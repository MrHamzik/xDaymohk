-- =============================================================================
-- Даймохк — обновление 02
-- Расширение типов уведомлений
-- Запускать ОДИН файл за раз в SQL Editor. Перед запуском: закройте другие
-- вкладки SQL Editor и остановите dev-сервер / приложение (они держат
-- read-локи на таблицы). Если упрётся в lock — просто повторите.
-- =============================================================================
set lock_timeout = '5s';

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    'system', 'profile_hidden', 'profile_visible', 'user_blocked', 'user_unblocked',
    'review_received', 'question_commented', 'comment_replied', 'like_received',
    'complaint_result', 'taxi_request', 'taxi_info'
  ));

reset lock_timeout;
