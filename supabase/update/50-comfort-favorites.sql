-- =============================================================================
-- Даймохк — обновление 50
-- Удобство: настройки ленты / тихих часов / вибро и избранные анкеты.
--
-- Идемпотентно, можно перезапускать.
-- =============================================================================
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'user_settings')
    then raise exception 'Нет таблицы user_settings — сначала 28-user-settings.sql'; end if;
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'profiles')
    then raise exception 'Нет таблицы profiles'; end if;
end $$;

alter table public.user_settings
  add column if not exists compact_lists boolean not null default false,
  add column if not exists confirm_danger boolean not null default true,
  add column if not exists quiet_hours boolean not null default false,
  add column if not exists vibrate boolean not null default true;

comment on column public.user_settings.compact_lists is
  'Карточки заданий без описания и меток — больше записей на экране.';
comment on column public.user_settings.confirm_danger is
  'Спрашивать перед отменой и удалением задания.';
comment on column public.user_settings.quiet_hours is
  'Не звучать с 22:00 до 7:00 (Москва) и во время намаза.';
comment on column public.user_settings.vibrate is
  'Короткий виброотклик на взятие задания и отметку оплаты.';

create table if not exists public.favorite_profiles (
  user_id    uuid not null references public.user_profiles(id) on delete cascade,
  profile_id text not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, profile_id)
);

create index if not exists idx_favorite_profiles_user
  on public.favorite_profiles (user_id, created_at desc);

alter table public.favorite_profiles enable row level security;

drop policy if exists "favorites self read" on public.favorite_profiles;
create policy "favorites self read"
  on public.favorite_profiles for select
  using (auth.uid()::text = user_id::text);

drop policy if exists "favorites self write" on public.favorite_profiles;
create policy "favorites self write"
  on public.favorite_profiles for insert
  with check (auth.uid()::text = user_id::text);

drop policy if exists "favorites self delete" on public.favorite_profiles;
create policy "favorites self delete"
  on public.favorite_profiles for delete
  using (auth.uid()::text = user_id::text);

grant select, insert, delete on public.favorite_profiles to authenticated;

do $$
begin
  raise notice 'Обновление 50 применено: настройки удобства и избранные.';
end $$;
