-- =============================================================================
-- Даймохк — обновление 26
-- Режим работы владельца виден всем зрителям его анкет.
--
-- Проблема
-- --------
-- Тумблер «Режим работы» в боковом меню (Работает / Перерыв / Не работает)
-- пишется в user_profiles.status_override — то есть принадлежит ЧЕЛОВЕКУ и
-- обязан менять статус сразу на ВСЕХ его анкетах специалиста.
--
-- В интерфейсе это работало только для самого владельца:
--     const isOwner = account?.id === profile.ownerId;
--     const override = isOwner ? account.statusOverride : profile.statusOverride;
--
-- Чужой зритель попадал во вторую ветку, а profiles.status_override не
-- существует как колонка и в Profile никогда не заполнялся — значит для
-- всех остальных override был undefined, и кольцо/бейдж считались только
-- по расписанию. Со стороны это выглядело так, будто тумблер вообще ни
-- на что не влияет.
--
-- Решение
-- -------
-- Отдаём status_override через уже существующую публичную вьюху
-- v_resident_reputation: её карточки анкет и так читают одним запросом
-- по ownerId, отдельного round-trip не появится.
--
-- Почему не v_users_with_profile_count: она security_invoker = true, и
-- политика «user_profiles self select» отдаёт читающему только его
-- собственную строку (та же ловушка, что чинили в обновлении 25).
--
-- Безопасность: status_override — это «работает / перерыв / выходной»,
-- ровно то, что и так рисуется на карточке. Персональных данных не
-- добавляем: ни e-mail, ни телефона, ни даты рождения.
--
-- Идемпотентно, можно перезапускать.
-- =============================================================================
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'user_profiles'
                   and column_name = 'status_override')
    then raise exception 'Нет колонки status_override в user_profiles'; end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'user_profiles'
                   and column_name = 'resident_rating')
    then raise exception 'Нет колонки resident_rating — сначала примените 18-tasks.sql'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Пересоздаём вьюху с добавленной колонкой status_override.
-- create or replace здесь не подходит: PostgreSQL запрещает менять список
-- колонок существующей вьюхи, поэтому сначала drop.
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
  -- Режим работы человека: применяется ко всем его анкетам специалиста.
  -- null / 'auto' — считать по расписанию анкеты.
  nullif(u.status_override, '')        as status_override
from public.user_profiles u;

grant select on public.v_resident_reputation to anon, authenticated;

comment on view public.v_resident_reputation is
  'Публичная репутация жителя для карточек анкет: имя, аватар, рейтинг по '
  'заданиям, счётчики и режим работы (status_override). Без e-mail и контактов.';

-- =============================================================================
-- Проверка: у пользователя, включившего «Перерыв», должно вернуться 'break'
--   select id, full_name, status_override
--     from public.v_resident_reputation
--    where status_override is not null;
-- =============================================================================
