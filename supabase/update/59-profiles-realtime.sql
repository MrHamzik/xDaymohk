-- ============================================================================
-- 59. Realtime для анкет: карточки обновляются без перезагрузки страницы
-- ============================================================================
--
-- Что было. ProfilesProvider подписан на изменения таблиц profiles,
-- user_profiles и complaints (components/ProfilesProvider.tsx:105–113).
-- Но подписка работает только для таблиц, добавленных в публикацию
-- supabase_realtime. Обновление 24 добавило туда tasks,
-- task_participants и resident_reviews — а profiles и user_profiles
-- забыли.
--
-- Из-за этого Postgres просто не отправлял события по анкетам: клиент
-- честно слушал канал, в который ничего не приходило. Снаружи это
-- выглядело так, будто «карточки специалистов дня/недели/месяца не
-- обновляются в реальном времени»: поменял ФИО или анкету — на экране
-- старое, пока не нажмёшь F5. Ошибок при этом никаких, что и делало
-- проблему незаметной.
--
-- Что делаем. Добавляем в публикацию обе таблицы. Заодно избранное
-- (favorites) — оно тоже читается на лету.
--
-- Про безопасность. Публикация НЕ отменяет RLS: Supabase Realtime
-- проверяет политики на каждого подписчика отдельно, и человек получит
-- событие только по той строке, которую и так имеет право прочитать.
-- Скрытые и забаненные анкеты остаются скрытыми.
--
-- REPLICA IDENTITY. Для profiles ставим FULL: в событии DELETE иначе
-- приходит только первичный ключ, а клиенту нужен owner_id, чтобы
-- понять, чью карточку убирать из списка. Для таблицы такого размера
-- это безопасно — накладные расходы заметны на таблицах с большим
-- потоком UPDATE, чего у анкет нет.
--
-- Идемпотентно: повторный запуск ничего не ломает.
-- ============================================================================

set lock_timeout = '5s';

do $$
begin
  alter publication supabase_realtime add table public.profiles;
  raise notice 'profiles добавлена в supabase_realtime';
exception
  when duplicate_object then
    raise notice 'profiles уже в публикации';
  when undefined_object then
    raise notice 'Публикации supabase_realtime нет — включите Realtime в Dashboard';
end $$;

do $$
begin
  alter publication supabase_realtime add table public.user_profiles;
  raise notice 'user_profiles добавлена в supabase_realtime';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.reviews;
  raise notice 'reviews добавлена в supabase_realtime';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- Полная строка в событиях: см. пояснение про DELETE выше.
alter table public.profiles      replica identity full;
alter table public.user_profiles replica identity full;

-- ---------------------------------------------------------------------------
-- Проверка после запуска:
--
--   select tablename from pg_publication_tables
--    where pubname = 'supabase_realtime'
--    order by tablename;
--
-- В списке должны быть profiles, user_profiles и reviews. Если запрос
-- вернул пусто — Realtime не включён в Dashboard:
-- Database -> Replication -> supabase_realtime.
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';

reset lock_timeout;
