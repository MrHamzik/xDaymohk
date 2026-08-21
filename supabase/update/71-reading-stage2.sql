-- =============================================================================
-- Даймохк — обновление 71 (Этап 2 разделов чтения)
--
-- Четыре раздела чтения — «Священный Коран», «Нохчалла», «Руководство»,
-- «Сира Пророка» — получают единый механизм:
--
--   1. Коран становится четвёртым разделом таблицы articles (единый
--      формат глав, управление из админки, как у остальных трёх).
--      Девять сур прежнего статичного справочника переносятся
--      стартовыми главами — раздел не окажется пустым.
--   2. Единое поле номера главы `chapter_number` (для Корана — номер
--      суры, при необходимости «сура:аят»). По ТЗ формат хранения
--      глав одинаков во всех четырёх разделах.
--   3. Прогресс чтения переезжает из localStorage в базу:
--      таблица user_reading_progress (по одной записи на раздел).
--      Состояние возникает только после того, как человек открыл главу.
--   4. Флаги в user_settings: одноразовая подсказка о сохранении
--      прогресса (is_reading_tip_shown) и чекбокс «Автосохранение»
--      (reading_autosave).
--   5. Триграммные индексы для поиска по главам (п.7 ТЗ: поиск должен
--      быть эффективным).
--
-- Имена разделов прогресса — по ТЗ: 'quran', 'nochchalma', 'guide',
-- 'sira'. В articles исторически 'nohchalla'; соответствие поддерживает
-- триггер ниже и маппинг в коде (lib/reading-sections.ts).
--
-- Идемпотентно, можно перезапускать.
-- =============================================================================
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'articles')
    then raise exception 'Нет таблицы articles — сначала примените обновление 30'; end if;
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'user_settings')
    then raise exception 'Нет таблицы user_settings — сначала примените обновление 28'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Коран — четвёртый раздел страниц-чтения
-- ---------------------------------------------------------------------------
alter table public.articles
  drop constraint if exists articles_section_known;
alter table public.articles
  add constraint articles_section_known
  check (section in ('sira', 'nohchalla', 'guide', 'quran'));

-- ---------------------------------------------------------------------------
-- 2. Номер главы (для Корана — сура, при необходимости «сура:аят»)
-- ---------------------------------------------------------------------------
alter table public.articles
  add column if not exists chapter_number text not null default '';

comment on column public.articles.chapter_number is
  'Номер главы: для Корана — номер суры (или «сура:аят»), у остальных разделов необязательная метка. Пустая строка — номера нет.';

-- ---------------------------------------------------------------------------
-- 3. Прогресс чтения: по одной записи на пользователя и раздел
-- ---------------------------------------------------------------------------
-- Состояние появляется только после первого открытого главой захода в
-- раздел (пишет приложение, а не миграция). При удалении главы
-- соответствующая строка прогресса удаляется каскадом — на главной
-- блок раздела просто вернётся к виду «Открыть».
create table if not exists public.user_reading_progress (
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  section_type text not null,
  chapter_id uuid not null references public.articles(id) on delete cascade,

  -- Процент прочитанного внутри главы, 0..100. Устойчив к правкам
  -- текста главы из админки (в отличие от привязки к абзацу).
  scroll_position numeric(5,2) not null default 0,

  updated_at timestamptz not null default now(),

  primary key (user_id, section_type),

  constraint user_reading_progress_section_known
    check (section_type in ('quran', 'nochchalma', 'guide', 'sira')),
  constraint user_reading_progress_scroll_range
    check (scroll_position >= 0 and scroll_position <= 100)
);

-- Каскадное удаление по chapter_id ходит в прогресс по этому индексу.
create index if not exists user_reading_progress_chapter_idx
  on public.user_reading_progress (chapter_id);

comment on table public.user_reading_progress is
  'Прогресс чтения: глава и позиция остановки, по одной записи на раздел. '
  'Пишется приложением от имени самого пользователя (RLS — только свои строки).';

-- Целостность: глава обязана принадлежать своему разделу. Имена
-- разделов прогресса и таблицы глав совпадают, кроме исторического
-- 'nohchalla' (прогресс называет его 'nochchalma' по ТЗ).
create or replace function public.check_reading_progress_chapter()
returns trigger
language plpgsql
as $$
declare
  chapter_section text;
begin
  select a.section into chapter_section
  from public.articles a
  where a.id = new.chapter_id;

  if chapter_section is null then
    raise exception 'Глава % не найдена', new.chapter_id;
  end if;

  if new.section_type = 'nochchalma' then
    if chapter_section <> 'nohchalla' then
      raise exception 'Глава принадлежит разделу %, а не «Нохчалла»', chapter_section;
    end if;
  elsif chapter_section <> new.section_type then
    raise exception 'Глава принадлежит разделу %, а не %', chapter_section, new.section_type;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_reading_progress_chapter on public.user_reading_progress;
