-- =============================================================================
-- Даймохк — обновление 22
-- Категории объектов карты («Другое») переезжают из localStorage в БД.
--
-- Проблема
-- --------
-- Админка хранила добавленные категории в localStorage браузера
-- (ключ samashki-custom-categories). Значит они существовали только на
-- том устройстве, где их завели: другие админы и обычные пользователи
-- видели лишь базовый набор, а после чистки кэша список пропадал.
-- Справочник общий по смыслу — его место в базе.
--
-- Решение
-- -------
-- Используем уже существующую таблицу app_filters со scope = 'map'
-- (она создана в 18-tasks.sql и умеет всё нужное: порядок, вкл/выкл,
-- двуязычные названия, RLS «читают все, пишет админ»).
--
-- value  — латинский слаг для URL и сравнений;
-- label_ru — то, что видит пользователь и что лежит в
--            house_addresses.category.
--
-- ВАЖНО: label_ru должен совпадать с текстом в house_addresses.category,
-- иначе фильтр на карте перестанет находить объекты. Поэтому базовый
-- набор заводим ровно теми же словами, что были захардкожены в админке
-- (DEFAULT_ADDRESS_CATEGORIES), и дополняем всеми категориями, которые
-- реально встречаются у адресов.
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
-- 1. Базовый набор категорий карты
-- ---------------------------------------------------------------------------
insert into public.app_filters (id, scope, value, label_ru, label_ce, sort_order) values
  ('map-other',      'map', 'other',      'Другое',           'Кхин',              10),
  ('map-shops',      'map', 'shops',      'Магазины',         'Туьканаш',          20),
  ('map-trade',      'map', 'trade',      'Торговля',         'Йохк-эцар',         30),
  ('map-service',    'map', 'service',    'Автосервис',       'Автосервис',        40),
  ('map-school',     'map', 'school',     'Школа',            'Школа',             50),
  ('map-education',  'map', 'education',  'Образование',      'Дешар',             60),
  ('map-mosque',     'map', 'mosque',     'Мечеть',           'Маьждиг',           70),
  ('map-admin',      'map', 'admin',      'Администрация',    'Куьйгалла',         80),
  ('map-post',       'map', 'post',       'Почта',            'Почта',             90),
  ('map-sport',      'map', 'sport',      'Спорткомплекс',    'Спорткомплекс',    100),
  ('map-health',     'map', 'health',     'Здравоохранение',  'Могашалла',        110)
-- Конфликт возможен и по первичному ключу, и по (scope, value):
-- без указания цели Postgres корректно гасит оба.
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Подхватываем категории, которые уже проставлены у адресов
--    (в том числе созданные админом через localStorage — они попали
--    в house_addresses.category при сохранении объекта).
--    Слаг генерируем из текста: пробелы → дефис, только латиница и
--    цифры; если после очистки пусто — берём хеш, чтобы не потерять.
-- ---------------------------------------------------------------------------
insert into public.app_filters (id, scope, value, label_ru, sort_order)
select
  'map-auto-' || substr(md5(c.category), 1, 8) as id,
  'map' as scope,
  coalesce(
    nullif(regexp_replace(lower(translate(c.category,
      'абвгдеёжзийклмнопрстуфхцчшщъыьэюя',
      'abvgdeejzijklmnoprstufhccss_y_eua')), '[^a-z0-9]+', '-', 'g'), '-'),
    'cat-' || substr(md5(c.category), 1, 6)
  ) as value,
  c.category as label_ru,
  500 as sort_order
from (
  select distinct trim(category) as category
    from public.house_addresses
   where category is not null
     and trim(category) <> ''
     and trim(category) <> 'Дома'
) c
where not exists (
  select 1 from public.app_filters f
   where f.scope = 'map' and f.label_ru = c.category
)
on conflict do nothing;

-- =============================================================================
-- Проверка:
--   select value, label_ru, sort_order, is_active
--     from public.app_filters where scope = 'map' order by sort_order;
--
-- Если какая-то категория осталась только в localStorage (объект с ней
-- ещё не сохранён), добавьте её в админке: «Фильтры» → «Карта».
-- =============================================================================
