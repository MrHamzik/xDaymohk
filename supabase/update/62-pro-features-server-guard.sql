-- =============================================================================
-- 62. Платные возможности проверяются на сервере (пункт 1 плана по п.20)
-- -----------------------------------------------------------------------------
-- ПРОБЛЕМА.
--
-- Уровень подписки выдать себе уже нельзя (миграция 60), срок продлить —
-- тоже (миграция 61). Но САМИ платные возможности до сих пор гасились
-- только в браузере: components/SettingsProvider.tsx решал, показывать ли
-- платные темы, обычным условием в коде. Любой, кто откроет консоль
-- разработчика, мог записать в user_settings theme_id = 'space' и
-- light_mode = true, ничего не заплатив. База такую строку принимала.
--
-- Правило простое: проверка, которая живёт в браузере, — не проверка.
-- Браузер принадлежит пользователю.
--
-- РЕШЕНИЕ.
--
-- Триггер, который перед записью сверяет запрошенные платные поля с
-- ДЕЙСТВУЮЩИМ уровнем (с учётом срока из миграции 61). Не хватает
-- уровня — поле молча возвращается к допустимому значению, остальная
-- строка сохраняется как обычно.
--
-- Почему не отказ с ошибкой: настройки сохраняются пачкой в фоне. Из-за
-- одного платного поля потерялись бы все остальные правки, сделанные
-- заодно, а пользователь увидел бы непонятный сбой. Тихий откат к
-- бесплатному значению даёт ровно то поведение, что и раньше в
-- интерфейсе, — только теперь его нельзя обойти.
--
-- Запуск повторно безопасен. Требуются миграции 60 и 61.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Какие темы бесплатны.
--
--    Зеркало FREE_THEME_IDS из lib/settings/pro.ts. Свои темы
--    (custom:...) бесплатны: человек делает их сам, это не товар.
-- ---------------------------------------------------------------------------
create or replace function public.is_free_theme(theme text)
returns boolean
language sql
immutable
as $$
  select theme is null
      or theme in ('light', 'dark')
      or theme like 'custom:%';
$$;

comment on function public.is_free_theme(text) is
  'Тема доступна без подписки: светлая, тёмная и созданные пользователем.';

-- ---------------------------------------------------------------------------
-- 2. Проверка платных возможностей.
-- ---------------------------------------------------------------------------
create or replace function public.guard_pro_features()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tier text;
  tier_rank int;
begin
  -- Сервер (service_role) и администраторы: сюда попадает оплата,
  -- ручная выдача и служебные правки. Их не ограничиваем.
  if auth.uid() is null or public.is_admin_email() then
    return new;
  end if;

  -- К этому моменту trg_guard_pro_tier уже отработал (см. пункт 3 про
  -- порядок), поэтому в new лежит НАСТОЯЩИЙ уровень из базы, а не тот,
  -- что прислал клиент.
  tier := public.effective_pro_tier(new.pro_tier, new.pro_until);

  tier_rank := case tier
    when 'bronze' then 1
    when 'silver' then 2
    when 'gold' then 3
    when 'platinum' then 4
    else 0
  end;

  -- Платные темы — с уровня «Бронза».
  if tier_rank < 1 and not public.is_free_theme(new.theme_id) then
    new.theme_id := case
      when tg_op = 'UPDATE' and public.is_free_theme(old.theme_id) then old.theme_id
      else 'light'
    end;
  end if;

  -- Светлый режим оформления — с уровня «Серебро».
  if tier_rank < 2 and coalesce(new.light_mode, false) then
    new.light_mode := false;
  end if;

  return new;
end;
$$;

comment on function public.guard_pro_features() is
  'Откатывает платные настройки (темы, светлый режим) тем, у кого нет действующей подписки.';

-- ---------------------------------------------------------------------------
-- 3. Подключение.
--
--    Имя выбрано так, чтобы триггер сработал ПОСЛЕ trg_guard_pro_tier:
--    при равном событии Postgres выполняет триггеры по алфавиту имени,
--    а 'trg_guard_pro_zfeatures' идёт после 'trg_guard_pro_tier'. Это
--    важно: сначала должен установиться настоящий уровень, и только
--    потом по нему проверяются возможности.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_guard_pro_features on public.user_settings;
drop trigger if exists trg_guard_pro_zfeatures on public.user_settings;
create trigger trg_guard_pro_zfeatures
  before insert or update on public.user_settings
  for each row
  execute function public.guard_pro_features();

-- ---------------------------------------------------------------------------
-- 4. Разовая уборка: у кого сейчас стоит платное без подписки.
--
--    Тех, кто успел проставить себе платную тему до этой миграции,
--    возвращаем на светлую.
-- ---------------------------------------------------------------------------
update public.user_settings s
set theme_id = 'light'
where not public.is_free_theme(s.theme_id)
  and public.effective_pro_tier(s.pro_tier, s.pro_until) = 'none';

update public.user_settings s
set light_mode = false
where coalesce(s.light_mode, false)
  and public.effective_pro_tier(s.pro_tier, s.pro_until) in ('none', 'bronze');

-- ---------------------------------------------------------------------------
-- 5. Проверка глазами: не должно вернуть ни строки.
--
--   select user_id, pro_tier, theme_id, light_mode
--   from public.user_settings
--   where public.effective_pro_tier(pro_tier, pro_until) = 'none'
--     and (not public.is_free_theme(theme_id) or coalesce(light_mode, false));
-- ---------------------------------------------------------------------------
