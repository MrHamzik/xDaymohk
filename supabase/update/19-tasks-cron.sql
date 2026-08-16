-- =============================================================================
-- Даймохк — обновление 19
-- Автообслуживание заданий «Аренца Темщик» / «ГIончалла» через pg_cron.
--
-- Зачем, если есть /api/tasks/maintenance:
--   HTTP-роут срабатывает только когда кто-то ОТКРЫЛ раздел. Ночью, когда
--   никто не заходит, исполнитель может ждать подтверждения часами сверх
--   положенных трёх, а просроченные задания продолжают висеть в ленте.
--   pg_cron выполняет то же самое прямо в БД каждые 5 минут, независимо
--   от посетителей. Роут остаётся как «тихий» дубль — обе точки входа
--   идемпотентны и не мешают друг другу.
--
-- Что делает функция:
--   1. Автоподтверждение: заказчик молчит 3 ч после «Выполнил» →
--      задание закрывается, исполнителям +1 к счётчику выполненных,
--      заказчику блокировка создания заданий на 6 ч (штраф за ожидание);
--   2. Просрочка: срок вышел, задание никто не взял → expired + архив;
--   3. Напоминание: за 2 часа до запланированных работ участникам
--      уходит уведомление (иначе про запись на субботу забывают).
--
-- Идемпотентно: выбираются только строки в подходящем статусе, повторный
-- запуск ничего не портит. Файл можно перезапускать.
-- =============================================================================
set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 0. Проверка предпосылок
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'tasks')
    then raise exception 'Нет таблицы public.tasks — сначала примените 18-tasks.sql'; end if;
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'task_participants')
    then raise exception 'Нет таблицы public.task_participants — сначала примените 18-tasks.sql'; end if;
end $$;

-- Отметка об отправленном напоминании: без неё cron слал бы его
-- каждые 5 минут в течение двух часов до начала работ.
alter table public.tasks
  add column if not exists reminder_sent_at timestamptz;

-- ---------------------------------------------------------------------------
-- 1. Основная процедура обслуживания
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
    -- Исполнителям: закрываем участие и растим счётчик выполненных
    -- (он питает фильтр «мин. выполненных заданий»).
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

      insert into public.notifications (id, recipient_id, type, title, title_ce, message, sender)
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

    -- Штраф заказчику: блокировка создания заданий.
    update public.user_profiles
       set tasks_blocked_until = now() + make_interval(hours => c_block_hours)
     where id = v_task.author_id;

    insert into public.notifications (id, recipient_id, type, title, title_ce, message, sender)
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
  -- 2. Просрочка: срок вышел, задание никто не взял
  -- =========================================================================
  for v_task in
    select id, title, author_id
      from public.tasks
     where status = 'open'
       and not is_archived
       and deadline_at is not null
       and deadline_at < now()
     limit 200
  loop
    update public.tasks
       set status = 'expired',
           is_archived = true
     where id = v_task.id;

    insert into public.notifications (id, recipient_id, type, title, title_ce, message, sender)
    values (
      'ntf-' || replace(gen_random_uuid()::text, '-', ''),
      v_task.author_id,
      'task_expired',
      'Срок задания истёк',
      'ТIедилларан хан чекхйели',
      format('«%s»: задание никто не взял.', v_task.title),
      'Даймохк'
    );

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
      insert into public.notifications (id, recipient_id, type, title, title_ce, message, sender)
      values (
        'ntf-' || replace(gen_random_uuid()::text, '-', ''),
        v_participant.user_id,
        'task_reminder',
        'Скоро начало задания',
        'ТIедиллар долалуш ду',
        format('«%s» начинается в %s.',
               v_task.title, to_char(v_task.scheduled_at, 'DD.MM HH24:MI')),
        'Даймохк'
      );
    end loop;

    -- Автору тоже: напомнить, что пора встречать людей.
    insert into public.notifications (id, recipient_id, type, title, title_ce, message, sender)
    values (
      'ntf-' || replace(gen_random_uuid()::text, '-', ''),
      v_task.author_id,
      'task_reminder',
      'Скоро начало вашего задания',
      'Хьан тIедиллар долалуш ду',
      format('«%s» начинается в %s.',
             v_task.title, to_char(v_task.scheduled_at, 'DD.MM HH24:MI')),
      'Даймохк'
    );

    update public.tasks set reminder_sent_at = now() where id = v_task.id;
    v_reminded := v_reminded + 1;
  end loop;

  return query select v_auto_confirmed, v_expired, v_reminded;
end;
$$;

revoke all on function public.process_task_maintenance() from public;
grant execute on function public.process_task_maintenance() to service_role;

-- ---------------------------------------------------------------------------
-- 2. Расписание pg_cron — каждые 5 минут
-- ---------------------------------------------------------------------------
do $$
begin
  -- Пересоздаём: повторный запуск файла не должен плодить задачи.
  perform cron.unschedule('tasks-maintenance');
exception when others then
  null; -- задачи ещё нет — это нормально при первом запуске
end $$;

select cron.schedule(
  'tasks-maintenance',
  '*/5 * * * *',
  'select public.process_task_maintenance();'
);

-- =============================================================================
-- Проверка:
--   select * from cron.job where jobname = 'tasks-maintenance';
--   select * from public.process_task_maintenance();   -- разовый прогон
--   select jobname, status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 10;
-- =============================================================================
