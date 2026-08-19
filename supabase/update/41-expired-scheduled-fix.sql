-- =============================================================================
-- Даймохк — обновление 41
-- Просрочка заданий «на дату» и немедленное удаление.
--
-- Найденная ошибка
-- ----------------
-- Срок задания хранится в РАЗНЫХ колонках (ограничение из обновления 18):
--   • срочное  (kind = 'urgent')    → deadline_at
--   • на дату  (kind = 'scheduled') → scheduled_at
--
-- А проверка просрочки в process_task_maintenance() смотрела только на
-- deadline_at. У запланированных заданий он NULL, сравнение с NULL не
-- проходит — и они НИКОГДА не помечались просроченными. Такое задание
-- висело в ленте вечно, хотя его дата давно прошла.
--
-- Именно поэтому `select * from public.cleanup_closed_tasks()` возвращала
-- нули, а карточки оставались на сайте: до статуса 'expired' они просто
-- не доходили, а удаляем мы только его.
--
-- Что меняется
-- ------------
-- 1. process_task_maintenance() проверяет ОБА поля через coalesce.
-- 2. Просроченное сразу УДАЛЯЕТСЯ, а не помечается: уведомление
--    заказчику уходит до удаления и на tasks не ссылается, поэтому
--    переживает его. Это то же поведение, что и в /api/tasks/maintenance.
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
-- 1. Разовая уборка уже накопившейся просрочки
--
-- Сначала уведомляем авторов (строка ещё существует и из неё берётся
-- заголовок), затем удаляем. Порядок важен: после DELETE названия уже
-- не будет, а человек должен понять, какое задание закрылось.
-- ---------------------------------------------------------------------------
do $$
declare
  v_task record;
  v_count integer := 0;
begin
  for v_task in
    select id, title, author_id
      from public.tasks
     where status in ('open', 'expired')
       and coalesce(deadline_at, scheduled_at) is not null
       and coalesce(deadline_at, scheduled_at) < now()
  loop
    insert into public.notifications
      (id, recipient_id, type, title, title_ce, message, sender)
    values (
      'ntf-' || replace(gen_random_uuid()::text, '-', ''),
      v_task.author_id,
      'task_expired',
      'Срок задания истёк',
      'ТIедилларан хан чекхйели',
      format('«%s»: задание никто не взял, оно удалено.', v_task.title),
      'Даймохк'
    );
    v_count := v_count + 1;
  end loop;

  delete from public.tasks
   where status in ('open', 'expired')
     and coalesce(deadline_at, scheduled_at) is not null
     and coalesce(deadline_at, scheduled_at) < now();

  raise notice 'Удалено просроченных заданий: %', v_count;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Обслуживание: проверяем ОБА поля срока и удаляем сразу
