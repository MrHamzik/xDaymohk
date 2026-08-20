-- Обязательный гид нового аккаунта: один раз на человека.

alter table public.user_settings
  add column if not exists tour_done boolean not null default false;

comment on column public.user_settings.tour_done is
  'Пошаговый гид после первого входа уже пройден.';
