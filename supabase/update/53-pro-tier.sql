-- Подписка Pro: ступень хранится в настройках. Оплата ещё не подключена.

alter table public.user_settings
  add column if not exists pro_tier text not null default 'none';

alter table public.user_settings
  drop constraint if exists user_settings_pro_tier_chk;

alter table public.user_settings
  add constraint user_settings_pro_tier_chk
  check (pro_tier in ('none', 'bronze', 'silver', 'gold', 'platinum'));

comment on column public.user_settings.pro_tier is
  'Подписка Pro: none / bronze / silver / gold / platinum.';
