-- =============================================================================
-- 60. Уровень подписки нельзя выдать себе самому + вечный Platinum владельцу
-- -----------------------------------------------------------------------------
-- ПРОБЛЕМА (найдена при работе над п.25/32).
--
-- Таблица user_settings разрешает владельцу строки менять её целиком:
--
--   create policy "user_settings self update" ... using (auth.uid() = user_id)
--
-- Колонка pro_tier лежит в той же строке. То есть любой вошедший
-- пользователь мог одним запросом из консоли браузера выдать себе
-- платный уровень:
--
--   supabase.from('user_settings').update({ pro_tier: 'platinum' })
--
-- RLS такой запрос пропускала: строка ведь его собственная. Платные
-- темы и возможности открывались бесплатно, а сервер об этом не знал.
--
-- Клиентская функция forceOwnerPlatinum() тут не помогала: она лишь
-- ПОКАЗЫВАЕТ владельцу платинум в интерфейсе, а запись в базу не
-- контролирует. Любая проверка в браузере обходится за десять секунд —
-- решение обязано жить на стороне базы.
--
-- РЕШЕНИЕ.
--
-- Триггер BEFORE INSERT/UPDATE, который сравнивает новый pro_tier со
-- старым и решает, кому позволено его менять:
--   * владелец проекта      — всегда 'platinum', что бы ни прислали;
--   * администратор         — может выставить любой уровень (ручная выдача);
--   * service_role (сервер) — может, это будущая оплата;
--   * обычный пользователь  — уровень остаётся прежним, попытка молча
--                             игнорируется (не ошибка: остальные поля
--                             в том же запросе должны сохраниться).
--
-- Почему триггер, а не отдельная policy с проверкой колонки: в Postgres
-- нельзя написать RLS «на UPDATE всех колонок, кроме одной». Гранты
-- уровня колонки (revoke update (pro_tier)) сломали бы обычный upsert
-- настроек целой строкой, которым пользуется приложение.
--
-- Запуск повторно безопасен.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Кто владелец проекта. Отдельная функция, чтобы адрес не был
--    размазан по триггерам: см. lib/admin.ts (DEV_EMAIL).
-- ---------------------------------------------------------------------------
create or replace function public.is_owner_email()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(
    (select email from auth.users where id::text = auth.uid()::text),
    ''
  )) = 'mr.hamzik1026@gmail.com';
$$;

revoke all on function public.is_owner_email() from public;
grant execute on function public.is_owner_email() to authenticated, anon;

comment on function public.is_owner_email() is
  'Владелец проекта (mr.hamzik1026@gmail.com). Зеркало DEV_EMAIL из lib/admin.ts.';

-- ---------------------------------------------------------------------------
-- 2. Кому принадлежит строка настроек, тот и проверяется.
--
--    Важно: смотрим на ВЛАДЕЛЬЦА СТРОКИ (new.user_id), а не на текущего
--    пользователя. Иначе админ, правящий чужие настройки, случайно
--    раздавал бы платинум по своему собственному признаку.
-- ---------------------------------------------------------------------------
create or replace function public.guard_pro_tier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_owner_email text;
  previous_tier text;
begin
  select lower(coalesce(email, '')) into row_owner_email
  from auth.users
  where id::text = new.user_id::text;

  -- Владелец проекта: платина навсегда, срока нет, отобрать нельзя —
  -- в том числе случайным сбросом настроек «как у всех».
  if row_owner_email = 'mr.hamzik1026@gmail.com' then
    new.pro_tier := 'platinum';
    return new;
  end if;

  -- Сервер (service_role) и администраторы меняют уровень осознанно:
  -- ручная выдача и будущая оплата идут именно этим путём.
  if auth.uid() is null or public.is_admin_email() then
    return new;
  end if;

  -- Остальные: уровень остаётся тем, что был. Новая строка получает
  -- 'none'. Прочие поля запроса при этом сохраняются как обычно.
  if tg_op = 'INSERT' then
    new.pro_tier := 'none';
    return new;
  end if;

  select pro_tier into previous_tier
  from public.user_settings
  where user_id = new.user_id;

  new.pro_tier := coalesce(previous_tier, 'none');
  return new;
end;
$$;

comment on function public.guard_pro_tier() is
  'Не даёт пользователю выдать себе платный pro_tier; владельцу проекта держит platinum.';

drop trigger if exists trg_guard_pro_tier on public.user_settings;
create trigger trg_guard_pro_tier
  before insert or update on public.user_settings
  for each row
  execute function public.guard_pro_tier();

-- ---------------------------------------------------------------------------
-- 3. Выдать владельцу платину прямо сейчас (миграция 54 могла пройти
--    до того, как аккаунт был создан).
-- ---------------------------------------------------------------------------
insert into public.user_settings (user_id, pro_tier)
select id, 'platinum'
from auth.users
where lower(coalesce(email, '')) = 'mr.hamzik1026@gmail.com'
on conflict (user_id) do update set pro_tier = 'platinum';

-- ---------------------------------------------------------------------------
-- 4. Проверка глазами: должно вернуть строку владельца с 'platinum'.
--
--   select u.email, s.pro_tier
--   from public.user_settings s
--   join auth.users u on u.id = s.user_id
--   where lower(u.email) = 'mr.hamzik1026@gmail.com';
-- ---------------------------------------------------------------------------
