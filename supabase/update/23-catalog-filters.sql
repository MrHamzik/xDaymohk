-- =============================================================================
-- Даймохк — обновление 23
-- Сферы деятельности каталога («Направление и сфера») переезжают в БД.
--
-- Проблема
-- --------
-- В админке есть раздел «Фильтры» → «Каталог», но список там всегда был
-- пустым, а добавленные сферы ни на что не влияли: каталог читал
-- захардкоженный массив PROFESSION_CATEGORIES из lib/types.ts. Получалось
-- два независимых источника — редактируешь один, работает другой.
--
-- Решение
-- -------
-- Заводим те же сферы в app_filters со scope='catalog'. Значения value
-- совпадают с id из PROFESSION_CATEGORIES (doctor, builder, …), потому
-- что именно они лежат в profiles.profession_category — иначе фильтр
-- перестал бы находить анкеты.
--
-- 'all' не заводим: это не сфера, а «сбросить фильтр», такая кнопка
-- рисуется в интерфейсе отдельно.
--
-- Идемпотентно, можно перезапускать.
-- =============================================================================
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'app_filters')
    then raise exception 'Нет таблицы public.app_filters — сначала примените 18-tasks.sql'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Базовые сферы (зеркало PROFESSION_CATEGORIES)
-- ---------------------------------------------------------------------------
insert into public.app_filters (id, scope, value, label_ru, label_ce, sort_order) values
  ('cat-doctor',      'catalog', 'doctor',      'Здоровье',            'Могушалла',           10),
  ('cat-builder',     'catalog', 'builder',     'Строительство',       'ГIишлош яр',          20),
  ('cat-teacher',     'catalog', 'teacher',     'Образование',         'Дешар',               30),
  ('cat-mechanic',    'catalog', 'mechanic',    'Авто',                'Авто',                40),
  ('cat-service',     'catalog', 'service',     'Бытовые услуги',      'ХIусаман гIуллакхаш', 50),
  ('cat-trade',       'catalog', 'trade',       'Торговля',            'Йохк-эцар',           60),
  ('cat-agriculture', 'catalog', 'agriculture', 'Сельское хозяйство',  'Юьртбахам',           70),
  ('cat-other',       'catalog', 'other',       'Другое',              'Кхидерш',             80)
-- Конфликт возможен и по первичному ключу, и по (scope, value):
-- без указания цели Postgres корректно гасит оба случая.
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Подхватываем сферы, которые уже проставлены у анкет, но
--    отсутствуют в справочнике (заведены до этой миграции).
-- ---------------------------------------------------------------------------
insert into public.app_filters (id, scope, value, label_ru, sort_order)
select
  'cat-auto-' || substr(md5(c.category), 1, 8),
  'catalog',
  c.category,
  initcap(replace(c.category, '_', ' ')),
  500
from (
  select distinct trim(profession_category) as category
    from public.profiles
   where profession_category is not null
     and trim(profession_category) <> ''
     and trim(profession_category) <> 'all'
) c
where not exists (
  select 1 from public.app_filters f
   where f.scope = 'catalog' and f.value = c.category
)
on conflict do nothing;

-- =============================================================================
-- Проверка:
--   select value, label_ru, sort_order, is_active
--     from public.app_filters where scope = 'catalog' order by sort_order;
-- =============================================================================
