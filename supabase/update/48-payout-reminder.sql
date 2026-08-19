-- =============================================================================
-- Даймохк — обновление 48
-- Напоминание о незакрытом расчёте.
--
-- Исполнитель сдал работу, перевод не отмечен («Оплата получена»).
-- Через час обеим сторонам уходит мягкое уведомление. Без отметки
-- cron слал бы его каждые 5 минут до автоподтверждения (3 ч).
--
-- Наличные не трогаем: там второй отметки нет, расчёт при встрече.
--
-- Колонку во вьюхи не добавляем: клиенту она не нужна, это служебный
-- флаг обслуживания.
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

alter table public.tasks
  add column if not exists payout_reminder_sent_at timestamptz;

comment on column public.tasks.payout_reminder_sent_at is
  'Когда отправили напоминание о незакрытом переводе. NULL — ещё не слали.';

create index if not exists idx_tasks_payout_reminder
  on public.tasks (submitted_at)
  where status = 'awaiting_confirm'
    and payment_received_at is null
    and payout_reminder_sent_at is null;

-- ---------------------------------------------------------------------------
-- process_task_maintenance: тот же текст, что в обновлении 41, плюс
-- блок 4. Сигнатуру не меняем — напоминания входят в reminded.
-- cleanup_closed_tasks не трогаем: её уже переписал 42.
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
  -- Держим в согласии с lib/types.ts.
  c_auto_confirm_hours   constant integer := 3;
  c_block_hours          constant integer := 6;
  c_reminder_hours       constant integer := 2;
  c_payout_remind_hours  constant integer := 1;
begin
  -- 1. Автоподтверждение
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
        (id, recipient_id, type, title, title_ce, message, message_ce, sender)
      values (
        'ntf-' || replace(gen_random_uuid()::text, '-', ''),
        v_participant.user_id,
        'task_auto_confirmed',
        'Задание подтверждено автоматически',
        'ТIедиллар шаьш тIечIагIдина',
        format('«%s»: заказчик не ответил за %s ч.', v_task.title, c_auto_confirm_hours),
        null,
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
      (id, recipient_id, type, title, title_ce, message, message_ce, sender)
    values (
      'ntf-' || replace(gen_random_uuid()::text, '-', ''),
      v_task.author_id,
      'task_auto_confirmed',
      'Задание закрыто автоматически',
      'ТIедиллар шаьш дIакъевлина',
      format('«%s». Вы не подтвердили за %s ч — создание новых заданий заблокировано на %s ч.',
             v_task.title, c_auto_confirm_hours, c_block_hours),
      null,
      'Даймохк'
    );

    v_auto_confirmed := v_auto_confirmed + 1;
  end loop;

  -- 2. Просрочка
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

    delete from public.tasks where id = v_task.id;
    v_expired := v_expired + 1;
  end loop;

  -- 3. Напоминание за 2 часа до запланированных работ
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

  -- 4. Незакрытый перевод: час после сдачи, отметки нет
  for v_task in
    select id, title, author_id
      from public.tasks
     where status = 'awaiting_confirm'
       and is_paid
       and payment_method in ('sbp', 'card', 'yoomoney')
       and payment_received_at is null
       and payout_reminder_sent_at is null
       and submitted_at is not null
       and submitted_at < now() - make_interval(hours => c_payout_remind_hours)
     limit 200
  loop
    for v_participant in
      select user_id
        from public.task_participants
       where task_id = v_task.id
         and status in ('joined', 'attended', 'done')
    loop
      insert into public.notifications
        (id, recipient_id, type, title, title_ce, message, message_ce, sender)
      values (
        'ntf-' || replace(gen_random_uuid()::text, '-', ''),
        v_participant.user_id,
        'task_reminder',
        'Отметьте получение оплаты',
        'Ахча схьаэцна аьлла билгалде',
        format('«%s»: когда деньги придут — нажмите «Оплата получена», иначе задание не закроется.', v_task.title),
        format('«%s»: ахча кхаьчча «Ахча схьаэцна» тIетаIае — цхьаьна тIедиллар дIакъовлалур дац.', v_task.title),
        'Даймохк'
      );
    end loop;

    insert into public.notifications
      (id, recipient_id, type, title, title_ce, message, message_ce, sender)
    values (
      'ntf-' || replace(gen_random_uuid()::text, '-', ''),
      v_task.author_id,
      'task_reminder',
      'Незавершённый расчёт',
      'Дехар чекхдаккха деза',
      format('«%s»: исполнитель сдал работу. Переведите оплату — он отметит получение, и задание закроется.', v_task.title),
      format('«%s»: кхочушдийриг болх бина. Ахча дIало — цо схьаэцна аьлла билгалдаккха, тIедиллар дIакъовлур ду.', v_task.title),
      'Даймохк'
    );

    update public.tasks
       set payout_reminder_sent_at = now()
     where id = v_task.id;

    v_reminded := v_reminded + 1;
  end loop;

  return query select v_auto_confirmed, v_expired, v_reminded;
end;
$$;

revoke all on function public.process_task_maintenance() from public;
grant execute on function public.process_task_maintenance() to service_role;

do $$
begin
  raise notice 'Обновление 48 применено: напоминание о незакрытом переводе через час.';
end $$;

-- =============================================================================
-- Проверка:
--   select payout_reminder_sent_at from public.tasks limit 1;
--   select * from public.process_task_maintenance();
-- =============================================================================
