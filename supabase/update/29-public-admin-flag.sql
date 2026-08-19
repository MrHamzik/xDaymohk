-- =============================================================================
-- Даймохк — обновление 29
-- Признак администратора виден всем (бейдж «Админ» на карточке анкеты).
--
-- Проблема
-- --------
-- isAdminProfile() определяет админа так: находит владельца анкеты в
-- списке users и смотрит его is_admin / e-mail. Список приходит из
-- v_users_with_profile_count, а та идёт с security_invoker = true —
-- политика «user_profiles self select» отдаёт читающему ТОЛЬКО его
-- собственную строку.
--
-- Итог: для чужих анкет владелец в списке не находится, функция уходит
-- в ветку «владелец известен и не админ» и возвращает false. Бейдж
-- «Админ» не показывался никому, кроме самого админа на своей анкете.
-- Ровно та же ловушка, что чинили в обновлениях 25 и 26.
--
-- Решение
-- -------
-- Отдаём is_admin через уже существующую публичную вьюху
-- v_resident_reputation: карточки читают её одним запросом по ownerId,
-- дополнительного round-trip не появится.
--
-- Безопасность: «этот человек — администратор» и так публичный факт,
-- бейдж рисуется на карточке. Ни e-mail, ни телефон не добавляем.
-- Невидимый разработчик остаётся невидимым: фильтр isDevEmail()
-- работает на стороне приложения и здесь не затрагивается.
--
-- Идемпотентно, можно перезапускать.
-- =============================================================================
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'user_profiles'
                   and column_name = 'is_admin')
    then raise exception 'Нет колонки is_admin в user_profiles'; end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'user_profiles'
                   and column_name = 'status_override')
    then raise exception 'Нет колонки status_override — сначала примените 26'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Пересоздаём вьюху с добавленной колонкой is_admin.
-- create or replace нельзя: PostgreSQL запрещает менять список колонок.
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
  greatest(0, extract(day from now() - u.created_at)::int) as account_days,
  -- Режим работы человека (обновление 26): применяется ко всем его
  -- анкетам специалиста. null / 'auto' — считать по расписанию.
  nullif(u.status_override, '')        as status_override,
  -- Признак администратора (обновление 29): нужен для бейджа «Админ».
  coalesce(u.is_admin, false)          as is_admin
from public.user_profiles u;

grant select on public.v_resident_reputation to anon, authenticated;

comment on view public.v_resident_reputation is
  'Публичная витрина профиля для карточек анкет: имя, аватар, рейтинг по '
  'заданиям, счётчики, режим работы и признак админа. Без e-mail и контактов.';

-- =============================================================================
-- Проверка (должна вернуть строки для ВСЕХ пользователей, не только своей):
--   select id, full_name, is_admin, status_override
--     from public.v_resident_reputation
--    where is_admin;
-- =============================================================================
