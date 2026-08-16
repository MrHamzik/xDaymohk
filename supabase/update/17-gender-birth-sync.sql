-- =============================================================================
-- Даймохк — обновление 17 (v2)
-- Пол и возраст в ЛИЧНОЙ анкете.
--
-- Проблема: пол и дата рождения пользователь заполняет на странице профиля
-- (таблица user_profiles), а личная анкета (profiles, is_personal = true) их
-- не получала — в карточке раздел «Пол/Возраст» оставался пустым.
--
-- Что делает этот файл:
--   0. ПРОВЕРКА: убеждается, что нужные столбцы существуют. Если нет —
--      падает с ЧИТАЕМОЙ ошибкой (что именно отсутствует) ДО любых изменений.
--   1. Пересоздаёт v_users_with_profile_count с gender/birth_date
--      (DROP + CREATE вместо CREATE OR REPLACE — так не конфликтует
--      с тем, как вьюха была создана раньше в живой БД).
--   2. Триггер на user_profiles копирует gender/birth_date в личную анкету.
--   3. ensure_personal_profile() теперь копирует пол/дату при СОЗДАНИИ
--      личной анкеты (не только при последующих правках профиля).
--   4. Одноразовый бэкфилл уже существующих личных анкет.
--
-- Запускать ОДИН файл за раз в SQL Editor. Перед запуском: закройте другие
-- вкладки SQL Editor и остановите dev-сервер / приложение (они держат
-- read-локи на таблицы). Если упрётся в lock — просто повторите.
-- =============================================================================
set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 0. Проверка столбцов (fail-fast, до любых изменений)
-- ---------------------------------------------------------------------------
do $$
declare
  missing text := '';
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'user_profiles' and column_name = 'gender')
    then missing := missing || ' user_profiles.gender;'; end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'user_profiles' and column_name = 'birth_date')
    then missing := missing || ' user_profiles.birth_date;'; end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles' and column_name = 'gender')
    then missing := missing || ' profiles.gender;'; end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles' and column_name = 'birth_date')
    then missing := missing || ' profiles.birth_date;'; end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_personal')
    then missing := missing || ' profiles.is_personal;'; end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles' and column_name = 'owner_id')
    then missing := missing || ' profiles.owner_id;'; end if;

  if missing <> '' then
    raise exception 'ОБНОВЛЕНИЕ 17 НЕ ПРИМЕНЕНО. В базе отсутствуют столбцы:% — пришлите этот текст разработчику, схема живой БД отличается от ожидаемой.', missing;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Вью v_users_with_profile_count + gender/birth_date.
--    DROP + CREATE: «create or replace view» падает, если у живой вьюхи
--    другой набор/порядок колонок; полное пересоздание вьюхи безопасно —
--    данных в ней нет. Если на вьюху завязан другой объект, DROP упадёт
--    явно (без cascade ничего лишнего не удалится).
--    CRUD по ней не делается, только SELECT — гранты Supabase по умолчанию
--    для public-схемы покрывают anon/authenticated.
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
-- 3. ensure_personal_profile(): при создании личной анкеты сразу подтягиваем
--    пол/дату рождения из user_profiles (signature функции не меняется —
--    grants сохраняются приCREATE OR REPLACE).
-- ---------------------------------------------------------------------------
create or replace function public.ensure_personal_profile(
  p_full_name text,
  p_avatar_url text default '',
  p_phone text default ''
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.profiles;
  v_personal_id text;
  v_row public.profiles;
  v_gender text;
  v_birth_date date;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_personal_id := 'personal-' || v_user_id::text;

  select * into v_existing
    from public.profiles
   where id = v_personal_id;
  if found then
    -- Анкета уже есть: заодно дозаполним пол/дату, если они пустые.
    if v_existing.gender is null or v_existing.birth_date is null then
      select u.gender, u.birth_date into v_gender, v_birth_date
        from public.user_profiles u where u.id = v_user_id;
      update public.profiles
         set gender = coalesce(v_existing.gender, v_gender),
             birth_date = coalesce(v_existing.birth_date, v_birth_date)
       where id = v_personal_id
      returning * into v_existing;
    end if;
    return v_existing;
  end if;

  select u.gender, u.birth_date into v_gender, v_birth_date
    from public.user_profiles u where u.id = v_user_id;

  insert into public.profiles (
    id, owner_id, full_name, avatar_url, is_specialist, is_personal,
    bio, workplace_address, workplace_coords, phone, hide_phone,
    same_as_phone_whatsapp, settlement, gender, birth_date
  ) values (
    v_personal_id,
    v_user_id,
    coalesce(nullif(trim(p_full_name), ''), 'Житель Даймохк'),
    coalesce(p_avatar_url, ''),
    false,
    true,
    'Житель Даймохк. Личная анкета.',
    'Даймохк',
    '{"lat":43.288024,"lng":45.298989}'::jsonb,
    coalesce(p_phone, ''),
    true,
    false,
    'Даймохк',
    v_gender,
    v_birth_date
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Бэкфилл: переносим пол/дату рождения в уже существующие личные анкеты.
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
