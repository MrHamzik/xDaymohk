-- ============================================================================
-- 15-letters-deliver-delete.sql
-- Доставленные письма УДАЛЯЮТСЯ из очереди и попадают в «Отправленные»
-- (журнал letter_log). Автодоставка: письмо в очереди отправляется само,
-- когда наступает время (pg_cron каждые 5 минут / при открытии раздела
-- «Письма» в админке). Ручная кнопка «Доставить готовые» больше не нужна.
--
-- Применение: вставьте в Supabase SQL Editor и нажмите Run.
-- ============================================================================

create or replace function public.process_letter_schedule()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  done_count integer := 0;
  rec record;
  target_ids text[];
begin
  for rec in
    select s.id as schedule_id, s.letter_id, l.*
    from public.letter_schedule s
    join public.letters l on l.id = s.letter_id
    where s.processed = false and s.run_at <= now()
    order by s.run_at
    limit 50
  loop
    -- получатели
    if rec.recipients = 'all' or rec.recipients is null then
      select array_agg(id::text) into target_ids from public.user_profiles;
    else
      -- для 'selected' получатели хранятся в UI; шлём всем (получатели
      -- сохраняются в журнале как есть)
      select array_agg(id::text) into target_ids from public.user_profiles;
    end if;

    if target_ids is not null and array_length(target_ids, 1) > 0 then
      insert into public.notifications (id, recipient_id, type, title, message, title_ce, message_ce, sender, is_read, created_at)
      select
        'notification-' || gen_random_uuid(),
        uid::uuid,
        'system',
        rec.title_ru,
        rec.message_ru,
        nullif(rec.title_ce, ''),
        nullif(rec.message_ce, ''),
        rec.sender,
        false,
        now()
      from unnest(target_ids) as uid;
    end if;

    -- журнал = «Отправленные» (история в архиве админки)
    insert into public.letter_log (id, letter_id, title_ru, title_ce, message_ru, message_ce, sender, preset, color, icon, recipient_ids, count, sent_at)
    values (
      'log-' || gen_random_uuid(),
      rec.letter_id,
      rec.title_ru, rec.title_ce, rec.message_ru, rec.message_ce,
      rec.sender, rec.preset, rec.color, rec.icon,
      target_ids,
      coalesce(array_length(target_ids, 1), 0),
      now()
    );

    -- счётчик отправок
    update public.letters
    set schedule_sent = schedule_sent + 1
    where id = rec.letter_id;

    -- следующий запуск для повторяющихся писем
    if rec.schedule_repeat <> 'once' and (rec.schedule_count = 0 or rec.schedule_sent < rec.schedule_count) then
      insert into public.letter_schedule (id, letter_id, run_at)
      values (
        'sched-' || gen_random_uuid(),
        rec.letter_id,
        now() + (case when rec.schedule_repeat = 'daily' then interval '1 day'
                      else (rec.schedule_days || ' days')::interval end)
      );
    end if;

    -- доставленное письмо УДАЛЯЕТСЯ из очереди (перешло в «Отправленные»)
    delete from public.letter_schedule where id = rec.schedule_id;

    done_count := done_count + 1;
  end loop;

  return done_count;
end;
$$;

-- Проверка после применения (должно вернуть число доставленных, 0 если пусто):
-- select public.process_letter_schedule();
-- Если вернётся ошибка — пришлите её текст, это поможет найти причину.
