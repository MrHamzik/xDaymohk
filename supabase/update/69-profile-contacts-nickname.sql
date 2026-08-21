-- =============================================================================
-- 69. Контакты — в профиле; анкеты получают галочки видимости; «другое» пол
-- -----------------------------------------------------------------------------
-- ТЗ от владельца (финальная редакция):
--   · номер WhatsApp и имя Telegram живут в ПРОФИЛЕ (аккаунте);
--   · в анкетах полей контактов больше нет — только три галочки
--     «показывать/не показывать», скопированные из профиля;
--   · пол допускает значение «другое»;
--   · в гиде появился шаг «Режим редактирования» (5-я позиция) —
--     нумерация шагов сдвигается, анкета стала 12-й, финал 13-й.
-- Идемпотентно (кроме сдвига tour_step — запускать один раз).
-- =============================================================================

-- 1. Профиль: WhatsApp и Telegram на аккаунте.
alter table public.user_profiles
  add column if not exists whatsapp text;
alter table public.user_profiles
  add column if not exists telegram text;

-- 2. Пол «другое»: чек-констрейнты обеих таблиц.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'user_profiles_gender_check'
             and conrelid = 'public.user_profiles'::regclass) then
    alter table public.user_profiles drop constraint user_profiles_gender_check;
  end if;
  alter table public.user_profiles
    add constraint user_profiles_gender_check check (gender in ('male', 'female', 'other'));
exception when duplicate_object then null; end $$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'profiles_gender_check'
             and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles drop constraint profiles_gender_check;
  end if;
  alter table public.profiles
    add constraint profiles_gender_check check (gender in ('male', 'female', 'other'));
exception when duplicate_object then null; end $$;

-- 3. Галочки видимости контактов в КАЖДОЙ анкете (переопределение профиля).
alter table public.profiles
  add column if not exists hide_whatsapp boolean not null default false;
alter table public.profiles
  add column if not exists hide_telegram boolean not null default false;

-- 4. Гид: вставлен шаг «Режим редактирования» на 5-ю позицию.
alter table public.user_settings
  drop constraint if exists user_settings_tour_step_range;

update public.user_settings
set tour_step = case
  when tour_step between 5 and 12 then tour_step + 1
  else tour_step
end;

alter table public.user_settings
  add constraint user_settings_tour_step_range
  check (tour_step >= 0 and tour_step <= 13);

comment on column public.user_settings.tour_step is
  'Номер шага единого гида из 14 (3 главная, 4 меню, 5 режим редактирования, 12 анкета, 13 финал). tour_done ставится только кнопкой «Завершить».';

-- Проверки:
--   select user_id, tour_step from public.user_settings where tour_step > 13;
--   select constraint_name from pg_constraint where conname like '%gender_check';
