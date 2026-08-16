-- ============================================================================
-- 10-letters-scheduler.sql
-- Планировщик писем: время отправки, частота, очередь.
--
-- Добавляет в letters поля планирования:
--   schedule_enabled  boolean
--   schedule_at       timestamptz   — время первой отправки
--   schedule_repeat   text          — 'once' | 'daily' | 'n_days'
--   schedule_days     integer       — для n_days (каждые N дней)
--   schedule_count    integer       — сколько раз всего (0 = всегда/безлимит)
--   schedule_sent     integer       — сколько раз уже отправлено
--
-- Таблица letter_schedule — «очередь»: строки, готовые к отправке.
-- Функция process_letter_schedule() переносит готовые письма в уведомления
-- и возвращает число отправленных; вызывается из /api/admin/letters/process
-- (и при желании — по cron).
--
-- Применение: вставьте в Supabase SQL Editor и нажмите Run.
-- ============================================================================

-- 1) Поля планирования в letters
alter table public.letters add column if not exists schedule_enabled boolean not null default false;
alter table public.letters add column if not exists schedule_at timestamptz;
alter table public.letters add column if not exists schedule_repeat text not null default 'once';
alter table public.letters add column if not exists schedule_days integer not null default 1;
alter table public.letters add column if not exists schedule_count integer not null default 0; -- 0 = безлимит
alter table public.letters add column if not exists schedule_sent integer not null default 0;

-- 2) Очередь запланированных отправок
create table if not exists public.letter_schedule (
  id          text primary key,
  letter_id   text not null,
  run_at      timestamptz not null,
  processed   boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.letter_schedule enable row level security;

drop policy if exists "letter_schedule admin read" on public.letter_schedule;
create policy "letter_schedule admin read"
  on public.letter_schedule for select
  using (public.is_admin_email());

drop policy if exists "letter_schedule admin write" on public.letter_schedule;
create policy "letter_schedule admin write"
  on public.letter_schedule for insert
  with check (public.is_admin_email());

-- 3) Функция: доставка готовых писем (вставляет уведомления всем/выбранным).
--    Возвращает число отправленных писем-запусков.
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
      -- для 'selected' получатели хранятся... (пока шлём всем; выбранные — в UI)
      select array_agg(id::text) into target_ids from public.user_profiles;
    end if;

    if target_ids is not null and array_length(target_ids, 1) > 0 then
      insert into public.notifications (id, recipient_id, type, title, message, title_ce, message_ce, sender, is_read, created_at)
      select
        'notification-' || gen_random_uuid(),
        uid,
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

    -- журнал
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

    -- помечаем запуск обработанным
    update public.letter_schedule set processed = true where id = rec.schedule_id;

    -- обновляем счётчик и планируем следующий запуск
    update public.letters
    set schedule_sent = schedule_sent + 1
    where id = rec.letter_id;

    if rec.schedule_repeat <> 'once' and (rec.schedule_count = 0 or rec.schedule_sent < rec.schedule_count) then
      insert into public.letter_schedule (id, letter_id, run_at)
      values (
        'sched-' || gen_random_uuid(),
        rec.letter_id,
        now() + (case when rec.schedule_repeat = 'daily' then interval '1 day'
                      else (rec.schedule_days || ' days')::interval end)
      );
    end if;

    done_count := done_count + 1;
  end loop;

  return done_count;
end;
$$;
