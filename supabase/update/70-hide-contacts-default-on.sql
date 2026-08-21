-- =============================================================================
-- 70. «Не показывать контакты» — галочки по умолчанию ПОСТАВЛЕНЫ
-- -----------------------------------------------------------------------------
-- Решение владельца (22.08, п.4): формулировка везде единая — «Не
-- показывать … в анкетах», и по умолчанию эти галочки стоят, т.е.
-- контакты скрыты, пока человек сам не снимет галочку.
--
-- Столбцы созданы миграциями 68 (user_profiles) и 69 (profiles);
-- здесь только переводим умолчание для СУЩЕСТВУЮЩИХ строк: false → true.
-- Для новых строк умолчание задаёт приложение (accountFromUser).
-- Идемпотентно.
-- =============================================================================
update public.user_profiles
set hide_phone = true, hide_whatsapp = true, hide_telegram = true
where hide_phone = false or hide_whatsapp = false or hide_telegram = false;

update public.profiles
set hide_phone = true, hide_whatsapp = true, hide_telegram = true
where hide_phone = false or hide_whatsapp = false or hide_telegram = false;

-- Проверка (0 строк):
--   select count(*) from public.user_profiles
--   where hide_phone = false or hide_whatsapp = false or hide_telegram = false;
