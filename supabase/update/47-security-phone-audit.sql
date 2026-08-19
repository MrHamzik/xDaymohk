-- =============================================================================
-- Даймохк — обновление 47
-- Безопасность: телефон скрыт от гостей + журнал действий администраторов.
--
-- Часть 1. Телефон виден гостям
-- -----------------------------
-- Таблица profiles читается политикой «profiles public read» без всякой
-- авторизации — так и задумано, каталог должен открываться сразу. Но в
-- строке лежат phone, whatsapp и telegram, и они уезжают вместе со
-- всеми остальными колонками. Любой скрипт за один проход собирает базу
-- телефонов села: одна страница, один запрос, никаких капч.
--
-- Убрать колонку из таблицы нельзя — она нужна владельцу и админам.
-- Забрать привилегию на колонку у anon тоже нельзя: клиент читает
-- `select *`, а звёздочка при отсутствии права на одну колонку роняет
-- ВЕСЬ запрос — каталог у гостей просто перестанет открываться.
--
-- Поэтому вводим вьюху v_profiles с security_invoker = true: RLS
-- таблицы продолжает работать как работала, а контакты подменяются
-- пустой строкой, когда auth.uid() пуст (гость). Владелец и админ
-- видят настоящие значения.
--
-- Флаг contacts_locked говорит интерфейсу, ПОЧЕМУ контактов нет:
-- «их скрыли» и «человек их не указал» — разные состояния, и кнопку
-- «Войдите, чтобы увидеть» надо показывать только в первом.
--
-- Часть 2. Действия администраторов не логируются
-- -----------------------------------------------
-- Блокировка, разблокировка, выдача и снятие прав не оставляют следов.
-- Админов двое, разобраться «кто и почему» после факта невозможно.
--
-- Таблица admin_audit_log: кто, что, над кем, когда, причина. Пишет
-- только сервер (service_role, минуя RLS), читают только админы,
-- изменять и удалять не может НИКТО — журнал, который можно
-- подчистить, journal-ом не является.
--
-- Идемпотентно, можно перезапускать.
-- =============================================================================
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'profiles')
    then raise exception 'Нет таблицы profiles'; end if;
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'user_profiles')
    then raise exception 'Нет таблицы user_profiles'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Витрина анкет без контактов для гостей
--
-- security_invoker = true — принципиально: вьюха НЕ должна обходить RLS
-- таблицы. Скрытые и забаненные анкеты обязаны остаться скрытыми, как и
-- при прямом чтении profiles.
--
-- DROP + CREATE, а не CREATE OR REPLACE: у живой вьюхи нельзя менять
-- набор колонок через replace, а мы добавляем contacts_locked.
-- ---------------------------------------------------------------------------
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
  -- Контакты: настоящие — владельцу и админу, пустые — всем остальным.
  -- Вошедший житель контакты видит: сервис для того и сделан, чтобы
  -- соседи могли позвонить друг другу. Закрываемся от анонимных
  -- сборщиков, а не от жителей.
  case when auth.uid() is null then '' else p.phone end     as phone,
  case when auth.uid() is null then null else p.whatsapp end as whatsapp,
  case when auth.uid() is null then null else p.telegram end as telegram,
  p.hide_phone,
  p.same_as_phone_whatsapp,
  -- true = контакты есть, но скрыты до входа. Отличается от «контактов
  -- нет вовсе»: в первом случае показываем кнопку входа, во втором —
  -- ничего.
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
  'security_invoker = true — RLS таблицы profiles действует как обычно.';

-- ---------------------------------------------------------------------------
-- 2. Журнал действий администраторов
--
-- target_user_id ссылается на user_profiles с on delete set null:
-- удаление аккаунта не должно стирать запись о том, что с ним делали.
-- Ради этого же рядом хранится target_label — снимок имени на момент
-- действия, читаемый даже когда строки пользователя уже нет.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id             bigserial primary key,
  actor_id       uuid references public.user_profiles(id) on delete set null,
  actor_email    text not null default '',
  action         text not null,
  target_user_id uuid references public.user_profiles(id) on delete set null,
  target_label   text not null default '',
  reason         text not null default '',
  -- Подробности действия: срок блокировки, прежнее значение права и т. п.
  -- jsonb, а не отдельные колонки: набор полей у разных действий разный,
  -- а плодить nullable-колонки под каждое — путь к таблице из тридцати
  -- всегда пустых столбцов.
  details        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists idx_admin_audit_created
  on public.admin_audit_log (created_at desc);
create index if not exists idx_admin_audit_target
  on public.admin_audit_log (target_user_id, created_at desc);
create index if not exists idx_admin_audit_actor
  on public.admin_audit_log (actor_id, created_at desc);

comment on table public.admin_audit_log is
  'Журнал административных действий: кто, что, над кем, когда и почему. '
  'Пишется только сервером через service_role. Изменение и удаление '
  'записей не разрешено никому.';

alter table public.admin_audit_log enable row level security;

-- Читают только админы. Политик на insert/update/delete НЕТ намеренно:
-- при включённом RLS отсутствие политики означает запрет, а service_role
-- RLS обходит — то есть писать может только сервер.
drop policy if exists "admin_audit_log admin read" on public.admin_audit_log;
create policy "admin_audit_log admin read"
  on public.admin_audit_log for select
  using (public.is_admin_email());

-- Прав на запись не выдаём даже authenticated: пусть попытка уйдёт в
-- отказ на уровне привилегий, не дожидаясь RLS.
revoke insert, update, delete on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;
grant usage, select on sequence public.admin_audit_log_id_seq to service_role;

-- ---------------------------------------------------------------------------
-- 3. Готово
-- ---------------------------------------------------------------------------
do $$
begin
  raise notice 'Обновление 47 применено: контакты скрыты от гостей, журнал админов создан.';
end $$;

-- =============================================================================
-- Проверка:
--   -- под анонимом контакты должны быть пустыми:
--   select id, phone, whatsapp, contacts_locked from public.v_profiles limit 5;
--
--   -- журнал пуст, но доступен админу:
--   select * from public.admin_audit_log order by created_at desc limit 20;
-- =============================================================================
