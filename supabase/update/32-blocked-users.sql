-- =============================================================================
-- Даймохк — обновление 32
-- Чёрный список: взаимное скрытие между жителями.
--
-- Что делает блокировка (согласовано с заказчиком)
-- ------------------------------------------------
--   • заблокированный НЕ видит анкеты того, кто его заблокировал —
--     ни в каталоге, ни на карте;
--   • блокирующий не видит анкеты заблокированного;
--   • заблокированный не может писать отзывы, вопросы и комментарии
--     в анкетах блокирующего;
--   • заблокированный не может откликаться на задания блокирующего.
--
-- Почему это НЕ то же самое, что бан администратора
-- -------------------------------------------------
-- В user_profiles уже есть is_blocked — это блокировка аккаунта
-- администратором, глобальная и односторонняя. Здесь же отношение
-- «человек — человеку», у него две стороны и нет прав администратора.
-- Смешивать их в одной колонке нельзя.
--
-- Модель хранения
-- ---------------
-- Одна строка = один факт «A заблокировал B». Взаимность достигается
-- НЕ второй строкой, а проверкой в обе стороны при чтении: иначе
-- разблокировка одной стороной оставляла бы висеть чужую запись.
--
-- Идемпотентно, можно перезапускать.
-- =============================================================================
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'user_profiles')
    then raise exception 'Нет таблицы user_profiles — сначала примените schema.sql'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Таблица блокировок
-- ---------------------------------------------------------------------------
create table if not exists public.blocked_users (
  -- Кто заблокировал.
  blocker_id uuid not null references public.user_profiles(id) on delete cascade,
  -- Кого заблокировали.
  blocked_id uuid not null references public.user_profiles(id) on delete cascade,
  -- Необязательная заметка «за что» — видна только автору блокировки.
  reason text not null default '',
  created_at timestamptz not null default now(),

  -- Пара уникальна: повторная блокировка того же человека не создаёт
  -- дубликат, а обновляет запись (upsert).
  primary key (blocker_id, blocked_id)
);

-- Самого себя заблокировать нельзя: это не имеет смысла и сломало бы
-- выдачу собственных анкет.
alter table public.blocked_users
  drop constraint if exists blocked_users_not_self;
alter table public.blocked_users
  add constraint blocked_users_not_self
  check (blocker_id <> blocked_id);

-- Обратный индекс: запрос «кто заблокировал МЕНЯ» нужен на каждой
-- выдаче каталога, и без него это был бы полный перебор таблицы.
create index if not exists blocked_users_blocked_idx
  on public.blocked_users (blocked_id);

comment on table public.blocked_users is
  'Чёрный список между жителями. Скрытие взаимное: проверять нужно обе '
  'стороны отношения. Не путать с user_profiles.is_blocked — там бан '
  'аккаунта администратором.';

-- ---------------------------------------------------------------------------
-- 2. RLS
--
-- Свой список видит только владелец. ВАЖНО: заблокированный НЕ должен
-- узнать, что его заблокировали, — иначе чёрный список превращается в
-- способ выяснения отношений. Поэтому политика на select только для
-- blocker_id, но не для blocked_id.
-- ---------------------------------------------------------------------------
alter table public.blocked_users enable row level security;

drop policy if exists "blocked self select" on public.blocked_users;
create policy "blocked self select"
  on public.blocked_users for select
  using (auth.uid()::text = blocker_id::text or is_admin_email());

drop policy if exists "blocked self insert" on public.blocked_users;
create policy "blocked self insert"
  on public.blocked_users for insert
  with check (auth.uid()::text = blocker_id::text);

drop policy if exists "blocked self delete" on public.blocked_users;
create policy "blocked self delete"
  on public.blocked_users for delete
  using (auth.uid()::text = blocker_id::text or is_admin_email());

-- ---------------------------------------------------------------------------
-- 3. Функция взаимной проверки
--
-- Одно место истины для вопроса «скрывать ли этих двоих друг от друга».
-- Дублировать это условие по эндпоинтам значит однажды забыть половину.
-- ---------------------------------------------------------------------------
create or replace function public.users_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocked_users
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

comment on function public.users_blocked(uuid, uuid) is
  'Заблокирован ли кто-то из пары другим (в любую сторону). '
  'security definer: вызывающий не имеет права читать чужие строки.';

grant execute on function public.users_blocked(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Список идентификаторов, скрытых от текущего пользователя
--
-- Возвращает всех, с кем у вызывающего есть блокировка в любую сторону.
-- Клиент получает плоский список и фильтрует им каталог и карту.
-- ---------------------------------------------------------------------------
create or replace function public.hidden_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select blocked_id from public.blocked_users where blocker_id = auth.uid()
  union
  select blocker_id from public.blocked_users where blocked_id = auth.uid();
$$;

comment on function public.hidden_user_ids() is
  'Кого не показывать текущему пользователю: и кого он заблокировал, '
  'и кто заблокировал его.';

grant execute on function public.hidden_user_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Готово
-- ---------------------------------------------------------------------------
do $$
begin
  raise notice 'Обновление 32 применено: blocked_users готова.';
end $$;