--
-- Функция пересоздаётся целиком (create or replace не умеет менять
-- сигнатуру частично). Блоки 1 и 3 повторяют обновление 19 без правок —
-- меняется только блок 2.
-- ---------------------------------------------------------------------------
create or replace function public.process_task_maintenance()
returns table (auto_confirmed integer, expired integer, reminded integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task        record;
  v_participant record;
  v_auto_confirmed integer := 0;
  v_expired        integer := 0;
  v_reminded       integer := 0;
  -- Держим в согласии с TASK_AUTO_CONFIRM_HOURS / TASK_BLOCK_HOURS
  -- в lib/types.ts. При изменении править в обоих местах.
  c_auto_confirm_hours constant integer := 3;
  c_block_hours        constant integer := 6;
  c_reminder_hours     constant integer := 2;
begin
  -- =========================================================================
  -- 1. Автоподтверждение: заказчик не ответил за 3 часа
  -- =========================================================================
  for v_task in
    select id, title, author_id
      from public.tasks
     where status = 'awaiting_confirm'
       and submitted_at is not null
       and submitted_at < now() - make_interval(hours => c_auto_confirm_hours)
     limit 200
  loop
    for v_participant in
      select user_id
        from public.task_participants
       where task_id = v_task.id
         and status in ('joined', 'attended')
    loop
      update public.task_participants
         set status = 'done'
       where task_id = v_task.id
         and user_id = v_participant.user_id;

      update public.user_profiles
         set tasks_done_count = coalesce(tasks_done_count, 0) + 1
       where id = v_participant.user_id;

      insert into public.notifications
        (id, recipient_id, type, title, title_ce, message, sender)
      values (
        'ntf-' || replace(gen_random_uuid()::text, '-', ''),
        v_participant.user_id,
        'task_auto_confirmed',
        'Задание подтверждено автоматически',
        'ТIедиллар шаьш тIечIагIдина',
        format('«%s»: заказчик не ответил за %s ч.', v_task.title, c_auto_confirm_hours),
        'Даймохк'
      );
    end loop;

    update public.tasks
       set status = 'completed',
           completed_at = now(),
           is_archived = true
     where id = v_task.id;

    update public.user_profiles
       set tasks_blocked_until = now() + make_interval(hours => c_block_hours)
     where id = v_task.author_id;

    insert into public.notifications
      (id, recipient_id, type, title, title_ce, message, sender)
    values (
      'ntf-' || replace(gen_random_uuid()::text, '-', ''),
      v_task.author_id,
      'task_auto_confirmed',
      'Задание закрыто автоматически',
      'ТIедиллар шаьш дIакъевлина',
      format('«%s». Вы не подтвердили за %s ч — создание новых заданий заблокировано на %s ч.',
             v_task.title, c_auto_confirm_hours, c_block_hours),
      'Даймохк'
    );

    v_auto_confirmed := v_auto_confirmed + 1;
  end loop;

  -- =========================================================================
  -- 2. Просрочка: срок вышел, задание никто не взял → УДАЛЯЕМ
  --
  -- coalesce(deadline_at, scheduled_at) — ключевая правка обновления 41:
  -- у заданий «на дату» deadline_at всегда NULL, и прежнее условие их
  -- не находило.
  --
  -- Уведомление отправляется ДО удаления: после него заголовка уже не
  -- будет. notifications на tasks не ссылаются и удаление переживают.
  -- =========================================================================
  for v_task in
    select id, title, author_id
      from public.tasks
     where status = 'open'
       and not is_archived
       and coalesce(deadline_at, scheduled_at) is not null
       and coalesce(deadline_at, scheduled_at) < now()
     limit 200
  loop
    insert into public.notifications
      (id, recipient_id, type, title, title_ce, message, sender)
    values (
      'ntf-' || replace(gen_random_uuid()::text, '-', ''),
      v_task.author_id,
      'task_expired',
      'Срок задания истёк',
      'ТIедилларан хан чекхйели',
      format('«%s»: задание никто не взял, оно удалено.', v_task.title),
      'Даймохк'
    );

    -- Участники уйдут каскадом (on delete cascade, обновление 18).
    delete from public.tasks where id = v_task.id;

    v_expired := v_expired + 1;
  end loop;

  -- =========================================================================
  -- 3. Напоминание за 2 часа до запланированных работ
  -- =========================================================================
  for v_task in
    select id, title, author_id, scheduled_at
      from public.tasks
     where kind = 'scheduled'
       and status in ('open', 'in_progress')
       and not is_archived
       and scheduled_at is not null
       and scheduled_at > now()
       and scheduled_at <= now() + make_interval(hours => c_reminder_hours)
       and reminder_sent_at is null
     limit 200
  loop
    for v_participant in
      select user_id
        from public.task_participants
       where task_id = v_task.id
         and status in ('joined', 'attended')
    loop
      insert into public.notifications
        (id, recipient_id, type, title, title_ce, message, sender)
      values (
        'ntf-' || replace(gen_random_uuid()::text, '-', ''),
        v_participant.user_id,
        'task_reminder',
        'Скоро начало работ',
        'Болх гергабахана',
        format('«%s» — через %s ч.', v_task.title, c_reminder_hours),
        'Даймохк'
      );
    end loop;

    update public.tasks set reminder_sent_at = now() where id = v_task.id;
    v_reminded := v_reminded + 1;
  end loop;

  return query select v_auto_confirmed, v_expired, v_reminded;
end;
$$;

revoke all on function public.process_task_maintenance() from public;
grant execute on function public.process_task_maintenance() to service_role;

-- ---------------------------------------------------------------------------
-- 3. Уборка: та же правка про два поля срока
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
  -- Просрочка: и помеченные 'expired', и открытые с истёкшим сроком по
  -- любому из двух полей. Уведомление по ним уже ушло из
  -- process_task_maintenance; сюда попадают лишь остатки.
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
  'Удаляет просроченные задания (оба поля срока) и архивирует отменённые.';

revoke all on function public.cleanup_closed_tasks() from public;
grant execute on function public.cleanup_closed_tasks() to service_role;

-- ---------------------------------------------------------------------------
-- 4. Готово
-- ---------------------------------------------------------------------------
do $$
begin
  raise notice 'Обновление 41 применено: задания «на дату» тоже просрочиваются и удаляются сразу.';
end $$;

-- =============================================================================
-- Проверка:
--   select status, count(*) from public.tasks group by status;
--   select * from public.process_task_maintenance();
--   select * from public.cleanup_closed_tasks();
--   -- не должно остаться ничего с прошедшим сроком:
--   select id, title, kind, deadline_at, scheduled_at from public.tasks
--    where status = 'open' and coalesce(deadline_at, scheduled_at) < now();
-- =============================================================================
