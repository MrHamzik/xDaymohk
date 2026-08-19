-- =============================================================================
-- Даймохк — обновление 49
-- Подтверждение телефона SMS перед первым платным заданием.
--
-- Задание за деньги создаёт любой с Google-почтой. Почта делается за
-- минуту. SMS-код привязывает аккаунт к российскому номеру.
-- «ГIончалла» (безвозмездно) остаётся открытой.
--
-- Код в БД не хранится — только хэш. Клиент не может сам проставить
-- phone_verified_at: триггер сбрасывает чужую отметку, пишет только
-- service_role.
--
-- Идемпотентно, можно перезапускать.
-- =============================================================================
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'user_profiles')
    then raise exception 'Нет таблицы user_profiles'; end if;
end $$;

alter table public.user_profiles
  add column if not exists phone_verified_at timestamptz;

comment on column public.user_profiles.phone_verified_at is
  'Когда номер подтвердили SMS-кодом. NULL — не подтверждён. '
  'Менять колонку может только сервер.';

create table if not exists public.sms_challenges (
  id          text primary key,
  user_id     uuid not null references public.user_profiles(id) on delete cascade,
  phone       text not null,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    integer not null default 0,
  sent_at     timestamptz not null default now(),
  consumed_at timestamptz
);

create index if not exists idx_sms_challenges_user
  on public.sms_challenges (user_id, sent_at desc);
create index if not exists idx_sms_challenges_phone
  on public.sms_challenges (phone, sent_at desc);

comment on table public.sms_challenges is
  'Одноразовые SMS-коды. Сам код не хранится, только sha256. '
  'Читает и пишет только service_role.';

alter table public.sms_challenges enable row level security;
-- Политик нет: authenticated не видит чужие и свои хэши.
revoke all on public.sms_challenges from anon, authenticated;
grant all on public.sms_challenges to service_role;

-- Клиент не подтверждает сам себя и теряет отметку при смене номера.
create or replace function public.guard_phone_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.role() is distinct from 'service_role' then
      new.phone_verified_at := null;
    end if;
    return new;
  end if;

  if new.phone is distinct from old.phone then
    new.phone_verified_at := null;
  elsif new.phone_verified_at is distinct from old.phone_verified_at
        and auth.role() is distinct from 'service_role' then
    new.phone_verified_at := old.phone_verified_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_phone_verified on public.user_profiles;
create trigger trg_guard_phone_verified
  before insert or update on public.user_profiles
  for each row execute function public.guard_phone_verified();

do $$
begin
  raise notice 'Обновление 49 применено: SMS-подтверждение телефона.';
end $$;

-- =============================================================================
-- Проверка:
--   select phone, phone_verified_at from public.user_profiles limit 5;
--   select count(*) from public.sms_challenges;
-- =============================================================================
