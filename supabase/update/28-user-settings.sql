-- =============================================================================
-- Даймохк — обновление 28
-- Пользовательские настройки: уведомления, поведение заданий, оформление.
--
-- Зачем в БД, а не в localStorage
-- -------------------------------
-- 1. Настройки уведомлений обязаны быть доступны СЕРВЕРУ: если человек
--    отключил категорию, уведомление вообще не должно создаваться.
--    Фильтрация на клиенте означала бы, что БД копит мусор, который
--    никто никогда не увидит, а счётчик непрочитанных врёт.
-- 2. «Автоодобрение исполнителя» читает /api/tasks/[id] при отклике —
--    это серверное решение, клиент на него влиять не может.
-- 3. Человек заходит с телефона и с компьютера; настройки должны
--    совпадать.
--
-- Оформление (тема, шрифт) тоже храним здесь для синхронизации, но
-- клиент дублирует его в localStorage: тему нужно применить ДО первого
-- кадра, иначе страница мигает белым перед загрузкой профиля.
--
-- Модель хранения
-- ---------------
-- Одна строка на пользователя, вместо колонки на каждую галочку:
--   notification_prefs jsonb — { "<группа>": { "show": bool, "sound": bool } }
--   custom_themes      jsonb — массив пользовательских тем (до 5)
-- Так добавление новой категории уведомлений не требует миграции.
-- Значения по умолчанию заданы в приложении (lib/settings/defaults.ts):
-- отсутствующий ключ = «включено», поэтому новые типы уведомлений
-- начинают работать сразу и не молчат из-за пустого jsonb.
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
-- 1. Таблица настроек
-- ---------------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,

  -- ── Уведомления ─────────────────────────────────────────────────────
  -- { "profile": {"show":true,"sound":false}, "tasks": {...}, ... }
  -- Пустой объект = всё включено (умолчания живут в приложении).
  notification_prefs jsonb not null default '{}'::jsonb,

  -- ── Поведение раздела «Аренца Темщик» ───────────────────────────────
  -- Открыл раздел → автоматически становлюсь Активен на 30 минут.
  auto_active_on_open boolean not null default false,
  -- Отклик на моё задание одобряется без моего участия.
  auto_approve_executor boolean not null default false,

  -- ── Оформление ──────────────────────────────────────────────────────
  -- Расширенный режим открывает темы и настройки шрифта.
  advanced_mode boolean not null default false,
  -- Идентификатор активной темы: 'light' | 'dark' | 'space' | 'sunset'
  -- либо 'custom:<id>' из custom_themes.
  theme_id text not null default 'light',
  -- Пользовательские темы, до 5 штук (ограничение проверяется ниже).
  custom_themes jsonb not null default '[]'::jsonb,
  -- Масштаб шрифта в процентах: 50..150.
  font_scale integer not null default 100
    check (font_scale >= 50 and font_scale <= 150),
  -- Семейство шрифта: 'manrope' | 'inter' | 'georgia' | 'system'.
  font_family text not null default 'manrope',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- jsonb-поля должны быть именно объектом/массивом: без этой проверки
-- в notification_prefs мог бы лечь скаляр и сломать чтение на сервере.
alter table public.user_settings
  drop constraint if exists user_settings_prefs_is_object;
alter table public.user_settings
  add constraint user_settings_prefs_is_object
  check (jsonb_typeof(notification_prefs) = 'object');

alter table public.user_settings
  drop constraint if exists user_settings_themes_is_array;
alter table public.user_settings
  add constraint user_settings_themes_is_array
  check (jsonb_typeof(custom_themes) = 'array'
         and jsonb_array_length(custom_themes) <= 5);

comment on table public.user_settings is
  'Пользовательские настройки: уведомления, поведение заданий, оформление. '
  'Одна строка на человека; умолчания задаются в приложении.';

-- ---------------------------------------------------------------------------
-- 2. updated_at
-- ---------------------------------------------------------------------------
drop trigger if exists trg_user_settings_updated on public.user_settings;
create trigger trg_user_settings_updated
  before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS: строка видна и меняется только своим владельцем
-- ---------------------------------------------------------------------------
alter table public.user_settings enable row level security;

drop policy if exists "user_settings self select" on public.user_settings;
create policy "user_settings self select"
  on public.user_settings for select
  using (auth.uid()::text = user_id::text or is_admin_email());

drop policy if exists "user_settings self insert" on public.user_settings;
create policy "user_settings self insert"
  on public.user_settings for insert
  with check (auth.uid()::text = user_id::text);

drop policy if exists "user_settings self update" on public.user_settings;
create policy "user_settings self update"
  on public.user_settings for update
  using (auth.uid()::text = user_id::text)
  with check (auth.uid()::text = user_id::text);

drop policy if exists "user_settings self delete" on public.user_settings;
create policy "user_settings self delete"
  on public.user_settings for delete
  using (auth.uid()::text = user_id::text);

grant select, insert, update, delete on public.user_settings to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Помощник для сервера: показывать ли уведомление этой группы.
--
--    Вызывается из notifyTaskEvent через service_role. Отсутствующий
--    ключ трактуем как «показывать» — новая категория не молчит, пока
--    пользователь её не настроил.
-- ---------------------------------------------------------------------------
create or replace function public.notifications_enabled(
  target uuid,
  group_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (s.notification_prefs -> group_key ->> 'show')::boolean
       from public.user_settings s
      where s.user_id = target),
    true
  );
$$;

revoke all on function public.notifications_enabled(uuid, text) from public;
grant execute on function public.notifications_enabled(uuid, text) to authenticated, service_role;

comment on function public.notifications_enabled(uuid, text) is
  'true, если пользователь не отключал эту группу уведомлений. '
  'Отсутствующая настройка = включено.';

-- =============================================================================
-- Проверка:
--   select * from public.user_settings limit 5;
--   select public.notifications_enabled('<uuid>', 'tasks');  -- true
-- =============================================================================
