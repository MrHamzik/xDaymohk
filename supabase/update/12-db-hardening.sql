-- ============================================================================
-- 12-db-hardening.sql
-- Защита от дублей на уровне БД + индексы производительности.
--
-- 1) Уникальный индекс на house_addresses (street + house_number + is_not_house)
--    — дубли НЕ смогут появиться в принципе (ранее «Заменить» плодило копии).
--    ВНИМАНИЕ: перед созданием индекса существующие дубли удаляются.
-- 2) Индексы на notifications (для центра уведомлений) и letters.
--
-- Применение: вставьте в Supabase SQL Editor и нажмите Run.
-- ============================================================================

-- 1) Сначала удаляем существующие дубли (оставляем первую по created_at)
WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY lower(trim(street)), lower(trim(coalesce(house_number,''))), is_not_house
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM house_addresses
)
DELETE FROM house_addresses WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2) Уникальный индекс — теперь дубли невозможны на уровне БД
create unique index if not exists idx_house_addresses_unique
  on house_addresses (lower(trim(street)), lower(trim(coalesce(house_number,''))), is_not_house);

-- 3) Индексы производительности для уведомлений (центр уведомлений)
create index if not exists idx_notifications_recipient
  on notifications (recipient_id, created_at desc);

create index if not exists idx_notifications_unread
  on notifications (recipient_id) where is_read = false;

-- 4) Индекс для letter_schedule (очередь писем)
create index if not exists idx_letter_schedule_pending
  on letter_schedule (processed, run_at) where processed = false;

-- 5) Проверка: сколько осталось адресов
select count(*) as total_addresses from house_addresses;
