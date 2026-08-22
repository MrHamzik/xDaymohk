-- =============================================================================
-- Даймохк — обновление 79: год машины и «заказать для другого»
-- -----------------------------------------------------------------------------
-- п.7/п.9 замечаний 23.08: у машины появляется год (для будущих
-- требований к моделям по тарифам), у поездки — «для другого»:
-- имя и телефон фактического пассажира, водитель видит их в заказе.
-- Идемпотентно.
-- =============================================================================
set lock_timeout = '5s';

alter table public.taxi_drivers
  add column if not exists car_year integer
  check (car_year is null or (car_year >= 1980 and car_year <= 2035));

alter table public.taxi_rides
  add column if not exists passenger_name text not null default '';

alter table public.taxi_rides
  add column if not exists passenger_phone text not null default '';

comment on column public.taxi_rides.passenger_name is
  'Поездка «для другого»: имя фактического пассажира (п.7 замечаний 23.08).';
comment on column public.taxi_rides.passenger_phone is
  'Поездка «для другого»: телефон фактического пассажира.';
