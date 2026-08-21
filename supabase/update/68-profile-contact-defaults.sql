-- =============================================================================
-- 68. Дефолты видимости контактов на аккаунте
-- -----------------------------------------------------------------------------
-- Три галочки из шага «Ваш профиль» гида (решение владельца, 21.08 ночь):
-- «Не показывать в анкетах» телефон / WhatsApp / Telegram. Хранятся на
-- АККАУНТЕ и автоматически применяются к каждой новой анкете (личная,
-- специалист, задание): скрытое просто не подставляется, телефон ещё и
-- получает анкетный флаг hide_phone = true.
--
-- Колонки nullable-безопасны: отсутствие строки = false (показывать).
-- Приложение на базе без этой миграции продолжает работать (селект в
-- AuthProvider повторяется коротким списком).
-- =============================================================================
alter table public.user_profiles
  add column if not exists hide_phone boolean not null default false;
alter table public.user_profiles
  add column if not exists hide_whatsapp boolean not null default false;
alter table public.user_profiles
  add column if not exists hide_telegram boolean not null default false;

comment on column public.user_profiles.hide_phone is
  'Дефолт для новых анкет: не показывать телефон (анкета получает hide_phone=true).';
comment on column public.user_profiles.hide_whatsapp is
  'Дефолт для новых анкет: не подставлять WhatsApp.';
comment on column public.user_profiles.hide_telegram is
  'Дефолт для новых анкет: не подставлять Telegram.';
