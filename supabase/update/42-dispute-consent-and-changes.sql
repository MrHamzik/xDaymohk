-- =============================================================================
-- Даймохк — обновление 42
-- Двустороннее согласие в споре, приём изменений исполнителем,
-- немедленное удаление отменённых заданий.
--
-- Что решает
-- ----------
-- 1. СПОР закрывался односторонне. Кнопку «Договорились» видел и
--    нажимал заказчик — задание закрывалось, даже если исполнитель
--    денег не получил и ничего не подтверждал. Теперь согласие нужно
--    от ОБОИХ: две отметки времени, и пока обе не проставлены, сделка
--    не закрывается.
--
-- 2. ИЗМЕНЕНИЯ УСЛОВИЙ проходили мимо исполнителя. Заказчик правил
--    награду или адрес, откликнувшийся получал уведомление — и на этом
--    всё: заказчик мог одобрить его на новых условиях, о которых тот и
--    не знал. Теперь правка помечает отклик как «требует согласия»:
--    одобрить нельзя, пока исполнитель не нажмёт «Принять изменения».
--
--    Заодно это снимает прежний запрет: править стало можно и ПОСЛЕ
--    одобрения — одобренный отклик просто возвращается в состояние
--    «на рассмотрении», и цикл повторяется.
--
-- 3. ОТМЕНЁННЫЕ задания висели неделю. Их никто не брал и не выполнял,
--    чеков и оценок по ним нет — держать такую запись незачем.
--    Удаляем сразу.
--
--    Оговорка про эскроу: если появится удержание средств и штрафы за
--    отмену, историю отмен придётся хранить. Поле cancelled_at и статус
--    'cancelled' остаются в схеме, поэтому вернуться к «скрывать вместо
--    удаления» можно правкой одной функции — ломать структуру не
--    придётся.
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
-- 1. Согласие сторон в споре
--
-- Две метки времени, а не один boolean: по ним видно, кто согласился
-- первым и когда. При разборе жалобы это единственный след того, как
-- стороны вели себя в споре.
-- ---------------------------------------------------------------------------
alter table public.tasks
  add column if not exists dispute_author_ok   timestamptz,
  add column if not exists dispute_executor_ok timestamptz;

comment on column public.tasks.dispute_author_ok is
  'Когда ЗАКАЗЧИК нажал «Договорились». NULL — ещё не соглашался.';
comment on column public.tasks.dispute_executor_ok is
  'Когда ИСПОЛНИТЕЛЬ нажал «Договорились». NULL — ещё не соглашался.';

-- ---------------------------------------------------------------------------
-- 2. Согласие исполнителя с изменёнными условиями
--
-- Метка времени на УЧАСТНИКЕ, а не на задании: у задания «на дату»
-- откликов несколько, и каждый соглашается сам за себя.
--
-- needs_consent ставится при правке задания, снимается кнопкой
-- «Принять изменения». Пока стоит — заказчик не может одобрить отклик.
-- ---------------------------------------------------------------------------
alter table public.task_participants
  add column if not exists needs_consent boolean not null default false,
  add column if not exists consent_at    timestamptz;

comment on column public.task_participants.needs_consent is
  'Условия задания изменились после отклика: нужно согласие исполнителя.';
comment on column public.task_participants.consent_at is
  'Когда исполнитель принял изменённые условия.';

-- ---------------------------------------------------------------------------
-- 3. Тип уведомления «условия изменились — подтвердите»
--
-- Список пересобираем целиком: check-ограничение нельзя дополнить.
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
  'task_payment_received',
  'task_updated',
  -- Обновление 42
  'task_changes_accepted', 'task_dispute_agreed'
));

