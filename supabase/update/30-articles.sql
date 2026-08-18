-- =============================================================================
-- Даймохк — обновление 30
-- Статьи для страниц-чтения: «Сира Пророка», «Нохчалла», «Руководство».
--
-- Зачем таблица, а не файлы в репозитории
-- ---------------------------------------
-- Пользователь просил РЕДАКТОР: главы должны публиковаться из админки,
-- без правки кода и деплоя. Значит содержимое живёт в БД.
--
-- Одна таблица на все страницы-чтения, а не три
-- ---------------------------------------------
-- «Сира», «Нохчалла» и «Руководство» устроены одинаково: набор глав с
-- заголовком, телом и порядком. Различает их только колонка `section`.
-- Три таблицы с идентичной структурой означали бы три копии RLS, три
-- эндпоинта и три редактора — при том, что завтра появится четвёртая
-- страница.
--
-- Формат тела главы
-- -----------------
-- `body_ru` / `body_ce` хранят MARKDOWN, а не HTML. Причина — безопасность:
-- HTML из админки пришлось бы вставлять через dangerouslySetInnerHTML, и
-- любой <script> в теле стал бы XSS на весь сайт. Markdown рендерится в
-- заранее известный набор React-элементов, произвольные теги в него
-- физически не попадают.
--
-- Черновики
-- ---------
-- `is_published` разделяет «написал» и «показал»: главу можно готовить
-- несколько заходов, читатели её не увидят. Публичная политика RLS
-- отдаёт только опубликованное.
--
-- Идемпотентно, можно перезапускать.
-- =============================================================================
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'user_profiles')
    then raise exception 'Нет таблицы user_profiles — сначала примените schema.sql'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Таблица глав
-- ---------------------------------------------------------------------------
create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),

  -- Какая страница: 'sira' | 'nohchalla' | 'guide'.
  -- Текстом, а не enum: добавление раздела не должно требовать миграции.
  section text not null,

  -- Порядок глав внутри раздела. Дробный шаг (10, 20, 30) оставляет
  -- место для вставки главы между существующими без перенумерации.
  sort_order integer not null default 0,

  title_ru text not null default '',
  title_ce text not null default '',

  -- Короткая подводка под заголовком в оглавлении (необязательна).
  lead_ru text not null default '',
  lead_ce text not null default '',

  -- Тело главы в markdown. См. пояснение о безопасности выше.
  body_ru text not null default '',
  body_ce text not null default '',

  -- Черновик не виден читателям.
  is_published boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.articles
  drop constraint if exists articles_section_known;
alter table public.articles
  add constraint articles_section_known
  check (section in ('sira', 'nohchalla', 'guide'));

-- Читатель всегда запрашивает «главы раздела по порядку» — индекс
-- покрывает этот запрос целиком.
create index if not exists articles_section_order_idx
  on public.articles (section, sort_order);

comment on table public.articles is
  'Главы страниц-чтения (Сира, Нохчалла, Руководство). Тело — markdown, '
  'рендерится безопасным набором элементов, не через innerHTML.';

-- ---------------------------------------------------------------------------
-- 2. updated_at
-- ---------------------------------------------------------------------------
drop trigger if exists trg_articles_updated on public.articles;
create trigger trg_articles_updated
  before update on public.articles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS
--
-- Читать опубликованное может кто угодно, включая гостя: это публичный
-- контент, ради которого страница и существует. Писать — только админ.
-- ---------------------------------------------------------------------------
alter table public.articles enable row level security;

drop policy if exists "articles public read" on public.articles;
create policy "articles public read"
  on public.articles for select
  using (is_published or is_admin_email());

drop policy if exists "articles admin insert" on public.articles;
create policy "articles admin insert"
  on public.articles for insert
  with check (is_admin_email());

drop policy if exists "articles admin update" on public.articles;
create policy "articles admin update"
  on public.articles for update
  using (is_admin_email())
  with check (is_admin_email());

drop policy if exists "articles admin delete" on public.articles;
create policy "articles admin delete"
  on public.articles for delete
  using (is_admin_email());

-- ---------------------------------------------------------------------------
-- 4. Готово
-- ---------------------------------------------------------------------------
do $$
begin
  raise notice 'Обновление 30 применено: таблица articles готова.';
end $$;
