-- =============================================================================
-- Даймохк — обновление 38
-- Отметка исполнителя «Оплата получена» и видимость отменённых заданий.
--
-- Что закрывает
-- -------------
-- 1. Заказчик мог нажать «Подтвердить» и закрыть задание, не заплатив.
--    Со стороны сервиса сделка выглядела успешной, у исполнителя росли
--    счётчики, а денег он не видел. Теперь на заданиях с переводом
--    (СБП, карта, ЮMoney) кнопка «Подтвердить» разблокируется только
--    после того, как ИСПОЛНИТЕЛЬ отметил «Оплата получена».
--
--    На наличных отметки нет: деньги передаются из рук в руки при
--    встрече, и требовать второй клик там значило бы вешать задание
--    из-за исполнителя, который уже ушёл домой с деньгами.
--
--    Страховка от зависания: если исполнитель отметку так и не поставил,
--    через окно автоподтверждения (3 ч) блокировка снимается сама —
--    иначе пропавший исполнитель заморозил бы задание навсегда.
--
-- 2. Отменённое задание пропадало у ОБЕИХ сторон: заказчику — потому что
--    is_archived = true выкидывает его из ленты, исполнителю — оно
--    висело в «В работе» как живое. Ни следа, ни объяснения.
--    Теперь оно остаётся видимым обеим сторонам с пометкой «Отменено»
--    и уходит из списков через 7 суток.
--
-- Почему колонка, а не вывод из payment_status
-- --------------------------------------------
-- payment_status ('offline' | 'pending' | ...) описывает эквайринг,
-- которого в проекте нет: сервис в расчётах не участвует (ИП на НПД,
-- ст. 4 ч. 2 п. 5 закона 422-ФЗ). Отметка исполнителя — это ФАКТ,
-- зафиксированный человеком, и у него своя метка времени. Смешивать
-- их в одну колонку значило бы получить два разных смысла в одном поле.
--
-- Идемпотентно, можно перезапускать.
-- =============================================================================
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'tasks')
    then raise exception 'Нет таблицы tasks — сначала примените 18-tasks.sql'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Отметка исполнителя «Оплата получена»
--
-- Время, а не boolean: по метке видно, когда именно исполнитель
-- подтвердил расчёт — это единственный след платежа на стороне сервиса,
-- и он понадобится при разборе жалобы.
-- ---------------------------------------------------------------------------
alter table public.tasks
  add column if not exists payment_received_at timestamptz;

comment on column public.tasks.payment_received_at is
  'Когда ИСПОЛНИТЕЛЬ отметил, что получил оплату. NULL — не отмечал. '
  'Пока NULL, заказчик не может подтвердить задание с переводом.';

-- ---------------------------------------------------------------------------
-- 2. Срок жизни отменённого задания в списках
--
-- Отдельная колонка, а не «отменено = скрыть сразу»: обе стороны должны
-- увидеть, что произошло. Через неделю запись уходит из лент, но
-- остаётся в БД — на ней держатся счётчики и разбор жалоб.
-- ---------------------------------------------------------------------------
alter table public.tasks
  add column if not exists visible_until timestamptz;

comment on column public.tasks.visible_until is
  'До какого момента закрытое задание ещё показывается сторонам. '
  'Ставится при отмене (7 суток). NULL — правило не применяется.';

-- ---------------------------------------------------------------------------
-- 3. Вьюхи: новые колонки нужно перечислить ЯВНО
--
-- v_tasks_feed и v_task_details перечисляют колонки списком (обновление
-- 21). Колонка, добавленная в tasks и не дописанная сюда, до интерфейса
-- не доходит — именно так «терялся» payment_method в обновлении 33.
-- ---------------------------------------------------------------------------
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
  -- Обновление 38
  t.payment_received_at, t.visible_until,
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
where not t.is_archived;

grant select on public.v_tasks_feed to anon, authenticated;

drop view if exists public.v_task_details;

create view public.v_task_details
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
  u.full_name             as author_name,
  u.avatar_url            as author_avatar_url,
  u.resident_rating       as author_rating,
  u.resident_review_count as author_review_count,
  u.tasks_created_count   as author_tasks_created,
  greatest(0, extract(day from now() - u.created_at)::int) as author_account_days,
  (select count(*) from public.task_participants p
    where p.task_id = t.id and p.status in ('joined', 'attended', 'done')) as taken_slots
from public.tasks t
join public.user_profiles u on u.id = t.author_id;

grant select on public.v_task_details to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Тип уведомления «Оплата получена»
--
-- Список пересобираем целиком: check-ограничение нельзя дополнить,
-- его можно только заменить, и пропущенный тип уронит вставку
-- уведомления в рантайме.
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'system', 'profile_hidden', 'profile_visible', 'user_blocked', 'user_unblocked',
  'review_received', 'question_commented', 'comment_replied', 'like_received',
  'complaint_result', 'taxi_request', 'taxi_info',
  'task_taken', 'task_submitted', 'task_confirmed', 'task_auto_confirmed',
  'task_cancel_requested', 'task_cancelled', 'task_expired',
  'task_joined', 'task_excluded', 'task_reminder',
  'task_rated', 'task_rate_pending',
  'task_join_request', 'task_join_approved', 'task_join_rejected',
  'support_answered',
  'task_disputed', 'task_dispute_released',
  -- Обновление 38: исполнитель подтвердил получение денег
  'task_payment_received'
));

-- ---------------------------------------------------------------------------
-- 5. Готово
-- ---------------------------------------------------------------------------
do $$
begin
  raise notice 'Обновление 38 применено: отметка «Оплата получена» и видимость отменённых заданий.';
end $$;
