-- =============================================================================
-- Даймохк — обновление 37
-- Настройки визуальных эффектов оформления.
--
-- Зачем в БД, а не только в localStorage
-- --------------------------------------
-- По той же причине, что тема и шрифт: человек заходит с телефона и с
-- компьютера, и настройки должны совпадать. На слабом телефоне он
-- выключает размытие — и не должен делать это заново после входа.
--
-- Одна jsonb-колонка, а не шесть булевых: эффектов со временем станет
-- больше, и добавление нового не должно требовать миграции.
--
-- Идемпотентно, можно перезапускать.
-- =============================================================================
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'user_settings')
    then raise exception 'Нет таблицы user_settings — сначала примените 28-user-settings.sql'; end if;
end $$;

alter table public.user_settings
  add column if not exists effects jsonb not null default '{}'::jsonb;

alter table public.user_settings
  drop constraint if exists user_settings_effects_is_object;
alter table public.user_settings
  add constraint user_settings_effects_is_object
  check (jsonb_typeof(effects) = 'object');

comment on column public.user_settings.effects is
  'Визуальные эффекты: { "shadow": 0..100, "glow": …, "gradient": …, '
  '"pattern": …, "blur": …, "motion": … }. Пустой объект = всё включено.';

do $$
begin
  raise notice 'Обновление 37 применено: user_settings.effects готова.';
end $$;
