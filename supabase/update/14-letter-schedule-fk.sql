-- ============================================================================
-- 14-letter-schedule-fk.sql
-- Внешний ключ и индекс для очереди запланированных писем.
--
-- Без внешнего ключа PostgREST не может выполнить вложенный запрос
-- letters(title_ru) из letter_schedule — очередь в админке оставалась пустой.
-- Код теперь читает очередь и названия отдельно (работает и без этого SQL),
-- но ключ добавляет целостность: при удалении шаблона удаляются и его
-- расписания, а индекс ускоряет выборку готовых к отправке строк.
--
-- Применение: вставьте в Supabase SQL Editor и нажмите Run.
-- ============================================================================

-- 1) Внешний ключ letter_schedule.letter_id → letters.id (каскадное удаление)
alter table public.letter_schedule
  drop constraint if exists letter_schedule_letter_fk;

alter table public.letter_schedule
  add constraint letter_schedule_letter_fk
  foreign key (letter_id) references public.letters(id)
  on delete cascade;

-- 2) Индекс для выборки process_letter_schedule(): (processed, run_at)
create index if not exists letter_schedule_processed_run_at_idx
  on public.letter_schedule (processed, run_at);

-- Проверка после применения:
-- select * from public.letter_schedule order by run_at desc limit 10;
