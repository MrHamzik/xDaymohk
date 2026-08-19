-- =============================================================================
-- Даймохк — обновление 27
-- Одобрение исполнителя заказчиком на ПЛАТНЫХ заданиях.
--
-- Зачем
-- -----
-- Раньше на срочном задании работал принцип «первый нажавший забирает»:
-- участник сразу получал status='joined', задание уходило в 'in_progress'.
-- Заказчик не мог повлиять на то, кто именно возьмёт его задание, а
-- исключить человека после нажатия «Выполнил» было уже нельзя — сделка
-- зависала.
--
-- Новый порядок (только для tasks.is_paid = true, раздел «Аренца Темщик»):
--   1. Исполнитель нажимает «Взять задание» → status='pending'.
--   2. Заказчику приходит уведомление, он «Одобряет» или «Отклоняет».
--   3. После одобрения → status='joined', задание переходит в 'in_progress'.
--   4. Кнопка «Исключить» доступна ТОЛЬКО на этапе pending/joined,
--      то есть до нажатия «Выполнил».
--
-- В «ГIончалла» (is_paid = false) одобрение не требуется: помогать может
-- любой, заявка сразу становится 'joined'.
--
-- Автоодобрения по таймеру НЕТ: заявка ждёт решения заказчика столько,
-- сколько нужно. Исполнитель в любой момент может сам отказаться.
--
-- Идемпотентно, можно перезапускать.
-- =============================================================================
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'task_participants')
    then raise exception 'Нет таблицы task_participants — сначала примените 18-tasks.sql'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Новый статус участника: 'pending' — заявка ждёт решения заказчика.
--    Ограничение пересоздаём: добавить вариант в существующий CHECK нельзя.
-- ---------------------------------------------------------------------------
alter table public.task_participants
  drop constraint if exists task_participants_status_check;

alter table public.task_participants
  add constraint task_participants_status_check
  check (status in ('pending', 'joined', 'excluded', 'attended', 'no_show', 'done', 'cancelled'));

-- Когда заказчик одобрил заявку. null у ещё не одобренных и у
-- бесплатных заданий, где одобрение не требуется.
alter table public.task_participants
  add column if not exists approved_at timestamptz;

comment on column public.task_participants.approved_at is
  'Момент одобрения заявки заказчиком (только платные задания). '
  'null — заявка ещё на рассмотрении либо одобрение не требовалось.';

-- Заказчику нужен быстрый ответ на вопрос «есть ли заявки на мои задания».
create index if not exists idx_task_participants_pending
  on public.task_participants (task_id)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- 2. Типы уведомлений: заявка подана / одобрена / отклонена.
--    Список задан CHECK-ограничением в 18-tasks.sql — пересоздаём целиком
--    с прежними значениями плюс три новых.
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'system', 'profile_hidden', 'profile_visible', 'user_blocked', 'user_unblocked',
  'review_received', 'question_commented', 'comment_replied', 'like_received',
  'complaint_result', 'taxi_request', 'taxi_info',
  -- Аренца Темщик / ГIончалла
  'task_taken', 'task_submitted', 'task_confirmed', 'task_auto_confirmed',
  'task_cancel_requested', 'task_cancelled', 'task_expired',
  'task_joined', 'task_excluded', 'task_reminder',
  'task_rated', 'task_rate_pending',
  -- Обновление 27: одобрение исполнителя заказчиком
  'task_join_request', 'task_join_approved', 'task_join_rejected'
));

-- ---------------------------------------------------------------------------
-- 3. Вьюха участников: отдаём approved_at, чтобы интерфейс знал,
--    можно ли ещё исключить человека.
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
  u.full_name,
  u.avatar_url,
  coalesce(u.resident_rating, 0)  as rating,
  coalesce(u.tasks_done_count, 0) as tasks_done_count,
  greatest(0, extract(day from now() - u.created_at)::int) as account_days
from public.task_participants p
join public.user_profiles u on u.id = p.user_id;

grant select on public.v_task_participants to anon, authenticated;

comment on view public.v_task_participants is
  'Участники задания с публичными данными профиля. approved_at показывает, '
  'одобрил ли заказчик заявку (платные задания).';

-- ---------------------------------------------------------------------------
-- 4. Счётчик занятых мест не должен учитывать заявки на рассмотрении.
--    v_tasks_feed / v_task_details считают taken_slots — пересчитываем их
--    так, чтобы 'pending' в занятые места не попадал.
-- ---------------------------------------------------------------------------
-- Пересоздание вьюх ленты вынесено в 20/21 — здесь только напоминание:
-- обе они считают taken_slots через status in ('joined','attended','done'),
-- то есть 'pending' уже исключён и правки не требуют.

-- =============================================================================
-- Проверка:
--   select status, count(*) from public.task_participants group by status;
--   select id, status, approved_at from public.v_task_participants limit 5;
-- =============================================================================
