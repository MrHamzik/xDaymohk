-- =============================================================================
-- Даймохк — обновление 35
-- Защита исполнителя при отказе принять работу: статус «на рассмотрении».
--
-- Дыра, которую это закрывает
-- ---------------------------
-- Сейчас заказчик может нажать «Не принято», а сразу следом «Отменить»
-- или «Удалить» — задание уходит в архив, исполнитель остаётся ни с чем
-- и без следов спора. Проверок на это не было ни в одном из трёх
-- обработчиков (reject, cancel, DELETE).
--
-- Как работает теперь
-- -------------------
-- «Не принято» переводит задание в статус 'disputed' и ставит
-- dispute_until = now() + 24 часа. В этом окне:
--   • заказчик НЕ может отменить или удалить задание;
--   • обе стороны видят обратный отсчёт и могут договориться;
--   • любая сторона может подать жалобу — её разберёт администратор.
--
-- По истечении суток задание автоматически возвращается в работу
-- (in_progress): исполнитель снова может нажать «Выполнил», а заказчик
-- — принять или отменить. Спор не должен висеть вечно.
--
-- Почему отдельный статус, а не флаг
-- ----------------------------------
-- 'disputed' — это состояние задания, от него зависят доступные
-- действия. Флаг рядом с status означал бы два источника истины: можно
-- было бы получить cancelled + is_disputed и не знать, что показывать.
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
-- 1. Новый статус
-- ---------------------------------------------------------------------------
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status in (
    'open', 'in_progress', 'awaiting_confirm',
    'disputed',
    'completed', 'cancelled', 'expired'
  ));

-- ---------------------------------------------------------------------------
-- 2. Срок рассмотрения
-- ---------------------------------------------------------------------------
alter table public.tasks
  add column if not exists dispute_until timestamptz;

alter table public.tasks
  add column if not exists dispute_reason text;

comment on column public.tasks.dispute_until is
  'До этого момента задание нельзя отменить или удалить: идёт спор об '
  'оплате. По истечении срока задание возвращается в работу.';

comment on column public.tasks.dispute_reason is
  'Причина, по которой заказчик не принял работу. Видна обеим сторонам.';

create index if not exists tasks_dispute_idx
  on public.tasks (dispute_until)
  where status = 'disputed';

-- ---------------------------------------------------------------------------
-- 3. Автовозврат в работу по истечении суток
--
-- Вызывается из /api/tasks/maintenance по расписанию — там же, где
-- закрываются просроченные задания.
-- ---------------------------------------------------------------------------
create or replace function public.release_expired_disputes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.tasks
  set status = 'in_progress',
      dispute_until = null
  where status = 'disputed'
    and dispute_until is not null
    and dispute_until < now();

  get diagnostics affected = row_count;
  return affected;
end;
$$;

comment on function public.release_expired_disputes() is
  'Возвращает в работу задания, у которых истёк срок рассмотрения спора.';

-- ---------------------------------------------------------------------------
-- 4. Тип уведомления о споре
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
  -- Обновление 35: спор об оплате
  'task_disputed', 'task_dispute_released'
));

-- ---------------------------------------------------------------------------
-- 5. Готово
-- ---------------------------------------------------------------------------
do $$
begin
  raise notice 'Обновление 35 применено: статус disputed и защита 24 часа готовы.';
end $$;
