-- Ник в личной анкете и множитель скругления живут в разных таблицах.

alter table public.profiles
  add column if not exists nickname text,
  add column if not exists show_nickname boolean not null default false;

comment on column public.profiles.nickname is
  'Короткое имя. Показывается вместо ФИО, только если show_nickname = true.';
comment on column public.profiles.show_nickname is
  'Личная анкета: показывать ник вместо имени.';

alter table public.user_settings
  add column if not exists hide_prayer boolean not null default false,
  add column if not exists light_mode boolean not null default false,
  add column if not exists radius_scale integer not null default 100,
  add column if not exists quick_widgets jsonb not null default '["status","lang","notify","theme"]'::jsonb,
  add column if not exists hidden_menu jsonb not null default '[]'::jsonb;

comment on column public.user_settings.hide_prayer is
  'Скрыть виджет времён намаза в боковом меню.';
comment on column public.user_settings.light_mode is
  'Режим правки меню: можно прятать разделы.';
comment on column public.user_settings.radius_scale is
  'Множитель скругления карточек, 0…200 (100 = как сейчас).';
comment on column public.user_settings.quick_widgets is
  'Четыре слота быстрых иконок бокового меню.';
comment on column public.user_settings.hidden_menu is
  'Идентификаторы скрытых пунктов бокового меню.';
