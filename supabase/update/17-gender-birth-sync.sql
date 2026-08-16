-- =============================================================================
-- Даймохк — обновление 17
-- Пол и возраст в ЛИЧНОЙ анкете.
--
-- Проблема: пол и дата рождения пользователь заполняет на странице профиля
-- (таблица user_profiles), а личная анкета (profiles, is_personal = true) их
-- не получала — в карточке раздел «Пол/Возраст» оставался пустым. Кроме того,
-- вью v_users_with_profile_count не отдавало gender/birth_date фронту.
--
-- Что делает этот файл:
--   1. Пересоздаёт v_users_with_profile_count с колонками gender, birth_date.
--   2. Триггер на user_profiles копирует gender/birth_date в личную анкету
--      (profiles публично читаема "profiles public read" — поэтому пол/возраст
--      в личной анкете видны всем, так задумано дизайном).
--   3. Одноразовый бэкфилл уже существующих личных анкет.
--
-- Запускать ОДИН файл за раз в SQL Editor. Перед запуском: закройте другие
-- вкладки SQL Editor и остановите dev-сервер / приложение (они держат
-- read-локи на таблицы). Если упрётся в lock — просто повторите.
-- =============================================================================
set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Вью v_users_with_profile_count + gender/birth_date
--    Новые колонки добавляются в КОНЕЦ списка (ограничение CREATE OR REPLACE
--    VIEW в Postgres: менять/переименовывать существующие колонки нельзя,
--    добавлять в конец — можно).
-- ---------------------------------------------------------------------------
create or replace view public.v_users_with_profile_count
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
  u.birth_date
from public.user_profiles u
left join (
  select
    owner_id,
    count(*)                          as profiles_total,
    count(*) filter (where is_hidden or is_banned) as hidden_count
  from public.profiles
  where owner_id is not null
  group by owner_id
) c on c.owner_id = u.id;

-- ---------------------------------------------------------------------------
-- 2. Триггер: user_profiles.gender/birth_date → личная анкета в profiles.
--    Источник истины — user_profiles; profiles читается публично, поэтому
--    копия полей в личной анкете и обеспечивает видимость для всех.
-- ---------------------------------------------------------------------------
create or replace function public.sync_personal_profile_demographics()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set gender = new.gender,
         birth_date = new.birth_date
   where owner_id = new.id
     and is_personal = true;
  return new;
end;
$$;

revoke all on function public.sync_personal_profile_demographics() from public;

drop trigger if exists trg_user_profiles_demographics on public.user_profiles;
create trigger trg_user_profiles_demographics
  after insert or update of gender, birth_date on public.user_profiles
  for each row execute function public.sync_personal_profile_demographics();

-- ---------------------------------------------------------------------------
-- 3. Бэкфилл: переносим пол/дату рождения в уже существующие личные анкеты.
-- ---------------------------------------------------------------------------
update public.profiles p
   set gender = u.gender,
       birth_date = u.birth_date
  from public.user_profiles u
 where p.owner_id = u.id
   and p.is_personal = true
   and (p.gender is distinct from u.gender or p.birth_date is distinct from u.birth_date);

notify pgrst, 'reload schema';

reset lock_timeout;
