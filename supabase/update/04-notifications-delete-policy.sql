-- =============================================================================
-- Даймохк — обновление 04
-- RLS: удаление своих уведомлений
-- Запускать ОДИН файл за раз в SQL Editor. Перед запуском: закройте другие
-- вкладки SQL Editor и остановите dev-сервер / приложение (они держат
-- read-локи на таблицы). Если упрётся в lock — просто повторите.
-- =============================================================================
set lock_timeout = '5s';

drop policy if exists "notifications self delete" on public.notifications;
create policy "notifications self delete"
  on public.notifications for delete
  using (auth.uid()::text = recipient_id::text);

reset lock_timeout;
