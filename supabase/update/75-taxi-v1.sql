-- =============================================================================
-- Даймохк — обновление 75: ВайТакси v1 (механика по мотивам Яндекс Такси)
-- -----------------------------------------------------------------------------
-- Согласованный скоуп v1: онлайн-таксист с анкетой авто; заказ А→Б из
-- адресной книги/геолокации; цена до заказа = подача + км + минуты,
-- сверху множитель тарифа и часовой множитель; заказ берёт первый
-- нажавший «Принять»; статусы поиск→назначен→еду→в поездке→завершено;
-- взаимные оценки; история. Оплата — наличными/СБП мимо сервиса.
-- Позже: автоназначение, «ко времени», карта в приложении, штрафы.
--
-- Состав:
--   taxi_drivers               — анкета таксиста и онлайн-статус;
--   taxi_fare                  — параметры цены (одна строка, правит админ);
--   taxi_tariffs               — тарифы «как в Яндексе» с множителями;
--   taxi_multiplier_schedule   — часовые слоты множителя спроса;
--   taxi_rides                 — поездки и статусы;
--   taxi_ratings               — взаимные оценки 1–5 после поездки.
--
-- Идемпотентно, можно перезапускать.
-- =============================================================================
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'user_profiles')
    then raise exception 'Нет таблицы user_profiles — сначала примените schema.sql'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Таксисты
-- ---------------------------------------------------------------------------
create table if not exists public.taxi_drivers (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,

  is_online boolean not null default false,

  -- Анкета авто: пассажир видит модель, цвет и номер у назначенного.
  car_model text not null default '',
  car_color text not null default '',
  car_plate text not null default '',
  years_driving integer not null default 0,

  -- Тарифы, которые возит таксист (id из taxi_tariffs).
  tariffs text[] not null default '{economy}',

  -- Поля, которые пишет ТОЛЬКО сервер/админ: значок проверки,
  -- агрегатный рейтинг и счётчик поездок. Триггер ниже не даёт
  -- клиенту подделать их через прямой клиент.
  is_verified boolean not null default false,
  rating numeric(3,2) not null default 0,
  ride_count integer not null default 0,

  updated_at timestamptz not null default now()
);

drop trigger if exists trg_taxi_drivers_updated on public.taxi_drivers;
create trigger trg_taxi_drivers_updated
  before update on public.taxi_drivers
  for each row execute function public.touch_updated_at();

-- Права на таблицу: читать могут все (пассажир видит машину
-- назначенного таксиста), писать — владелец строки и админ. SELECT
-- нужен и для UPDATE с WHERE (чтение старой строки).
grant select, update on public.taxi_drivers to anon, authenticated;

-- Клиент может править свою строку, но служебные поля остаются.
create or replace function public.taxi_drivers_protect()
returns trigger
language plpgsql
as $$
begin
  -- Флаг taxi.recalc ставит триггер пересчёта рейтинга — его апдейт
  -- служебных полей и есть легальный, не откатываем.
  if not is_admin_email()
     and coalesce(current_setting('taxi.recalc', true), '') <> '1' then
    new.is_verified := old.is_verified;
    new.rating := old.rating;
    new.ride_count := old.ride_count;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_taxi_drivers_protect on public.taxi_drivers;
create trigger trg_taxi_drivers_protect
  before update on public.taxi_drivers
  for each row execute function public.taxi_drivers_protect();

-- ---------------------------------------------------------------------------
-- 2. Параметры цены (одна строка, правит админ)
-- ---------------------------------------------------------------------------
create table if not exists public.taxi_fare (
  id integer primary key default 1,
  -- Подача (посадка), ₽.
  base_fare numeric not null default 50,
  -- ₽ за километр и за минуту в пути.
  per_km numeric not null default 15,
  per_min numeric not null default 2,
  -- Ниже этой суммы поездка не стоит — короткие «через улицу» не
  -- разоряют таксиста.
  min_fare numeric not null default 100,
  -- Прямая → дороги: сельские петли длиннее прямой.
  road_factor numeric not null default 1.3,
  updated_at timestamptz not null default now(),
  constraint taxi_fare_single_row check (id = 1)
);