create trigger trg_reading_progress_chapter
  before insert or update on public.user_reading_progress
  for each row execute function public.check_reading_progress_chapter();

drop trigger if exists trg_user_reading_progress_updated on public.user_reading_progress;
create trigger trg_user_reading_progress_updated
  before update on public.user_reading_progress
  for each row execute function public.touch_updated_at();

-- RLS: человек видит и правит ТОЛЬКО свои строки. Чужой прогресс не
-- читается никем, кроме владельца; админам он не нужен.
alter table public.user_reading_progress enable row level security;

drop policy if exists "reading progress self select" on public.user_reading_progress;
create policy "reading progress self select"
  on public.user_reading_progress for select
  using (auth.uid() = user_id);

drop policy if exists "reading progress self insert" on public.user_reading_progress;
create policy "reading progress self insert"
  on public.user_reading_progress for insert
  with check (auth.uid() = user_id);

drop policy if exists "reading progress self update" on public.user_reading_progress;
create policy "reading progress self update"
  on public.user_reading_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "reading progress self delete" on public.user_reading_progress;
create policy "reading progress self delete"
  on public.user_reading_progress for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. Флаги настроек: одноразовая подсказка и автосохранение чтения
-- ---------------------------------------------------------------------------
-- is_reading_tip_shown: модальное окно-гид по сохранению прогресса
-- показывается один раз за всё время аккаунта (п.8 ТЗ).
-- reading_autosave: чекбокс «Автосохранение» (п.9 ТЗ), синхронизирован
-- с выбором в одноразовой подсказке.
alter table public.user_settings
  add column if not exists is_reading_tip_shown boolean not null default false;

alter table public.user_settings
  add column if not exists reading_autosave boolean not null default true;

comment on column public.user_settings.is_reading_tip_shown is
  'Одноразовая подсказка о сохранении прогресса чтения уже показана.';
comment on column public.user_settings.reading_autosave is
  'Автосохранение места чтения в реальном времени (не действует в режиме исследования и при переходах из поиска).';

-- ---------------------------------------------------------------------------
-- 5. Поиск по главам: триграммные индексы
-- ---------------------------------------------------------------------------
-- Поиск идёт через ILIKE '%фраза%' (подстрока, без учёта регистра —
-- именно так ждут читатели: слово, фраза, номер). Триграммный GIN
-- позволяет Postgres не сканировать таблицу целиком на запросах от
-- трёх символов. Разделы чтения небольшие, но индекс дешёвый и снимает
-- вопрос «эффективен ли поиск» на росте контента.
create extension if not exists pg_trgm;

create index if not exists articles_title_ru_trgm_idx
  on public.articles using gin (title_ru gin_trgm_ops);
create index if not exists articles_title_ce_trgm_idx
  on public.articles using gin (title_ce gin_trgm_ops);
create index if not exists articles_body_ru_trgm_idx
  on public.articles using gin (body_ru gin_trgm_ops);
