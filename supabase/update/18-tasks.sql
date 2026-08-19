-- =============================================================================
-- Даймохк — обновление 18
-- «Аренца Темщик» (ВайГIуллакх) и «ГIончалла» (ВайГIо): движок заданий.
--
-- Один движок на оба раздела, различаются флагом is_paid:
--   is_paid = true  → «Аренца Темщик»: задание с денежной наградой;
--   is_paid = false → «ГIончалла»:     безвозмездная помощь (садака).
--
-- Что создаётся:
--   1. tasks              — задания (срочные и запланированные);
--   2. task_participants  — исполнители: взявшие срочное / записавшиеся;
--   3. resident_reviews   — взаимные отзывы жителей (НЕ путать с reviews:
--                           те про навыки специалиста, эти — про человека);
--   4. executor_status    — тумблер «Активен/Неактивен» в разделе;
--   5. app_filters        — справочник фильтров, управляемый из админки;
--   6. поля рейтинга жителя в user_profiles + счётчики заданий;
--   7. новые типы уведомлений;
--   8. RLS, индексы, триггеры пересчёта рейтинга.
--
-- ВАЖНО про деньги: на этом этапе эскроу нет (платёжные провайдеры требуют
-- оборот от 800 тыс./мес). Оплата «договорная» — передаётся напрямую между
-- людьми, приложение фиксирует только ФАКТ расчёта. Поля payment_status /
-- escrow_deal_id заложены заранее, чтобы подключение ЮKassa/Т-Банка позже
-- не потребовало миграции данных.
--
-- Идемпотентен: можно перезапускать. Запускать ОДИН файл за раз в SQL Editor.
-- =============================================================================
set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 0. Проверка предпосылок (fail-fast, до любых изменений)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'user_profiles')
    then raise exception 'Нет таблицы public.user_profiles — сначала примените schema.sql'; end if;
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'profiles')
    then raise exception 'Нет таблицы public.profiles — сначала примените schema.sql'; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'is_admin_email')
    then raise exception 'Нет функции public.is_admin_email() — сначала примените schema.sql'; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'touch_updated_at')
    then raise exception 'Нет функции public.touch_updated_at() — сначала примените schema.sql'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Рейтинг жителя и счётчики заданий в user_profiles
--    Рейтинг специалиста живёт в profiles.rating (навыки в сфере).
--    Здесь — рейтинг ЧЕЛОВЕКА: как он себя ведёт в сделках.
-- ---------------------------------------------------------------------------
alter table public.user_profiles
  add column if not exists resident_rating       numeric(3,1) not null default 0,
  add column if not exists resident_review_count integer      not null default 0,
  -- Счётчики денормализованы: используются в фильтре «мин. выполненных
  -- заданий» и в шапке карточки. Считать on-the-fly на каждой карточке
  -- дорого, поэтому обновляются триггером при завершении задания.
  add column if not exists tasks_created_count   integer      not null default 0,
  add column if not exists tasks_done_count      integer      not null default 0,
  -- Блокировка создания заданий (штраф за неподтверждение оплаты, 6 часов).
  add column if not exists tasks_blocked_until   timestamptz;

comment on column public.user_profiles.resident_rating is
  'Рейтинг жителя (поведение в сделках). Рейтинг специалиста — profiles.rating.';

