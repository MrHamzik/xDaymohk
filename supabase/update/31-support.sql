-- =============================================================================
-- Даймохк — обновление 31
-- Раздел «Помощь»: частые вопросы (FAQ) и вопросы от пользователей.
--
-- Две таблицы, а не одна
-- ----------------------
-- support_faq      — заранее подготовленные пары «вопрос/ответ»,
--                    редактируются админом, видны всем.
-- support_questions— вопросы, которые задают пользователи; на них
--                    отвечает админ, и ответ виден автору.
--
-- Слить их в одну таблицу нельзя: у FAQ нет автора и он всегда
-- опубликован, а у вопроса есть автор, статус и адресат уведомления.
--
-- Публикация вопроса пользователя
-- -------------------------------
-- `is_public` позволяет админу превратить удачный вопрос в общий: он
-- начинает находиться поиском у всех. По умолчанию false — вопрос
-- может содержать личные подробности, и публиковать его молча нельзя.
--
-- Поиск
-- -----
-- Полнотекстовый индекс по русскому словарю: поиск «как удалить
-- анкету» должен находить «Удаление анкеты», а не только точную
-- подстроку. Дополнительно трграммный индекс для опечаток.
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

-- Для поиска с опечатками.
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- 1. Частые вопросы
-- ---------------------------------------------------------------------------
create table if not exists public.support_faq (
  id uuid primary key default gen_random_uuid(),
  sort_order integer not null default 0,
  question_ru text not null default '',
  question_ce text not null default '',
  answer_ru   text not null default '',
  answer_ce   text not null default '',
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_faq_order_idx
  on public.support_faq (sort_order);

comment on table public.support_faq is
  'Частые вопросы раздела «Помощь». Ответы в markdown, рендерятся Prose.';

-- ---------------------------------------------------------------------------
-- 2. Вопросы от пользователей
-- ---------------------------------------------------------------------------
create table if not exists public.support_questions (
  id uuid primary key default gen_random_uuid(),

  -- Автор. on delete set null: удалили аккаунт — вопрос и ответ
  -- остаются в общей базе знаний, но перестают быть привязаны к человеку.
  author_id uuid references public.user_profiles(id) on delete set null,
  author_name text not null default '',

  question text not null,
  answer   text not null default '',

  -- 'new' — ждёт ответа, 'answered' — отвечен, 'closed' — снят без ответа.
  status text not null default 'new',

  -- Виден ли вопрос всем в общем списке и поиске.
  is_public boolean not null default false,

  answered_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.support_questions
  drop constraint if exists support_questions_status_known;
alter table public.support_questions
  add constraint support_questions_status_known
  check (status in ('new', 'answered', 'closed'));

-- Пустой вопрос и «простыня» одинаково бесполезны.
alter table public.support_questions
  drop constraint if exists support_questions_length;
alter table public.support_questions
  add constraint support_questions_length
  check (char_length(question) between 5 and 1000);

create index if not exists support_questions_author_idx
  on public.support_questions (author_id, created_at desc);
create index if not exists support_questions_public_idx
  on public.support_questions (is_public, created_at desc);

-- Полнотекстовый поиск по вопросу и ответу.
create index if not exists support_questions_search_idx
  on public.support_questions
  using gin (to_tsvector('russian', question || ' ' || coalesce(answer, '')));
create index if not exists support_questions_trgm_idx
  on public.support_questions using gin (question gin_trgm_ops);

comment on table public.support_questions is
  'Вопросы пользователей в раздел «Помощь». Ответ админа приходит '
  'автору уведомлением; is_public выносит пару в общий список.';

-- ---------------------------------------------------------------------------
-- 3. updated_at
-- ---------------------------------------------------------------------------
drop trigger if exists trg_support_faq_updated on public.support_faq;
create trigger trg_support_faq_updated
  before update on public.support_faq
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_support_questions_updated on public.support_questions;
create trigger trg_support_questions_updated
  before update on public.support_questions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
alter table public.support_faq enable row level security;

drop policy if exists "faq public read" on public.support_faq;
create policy "faq public read"
  on public.support_faq for select
  using (is_published or is_admin_email());

drop policy if exists "faq admin write" on public.support_faq;
create policy "faq admin write"
  on public.support_faq for all
  using (is_admin_email()) with check (is_admin_email());

alter table public.support_questions enable row level security;

-- Свой вопрос виден всегда; чужой — только если админ его опубликовал.
drop policy if exists "questions read" on public.support_questions;
create policy "questions read"
  on public.support_questions for select
  using (
    is_public
    or auth.uid()::text = author_id::text
    or is_admin_email()
  );

drop policy if exists "questions self insert" on public.support_questions;
create policy "questions self insert"
  on public.support_questions for insert
  with check (auth.uid()::text = author_id::text);

-- Отвечает и публикует только админ: иначе автор мог бы вписать себе
-- ответ от имени поддержки.
drop policy if exists "questions admin update" on public.support_questions;
create policy "questions admin update"
  on public.support_questions for update
  using (is_admin_email()) with check (is_admin_email());

drop policy if exists "questions delete" on public.support_questions;
create policy "questions delete"
  on public.support_questions for delete
  using (auth.uid()::text = author_id::text or is_admin_email());

-- ---------------------------------------------------------------------------
-- 5. Тип уведомления об ответе
--
-- Список типов задан CHECK-ограничением (schema.sql, дополнялся в 18 и
-- 27), а не enum-типом, поэтому пересоздаём его целиком с прежними
-- значениями плюс новое. Уведомление приходит в колокольчик и раздел
-- «Письма»: отправки email в проекте нет, и вводить её ради одного
-- сценария не стали.
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'system', 'profile_hidden', 'profile_visible', 'user_blocked', 'user_unblocked',
  'review_received', 'question_commented', 'comment_replied', 'like_received',
  'complaint_result', 'taxi_request', 'taxi_info',
  -- Аренца Темщик / ГIончалла
  'task_taken', 'task_submitted', 'task_confirmed', 'task_auto_confirmed',
  'task_cancel_requested', 'task_cancelled', 'task_expired',
  'task_joined', 'task_excluded', 'task_reminder',
  'task_rated', 'task_rate_pending',
  'task_join_request', 'task_join_approved', 'task_join_rejected',
  -- Обновление 31: ответ поддержки на вопрос пользователя
  'support_answered'
));

-- ---------------------------------------------------------------------------
-- 6. Готово
-- ---------------------------------------------------------------------------
do $$
begin
  raise notice 'Обновление 31 применено: support_faq и support_questions готовы.';
end $$;
