-- =============================================================================
-- Даймохк — обновление 73: предложения «скрепкой» на главную
-- -----------------------------------------------------------------------------
-- Владелец (Этап 2-каталог, п.6): у анкет (личной и специалиста) и у
-- заданий появляется иконка скрепки — житель может ПРЕДЛОЖИТЬ объект
-- на главную страницу. Один аккаунт — одно предложение в день,
-- сброс в 00:00 (календарная дата). Предложения видны администрации
-- в разделе «Главная страница»; само закрепление блоков — следующий
-- этап, сейчас копятся предложения.
--
-- Ограничение «раз в день» держит составной уникальный ключ
-- (user_id, proposed_date): даже обход клиента не даст второй
-- строки за сутки.
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

create table if not exists public.home_pin_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,

  -- 'profile' — анкета, 'task' — задание.
  target_type text not null,
  -- id анкеты (text) или id задания (uuid как text).
  target_id text not null,

  -- Календарный день предложения: сброс лимита в 00:00.
  proposed_date date not null default current_date,

  created_at timestamptz not null default now(),

  constraint home_pin_target_known
    check (target_type in ('profile', 'task')),
  constraint home_pin_once_per_day
    unique (user_id, proposed_date)
);

-- Админка группирует «сколько раз предложили объект» — индекс по цели.
create index if not exists home_pin_proposals_target_idx
  on public.home_pin_proposals (target_type, target_id);

comment on table public.home_pin_proposals is
  'Предложения жителей закрепить анкету/задание на главной. '
  'Одно предложение на аккаунт в день (unique по дате). Пишет сервер '
  'от имени вошедшего пользователя; читает администрация.';

-- RLS: владелец видит свои предложения (интерфейс «уже предлагали
-- сегодня»), администрация — все. Писать и удалять — только сервер
-- (сервисная роль), напрямую из клиента вставка невозможна.
alter table public.home_pin_proposals enable row level security;

drop policy if exists "home pins self select" on public.home_pin_proposals;
create policy "home pins self select"
  on public.home_pin_proposals for select
  using (auth.uid()::text = user_id::text or is_admin_email());
