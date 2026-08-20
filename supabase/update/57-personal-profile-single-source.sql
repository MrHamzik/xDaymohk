-- ============================================================================
-- 57. Личная анкета создаётся в одном месте
-- ============================================================================
--
-- Что было. Строчка «создать анкету personal-<uid>» жила в ЧЕТЫРЁХ местах,
-- и все четыре повторяли один и тот же список из 13 колонок:
--
--   1. ensure_personal_profile()   — schema.sql, вызывается из приложения
--      после регистрации (RPC-подстраховка онбординга);
--   2. ensure_personal_profile()   — update/17, переопределяет первую и
--      дополнительно копирует пол и дату рождения;
--   3. handle_new_auth_user()      — триггер на auth.users, вставляет
--      анкету СВОИМ отдельным insert, мимо обеих функций;
--   4. бэкфилл в конце schema.sql  — четвёртая копия того же списка.
--
-- Чем это плохо. Копии уже разъехались: версия из триггера не заполняет
-- gender и birth_date, поэтому у человека, зарегистрированного обычным
-- путём, анкета создавалась без пола и даты, а те же поля у него уже
-- лежали в user_profiles. Дозаполнялись они потом — и только если
-- приложение отдельно вызовет ensure_personal_profile(). Любая будущая
-- правка (новая колонка, другой посёлок по умолчанию) требовала помнить
-- про все четыре места; забыть одно — значит получить два сорта анкет.
--
-- Что стало. Появилась одна внутренняя функция create_personal_profile(),
-- которая знает, как выглядит личная анкета. Остальные три вызывают её.
-- Список колонок существует ровно в одном экземпляре.
--
-- Безопасность. create_personal_profile() принимает user_id аргументом,
-- поэтому наружу её отдавать нельзя: любой вошедший смог бы создать
-- анкету, принадлежащую чужому аккаунту. Права на неё сняты полностью
-- (revoke all, никаких grant) — вызвать её могут только другие
-- security definer функции, которые исполняются от владельца. Публичной
-- остаётся прежняя ensure_personal_profile(), она берёт auth.uid() сама
-- и подделать владельца через неё невозможно.
--
-- Идемпотентно: файл можно запускать повторно.
-- ============================================================================

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Единственное место, где описано, что такое «личная анкета».
-- ---------------------------------------------------------------------------
create or replace function public.create_personal_profile(
  p_user_id    uuid,
  p_full_name  text,
  p_avatar_url text default '',
  p_phone      text default ''
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_personal_id text := 'personal-' || p_user_id::text;
  v_row         public.profiles;
  v_gender      text;
  -- text, а не date: в живой базе обе колонки хранятся строкой
  -- 'YYYY-MM-DD' (подтверждено дампом supabase/DB.md). При присваивании
  -- Postgres приведёт значение к типу колонки сам, поэтому одна и та же
  -- функция работает и с text, и с date.
  v_birth_date  text;
begin
  -- Пол и дату рождения берём из анкеты аккаунта: человек ввёл их при
  -- регистрации, и дублировать ввод в личной анкете незачем.
  select u.gender, u.birth_date
    into v_gender, v_birth_date
    from public.user_profiles u
   where u.id = p_user_id;

  insert into public.profiles (
    id, owner_id, full_name, avatar_url, is_specialist, is_personal,
    bio, workplace_address, workplace_coords, phone, hide_phone,
    same_as_phone_whatsapp, settlement, gender, birth_date
  ) values (
    v_personal_id,
    p_user_id,
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
  on conflict (id) do nothing
  returning * into v_row;

  -- on conflict ничего не вернул — анкета уже была. Отдаём существующую,
  -- чтобы вызывающая сторона всегда получала строку, а не null.
  if v_row.id is null then
    select * into v_row from public.profiles where id = v_personal_id;
  end if;

  return v_row;
end;
$$;

comment on function public.create_personal_profile(uuid, text, text, text) is
  'Единственное место создания личной анкеты personal-<uid>. Внутренняя: '
  'принимает произвольный user_id, поэтому клиентам не выдаётся.';

-- Внутренняя функция: наружу не отдаём (см. блок «Безопасность» выше).
revoke all on function public.create_personal_profile(uuid, text, text, text) from public;
revoke all on function public.create_personal_profile(uuid, text, text, text) from anon;
revoke all on function public.create_personal_profile(uuid, text, text, text) from authenticated;

-- ---------------------------------------------------------------------------
-- 2. Публичная обёртка для приложения: владелец только текущий пользователь.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_personal_profile(
  p_full_name  text,
  p_avatar_url text default '',
  p_phone      text default ''
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid := auth.uid();
  v_existing    public.profiles;
  v_personal_id text;
  v_gender      text;
  v_birth_date  text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_personal_id := 'personal-' || v_user_id::text;

  select * into v_existing
    from public.profiles
   where id = v_personal_id;

  if found then
    -- Анкета уже есть: дозаполняем пол и дату, если их не было. Так
    -- лечатся анкеты, созданные старым триггером — он эти поля не писал.
    if v_existing.gender is null or v_existing.birth_date is null then
      select u.gender, u.birth_date into v_gender, v_birth_date
        from public.user_profiles u where u.id = v_user_id;
      update public.profiles
         set gender     = coalesce(v_existing.gender, v_gender),
             birth_date = coalesce(v_existing.birth_date, v_birth_date)
       where id = v_personal_id
      returning * into v_existing;
    end if;
    return v_existing;
  end if;

  return public.create_personal_profile(
    v_user_id, p_full_name, p_avatar_url, p_phone
  );
end;
$$;

revoke all on function public.ensure_personal_profile(text, text, text) from public;
grant execute on function public.ensure_personal_profile(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Триггер регистрации: больше не повторяет список колонок.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name  text;
  v_avatar_url text;
  v_phone      text;
  v_is_admin   boolean;
begin
  v_full_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    ''
  );
  v_avatar_url := coalesce(new.raw_user_meta_data->>'avatar_url', '');
  v_phone := coalesce(new.phone, '');
  v_is_admin := lower(coalesce(new.email, '')) in (
    'mr.hamzik1026@gmail.com',
    'nabis95@gmail.com'
  );

  insert into public.user_profiles (id, email, full_name, avatar_url, phone, is_admin)
  values (new.id, new.email, v_full_name, v_avatar_url, v_phone, v_is_admin)
  on conflict (id) do nothing;

  -- Порядок важен: user_profiles заполняется первой, и функция ниже
  -- сразу подхватывает из неё пол и дату рождения.
  perform public.create_personal_profile(
    new.id, v_full_name, v_avatar_url, v_phone
  );

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Лечим анкеты, созданные старым триггером без пола и даты рождения.
-- ---------------------------------------------------------------------------
update public.profiles p
   set gender     = u.gender,
       birth_date = u.birth_date
  from public.user_profiles u
 where p.owner_id = u.id
   and p.is_personal = true
   and (p.gender is null or p.birth_date is null)
   and (u.gender is not null or u.birth_date is not null);

notify pgrst, 'reload schema';

reset lock_timeout;
