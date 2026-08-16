-- ============================================================================
-- 07-clean-duplicate-addresses.sql
-- Очистка ДУБЛИКАТОВ адресов в таблице house_addresses.
--
-- Проблема: повторные импорты одного CSV (кнопка «Заменить» раньше добавляла
-- копию) раздули таблицу: ~1874 уникальных адресов -> 11244 строк.
--
-- Что делает:
--   1. Показывает статистику (всего / уникальных / дублей) ДО.
--   2. Удаляет дубликаты, оставляя ОДНУ запись на (street, house_number,
--      is_not_house, category). Оставляется запись с наименьшим created_at
--      (первая импортированная).
--   3. Показывает статистику ПОСЛЕ.
--
-- Применение: вставьте весь файл в Supabase SQL Editor и нажмите Run.
-- Это безопасно: удаляются ТОЛЬКО дубли, у которых есть повтор.
-- ============================================================================

-- 1) Статистика ДО
SELECT
  count(*)                                          AS total_rows,
  count(DISTINCT (street, house_number, is_not_house, category)) AS unique_addresses,
  count(*) - count(DISTINCT (street, house_number, is_not_house, category)) AS duplicates
FROM house_addresses;

-- 2) Удаление дублей (оставляем одну запись на адрес)
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY lower(trim(street)), lower(trim(coalesce(house_number, ''))), is_not_house, coalesce(category, '')
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM house_addresses
)
DELETE FROM house_addresses
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 3) Статистика ПОСЛЕ
SELECT
  count(*)                                          AS total_rows,
  count(DISTINCT (street, house_number, is_not_house, category)) AS unique_addresses
FROM house_addresses;
