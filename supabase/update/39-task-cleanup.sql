-- =============================================================================
-- Даймохк — обновление 39
-- Уборка закрытых заданий: просроченные удаляются, отменённые архивируются.
--
-- Что закрывает
-- -------------
-- Просроченное задание (срок вышел, никто не взял) помечалось
-- is_archived = true и оставалось в базе НАВСЕГДА. Такие записи ничего
-- не хранят и ни на чём не держатся, но копятся с каждым днём: через
-- год работы села это тысячи мёртвых строк в таблице, по которой идёт
-- каждый запрос ленты.
--
-- Почему удалять безопасно
-- ------------------------
-- Просроченное — это задание, которое НИКТО НЕ ВЗЯЛ:
--   • исполнителей нет, а если кто-то откликался и передумал, строки
--     task_participants уходят каскадом (on delete cascade, обновление 18);
--   • отзывов нет по определению — resident_reviews ставятся только по
--     завершённой сделке;
--   • на счётчики репутации оно не влияло: они растут при 'completed'.
--
-- Отменённые задания, наоборот, НЕ удаляем: у них была история, стороны
-- могли о чём-то договариваться, и запись нужна при разборе жалобы.
-- Их просто прячем из лент через неделю показа (обновление 38).
--
-- Отсрочка
-- --------
-- Неделя, а не сразу: заказчик должен успеть увидеть уведомление «срок
-- истёк» и при желании пересоздать задание, пока помнит содержание.
-- Точка отсчёта — visible_until, а не deadline_at: задание могло
-- провисеть открытым дольше срока, если обслуживание не запускалось.
--
-- Дублирует шаг из /api/tasks/maintenance намеренно: тот вызывается,
-- только когда кто-то открыл раздел, а pg_cron работает всегда.
--
-- Идемпотентно, можно перезапускать.
-- =============================================================================
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'tasks'
                   and column_name = 'visible_until')
    then raise exception 'Нет колонки tasks.visible_until — сначала примените 38-payment-received.sql'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Функция уборки
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_closed_tasks()
returns table (expired_deleted integer, cancelled_archived integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expired_deleted    integer := 0;
  v_cancelled_archived integer := 0;
begin
  -- Просроченные: физическое удаление. Участники уйдут каскадом.
  with removed as (
    delete from public.tasks
     where status = 'expired'
       and visible_until is not null
       and visible_until < now()
    returning id
  )
  select count(*) into v_expired_deleted from removed;

  -- Отменённые: прячем из лент, но оставляем в базе — на них может
  -- ссылаться жалоба, и по ним видно, кто как себя вёл.
  with hidden as (
    update public.tasks
       set is_archived = true
     where status = 'cancelled'
       and is_archived = false
       and visible_until is not null
       and visible_until < now()
    returning id
  )
  select count(*) into v_cancelled_archived from hidden;

  return query select v_expired_deleted, v_cancelled_archived;
end;
$$;

comment on function public.cleanup_closed_tasks() is
  'Удаляет просроченные задания и архивирует отменённые после срока показа.';

revoke all on function public.cleanup_closed_tasks() from public;
grant execute on function public.cleanup_closed_tasks() to service_role;

-- ---------------------------------------------------------------------------
-- 2. Расписание pg_cron — раз в сутки в 04:00
--
-- Чаще не нужно: отсрочка измеряется сутками, а тяжёлый DELETE лучше
-- уводить на ночь, когда селом никто не пользуется.
-- ---------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('tasks-cleanup');
exception when others then
  null; -- задачи ещё нет — нормально при первом запуске
end $$;

do $$
begin
  perform cron.schedule(
    'tasks-cleanup',
    '0 4 * * *',
    'select public.cleanup_closed_tasks();'
  );
exception when others then
  -- pg_cron может быть не установлен: уборку тогда делает
  -- /api/tasks/maintenance при открытии раздела.
  raise notice 'pg_cron недоступен — уборка идёт только через /api/tasks/maintenance';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Готово
-- ---------------------------------------------------------------------------
do $$
begin
  raise notice 'Обновление 39 применено: просроченные задания удаляются, отменённые архивируются.';
end $$;

-- =============================================================================
-- Проверка:
--   select * from public.cleanup_closed_tasks();      -- разовый прогон
--   select * from cron.job where jobname = 'tasks-cleanup';
--   select status, count(*) from public.tasks group by status;
-- =============================================================================
