-- =============================================================================
-- Даймохк — обновление 76: таксист-приватность и пункт «на линии»
-- -----------------------------------------------------------------------------
-- 1. Таксист может решать, показывать ли пассажирам пол и возраст
--    (в мусульманской общине это может быть важно — решение владельца,
--    п.17 замечаний 22.08). По умолчанию скрыто.
-- 2. Пункт меню/виджет «Я таксист: на линии» (п.15) скрыт по умолчанию:
--    существующим аккаунтам дописываем 'taxiline' в hidden_menu, как в
--    обновлении 64 для четвёрки быстрых настроек.
-- Идемпотентно.
-- =============================================================================
set lock_timeout = '5s';

alter table public.taxi_drivers
  add column if not exists show_gender boolean not null default false;

alter table public.taxi_drivers
  add column if not exists show_age boolean not null default false;

comment on column public.taxi_drivers.show_gender is
  'Таксист разрешает показывать пассажирам свой пол.';
comment on column public.taxi_drivers.show_age is
  'Таксист разрешает показывать пассажирам свой возраст.';

update public.user_settings
set hidden_menu = hidden_menu || '["taxiline"]'::jsonb
where not (hidden_menu @> '["taxiline"]'::jsonb);
