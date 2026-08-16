-- =============================================================================
-- Даймохк — обновление 03
-- Двуязычные уведомления + отправитель
-- Запускать ОДИН файл за раз в SQL Editor. Перед запуском: закройте другие
-- вкладки SQL Editor и остановите dev-сервер / приложение (они держат
-- read-локи на таблицы). Если упрётся в lock — просто повторите.
-- =============================================================================
set lock_timeout = '5s';

alter table public.notifications
  add column if not exists title_ce text;

alter table public.notifications
  add column if not exists message_ce text;

alter table public.notifications
  add column if not exists sender text not null default 'Даймохк';

reset lock_timeout;
