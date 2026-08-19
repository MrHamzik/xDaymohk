-- =============================================================================
-- Даймохк — обновление 25
-- Публичная репутация жителей + категории карты в разделе «Адреса».
--
-- Проблема 1: рейтинг видит только его владелец
-- ---------------------------------------------
-- Карточка анкеты берёт репутацию из v_users_with_profile_count, а та
-- создана с security_invoker = true, то есть RLS применяется от имени
-- читающего. Политика «user_profiles self select» разрешает видеть
-- ТОЛЬКО свою строку:
--     using (auth.uid()::text = id::text or is_admin_email())
-- Отсюда странность: исполнитель видит свой рейтинг везде, а заказчик
-- у него — нет. Каждый видел только себя.
--
-- Вьюху не трогаем: она отдаёт e-mail и служит админке, снимать с неё
-- RLS нельзя. Вместо этого заводим ОТДЕЛЬНУЮ публичную вьюху только с
-- теми полями, которые и так показываются в карточке: имя, аватар,
-- рейтинг, число оценок, возраст аккаунта. Никаких e-mail, телефонов,
-- дат рождения и признаков блокировки.
--
-- Проблема 2: рейтинг заданий на анкете специалиста
-- -------------------------------------------------
-- Решается на стороне интерфейса (репутация показывается только в
-- личной анкете), SQL для этого не нужен.
--
-- Идемпотентно, можно перезапускать.
-- =============================================================================
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'user_profiles'
                   and column_name = 'resident_rating')
    then raise exception 'Нет колонки resident_rating — сначала примените 18-tasks.sql'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Публичная репутация жителей
--    security_invoker = false — тот же приём, что у v_user_display в
--    schema.sql: вьюха выполняется с правами владельца, а безопасность
--    обеспечивается составом колонок.
-- ---------------------------------------------------------------------------
drop view if exists public.v_resident_reputation;

create view public.v_resident_reputation
with (security_invoker = false)
as
select
  u.id,
  u.full_name,
  u.avatar_url,
  coalesce(u.resident_rating, 0)       as resident_rating,
  coalesce(u.resident_review_count, 0) as resident_review_count,
  coalesce(u.tasks_done_count, 0)      as tasks_done_count,
  greatest(0, extract(day from now() - u.created_at)::int) as account_days
from public.user_profiles u;

grant select on public.v_resident_reputation to anon, authenticated;

comment on view public.v_resident_reputation is
  'Публичная репутация жителя для карточек анкет. Только безопасные поля: '
  'имя, аватар, рейтинг по заданиям, счётчики. Без e-mail и контактов.';

-- =============================================================================
-- Проверка (должно вернуть строки для ВСЕХ пользователей, не только своей):
--   select id, full_name, resident_rating, resident_review_count
--     from public.v_resident_reputation limit 10;
-- =============================================================================
