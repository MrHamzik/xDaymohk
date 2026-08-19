-- =============================================================================
-- Даймохк — обновление 21
-- Бюджет на закупку для заданий категории «Покупки».
--
-- Сценарий: «купи продуктов на 1500 ₽, награда 200 ₽». Исполнитель идёт
-- в магазин, тратит СВОИ 1500 ₽, привозит товар и получает обратно
-- 1500 ₽ закупки + 200 ₽ награды. То есть закупка — это не доход
-- исполнителя, а возмещение расходов, и считать её надо отдельно:
--   * в рейтинге и статистике она не участвует;
--   * налогом облагается только награда;
--   * в карточке показывается отдельной строкой, чтобы исполнитель
--     заранее видел, сколько своих денег понадобится.
--
-- Идемпотентно, можно перезапускать.
-- =============================================================================
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'tasks')
    then raise exception 'Нет таблицы public.tasks — сначала примените 18-tasks.sql'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Колонка бюджета
-- ---------------------------------------------------------------------------
alter table public.tasks
  add column if not exists purchase_budget integer not null default 0;

-- Разумный потолок: защита от опечатки в духе «1500000».
do $$
begin
  alter table public.tasks
    add constraint tasks_purchase_budget_chk
    check (purchase_budget >= 0 and purchase_budget <= 1000000);
exception when duplicate_object then
  null; -- ограничение уже есть
end $$;

comment on column public.tasks.purchase_budget is
  'Деньги на закупку товара (категория «Покупки»). Исполнитель тратит свои '
  'и получает обратно вместе с наградой. НЕ является его доходом.';

-- ---------------------------------------------------------------------------
-- 2. Вьюхи пересоздаём — им нужно отдавать новое поле
--    (см. 20-tasks-feed-fix.sql: security_invoker = false, иначе RLS
--    политики user_profiles режет JOIN и лента приходит пустой).
-- ---------------------------------------------------------------------------
drop view if exists public.v_tasks_feed;

create view public.v_tasks_feed
with (security_invoker = false)
as
select
  t.id, t.author_id, t.is_paid, t.kind, t.title, t.description, t.category,
  t.reward, t.purchase_budget, t.priority, t.slots,
  t.deadline_at, t.scheduled_at, t.address, t.lat, t.lng,
  t.min_rating, t.min_account_days, t.min_tasks_done, t.allow_newcomers,
  t.status, t.payment_status, t.submitted_at, t.completed_at,
  t.cancelled_at, t.cancel_reason, t.is_archived, t.created_at, t.updated_at,
  u.full_name             as author_name,
  u.avatar_url            as author_avatar_url,
  u.resident_rating       as author_rating,
  u.resident_review_count as author_review_count,
  u.tasks_created_count   as author_tasks_created,
  greatest(0, extract(day from now() - u.created_at)::int) as author_account_days,
  (select count(*) from public.task_participants p
    where p.task_id = t.id and p.status in ('joined', 'attended', 'done')) as taken_slots
from public.tasks t
join public.user_profiles u on u.id = t.author_id
where not t.is_archived;

grant select on public.v_tasks_feed to anon, authenticated;

drop view if exists public.v_task_details;

create view public.v_task_details
with (security_invoker = false)
as
select
  t.id, t.author_id, t.is_paid, t.kind, t.title, t.description, t.category,
  t.reward, t.purchase_budget, t.priority, t.slots,
  t.deadline_at, t.scheduled_at, t.address, t.lat, t.lng,
  t.min_rating, t.min_account_days, t.min_tasks_done, t.allow_newcomers,
  t.status, t.payment_status, t.submitted_at, t.completed_at,
  t.cancelled_at, t.cancel_reason, t.is_archived, t.created_at, t.updated_at,
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

grant select on public.v_task_details to anon, authenticated;

-- =============================================================================
-- Проверка:
--   select id, title, reward, purchase_budget from public.v_tasks_feed;
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 3. Починка пустых имён и аватаров
--    Симптом: в карточке задания вместо ФИО показывается «Житель Даймохк»,
--    а вместо фото — иконка приложения. Причина: строка в user_profiles
--    создана раньше, чем пришли данные Google OAuth, и full_name /
--    avatar_url остались пустыми. Вьюхи отдают пустое значение, а
--    интерфейс подставляет запасные варианты.
--
--    Переносим имя и аватар из auth.users.raw_user_meta_data — там их
--    сохраняет Supabase при входе через Google.
-- ---------------------------------------------------------------------------
update public.user_profiles p
   set full_name = coalesce(
         nullif(trim(p.full_name), ''),
         nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
         nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
         p.full_name)
  from auth.users u
 where u.id = p.id
   and coalesce(trim(p.full_name), '') = '';

update public.user_profiles p
   set avatar_url = coalesce(
         nullif(trim(p.avatar_url), ''),
         nullif(trim(u.raw_user_meta_data ->> 'avatar_url'), ''),
         nullif(trim(u.raw_user_meta_data ->> 'picture'), ''),
         p.avatar_url)
  from auth.users u
 where u.id = p.id
   and coalesce(trim(p.avatar_url), '') = '';

-- Диагностика: у кого всё ещё пусто (такие люди не заполнили профиль).
--   select id, email, full_name, avatar_url from public.user_profiles
--    where coalesce(trim(full_name), '') = '' or coalesce(trim(avatar_url), '') = '';