insert into public.taxi_fare (id)
values (1)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Тарифы — набор «как в Яндексе», множители правит админ
-- ---------------------------------------------------------------------------
create table if not exists public.taxi_tariffs (
  id text primary key,
  label_ru text not null,
  label_ce text not null default '',
  multiplier numeric not null default 1,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

insert into public.taxi_tariffs (id, label_ru, label_ce, multiplier, sort_order) values
  ('economy',  'Эконом',   'Эконом',   1.0, 10),
  ('comfort',  'Комфорт',  'Комфорт',  1.3, 20),
  ('business', 'Бизнес',   'Бизнес',   1.8, 30),
  ('minivan',  'Минивэн',  'Минивэн',  1.5, 40)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Множитель спроса по часам: интервал [start_hour, end_hour)
-- ---------------------------------------------------------------------------
create table if not exists public.taxi_multiplier_schedule (
  id integer generated always as identity primary key,
  start_hour integer not null,
  end_hour integer not null,
  multiplier numeric not null default 1,
  constraint taxi_surge_hours check (start_hour >= 0 and start_hour < 24
                                 and end_hour > 0 and end_hour <= 24
                                 and start_hour < end_hour)
);

-- Стартовые слоты: утренний/вечерний пики и ночь. Не пересекаются.
insert into public.taxi_multiplier_schedule (start_hour, end_hour, multiplier)
select v.s, v.e, v.m
from (values (7, 9, 1.5), (17, 20, 1.5), (22, 24, 1.2), (0, 6, 1.2)) as v(s, e, m)
where not exists (select 1 from public.taxi_multiplier_schedule);

-- ---------------------------------------------------------------------------
-- 5. Поездки
-- ---------------------------------------------------------------------------
create table if not exists public.taxi_rides (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.user_profiles(id) on delete cascade,
  driver_id uuid references public.taxi_drivers(user_id) on delete set null,

  status text not null default 'searching',

  tariff_id text not null references public.taxi_tariffs(id),

  -- Точки: подпись для человека + координаты для расчёта.
  from_label text not null,
  from_lat numeric(10,7),
  from_lng numeric(10,7),
  to_label text not null,
  to_lat numeric(10,7),
  to_lng numeric(10,7),

  -- Расчёт на момент заказа: цена видна до и не меняется в пути.
  distance_km numeric(6,1) not null default 0,
  price numeric not null,
  multiplier numeric not null default 1,

  comment text not null default '',

  created_at timestamptz not null default now(),
  assigned_at timestamptz,
  completed_at timestamptz,
  cancelled_by text,

  constraint taxi_ride_status_known
    check (status in ('searching', 'assigned', 'to_pickup', 'in_ride',
                      'completed', 'cancelled'))
);

create index if not exists taxi_rides_searching_idx
  on public.taxi_rides (status) where status = 'searching';
create index if not exists taxi_rides_driver_idx
  on public.taxi_rides (driver_id, status);

-- ---------------------------------------------------------------------------
-- 6. Взаимные оценки
-- ---------------------------------------------------------------------------
create table if not exists public.taxi_ratings (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.taxi_rides(id) on delete cascade,
  rider_to_driver integer check (rider_to_driver between 1 and 5),
  driver_to_rider integer check (driver_to_rider between 1 and 5),
  created_at timestamptz not null default now(),
  constraint taxi_ratings_one_row_per_ride unique (ride_id)
);

-- ---------------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------------
alter table public.taxi_drivers enable row level security;

drop policy if exists "taxi drivers public read" on public.taxi_drivers;
create policy "taxi drivers public read"
  on public.taxi_drivers for select
  using (true);

drop policy if exists "taxi drivers self write" on public.taxi_drivers;
create policy "taxi drivers self write"
  on public.taxi_drivers for insert
  with check (auth.uid() = user_id);

drop policy if exists "taxi drivers self update" on public.taxi_drivers;
create policy "taxi drivers self update"
  on public.taxi_drivers for update
  using (auth.uid() = user_id or is_admin_email());

alter table public.taxi_fare enable row level security;
drop policy if exists "taxi fare public read" on public.taxi_fare;
create policy "taxi fare public read" on public.taxi_fare for select using (true);

alter table public.taxi_tariffs enable row level security;
drop policy if exists "taxi tariffs public read" on public.taxi_tariffs;
create policy "taxi tariffs public read" on public.taxi_tariffs for select using (true);

alter table public.taxi_multiplier_schedule enable row level security;
drop policy if exists "taxi surge public read" on public.taxi_multiplier_schedule;
create policy "taxi surge public read" on public.taxi_multiplier_schedule for select using (true);

alter table public.taxi_rides enable row level security;

drop policy if exists "taxi rides participant read" on public.taxi_rides;
create policy "taxi rides participant read"
  on public.taxi_rides for select
  using (auth.uid() = rider_id or auth.uid() = driver_id or is_admin_email());

drop policy if exists "taxi rides self insert" on public.taxi_rides;
create policy "taxi rides self insert"
  on public.taxi_rides for insert
  with check (auth.uid() = rider_id);

drop policy if exists "taxi rides participant update" on public.taxi_rides;
create policy "taxi rides participant update"
  on public.taxi_rides for update
  using (auth.uid() = rider_id or auth.uid() = driver_id or is_admin_email());

grant select, insert, update on public.taxi_rides to anon, authenticated;

alter table public.taxi_ratings enable row level security;

drop policy if exists "taxi ratings participant read" on public.taxi_ratings;
create policy "taxi ratings participant read"
  on public.taxi_ratings for select
  using (
    exists (
      select 1 from public.taxi_rides r
      where r.id = ride_id
        and (r.rider_id = auth.uid() or r.driver_id = auth.uid())
    )
    or is_admin_email()
  );

drop policy if exists "taxi ratings participant insert" on public.taxi_ratings;
create policy "taxi ratings participant insert"
  on public.taxi_ratings for insert
  with check (
    exists (
      select 1 from public.taxi_rides r
      where r.id = ride_id
        and (r.rider_id = auth.uid() or r.driver_id = auth.uid())
    )
  );

grant select, insert, update on public.taxi_ratings to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Агрегат рейтинга таксиста: пересчёт после каждой оценки
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER: пересчёт пишет чужую строку таксиста (рейтинг),
-- а RLS разрешает update только владельцу. Функция узкая — трогает
-- два агрегатных поля; search_path зафиксирован.
create or replace function public.taxi_recalc_driver_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver uuid;
begin
  select r.driver_id into v_driver
  from public.taxi_rides r
  where r.id = new.ride_id;

  if v_driver is null then
    return new;
  end if;

  -- Разрешаем себе запись служебных полей (см. protect-триггер);
  -- флаг транзакционный, снаружи не виден.
  perform set_config('taxi.recalc', '1', true);

  update public.taxi_drivers d
  set rating = coalesce(
        (select round(avg(rr.rider_to_driver)::numeric, 2)
         from public.taxi_ratings rr
         join public.taxi_rides r on r.id = rr.ride_id
         where r.driver_id = v_driver and rr.rider_to_driver is not null),
        0),
      ride_count = (
        select count(*) from public.taxi_rides r
        where r.driver_id = v_driver and r.status = 'completed')
  where d.user_id = v_driver;

  return new;
end;
$$;

drop trigger if exists trg_taxi_ratings_recalc on public.taxi_ratings;
create trigger trg_taxi_ratings_recalc
  after insert or update on public.taxi_ratings
  for each row execute function public.taxi_recalc_driver_rating();

comment on table public.taxi_rides is
  'ВайТакси v1: поездка с фиксированной при заказе ценой. '
  'Статусы: searching → assigned → to_pickup → in_ride → completed / cancelled.';