-- ---------------------------------------------------------------------------
-- 4. Вьюхи: новые колонки нужно перечислить ЯВНО
--
-- v_tasks_feed и v_task_details перечисляют колонки списком, поэтому
-- любая новая колонка tasks должна быть дописана И СЮДА (см. обновление
-- 36, где на этом уже обожглись с payment_method).
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
  t.payment_received_at, t.visible_until,
  -- Обновление 42
  t.dispute_author_ok, t.dispute_executor_ok,
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
  t.dispute_author_ok, t.dispute_executor_ok,
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
-- 4b. Вьюха участников: needs_consent должен дойти до интерфейса
--
-- v_task_participants тоже перечисляет колонки явно (обновление 27).
-- Без пересоздания флаг согласия не попадёт в карточку, и кнопка
-- «Принять изменения» никогда не покажется.
-- ---------------------------------------------------------------------------
drop view if exists public.v_task_participants;

create view public.v_task_participants
with (security_invoker = false)
as
select
  p.id,
  p.task_id,
  p.user_id,
  p.status,
  p.attended,
  p.bonus_percent,
  p.excluded_at,
  p.approved_at,
  p.joined_at,
  -- Обновление 42
  p.needs_consent,
  p.consent_at,
  u.full_name,
  u.avatar_url,
  coalesce(u.resident_rating, 0)  as rating,
  coalesce(u.tasks_done_count, 0) as tasks_done_count,
  greatest(0, extract(day from now() - u.created_at)::int) as account_days
from public.task_participants p
join public.user_profiles u on u.id = p.user_id;

grant select on public.v_task_participants to anon, authenticated;

comment on view public.v_task_participants is
  'Участники задания с публичными данными профиля. approved_at — одобрен ли '
  'отклик, needs_consent — ждём согласия с изменёнными условиями.';

-- ---------------------------------------------------------------------------
-- 5. Уборка: отменённые удаляются сразу
--
-- Раньше они архивировались через неделю показа (обновление 39).
-- Задание, до которого не дошли ни работа, ни оценка, ни расчёт, не
-- несёт истории — держать его в базе незачем.
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_closed_tasks()
returns table (expired_deleted integer, cancelled_archived integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expired_deleted   integer := 0;
  v_cancelled_deleted integer := 0;
begin
  -- Просрочка: и помеченные 'expired', и открытые с истёкшим сроком по
  -- любому из двух полей (deadline_at у срочных, scheduled_at у «на дату»).
  with removed as (
    delete from public.tasks
     where status = 'expired'
        or (
             status = 'open'
             and coalesce(deadline_at, scheduled_at) is not null
             and coalesce(deadline_at, scheduled_at) < now()
           )
    returning id
  )
  select count(*) into v_expired_deleted from removed;

  -- Отменённые: удаляем сразу. Участники уходят каскадом; отзывов по
  -- таким заданиям нет по определению (они ставятся после завершения).
  with removed_cancelled as (
    delete from public.tasks
     where status = 'cancelled'
    returning id
  )
  select count(*) into v_cancelled_deleted from removed_cancelled;

  -- Имя второй колонки оставляем прежним ради совместимости вызовов.
  return query select v_expired_deleted, v_cancelled_deleted;
end;
$$;

comment on function public.cleanup_closed_tasks() is
  'Удаляет просроченные и отменённые задания: до оценок и расчёта они не дошли.';

revoke all on function public.cleanup_closed_tasks() from public;
grant execute on function public.cleanup_closed_tasks() to service_role;

-- ---------------------------------------------------------------------------
-- 6. Разовая уборка уже накопившихся отменённых
-- ---------------------------------------------------------------------------
do $$
declare
  v_count integer;
begin
  delete from public.tasks where status = 'cancelled';
  get diagnostics v_count = row_count;
  raise notice 'Удалено отменённых заданий: %', v_count;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Готово
-- ---------------------------------------------------------------------------
do $$
begin
  raise notice 'Обновление 42 применено: согласие сторон в споре, приём изменений, отменённые удаляются сразу.';
end $$;

-- =============================================================================
-- Проверка:
--   select * from public.cleanup_closed_tasks();
--   select status, count(*) from public.tasks group by status;
--   select id, dispute_author_ok, dispute_executor_ok from public.tasks
--    where status = 'disputed';
--   select task_id, user_id, needs_consent from public.task_participants
--    where needs_consent;
-- =============================================================================
