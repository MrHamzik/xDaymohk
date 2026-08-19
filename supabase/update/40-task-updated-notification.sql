-- =============================================================================
-- Даймохк — обновление 40
-- Тип уведомления «Условия задания изменились».
--
-- Зачем
-- -----
-- Заказчик получил возможность править задание, пока оно открыто и по
-- нему нет одобренного исполнителя (PATCH /api/tasks/:id). Тем, кто уже
-- откликнулся и ждёт решения, уходит уведомление: они подавали заявку
-- на ДРУГИХ условиях и должны увидеть новые до одобрения.
--
-- Почему отдельной миграцией
-- --------------------------
-- notifications.type ограничен check-списком. Ограничение нельзя
-- дополнить — только заменить целиком, и пропущенный тип роняет
-- вставку в рантайме. Поэтому список пересобирается полностью, со
-- всеми типами из обновлений 18, 27, 31, 35 и 38.
--
-- Идемпотентно, можно перезапускать.
-- =============================================================================
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'notifications')
    then raise exception 'Нет таблицы notifications — сначала примените базовые миграции'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Полный список типов уведомлений
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
  -- Обновление 40: заказчик изменил условия до одобрения исполнителя
  'task_updated'
));

-- ---------------------------------------------------------------------------
-- 2. Готово
-- ---------------------------------------------------------------------------
do $$
begin
  raise notice 'Обновление 40 применено: тип уведомления task_updated добавлен.';
end $$;