create index if not exists articles_body_ce_trgm_idx
  on public.articles using gin (body_ce gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 5.1. Функция поиска по главам (п.7 ТЗ)
-- ---------------------------------------------------------------------------
-- Вызывается через RPC (/api/articles/search -> supabase.rpc). Запрос
-- приходит ПАРАМЕТРОМ, поэтому в SQL не попадает ни одного склеенного
-- пользователем символа; шаблон LIKE строится внутри из параметра.
--
-- Функция SECURITY INVOKER (по умолчанию): читает articles от имени
-- вызывающего, значит RLS «только опубликованное для публики»
-- продолжает действовать — гость не найдёт черновики.
--
-- Возвращает поле, в котором найдено совпадение, и фрагмент вокруг
-- него (70 символов с каждой стороны): клиент подсветит совпадение
-- тегом <mark> без innerHTML.
create or replace function public.search_articles(
  p_section text,
  p_query text,
  p_limit integer default 12
)
returns table (
  id uuid,
  chapter_number text,
  title_ru text,
  title_ce text,
  field text,
  snippet text
)
language sql
stable
as $$
  with hits as (
    select a.id, a.chapter_number, a.title_ru, a.title_ce, a.sort_order,
      case
        when lower(a.title_ru) like lower('%' || p_query || '%') then 'title_ru'
        when lower(a.title_ce) like lower('%' || p_query || '%') then 'title_ce'
        when lower(a.lead_ru) like lower('%' || p_query || '%') then 'lead_ru'
        when lower(a.lead_ce) like lower('%' || p_query || '%') then 'lead_ce'
        when lower(a.chapter_number) like lower('%' || p_query || '%') then 'chapter_number'
        when lower(a.body_ru) like lower('%' || p_query || '%') then 'body_ru'
        else 'body_ce'
      end as field,
      case
        when lower(a.title_ru) like lower('%' || p_query || '%') then a.title_ru
        when lower(a.title_ce) like lower('%' || p_query || '%') then a.title_ce
        when lower(a.lead_ru) like lower('%' || p_query || '%') then a.lead_ru
        when lower(a.lead_ce) like lower('%' || p_query || '%') then a.lead_ce
        when lower(a.chapter_number) like lower('%' || p_query || '%') then a.chapter_number
        when lower(a.body_ru) like lower('%' || p_query || '%') then a.body_ru
        else a.body_ce
      end as haystack
    from public.articles a
    where a.section = p_section
      and a.is_published
      and length(btrim(p_query)) >= 2
      and (
        lower(a.title_ru) like lower('%' || p_query || '%')
        or lower(a.title_ce) like lower('%' || p_query || '%')
        or lower(a.lead_ru) like lower('%' || p_query || '%')
        or lower(a.lead_ce) like lower('%' || p_query || '%')
        or lower(a.chapter_number) like lower('%' || p_query || '%')
        or lower(a.body_ru) like lower('%' || p_query || '%')
        or lower(a.body_ce) like lower('%' || p_query || '%')
      )
    order by a.sort_order
    limit greatest(1, least(p_limit, 30))
  )
  select h.id, h.chapter_number, h.title_ru, h.title_ce, h.field,
    substring(
      h.haystack
      from greatest(1, position(lower(p_query) in lower(h.haystack)) - 70)
      for 170
    )
  from hits h
  order by h.sort_order;
$$;

revoke execute on function public.search_articles(text, text, integer) from public;
grant execute on function public.search_articles(text, text, integer)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Стартовые главы Корана
-- ---------------------------------------------------------------------------
-- Девять сур прежнего статичного справочника (самые читаемые). Только
-- метаданные: тексты аятов добавит админ через редактор — для этого
-- раздел и переводился в articles. Вставляем, лишь пока раздел пуст:
-- повторный прогон миграции не плодит дубли и не затирает правки.
insert into public.articles
  (section, sort_order, chapter_number, title_ru, title_ce, lead_ru, lead_ce, is_published)
select v.section, v.sort_order, v.chapter_number,
       v.title_ru, v.title_ce, v.lead_ru, v.lead_ce, true
from (values
  ('quran', 10, '1',   'Аль-Фатиха (Открывающая Книгу)', 'Аль-Фатихьа (ДIадолор)',         'Сура 1 · 7 аятов · Мекка',   '1-гIа сура · 7 аят · Макка'),
  ('quran', 20, '2',   'Аль-Бакара (Корова)',            'Аль-Бакъара (Етт)',              'Сура 2 · 286 аятов · Медина','2-гIа сура · 286 аят · Мадина'),
  ('quran', 30, '3',   'Али Имран (Семейство Имрана)',   'Али Iимран (Iимранан доьзал)',   'Сура 3 · 200 аятов · Медина','3-гIа сура · 200 аят · Мадина'),
  ('quran', 40, '36',  'Йа Син',                         'Йа Син (Къуръанан дог)',         'Сура 36 · 83 аята · Мекка',  '36-гIа сура · 83 аят · Макка'),
  ('quran', 50, '55',  'Ар-Рахман (Милосердный)',        'Ар-Рахьман (Къинхетаме верг)',   'Сура 55 · 78 аятов · Медина','55-гIа сура · 78 аят · Мадина'),
  ('quran', 60, '67',  'Аль-Мульк (Власть)',             'Аль-Мульк (Пачхьалкх)',          'Сура 67 · 30 аятов · Мекка', '67-гIа сура · 30 аят · Макка'),
  ('quran', 70, '112', 'Аль-Ихляс (Искренность)',        'Аль-Ихляс (ЦIена дин)',          'Сура 112 · 4 аята · Мекка',  '112-гIа сура · 4 аят · Макка'),
  ('quran', 80, '113', 'Аль-Фаляк (Рассвет)',            'Аль-Фалякъ (Iуьйре)',            'Сура 113 · 5 аятов · Мекка', '113-гIа сура · 5 аят · Макка'),
  ('quran', 90, '114', 'Ан-Нас (Люди)',                  'Ан-Нас (Адамаш)',                'Сура 114 · 6 аятов · Мекка', '114-гIа сура · 6 аят · Макка')
) as v(section, sort_order, chapter_number, title_ru, title_ce, lead_ru, lead_ce)
where not exists (
  select 1 from public.articles where section = 'quran'
);