-- ---------------------------------------------------------------------------
-- 2. tasks — задания
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id                text primary key,
  author_id         uuid not null references public.user_profiles(id) on delete cascade,

  -- Раздел: true = «Аренца Темщик» (за деньги), false = «ГIончалла» (бесплатно)
  is_paid           boolean not null default true,
  -- Тип: urgent = сделать до дедлайна; scheduled = запись на конкретный день
  kind              text not null default 'urgent'
    check (kind in ('urgent', 'scheduled')),

  title             text not null,
  description       text not null default '',
  category          text not null default 'other',

  -- Награда ОДНОМУ исполнителю, в рублях (для ГIончалла = 0).
  reward            integer not null default 0 check (reward >= 0 and reward <= 1000000),
  -- Приоритет: надбавка сверх награды, платит заказчик.
  priority          text not null default 'normal'
    check (priority in ('normal', 'high', 'critical')),

  -- Сколько исполнителей нужно (срочное = 1, запланированное = N).
  slots             integer not null default 1 check (slots >= 1 and slots <= 100),

  -- Срочное: «сделать до». Запланированное: дата и время работ.
  deadline_at       timestamptz,
  scheduled_at      timestamptz,

  -- Геопривязка для фильтра «Близко» (1 км от текущей позиции).
  address           text not null default '',
  lat               double precision,
  lng               double precision,

  -- Требования к исполнителю (проверяются сервером при взятии задания).
  min_rating        numeric(3,1) not null default 0 check (min_rating >= 0 and min_rating <= 5),
  min_account_days  integer not null default 0 check (min_account_days >= 0),
  min_tasks_done    integer not null default 0 check (min_tasks_done >= 0),
  allow_newcomers   boolean not null default true,

  status            text not null default 'open'
    check (status in ('open', 'in_progress', 'awaiting_confirm', 'completed', 'cancelled', 'expired')),

  -- Задел под эскроу (сейчас всегда 'offline' — расчёт вне приложения).
  payment_status    text not null default 'offline'
    check (payment_status in ('offline', 'pending', 'held', 'released', 'refunded')),
  escrow_deal_id    text,

  -- Момент нажатия «Выполнил» — от него отсчитываются 3 часа автоподтверждения.
  submitted_at      timestamptz,
  completed_at      timestamptz,
  cancelled_at      timestamptz,
  cancel_reason     text,

  -- Скрытие из списков без удаления: история нужна для счётчиков,
  -- рейтинга и разбора жалоб.
  is_archived       boolean not null default false,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Срочному нужен дедлайн, запланированному — дата работ.
  constraint tasks_kind_dates_chk check (
    (kind = 'urgent'    and deadline_at  is not null) or
    (kind = 'scheduled' and scheduled_at is not null)
  ),
  -- Координаты либо обе, либо ни одной.
  constraint tasks_coords_chk check (
    (lat is null and lng is null) or
    (lat between -90 and 90 and lng between -180 and 180)
  )
);

-- Лента заданий: активные, свежие сверху.
create index if not exists idx_tasks_feed
  on public.tasks (status, is_archived, created_at desc)
  where not is_archived;
create index if not exists idx_tasks_author    on public.tasks (author_id, created_at desc);
create index if not exists idx_tasks_category  on public.tasks (category) where not is_archived;
create index if not exists idx_tasks_geo       on public.tasks (lat, lng) where not is_archived;
create index if not exists idx_tasks_deadline  on public.tasks (deadline_at)
  where status = 'open' and not is_archived;
-- Для фонового автоподтверждения через 3 часа.
create index if not exists idx_tasks_submitted on public.tasks (submitted_at)
  where status = 'awaiting_confirm';

drop trigger if exists trg_tasks_updated on public.tasks;
create trigger trg_tasks_updated
  before update on public.tasks
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. task_participants — кто взял / кто записался
-- ---------------------------------------------------------------------------
create table if not exists public.task_participants (
  id            text primary key,
  task_id       text not null references public.tasks(id) on delete cascade,
  user_id       uuid not null references public.user_profiles(id) on delete cascade,

  status        text not null default 'joined'
    check (status in ('joined', 'excluded', 'attended', 'no_show', 'done', 'cancelled')),

  -- Явка на запланированном задании (отмечает заказчик).
  attended      boolean,
  -- Бонус сверх награды, 0..20 % (наказания нет — только рейтинг).
  bonus_percent integer not null default 0 check (bonus_percent >= 0 and bonus_percent <= 20),

  -- Исключённый заказчиком не может записаться на это задание повторно.
  excluded_at   timestamptz,
  joined_at     timestamptz not null default now(),

  -- Один человек — одна запись на задание (в т.ч. защита от повторной
  -- записи после исключения: строка остаётся со status='excluded').
  unique (task_id, user_id)
);

