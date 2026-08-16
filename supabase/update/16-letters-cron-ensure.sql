-- ============================================================================
-- 16-letters-cron-ensure.sql
-- ГАРАНТИРУЕТ наличие pg_cron-задачи доставки писем (идемпотентно).
--
-- Письма из очереди отправляются автоматически, когда наступает время:
--   1) pg_cron каждые 5 минут вызывает process_letter_schedule();
--   2) при открытии раздела «Письма» / «Архив» в админке доставка
--      запускается дополнительно (см. /api/admin/letters/process).
--
-- Если письма не отправляются — первым делом выполните проверку внизу
-- файла: select public.process_letter_schedule(); и пришлите текст ошибки.
--
-- Применение: вставьте в Supabase SQL Editor и нажмите Run.
-- ============================================================================

-- 1) Убираем старую задачу (если есть) и ставим заново — идемпотентно.
do $$
declare
  jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'letters-delivery';
  if jid is not null then
    perform cron.unschedule(jid);
  end if;
end $$;

select cron.schedule(
  'letters-delivery',           -- имя задачи
  '*/5 * * * *',                -- каждые 5 минут
  'select public.process_letter_schedule();'
);

-- 2) ПРОВЕРКА доставки прямо сейчас (вернёт число отправленных писем,
--    0 — если нечего отправлять). Если вернёт ОШИБКУ — скопируйте её
--    текст и пришлите разработчику — это и есть причина «не отправляются».
select public.process_letter_schedule() as delivered_now;

-- 3) Проверка активных cron-задач (должна быть letters-delivery):
-- select jobid, jobname, schedule, active from cron.job;
