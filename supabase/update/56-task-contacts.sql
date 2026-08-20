-- ============================================================================
-- 56. Контакты в заданиях: три тумблера вместо «Общего номера»
-- ============================================================================
--
-- Что было. В форме задания стоял блок «Общий номер»: человек вводил
-- телефон заново на каждое задание. Номер при этом уже лежал в профиле,
-- то есть одни и те же цифры хранились в двух местах и разъезжались —
-- поменял в профиле, а в старых заданиях остался прежний.
--
-- Что стало. Номера живут ТОЛЬКО в профиле (user_profiles: phone,
-- whatsapp, telegram) и заполняются один раз. В задании выбирается не
-- номер, а видимость: показывать ли телефон, WhatsApp, Telegram по
-- этому конкретному заданию.
--
-- Почему видимость хранится у задания, а не у профиля: по одному
-- заданию человек готов принимать звонки, по другому — только
-- сообщения в WhatsApp. Это свойство объявления, а не свойство
-- человека.
--
-- Безопасность. Сами номера здесь не дублируются — только три
-- логических флага. Значение по умолчанию false: контакт не
-- раскрывается, пока автор явно не разрешил (deny by default).
-- ============================================================================

alter table public.tasks
  add column if not exists show_phone    boolean not null default false,
  add column if not exists show_whatsapp boolean not null default false,
  add column if not exists show_telegram boolean not null default false;

comment on column public.tasks.show_phone is
  'Показывать в задании телефон из профиля автора. Сам номер не дублируется.';
comment on column public.tasks.show_whatsapp is
  'Показывать в задании WhatsApp из профиля автора.';
comment on column public.tasks.show_telegram is
  'Показывать в задании Telegram из профиля автора.';

-- Существующие задания: раньше телефон в платных заданиях показывался
-- всегда, поэтому для них сохраняем прежнее поведение — иначе у живых
-- объявлений молча пропали бы контакты и заказчику перестали бы
-- звонить. Безвозмездные задания телефон не показывали, их не трогаем.
update public.tasks
   set show_phone = true
 where is_paid = true
   and show_phone = false;

-- ---------------------------------------------------------------------------
-- Лента заданий: отдаём флаги и, если разрешено, сам контакт из профиля.
-- ---------------------------------------------------------------------------
--
-- Контакт подставляется на стороне базы, а не собирается клиентом:
-- клиенту нельзя доверять решение «показывать или нет». Условия те же,
-- что во вьюхе профилей (обновление 47): анонимному посетителю контакты
-- не отдаются вообще, иначе номера уедут сборщикам.
--
-- ВНИМАНИЕ: контакты лежат в ДВУХ РАЗНЫХ таблицах.
--
--   public.user_profiles — аккаунт. Здесь только phone.
--   public.profiles      — анкета. Здесь whatsapp и telegram.
--
-- Поэтому WhatsApp и Telegram нельзя брать из алиаса u (user_profiles):
-- таких колонок там нет. Их берём из анкеты автора отдельным подзапросом.
--
-- Анкет у человека может быть несколько (личная и специалиста), причём
-- owner_id не уникален. Берём ту же, что и функция выдачи анкет в
-- schema.sql: `order by is_personal desc, created_at desc` — личная
-- приоритетнее, среди равных свежая. limit 1 обязателен, иначе
-- подзапрос упадёт на втором ряду.

drop view if exists public.v_tasks_feed;
create view public.v_tasks_feed
with (security_invoker = false)
as
select
  t.id, t.author_id, t.is_paid, t.kind, t.title, t.description, t.category,
  t.reward, t.purchase_budget, t.priority, t.slots,
  t.deadline_at, t.scheduled_at, t.address, t.lat, t.lng,
  t.min_rating, t.min_account_days, t.min_tasks_done, t.allow_newcomers,
  t.status, t.payment_status, t.submitted_at, t.completed_at,
  t.cancelled_at, t.cancel_reason, t.is_archived, t.created_at, t.updated_at,
  t.payment_method,
  t.dispute_until, t.dispute_reason,
  t.payment_received_at, t.visible_until,
  t.dispute_author_ok, t.dispute_executor_ok,
  -- Обновление 56
  t.show_phone, t.show_whatsapp, t.show_telegram,
  case
    when auth.uid() is null then ''
    when t.show_phone then coalesce(u.phone, '')
    else ''
  end as author_phone,
  -- WhatsApp и Telegram живут в анкете (public.profiles), а не в
  -- аккаунте: в user_profiles таких колонок нет.
  case
    when auth.uid() is null then ''
    when t.show_whatsapp then coalesce(ap.whatsapp, '')
    else ''
  end as author_whatsapp,
  case
    when auth.uid() is null then ''
    when t.show_telegram then coalesce(ap.telegram, '')
    else ''
  end as author_telegram,
  u.full_name             as author_name,
  u.avatar_url            as author_avatar_url,
  u.resident_rating       as author_rating,
  u.resident_review_count as author_review_count,
  u.tasks_created_count   as author_tasks_created,
  greatest(0, extract(day from now() - u.created_at)::int) as author_account_days,
  (select count(*) from public.task_participants p
    where p.task_id = t.id and p.status in ('joined', 'attended', 'done')) as taken_slots
from public.tasks t
join public.user_profiles u on u.id = t.author_id
-- Анкета автора: только ради whatsapp/telegram. LEFT JOIN — анкеты
-- может не быть вовсе (человек зарегистрировался и сразу создал
-- задание), и такое задание обязано остаться в ленте.
left join lateral (
  select p.whatsapp, p.telegram
    from public.profiles p
   where p.owner_id = t.author_id
   order by p.is_personal desc, p.created_at desc
   limit 1
) ap on true
where not t.is_archived;

grant select on public.v_tasks_feed to anon, authenticated;

-- ============================================================================
-- ВАЖНО: старая колонка НЕ удаляется этой миграцией.
--
-- В таблице заданий телефон отдельным столбцом не хранился, поэтому
-- удалять здесь нечего. Если после выката обнаружится неиспользуемый
-- столбец с номером — удалять его нужно ОТДЕЛЬНОЙ миграцией и только
-- после того, как новый код отработает на проде хотя бы неделю:
-- `alter table ... drop column` необратим, из резервной копии
-- восстанавливать дорого.
-- ============================================================================

-- Проверка после применения:
--   select id, is_paid, show_phone, show_whatsapp, show_telegram
--     from public.tasks order by created_at desc limit 10;
--   select count(*) filter (where show_phone) as with_phone, count(*)
--     from public.tasks;
