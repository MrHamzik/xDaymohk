-- =============================================================================
-- Даймохк — обновление 80: цены по тарифам, доплаты, требования к машинам
-- -----------------------------------------------------------------------------
-- Решения владельца (п.9 замечаний 23.08, «все четыре»):
--   1. У каждого тарифа могут быть СВОИ подача/км/мин (иначе — общая
--      сетка × множитель тарифа).
--   2. Детское кресло — фиксированная доплата (опция child_seat).
--   3. Межгород: км сверх порога — по повышенной ставке.
--   4. Отмена после принятия заказа — информативная плата.
--   5. Требования к машинам по тарифам (таблица Яндекса, сведённая к
--      нашим 4 тарифам): год ниже порога — тариф недоступен, null —
--      «—» (не положен), минивэн — отдельный список. Админ правит
--      каждую модель в «Такси → Марки».
-- Идемпотентно.
-- =============================================================================
set lock_timeout = '5s';

alter table public.taxi_tariffs
  add column if not exists base_fare numeric,
  add column if not exists per_km numeric,
  add column if not exists per_min numeric;

alter table public.taxi_fare
  add column if not exists child_seat_fee numeric not null default 50,
  add column if not exists intercity_from_km numeric not null default 30,
  add column if not exists intercity_per_km numeric not null default 25,
  add column if not exists cancel_fee numeric not null default 100;

comment on column public.taxi_fare.child_seat_fee is 'Доплата за детское кресло, ₽.';
comment on column public.taxi_fare.intercity_from_km is 'С какого километра начинается межгород.';
comment on column public.taxi_fare.intercity_per_km is 'Ставка межгорода, ₽/км.';
comment on column public.taxi_fare.cancel_fee is 'Плата за отмену после принятия заказа, ₽ (напрямую водителю).';

-- Требования к машинам: модель → минимальные годы по тарифам.
create table if not exists public.car_requirements (
  model text primary key references public.car_brands(name) on update cascade on delete cascade,
  year_economy integer,
  year_comfort integer,
  year_business integer,
  is_minivan boolean not null default false
);

alter table public.car_requirements enable row level security;
drop policy if exists "car requirements public read" on public.car_requirements;
create policy "car requirements public read" on public.car_requirements for select using (true);

-- Стартовые требования: эконом — от 2011, комфорт — от 2015,
-- бизнес — от 2016 для премиальных моделей (остальным «—»),
-- минивэны — список семиместных. Админ уточняет по таблице.
insert into public.car_requirements
  (model, year_economy, year_comfort, year_business, is_minivan)
select
  b.name,
  2011,
  2015,
  case
    when b.name ~* '^(BMW (5|7|X5|X6)|Mercedes-Benz (E|S|GL|CLS|GLE|GLS)|Mercedes-Maybach|Audi (A6|A8|Q7|Q8)|Lexus (ES|GS|LS|LX|RX|GX)|Toyota (Land Cruiser|Camry)|Genesis|Jaguar|Porsche|Rolls Royce|Bentley)'
      then 2016
    else null
  end,
  b.name in (
    'Kia Carnival', 'Mercedes-Benz V-klasse', 'Volkswagen Teramont',
    'Volkswagen Caddy', 'Ford Galaxy', 'Toyota Land Cruiser 200',
    'Toyota Land Cruiser Prado', 'Toyota Highlander', 'Mazda CX-9',
    'Chevrolet Tahoe', 'УАЗ СГР («буханка»)'
  )
from public.car_brands b
on conflict (model) do nothing;