create index if not exists idx_task_participants_task on public.task_participants (task_id);
create index if not exists idx_task_participants_user on public.task_participants (user_id, joined_at desc);

-- ---------------------------------------------------------------------------
-- 4. resident_reviews — взаимные отзывы о ЧЕЛОВЕКЕ (не о навыках)
--    Ставятся только после завершённой сделки, по одному с каждой стороны.
-- ---------------------------------------------------------------------------
create table if not exists public.resident_reviews (
  id           text primary key,
  task_id      text not null references public.tasks(id) on delete cascade,
  -- Кого оценивают.
  target_id    uuid not null references public.user_profiles(id) on delete cascade,
  -- Кто оценивает.
  author_id    uuid not null references public.user_profiles(id) on delete cascade,
  -- Роль оцениваемого в этой сделке (рейтинг общий, но полезно для аналитики).
  target_role  text not null check (target_role in ('customer', 'executor')),

  rating       numeric(2,1) not null check (rating between 1 and 5),
  text         text not null default '',
  created_at   timestamptz not null default now(),

  -- Один отзыв на связку «задание + автор + цель».
  unique (task_id, author_id, target_id),
  -- Себя оценивать нельзя.
  constraint resident_reviews_no_self check (author_id <> target_id)
);

create index if not exists idx_resident_reviews_target on public.resident_reviews (target_id, created_at desc);
create index if not exists idx_resident_reviews_author on public.resident_reviews (author_id);

-- ---------------------------------------------------------------------------
-- 5. executor_status — тумблер «Активен/Неактивен»
--    Неактивные не видят задания и не могут их брать. Активность
--    продлевается любым действием в разделе; протухшая (active_until в
--    прошлом) считается выключенной — фоновая чистка не нужна.
-- ---------------------------------------------------------------------------
create table if not exists public.executor_status (
  user_id      uuid primary key references public.user_profiles(id) on delete cascade,
  is_active    boolean not null default false,
  active_until timestamptz,
  updated_at   timestamptz not null default now()
);

-- Частичный индекс для счётчика «подходит N активных исполнителей».
create index if not exists idx_executor_status_active
  on public.executor_status (active_until)
  where is_active;

drop trigger if exists trg_executor_status_updated on public.executor_status;
create trigger trg_executor_status_updated
  before update on public.executor_status
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6. app_filters — справочник фильтров, управляемый из админки
--    (категории заданий, сферы каталога, категории объектов на карте).
-- ---------------------------------------------------------------------------
create table if not exists public.app_filters (
  id         text primary key,
  scope      text not null check (scope in ('tasks', 'catalog', 'map')),
  value      text not null,
  label_ru   text not null,
  label_ce   text,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (scope, value)
);

create index if not exists idx_app_filters_scope on public.app_filters (scope, sort_order)
  where is_active;

-- Категории заданий по умолчанию (перезапуск не плодит дубли).
insert into public.app_filters (id, scope, value, label_ru, label_ce, sort_order) values
  ('tasks-purchases', 'tasks', 'purchases', 'Покупки',  'Эцарш',      10),
  ('tasks-delivery',  'tasks', 'delivery',  'Доставка', 'Дахьар',     20),
  ('tasks-building',  'tasks', 'building',  'Стройка',  'ГIишлош',    30),
  ('tasks-moving',    'tasks', 'moving',    'Переезд',  'ДIадахар',   40),
  ('tasks-cleaning',  'tasks', 'cleaning',  'Уборка',   'ЦIанъяр',    50),
  ('tasks-repair',    'tasks', 'repair',    'Ремонт',   'Таздар',     60),
  ('tasks-garden',    'tasks', 'garden',    'Огород',   'Беш',        70),
  ('tasks-other',     'tasks', 'other',     'Другое',   'Кхин',       80)
