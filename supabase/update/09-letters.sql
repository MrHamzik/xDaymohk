-- ============================================================================
-- 09-letters.sql
-- Раздел «Письма»: шаблоны писем + история отправки.
--
-- letters   — шаблоны (welcome + кастомные), двуязычные, пресет цвета/иконки.
-- letter_log— журнал отправленных писем (кто/когда/что).
--
-- Применение: вставьте в Supabase SQL Editor и нажмите Run.
-- ============================================================================

create table if not exists public.letters (
  id          text primary key,
  key         text unique,            -- 'welcome' или null для кастомных
  letter_type text not null default 'custom',  -- 'welcome' | 'custom'
  title_ru    text not null default '',
  title_ce    text not null default '',
  message_ru  text not null default '',
  message_ce  text not null default '',
  sender      text not null default 'Даймохк',
  preset      text not null default 'green',   -- green | yellow | red | custom
  color       text,                            -- hex для preset=custom
  icon        text not null default '📩',      -- эмодзи-пресет
  recipients  text not null default 'all',     -- 'all' | 'selected'
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.letter_log (
  id            text primary key,
  letter_id     text,
  title_ru      text,
  title_ce      text,
  message_ru    text,
  message_ce    text,
  sender        text,
  preset        text,
  color         text,
  icon          text,
  recipient_ids text[],
  count         integer not null default 0,
  sent_at       timestamptz not null default now()
);

-- RLS: письма и журнал доступны только админам (чтение), запись — админ.
alter table public.letters enable row level security;
alter table public.letter_log enable row level security;

drop policy if exists "letters admin read" on public.letters;
create policy "letters admin read"
  on public.letters for select
  using (public.is_admin_email());

drop policy if exists "letters admin write" on public.letters;
create policy "letters admin write"
  on public.letters for insert
  with check (public.is_admin_email());

drop policy if exists "letters admin update" on public.letters;
create policy "letters admin update"
  on public.letters for update
  using (public.is_admin_email())
  with check (public.is_admin_email());

drop policy if exists "letter_log admin read" on public.letter_log;
create policy "letter_log admin read"
  on public.letter_log for select
  using (public.is_admin_email());

drop policy if exists "letter_log admin insert" on public.letter_log;
create policy "letter_log admin insert"
  on public.letter_log for insert
  with check (public.is_admin_email());

-- Стартовый welcome-шаблон (если нет)
insert into public.letters (id, key, letter_type, title_ru, title_ce, message_ru, message_ce, sender, preset, icon, recipients)
values (
  'letter-welcome',
  'welcome',
  'welcome',
  'Добро пожаловать в Даймохк!',
  'Марша догIийла, Даймохк!',
  'Вы стали частью сообщества Даймохк! Заполните анкету и исследуйте карту села.',
  'Хьо Даймохк йукъараллашна тIехьа вош вина! Хьайн анкетан кечйе а, юьртан карта хьажа.',
  'Даймохк',
  'green',
  '🎉',
  'all'
)
on conflict (key) do nothing;
