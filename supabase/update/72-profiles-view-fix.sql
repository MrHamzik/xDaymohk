-- =============================================================================
-- Даймохк — обновление 72: вьюха каталога теряет ник и галочки видимости
-- -----------------------------------------------------------------------------
-- СИМПТОМЫ (от владельца, Этап 2):
--   · никнейм личной анкеты и галочка «показывать ник вместо ФИО» не
--     сохраняются — после перезагрузки поле снова пустое;
--   · личная анкета «не подтягивает» галочки «не показывать телефон /
--     WhatsApp / Telegram».
--
-- КОРЕНЬ. Анкеты читаются через вьюху v_profiles (обновление 47).
-- Позже миграции добавили в таблицу profiles колонки:
--   · 51 — nickname, show_nickname;
--   · 69 — hide_whatsapp, hide_telegram;
-- но вьюху НЕ пересоздали: она по-прежнему отдаёт набор колонок из 47.
-- Поля физически писались в базу, однако чтение возвращало пустоту —
-- интерфейс показывал «ничего не сохранено», а каждое следующее
-- сохранение записывало поверх уже пустые значения.
--
-- ЛЕЧЕНИЕ.
--   1. Вьюха пересоздаётся с четырьмя колонками (набор колонок у живой
--      вьюхи меняется только через DROP + CREATE).
--   2. Одноразовое восстановление личных анкет: их галочки видимости
--      синхронизируются с дефолтами владельца из user_profiles — ровно
--      то, что анкета обязана была унаследовать при создании. Личная
--      анкета одна на человека и создаётся из дефолтов, поэтому
--      рассинхронизация — следствие бага, а не осознанный выбор.
--      Галочки анкет специалистов НЕ трогаются: это переопределения.
--
-- Идемпотентно, можно перезапускать.
-- =============================================================================
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles'
                   and column_name = 'nickname')
    then raise exception 'Нет profiles.nickname — сначала примените обновление 51'; end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles'
                   and column_name = 'hide_telegram')
    then raise exception 'Нет profiles.hide_telegram — сначала примените обновление 69'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Восстановление личных анкет (ДО пересоздания вьюхи — работаем с
--    таблицей напрямую)
-- ---------------------------------------------------------------------------
update public.profiles p
set hide_phone    = up.hide_phone,
    hide_whatsapp = up.hide_whatsapp,
    hide_telegram = up.hide_telegram
from public.user_profiles up
where p.is_personal = true
  and p.owner_id = up.id;

-- ---------------------------------------------------------------------------
-- 2. Вьюха каталога: тот же смысл, плюс четыре колонки
-- ---------------------------------------------------------------------------
-- Набор колонок у существующей вьюхи не меняется через CREATE OR
-- REPLACE — только DROP + CREATE (как и в обновлении 47).
drop view if exists public.v_profiles;

create view public.v_profiles
with (security_invoker = true)
as
select
  p.id,
  p.owner_id,
  p.full_name,
  p.avatar_url,
  p.photos,
  p.is_specialist,
  p.is_personal,
  p.profession_category,
  p.profession_title,
  p.experience,
  p.experience_start,
  p.experience_end,
  p.experience_current,
  p.bio,
  p.workplace_address,
  p.workplace_coords,
  p.rating,
  p.review_count,
  -- Контакты: настоящие — владельцу и админу, пустые — всем остальным
  -- (обновление 47: гостей не пускаем собирать номера парсером).
  case when auth.uid() is null then '' else p.phone end     as phone,
  case when auth.uid() is null then null else p.whatsapp end as whatsapp,
  case when auth.uid() is null then null else p.telegram end as telegram,
  p.hide_phone,
  -- Добавлено обновлением 72: галочки видимости анкеты, ник и флаг
  -- «показывать ник вместо ФИО». Раньше вьюха их не отдавала, и
  -- сохранённые значения «исчезали» после перезагрузки.
  p.hide_whatsapp,
  p.hide_telegram,
  p.nickname,
  p.show_nickname,
  p.same_as_phone_whatsapp,
  (
    auth.uid() is null
    and (
      coalesce(p.phone, '') <> ''
      or coalesce(p.whatsapp, '') <> ''
      or coalesce(p.telegram, '') <> ''
    )
  ) as contacts_locked,
  p.video_url,
  p.is_verified,
  p.verification_status,
  p.is_admin,
  p.is_hidden,
  p.is_banned,
  p.work_days,
  p.work_hours_start,
  p.work_hours_end,
  p.break_start,
  p.break_end,
  p.is_flexible_schedule,
  p.gender,
  p.birth_date,
  p.settlement,
  p.created_at,
  p.updated_at
from public.profiles p;

grant select on public.v_profiles to anon, authenticated;

comment on view public.v_profiles is
  'Каталог анкет для чтения. Телефон, WhatsApp и Telegram отдаются '
  'только вошедшим: у гостей это пустые значения, а contacts_locked '
  'сообщает интерфейсу, что контакты существуют, но закрыты. '
  'Обновление 72: добавлены hide_whatsapp, hide_telegram, nickname, '
  'show_nickname. security_invoker = true — RLS таблицы profiles '
  'действует как обычно.';