-- Без указания цели: строка конфликтует сразу по PK и по (scope, value),
-- а с явным арбитром Postgres упал бы на «чужом» ограничении при повторе.
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 7. Новые типы уведомлений
--    В schema.sql тип задан CHECK-ограничением — пересоздаём с новыми
--    значениями, старые сохраняем.
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'system', 'profile_hidden', 'profile_visible', 'user_blocked', 'user_unblocked',
  'review_received', 'question_commented', 'comment_replied', 'like_received',
  'complaint_result', 'taxi_request', 'taxi_info',
  -- Аренца Темщик / ГIончалла
  'task_taken', 'task_submitted', 'task_confirmed', 'task_auto_confirmed',
  'task_cancel_requested', 'task_cancelled', 'task_expired',
  'task_joined', 'task_excluded', 'task_reminder',
  'task_rated', 'task_rate_pending'
));

-- ---------------------------------------------------------------------------
-- 8. Пересчёт рейтинга жителя (по аналогии с recompute_profile_rating)
-- ---------------------------------------------------------------------------
create or replace function public.recompute_resident_rating(target uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.user_profiles
     set resident_rating = coalesce(
           (select round(avg(rating)::numeric, 1)
              from public.resident_reviews where target_id = target), 0),
         resident_review_count = (
           select count(*) from public.resident_reviews where target_id = target)
   where id = target;
$$;

revoke all on function public.recompute_resident_rating(uuid) from public;
grant execute on function public.recompute_resident_rating(uuid) to authenticated, service_role;

create or replace function public.trg_recompute_resident_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'DELETE') then
    perform public.recompute_resident_rating(old.target_id);
    return old;
  end if;
  perform public.recompute_resident_rating(new.target_id);
  if (tg_op = 'UPDATE' and old.target_id <> new.target_id) then
    perform public.recompute_resident_rating(old.target_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_resident_reviews_ins on public.resident_reviews;
create trigger trg_resident_reviews_ins
  after insert on public.resident_reviews
  for each row execute function public.trg_recompute_resident_rating();

drop trigger if exists trg_resident_reviews_upd on public.resident_reviews;
create trigger trg_resident_reviews_upd
  after update on public.resident_reviews
  for each row execute function public.trg_recompute_resident_rating();

drop trigger if exists trg_resident_reviews_del on public.resident_reviews;
create trigger trg_resident_reviews_del
  after delete on public.resident_reviews
  for each row execute function public.trg_recompute_resident_rating();

-- ---------------------------------------------------------------------------
-- 9. RLS
-- ---------------------------------------------------------------------------
alter table public.tasks              enable row level security;
alter table public.task_participants  enable row level security;
alter table public.resident_reviews   enable row level security;
alter table public.executor_status    enable row level security;
alter table public.app_filters        enable row level security;

-- tasks: неархивные видны всем (лента открыта и гостям, как каталог);
-- автор и админ видят свои архивные тоже.
drop policy if exists "tasks public read" on public.tasks;
create policy "tasks public read"
  on public.tasks for select
  using (not is_archived or auth.uid()::text = author_id::text or is_admin_email());

-- Запись только через API (service role): там проверяются стоп-лист,
-- лимиты, требования к исполнителю и возраст 14+.
drop policy if exists "tasks author insert" on public.tasks;
create policy "tasks author insert"
  on public.tasks for insert
  with check (auth.uid()::text = author_id::text);

drop policy if exists "tasks author update" on public.tasks;
create policy "tasks author update"
  on public.tasks for update
  using (auth.uid()::text = author_id::text or is_admin_email())
  with check (auth.uid()::text = author_id::text or is_admin_email());

-- Удаление — только админ. Пользователь «удаляет» через is_archived,
-- чтобы не рушить счётчики, рейтинг и разбор жалоб.
drop policy if exists "tasks admin delete" on public.tasks;
create policy "tasks admin delete"
  on public.tasks for delete
  using (is_admin_email());

-- task_participants: видны всем (на карточке показываем, кто взял).
drop policy if exists "task_participants public read" on public.task_participants;
create policy "task_participants public read"
  on public.task_participants for select
  using (true);

drop policy if exists "task_participants self insert" on public.task_participants;
create policy "task_participants self insert"
  on public.task_participants for insert
  with check (auth.uid()::text = user_id::text);

-- Обновлять может сам участник (отказ) и автор задания (исключение, явка).
drop policy if exists "task_participants update" on public.task_participants;
create policy "task_participants update"
  on public.task_participants for update
  using (
    auth.uid()::text = user_id::text
    or is_admin_email()
    or exists (select 1 from public.tasks t
                where t.id = task_participants.task_id
                  and t.author_id::text = auth.uid()::text)
  )
  with check (
    auth.uid()::text = user_id::text
    or is_admin_email()
    or exists (select 1 from public.tasks t
                where t.id = task_participants.task_id
                  and t.author_id::text = auth.uid()::text)
  );

-- resident_reviews: читают все (рейтинг публичный), пишет автор,
-- удаляют автор и админ. Проверка «только после сделки» — в API.
drop policy if exists "resident_reviews public read" on public.resident_reviews;
create policy "resident_reviews public read"
  on public.resident_reviews for select
  using (true);

drop policy if exists "resident_reviews author insert" on public.resident_reviews;
create policy "resident_reviews author insert"
  on public.resident_reviews for insert
  with check (auth.uid()::text = author_id::text);

drop policy if exists "resident_reviews author update" on public.resident_reviews;
create policy "resident_reviews author update"
  on public.resident_reviews for update
  using (auth.uid()::text = author_id::text)
  with check (auth.uid()::text = author_id::text);

drop policy if exists "resident_reviews author delete" on public.resident_reviews;
create policy "resident_reviews author delete"
  on public.resident_reviews for delete
  using (auth.uid()::text = author_id::text or is_admin_email());

-- executor_status: читают все (нужно для счётчика «подходит N»),
-- меняет только сам пользователь.
drop policy if exists "executor_status public read" on public.executor_status;
create policy "executor_status public read"
  on public.executor_status for select
  using (true);

drop policy if exists "executor_status self write" on public.executor_status;
create policy "executor_status self write"
  on public.executor_status for all
  using (auth.uid()::text = user_id::text or is_admin_email())
  with check (auth.uid()::text = user_id::text or is_admin_email());

-- app_filters: читают все, меняет только админ.
drop policy if exists "app_filters public read" on public.app_filters;
create policy "app_filters public read"
  on public.app_filters for select
  using (is_active or is_admin_email());

drop policy if exists "app_filters admin write" on public.app_filters;
create policy "app_filters admin write"
  on public.app_filters for all
  using (is_admin_email())
  with check (is_admin_email());

-- ---------------------------------------------------------------------------
-- 10. Вьюха ленты: задание + публичные данные заказчика для шапки карточки
--     (рейтинг, возраст аккаунта в днях, сколько заданий опубликовал)
--     + сколько мест занято.
--     security_invoker: RLS применяется от имени читающего, а не создателя.
-- ---------------------------------------------------------------------------
drop view if exists public.v_tasks_feed;
create view public.v_tasks_feed
with (security_invoker = true)
as
select
  t.*,
  u.full_name             as author_name,
  u.avatar_url            as author_avatar_url,
  u.resident_rating       as author_rating,
  u.resident_review_count as author_review_count,
  u.tasks_created_count   as author_tasks_created,
  greatest(0, extract(day from now() - u.created_at)::int) as author_account_days,
  (select count(*) from public.task_participants p
    where p.task_id = t.id and p.status in ('joined', 'attended', 'done')) as taken_slots
from public.tasks t
join public.user_profiles u on u.id = t.author_id;

grant select on public.v_tasks_feed to anon, authenticated;

-- =============================================================================
-- Готово. Проверка:
--   select count(*) from public.tasks;
--   select * from public.app_filters where scope = 'tasks' order by sort_order;
--   select resident_rating, tasks_done_count from public.user_profiles limit 5;
-- =============================================================================
