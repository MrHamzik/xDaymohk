-- =============================================================================
-- Даймохк — обновление 24
-- Живое обновление раздела заданий (Supabase Realtime).
--
-- Проблема
-- --------
-- Действия второй стороны не были видны сразу: исполнитель нажимал
-- «Выполнил», а у заказчика в открытой карточке оставалась старая
-- кнопка; отзыв появлялся только после перезахода. Клиент подписан на
-- postgres_changes, но Supabase шлёт события лишь для таблиц, явно
-- добавленных в публикацию supabase_realtime.
--
-- Что делаем
-- ----------
-- Добавляем в публикацию tasks, task_participants и resident_reviews.
-- Для task_participants и resident_reviews дополнительно включаем
-- REPLICA IDENTITY FULL: без неё в событии DELETE приходит только
-- первичный ключ, а клиенту нужны task_id и user_id, чтобы понять,
-- какую карточку обновлять.
--
-- Безопасность: Realtime уважает RLS — подписчик получает только те
-- строки, которые ему и так видны через SELECT. Политики заданы в
-- 18-tasks.sql, здесь ничего не ослабляем.
--
-- Идемпотентно: повторный запуск ничего не ломает.
-- =============================================================================
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'tasks')
    then raise exception 'Нет таблицы public.tasks — сначала примените 18-tasks.sql'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Публикация supabase_realtime
--    add table падает с ошибкой, если таблица уже добавлена, поэтому
--    каждую заворачиваем в отдельный блок с перехватом.
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.tasks;
exception
  when duplicate_object then null;   -- уже в публикации
  when undefined_object then
    raise notice 'Публикации supabase_realtime нет — включите Realtime в Dashboard';
end $$;

do $$
begin
  alter publication supabase_realtime add table public.task_participants;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.resident_reviews;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. REPLICA IDENTITY FULL для дочерних таблиц
--    Нужна, чтобы в событии DELETE приходили task_id / user_id, а не
--    только id: по ним клиент понимает, какую карточку перерисовать.
-- ---------------------------------------------------------------------------
alter table public.task_participants replica identity full;
alter table public.resident_reviews  replica identity full;

-- =============================================================================
-- Проверка (должны быть три строки):
--   select tablename from pg_publication_tables
--    where pubname = 'supabase_realtime'
--      and tablename in ('tasks', 'task_participants', 'resident_reviews');
--
-- Если строк нет, включите Realtime: Dashboard → Database → Replication
-- → supabase_realtime → отметьте эти таблицы.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 3. Репутация жителя во вьюхе пользователей
--    Карточка анкеты показывает под именем рейтинг по заданиям, но
--    v_users_with_profile_count его не отдавала — клиенту неоткуда было
--    взять resident_rating без отдельного запроса на каждую карточку.
--    Пересоздаём вьюху с двумя новыми колонками (структура остальных
--    сохранена — см. 17-gender-birth-sync.sql).
-- ---------------------------------------------------------------------------
drop view if exists public.v_users_with_profile_count;

create view public.v_users_with_profile_count
  with (security_invoker = true) as
select
  u.id,
  u.email,
  u.full_name,
  u.avatar_url,
  u.is_admin,
  u.is_blocked,
  u.created_at,
  u.settlement,
  coalesce(c.profiles_total, 0) as profile_count,
  coalesce(c.hidden_total, 0)   as hidden_count,
  u.gender,
  u.birth_date,
  -- Репутация в заданиях: рейтинг ЧЕЛОВЕКА, не навыков специалиста.
  coalesce(u.resident_rating, 0)       as resident_rating,
  coalesce(u.resident_review_count, 0) as resident_review_count
from public.user_profiles u
left join (
  select
    owner_id,
    count(*)                                       as profiles_total,
    count(*) filter (where is_hidden or is_banned) as hidden_total
  from public.profiles
  where owner_id is not null
  group by owner_id
) c on c.owner_id = u.id;

-- DROP сбрасывает гранты — возвращаем явно.
grant select on public.v_users_with_profile_count to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Иконка у фильтра
--    Сферы каталога рисуются с иконкой (стетоскоп у «Здоровья» и т.д.).
--    До сих пор иконка была захардкожена по id, поэтому у сферы,
--    добавленной админом, её быть не могло — рисовался «портфель».
--    Храним имя иконки из набора lucide-react; список допустимых
--    значений задан в интерфейсе (ICON_OPTIONS).
-- ---------------------------------------------------------------------------
alter table public.app_filters
  add column if not exists icon text;

comment on column public.app_filters.icon is
  'Имя иконки lucide-react (Stethoscope, Hammer, …). NULL — иконка по умолчанию.';

-- Проставляем иконки встроенным сферам каталога, чтобы вид не изменился.
update public.app_filters set icon = 'Stethoscope'    where scope = 'catalog' and value = 'doctor'      and icon is null;
update public.app_filters set icon = 'Hammer'         where scope = 'catalog' and value = 'builder'     and icon is null;
update public.app_filters set icon = 'GraduationCap'  where scope = 'catalog' and value = 'teacher'     and icon is null;
update public.app_filters set icon = 'Wrench'         where scope = 'catalog' and value = 'mechanic'    and icon is null;
update public.app_filters set icon = 'Scissors'       where scope = 'catalog' and value = 'service'     and icon is null;
update public.app_filters set icon = 'ShoppingBag'    where scope = 'catalog' and value = 'trade'       and icon is null;
update public.app_filters set icon = 'Sprout'         where scope = 'catalog' and value = 'agriculture' and icon is null;
update public.app_filters set icon = 'Briefcase'      where scope = 'catalog' and value = 'other'       and icon is null;
