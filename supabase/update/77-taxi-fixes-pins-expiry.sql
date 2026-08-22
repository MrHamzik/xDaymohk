-- =============================================================================
-- Даймохк — обновление 77: фиксы такси и срок закрепления на главной
-- -----------------------------------------------------------------------------
-- 1. Protect-триггер taxi_drivers откатывал ЛЕГАЛЬНЫЕ серверные
--    обновления (админ-«Проверить»): сервисная роль не проходит
--    is_admin_email(), и is_verified восстанавливалось обратно.
--    Теперь триггер пропускает service_role (и флаговый пересчёт).
-- 2. Закрепление на главной — со сроком: часы/дни выбирает админ при
--    закреплении (п.3 замечаний 23.08). expires_at NULL = бессрочно.
-- 3. Предпочтения пассажира (п.11): предпочтительный пол таксиста и
--    минимальный возраст; опции поездки (животные, багаж, детское
--    кресло) — массивом.
-- 4. События поездки (п.13): лента «принял/выехал/отменил…» в разделе
--    такси вместо голых статусов; уведомления дублирует сервер.
-- Идемпотентно.
-- =============================================================================
set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Protect-триггер с учётом сервисной роли
-- ---------------------------------------------------------------------------
create or replace function public.taxi_drivers_protect()
returns trigger
language plpgsql
as $$
begin
  if not is_admin_email()
     and coalesce(current_setting('request.jwt.role', true), '') <> 'service_role'
     and coalesce(current_setting('taxi.recalc', true), '') <> '1' then
    new.is_verified := old.is_verified;
    new.rating := old.rating;
    new.ride_count := old.ride_count;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Срок закрепления
-- ---------------------------------------------------------------------------
alter table public.home_pinned
  add column if not exists expires_at timestamptz;

comment on column public.home_pinned.expires_at is
  'До какого момента блок закреплён на главной. NULL — бессрочно.';

-- ---------------------------------------------------------------------------
-- 3. Предпочтения и опции поездки
-- ---------------------------------------------------------------------------
alter table public.taxi_rides
  add column if not exists pref_gender text not null default 'any';

alter table public.taxi_rides
  drop constraint if exists taxi_rides_pref_gender_known;
alter table public.taxi_rides
  add constraint taxi_rides_pref_gender_known
  check (pref_gender in ('any', 'male', 'female'));

alter table public.taxi_rides
  add column if not exists pref_min_age integer not null default 18;

alter table public.taxi_rides
  add column if not exists options text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- 4. События поездки
-- ---------------------------------------------------------------------------
create table if not exists public.taxi_events (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.taxi_rides(id) on delete cascade,
  -- created / accepted / to_pickup / in_ride / completed / cancelled
  event_type text not null,
  -- кто инициировал: rider / driver / system
  actor text not null default 'system',
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists taxi_events_ride_idx
  on public.taxi_events (ride_id, created_at);

alter table public.taxi_events enable row level security;

drop policy if exists "taxi events participant read" on public.taxi_events;
create policy "taxi events participant read"
  on public.taxi_events for select
  using (
    exists (
      select 1 from public.taxi_rides r
      where r.id = ride_id
        and (r.rider_id = auth.uid() or r.driver_id = auth.uid())
    )
    or is_admin_email()
  );

grant select on public.taxi_events to anon, authenticated;

comment on table public.taxi_events is
  'Лента событий поездки ВайТакси: пишет сервер при каждом переходе '
  'статуса; пассажир и таксист видят её в разделе такси.';
