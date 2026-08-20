-- ============================================================================
-- 58. profiles.created_at: date -> timestamptz (каталог перестаёт тасовать анкеты)
-- ============================================================================
--
-- Что было. В живой базе public.profiles.created_at объявлена как date со
-- значением по умолчанию CURRENT_DATE — то есть время создания не
-- сохранялось вообще. У всех анкет, заведённых в один день, значение
-- получалось буквально одинаковым.
--
-- Чем это плохо. Каталог сортируется именно по этой колонке
-- (lib/profiles/load.ts: order('created_at', desc)), причём без второго
-- ключа. Когда значения равны, Postgres НЕ обязан возвращать строки в
-- одном и том же порядке: план может измениться, строка после update
-- физически переезжает в конец таблицы. Человек листает каталог,
-- подгружается следующая страница — и часть анкет показывается второй
-- раз, а часть пропускается. Чем больше анкет заводится за день, тем
-- заметнее.
--
-- Косвенное подтверждение, что это недосмотр, а не замысел: соседняя
-- колонка updated_at в той же таблице — честный timestamptz, и
-- schema.sql всё это время объявлял created_at тоже как timestamptz.
-- Разъехались именно база и схема.
--
-- Что делаем.
--   1. Меняем тип на timestamptz. У существующих строк время станет
--      00:00 по времени сервера — точнее уже не восстановить, дата в них
--      всё, что сохранилось. Новые анкеты получат точное время.
--   2. Возвращаем default now() вместо CURRENT_DATE.
--   3. Пересобираем индекс сортировки под новый тип.
--
-- Порядок в каталоге дополнительно закреплён вторым ключом (id) на
-- стороне приложения — это чинит и уже существующие строки, у которых
-- время одинаковое и после миграции.
--
-- Безопасность и данные. Приведение date -> timestamptz не теряет дату и
-- выполняется без потери строк. Права, RLS и внешние ключи не меняются.
-- Идемпотентно: повторный запуск ничего не делает.
-- ============================================================================

set lock_timeout = '5s';

do $$
declare
  v_type text;
begin
  select data_type into v_type
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'profiles'
     and column_name  = 'created_at';

  if v_type is null then
    raise exception 'public.profiles.created_at не найдена';
  end if;

  if v_type = 'date' then
    -- ALTER TYPE переписывает таблицу и держит ACCESS EXCLUSIVE. Для
    -- каталога анкет это доли секунды; lock_timeout выше не даст
    -- миграции повиснуть, если кто-то держит длинную транзакцию.
    alter table public.profiles
      alter column created_at drop default;

    alter table public.profiles
      alter column created_at type timestamptz
      using created_at::timestamptz;

    alter table public.profiles
      alter column created_at set default now();

    alter table public.profiles
      alter column created_at set not null;

    raise notice 'profiles.created_at: date -> timestamptz';
  else
    raise notice 'profiles.created_at уже %, пропускаем', v_type;
  end if;
end;
$$;

-- Индекс сортировки каталога пересобираем под новый тип колонки.
drop index if exists public.idx_profiles_created_at;
create index if not exists idx_profiles_created_at
  on public.profiles (created_at desc);

-- Составной индекс под фактический порядок каталога: created_at desc, id desc.
-- Без него вторая колонка сортировки заставляла бы Postgres досортировывать
-- результат в памяти на каждой странице.
create index if not exists idx_profiles_created_at_id
  on public.profiles (created_at desc, id desc);

comment on column public.profiles.created_at is
  'Момент создания анкеты. timestamptz, а не date: каталог сортируется по '
  'этой колонке, и без времени анкеты одного дня меняли порядок между '
  'запросами (дубли и пропуски при листании).';

notify pgrst, 'reload schema';

reset lock_timeout;
