-- =============================================================================
-- Даймохк — полная схема базы данных (fresh install)
-- =============================================================================
-- Единый скрипт для развёртывания с нуля. Запускается один раз в
-- Supabase Dashboard -> SQL Editor (или: psql "$DATABASE_URL" -f supabase/schema.sql).
--
-- Что входит:
--   1. Расширения и вспомогательные функции
--   2. Все таблицы (user_profiles, profiles, certificates, reviews,
--      profile_questions, profile_question_comments, complaints,
--      house_addresses, notifications, donations, project_support)
--   3. Storage bucket + RLS + политики
--   4. Вьюхи для живых имён авторов и каталога
--   5. Триггеры (рейтинги, счётчики, onboarding)
--   6. GRANT-ы для ролей anon / authenticated / service_role
--
-- Идемпотентность: безопасно перезапускать (IF NOT EXISTS / OR REPLACE).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Расширения
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";


-- ---------------------------------------------------------------------------
-- 2. Вспомогательные функции
-- ---------------------------------------------------------------------------

-- Админы (зеркало lib/admin.ts — держать в синхроне).
create or replace function public.is_admin_email()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(
    (select email from auth.users where id::text = auth.uid()::text),
    ''
  )) in ('mr.hamzik1026@gmail.com', 'nabis95@gmail.com');
$$;

revoke all on function public.is_admin_email() from public;
grant execute on function public.is_admin_email() to authenticated, anon;

-- auth.uid() с гарантированным uuid-типом (в некоторых проектах uid() — text).
create or replace function public.uid() returns uuid
language plpgsql
stable
as $$
declare
  raw text;
begin
  raw := auth.uid();
  if raw is null or raw = '' then
    return '00000000-0000-0000-0000-000000000000'::uuid;
  end if;
  return raw::uuid;
exception when invalid_text_representation then
  return '00000000-0000-0000-0000-000000000000'::uuid;
end;
$$;

grant execute on function public.uid() to authenticated, anon;


-- ---------------------------------------------------------------------------
-- 3. Таблицы
-- ---------------------------------------------------------------------------

-- 3.1 user_profiles — метаданные учётной записи (1:1 с auth.users)
create table if not exists public.user_profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null,
  full_name       text not null default '',
  avatar_url      text not null default '',
  phone           text not null default '',
  is_admin        boolean not null default false,
  is_blocked      boolean not null default false,
  status_override text,
  gender          text check (gender in ('male', 'female')),
  birth_date      date,
  birth_year      integer,
  settlement      text default 'Даймохк',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_user_profiles_email on public.user_profiles (lower(email));

-- 3.2 profiles — каталог анкет (личные карточки + специалисты/жители)
create table if not exists public.profiles (
  id                       text primary key,
  owner_id                 uuid references public.user_profiles(id) on delete cascade,
  full_name                text not null default '',
  avatar_url               text not null default '',
  photos                   jsonb not null default '[]'::jsonb,
  is_specialist            boolean not null default false,
  is_personal              boolean not null default false,
  profession_category      text,
  profession_title         text,
  experience               text,
  experience_start         date,
  experience_end           date,
  experience_current       boolean not null default false,
  bio                      text not null default '',
  workplace_address        text not null default '',
  workplace_coords         jsonb not null default '{"lat":43.288024,"lng":45.298989}'::jsonb,
  rating                   numeric(3,1) not null default 0,
  review_count             integer not null default 0,
  phone                    text not null default '',
  hide_phone               boolean not null default false,
  same_as_phone_whatsapp   boolean not null default true,
  whatsapp                 text,
  telegram                 text,
  video_url                text,
  is_verified              boolean not null default false,
  verification_status      text not null default 'none'
    check (verification_status in ('none', 'pending', 'verified', 'rejected')),
  is_admin                 boolean not null default false,
  is_hidden                boolean not null default false,
  is_banned                boolean not null default false,
  work_days                jsonb,
  work_hours_start         text,
  work_hours_end           text,
  break_start              text,
  break_end                text,
  is_flexible_schedule     boolean not null default false,
  gender                   text check (gender in ('male', 'female')),
  birth_date               date,
  settlement               text default 'Даймохк',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_profiles_owner_id        on public.profiles (owner_id);
create index if not exists idx_profiles_is_hidden       on public.profiles (is_hidden) where not is_hidden;
create index if not exists idx_profiles_specialist      on public.profiles (is_specialist);
create index if not exists idx_profiles_verif_status    on public.profiles (verification_status);
create index if not exists idx_profiles_profession_cat  on public.profiles (profession_category);
create index if not exists idx_profiles_created_at      on public.profiles (created_at desc);
create index if not exists idx_profiles_photos_gin      on public.profiles using gin (photos jsonb_path_ops);
create index if not exists idx_profiles_public_specialist
  on public.profiles (created_at desc)
  where not is_hidden and not is_banned and is_specialist;

-- 3.3 certificates — документы анкеты
create table if not exists public.certificates (
  id          text primary key,
  profile_id  text not null references public.profiles(id) on delete cascade,
  title       text not null default '',
  issuer      text not null default '',
  year        text not null default '',
  image_url   text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists idx_certificates_profile_id on public.certificates (profile_id);

-- 3.4 reviews — отзывы (имя/аватар автора подтягиваются вьюхой v_reviews)
create table if not exists public.reviews (
  id                  text primary key,
  profile_id          text not null references public.profiles(id) on delete cascade,
  author_id           uuid references public.user_profiles(id) on delete set null,
  rating              numeric(2,1) not null check (rating between 0 and 5),
  text                text not null default '',
  created_at          date not null default current_date
);

create index if not exists idx_reviews_profile_id on public.reviews (profile_id, created_at desc);
create index if not exists idx_reviews_author_id on public.reviews (author_id);

-- 3.5 profile_questions — вопросы к анкете
create table if not exists public.profile_questions (
  id           text primary key,
  profile_id   text not null references public.profiles(id) on delete cascade,
  author_id    uuid references public.user_profiles(id) on delete set null,
  question     text not null check (char_length(question) between 1 and 500),
  created_at   date not null default current_date
);

create index if not exists idx_profile_questions_profile
  on public.profile_questions (profile_id, created_at desc);

-- 3.6 profile_question_comments — обсуждение под вопросом
create table if not exists public.profile_question_comments (
  id          text primary key,
  question_id text not null references public.profile_questions(id) on delete cascade,
  author_id   uuid references public.user_profiles(id) on delete set null,
  comment     text not null check (char_length(comment) between 1 and 500),
  created_at  date not null default current_date,
  reply_to_id text references public.profile_question_comments(id) on delete set null
);

create index if not exists idx_pqc_question
  on public.profile_question_comments (question_id, created_at desc);
create index if not exists idx_pqc_reply_to
  on public.profile_question_comments (reply_to_id);

-- 3.7 complaints — жалобы на анкеты
create table if not exists public.complaints (
  id            text primary key,
  profile_id    text not null references public.profiles(id) on delete cascade,
  target_user_id uuid references public.user_profiles(id) on delete set null,
  author_id     uuid not null references public.user_profiles(id) on delete cascade,
  author_name   text not null default '',
  reason        text not null check (char_length(reason) between 1 and 500),
  status        text not null default 'open'
    check (status in ('open', 'dismissed', 'resolved')),
  created_at    date not null default current_date
);

create index if not exists idx_complaints_status on public.complaints (status, created_at desc);

-- 3.8 house_addresses — адресная книга (наполняется админом)
create table if not exists public.house_addresses (
  id             text primary key,
  street         text not null,
  house_number   text not null default '',
  full_address   text not null,
  lat            numeric(10,7) not null,
  lng            numeric(10,7) not null,
  postal_code    text not null default '366602',
  is_not_house   boolean not null default false,
  category       text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_house_addresses_street on public.house_addresses (street);
create index if not exists idx_house_addresses_category on public.house_addresses (category);

-- 3.9 notifications — уведомления
create table if not exists public.notifications (
  id            text primary key,
  recipient_id  uuid not null references public.user_profiles(id) on delete cascade,
  type          text not null default 'system'
    check (type in (
      'system', 'profile_hidden', 'profile_visible', 'user_blocked', 'user_unblocked',
      'review_received', 'question_commented', 'comment_replied', 'like_received',
      'complaint_result', 'taxi_request', 'taxi_info'
    )),
  title         text not null default 'Уведомление',
  title_ce      text,
  message       text not null default '',
  message_ce    text,
  sender        text not null default 'Даймохк',
  is_read       boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists idx_notifications_recipient on public.notifications (recipient_id, created_at desc);
create index if not exists idx_notifications_unread on public.notifications (recipient_id) where not is_read;

-- 3.10 donations — реестр пожертвований (идемпотентный по operation_id)
create table if not exists public.donations (
  operation_id  text primary key,
  amount        numeric(12,2) not null check (amount > 0),
  currency      text not null default 'RUB',
  sender        text,
  label         text,
  received_at   timestamptz not null,
  raw_payload   jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_donations_received_at on public.donations (received_at);

-- 3.11 project_support — месячный прогресс сборов
create table if not exists public.project_support (
  month_key        text primary key, -- например '2026-08'
  collected_rub    numeric(12,2) not null default 0,
  other_costs_rub  numeric(12,2) not null default 500,
  updated_at       timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- 4. Storage bucket + RLS
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('profile-media', 'profile-media', true)
on conflict (id) do nothing;

alter table public.user_profiles   enable row level security;
alter table public.profiles        enable row level security;
alter table public.certificates    enable row level security;
alter table public.reviews         enable row level security;
alter table public.profile_questions enable row level security;
alter table public.profile_question_comments enable row level security;
alter table public.complaints      enable row level security;
alter table public.house_addresses enable row level security;
alter table public.notifications   enable row level security;
alter table public.donations       enable row level security;
alter table public.project_support enable row level security;


-- ---------------------------------------------------------------------------
-- 5. Политики RLS
-- ---------------------------------------------------------------------------

-- user_profiles: пользователь видит/меняет себя, админ — всё
drop policy if exists "user_profiles self select" on public.user_profiles;
create policy "user_profiles self select"
  on public.user_profiles for select
  using (auth.uid()::text = id::text or is_admin_email());

drop policy if exists "user_profiles self insert" on public.user_profiles;
create policy "user_profiles self insert"
  on public.user_profiles for insert
  with check (auth.uid()::text = id::text);

drop policy if exists "user_profiles self update" on public.user_profiles;
create policy "user_profiles self update"
  on public.user_profiles for update
  using (auth.uid()::text = id::text)
  with check (auth.uid()::text = id::text);

drop policy if exists "user_profiles admin update" on public.user_profiles;
create policy "user_profiles admin update"
  on public.user_profiles for update
  using (is_admin_email())
  with check (is_admin_email());

-- profiles: публичное чтение (включая личные карточки — шаг 20),
-- владелец пишет, админ всё; личную анкету владелец удалить не может
drop policy if exists "profiles public read" on public.profiles;
create policy "profiles public read"
  on public.profiles for select
  using (
    not (is_hidden or is_banned)
    or auth.uid()::text = owner_id::text
    or is_admin_email()
  );

drop policy if exists "profiles owner insert" on public.profiles;
create policy "profiles owner insert"
  on public.profiles for insert
  with check (auth.uid()::text = owner_id::text or owner_id is null);

drop policy if exists "profiles owner update" on public.profiles;
create policy "profiles owner update"
  on public.profiles for update
  using (auth.uid()::text = owner_id::text)
  with check (auth.uid()::text = owner_id::text);

drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles admin update"
  on public.profiles for update
  using (is_admin_email())
  with check (is_admin_email());

drop policy if exists "profiles owner delete" on public.profiles;
create policy "profiles owner delete"
  on public.profiles for delete
  using (
    (auth.uid()::text = owner_id::text and not is_personal)
    or is_admin_email()
  );

-- certificates
drop policy if exists "certificates public read" on public.certificates;
create policy "certificates public read"
  on public.certificates for select
  using (true);

drop policy if exists "certificates owner write" on public.certificates;
create policy "certificates owner write"
  on public.certificates for all
  using (
    exists (select 1 from public.profiles p where p.id = certificates.profile_id and p.owner_id::text = auth.uid()::text)
    or is_admin_email()
  )
  with check (
    exists (select 1 from public.profiles p where p.id = certificates.profile_id and p.owner_id::text = auth.uid()::text)
    or is_admin_email()
  );

-- reviews: публичное чтение; запись через /api/reviews (service role);
-- удаление — автор / админ / владелец анкеты
drop policy if exists "reviews public read" on public.reviews;
create policy "reviews public read"
  on public.reviews for select
  using (true);

drop policy if exists "reviews author write" on public.reviews;
create policy "reviews author write"
  on public.reviews for insert
  with check (auth.uid()::text = author_id::text);

drop policy if exists "reviews author delete" on public.reviews;
create policy "reviews author delete"
  on public.reviews for delete
  using (
    auth.uid()::text = author_id::text
    or is_admin_email()
    or exists (
      select 1 from public.profiles p
      where p.id = reviews.profile_id
        and p.owner_id::text = auth.uid()::text
    )
  );

-- profile_questions: публичное чтение; запись через /api/profile-questions;
-- удаление — автор / админ / владелец анкеты
drop policy if exists "profile_questions public read" on public.profile_questions;
create policy "profile_questions public read"
  on public.profile_questions for select
  using (true);

drop policy if exists "profile_questions author delete" on public.profile_questions;
create policy "profile_questions author delete"
  on public.profile_questions for delete
  using (
    auth.uid()::text = author_id::text
    or is_admin_email()
    or exists (
      select 1 from public.profiles p
      where p.id = profile_questions.profile_id
        and p.owner_id::text = auth.uid()::text
    )
  );

-- profile_question_comments: публичное чтение; запись через
-- /api/question-comments; удаление — автор / админ / владелец анкеты
drop policy if exists "profile_question_comments public read" on public.profile_question_comments;
create policy "profile_question_comments public read"
  on public.profile_question_comments for select
  using (true);

drop policy if exists "profile_question_comments author delete" on public.profile_question_comments;
create policy "profile_question_comments author delete"
  on public.profile_question_comments for delete
  using (
    auth.uid()::text = author_id::text
    or is_admin_email()
    or exists (
      select 1 from public.profile_questions q
      join public.profiles p on p.id = q.profile_id
      where q.id = profile_question_comments.question_id
        and p.owner_id::text = auth.uid()::text
    )
  );

-- complaints
drop policy if exists "complaints author read" on public.complaints;
create policy "complaints author read"
  on public.complaints for select
  using (auth.uid()::text = author_id::text or is_admin_email());

drop policy if exists "complaints author insert" on public.complaints;
create policy "complaints author insert"
  on public.complaints for insert
  with check (auth.uid()::text = author_id::text);

drop policy if exists "complaints admin update" on public.complaints;
create policy "complaints admin update"
  on public.complaints for update
  using (is_admin_email())
  with check (is_admin_email());

-- house_addresses
drop policy if exists "house_addresses public read" on public.house_addresses;
create policy "house_addresses public read"
  on public.house_addresses for select
  using (true);

drop policy if exists "house_addresses admin write" on public.house_addresses;
create policy "house_addresses admin write"
  on public.house_addresses for all
  using (is_admin_email())
  with check (is_admin_email());

-- notifications
drop policy if exists "notifications self read" on public.notifications;
create policy "notifications self read"
  on public.notifications for select
  using (auth.uid()::text = recipient_id::text);

drop policy if exists "notifications self update" on public.notifications;
create policy "notifications self update"
  on public.notifications for update
  using (auth.uid()::text = recipient_id::text)
  with check (auth.uid()::text = recipient_id::text);

drop policy if exists "notifications admin insert" on public.notifications;
create policy "notifications admin insert"
  on public.notifications for insert
  with check (is_admin_email() or auth.uid()::text = recipient_id::text);

-- Пользователь может удалять свои уведомления (корзина в центре уведомлений).
drop policy if exists "notifications self delete" on public.notifications;
create policy "notifications self delete"
  on public.notifications for delete
  using (auth.uid()::text = recipient_id::text);

-- donations / project_support: публичное чтение, запись только service role
drop policy if exists "donations public read" on public.donations;
create policy "donations public read"
  on public.donations for select
  using (true);

drop policy if exists "project_support public read" on public.project_support;
create policy "project_support public read"
  on public.project_support for select
  using (true);

-- storage: чтение всем, запись владельцу в avatars/documents
drop policy if exists "profile-media read" on storage.objects;
create policy "profile-media read"
  on storage.objects
  for select
  using (bucket_id = 'profile-media');

drop policy if exists "profile-media owner write" on storage.objects;
create policy "profile-media owner write"
  on storage.objects
  for insert
  with check (
    bucket_id = 'profile-media'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] in ('avatars', 'documents')
    and (storage.foldername(name))[2] like (auth.uid()::text || '-%')
  );

drop policy if exists "profile-media owner delete" on storage.objects;
create policy "profile-media owner delete"
  on storage.objects
  for delete
  using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[2] like (auth.uid()::text || '-%')
  );


-- ---------------------------------------------------------------------------
-- 6. Вьюхи
-- ---------------------------------------------------------------------------

-- Публичный справочник имён: только id / full_name / avatar_url.
-- Намеренно НЕ security_invoker — иначе user_profiles RLS скрыла бы имена
-- авторов от всех, кроме владельца (баг «Удалённый пользователь»).
create or replace view public.v_user_display
  with (security_invoker = false) as
select
  u.id         as id,
  u.full_name  as full_name,
  u.avatar_url as avatar_url
from public.user_profiles u;

-- Отзывы с живым именем/аватаром автора
create or replace view public.v_reviews
  with (security_invoker = true) as
select
  r.id,
  r.profile_id,
  r.author_id,
  coalesce(d.full_name, 'Удалённый пользователь') as author,
  d.avatar_url                                       as author_avatar_url,
  r.rating,
  r.text,
  r.created_at
from public.reviews r
left join public.v_user_display d on d.id = r.author_id;

-- Вопросы со счётчиком комментариев
create or replace view public.v_profile_questions
  with (security_invoker = true) as
select
  q.id,
  q.profile_id,
  q.author_id,
  coalesce(d.full_name, 'Удалённый пользователь') as author_name,
  d.avatar_url                                       as author_avatar_url,
  q.question,
  q.created_at,
  (select count(*) from public.profile_question_comments c
    where c.question_id = q.id)                      as comment_count
from public.profile_questions q
left join public.v_user_display d on d.id = q.author_id;

-- Комментарии с реплаями (reply_to) и живыми именами
create or replace view public.v_question_comments
  with (security_invoker = true) as
select
  c.id,
  c.question_id,
  c.author_id,
  coalesce(d.full_name, 'Удалённый пользователь') as author_name,
  d.avatar_url                                       as author_avatar_url,
  c.comment,
  c.created_at,
  c.reply_to_id,
  rp.id                                              as reply_to_author_id,
  coalesce(rp.full_name, 'Удалённый пользователь')    as reply_to_author_name
from public.profile_question_comments c
left join public.v_user_display d on d.id = c.author_id
left join public.profile_question_comments rc on rc.id = c.reply_to_id
left join public.v_user_display rp on rp.id = rc.author_id;

-- Пользователи со счётчиком анкет (для админ-панели)
create or replace view public.v_users_with_profile_count
  with (security_invoker = true) as
select
  u.id,
  u.email,
  u.full_name,
  u.avatar_url,
  u.is_admin,
  u.is_blocked,
  u.created_at,
  u.settlement,
  coalesce(c.profiles_total, 0) as profile_count,
  coalesce(c.hidden_total, 0)   as hidden_count
from public.user_profiles u
left join (
  select
    owner_id,
    count(*)                          as profiles_total,
    count(*) filter (where is_hidden or is_banned) as hidden_total
  from public.profiles
  where owner_id is not null
  group by owner_id
) c on c.owner_id = u.id;


-- ---------------------------------------------------------------------------
-- 7. Триггеры
-- ---------------------------------------------------------------------------

-- updated_at
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_profiles_updated on public.user_profiles;
create trigger trg_user_profiles_updated
  before update on public.user_profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_project_support_updated on public.project_support;
create trigger trg_project_support_updated
  before update on public.project_support
  for each row execute function public.touch_updated_at();

-- Рейтинг анкеты пересчитывается при изменении отзывов
create or replace function public.recompute_profile_rating(target_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set rating = coalesce((select round(avg(rating)::numeric, 1)
                            from public.reviews where profile_id = target_id), 0),
         review_count = (select count(*) from public.reviews where profile_id = target_id),
         updated_at = now()
   where id = target_id;
$$;

revoke all on function public.recompute_profile_rating(text) from public;
grant execute on function public.recompute_profile_rating(text) to authenticated, service_role;

create or replace function public.trg_recompute_rating()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'DELETE') then
    perform public.recompute_profile_rating(old.profile_id);
    return old;
  else
    perform public.recompute_profile_rating(new.profile_id);
    if (tg_op = 'UPDATE' and old.profile_id is distinct from new.profile_id) then
      perform public.recompute_profile_rating(old.profile_id);
    end if;
    return new;
  end if;
end;
$$;

drop trigger if exists trg_reviews_after_insert on public.reviews;
create trigger trg_reviews_after_insert
  after insert on public.reviews
  for each row execute function public.trg_recompute_rating();

drop trigger if exists trg_reviews_after_update on public.reviews;
create trigger trg_reviews_after_update
  after update on public.reviews
  for each row execute function public.trg_recompute_rating();

drop trigger if exists trg_reviews_after_delete on public.reviews;
create trigger trg_reviews_after_delete
  after delete on public.reviews
  for each row execute function public.trg_recompute_rating();

-- Счётчик анкет на пользователя ведётся клиентом; функция-заглушка
-- сохраняет совместимость с вызовами из кода.
create or replace function public.recompute_user_profile_count(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise notice 'recompute_user_profile_count called for % — counter is maintained client-side, skipping', target_user;
end;
$$;

revoke all on function public.recompute_user_profile_count(uuid) from public;
grant execute on function public.recompute_user_profile_count(uuid) to authenticated, service_role;

create or replace function public.trg_recompute_user_count()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'DELETE') then
    if (old.owner_id is not null) then
      perform public.recompute_user_profile_count(old.owner_id);
    end if;
    return old;
  else
    if (new.owner_id is not null) then
      perform public.recompute_user_profile_count(new.owner_id);
    end if;
    if (tg_op = 'UPDATE' and old.owner_id is distinct from new.owner_id and old.owner_id is not null) then
      perform public.recompute_user_profile_count(old.owner_id);
    end if;
    return new;
  end if;
end;
$$;

drop trigger if exists trg_profiles_after_insert on public.profiles;
create trigger trg_profiles_after_insert
  after insert on public.profiles
  for each row execute function public.trg_recompute_user_count();

drop trigger if exists trg_profiles_after_update on public.profiles;
create trigger trg_profiles_after_update
  after update on public.profiles
  for each row execute function public.trg_recompute_user_count();

drop trigger if exists trg_profiles_after_delete on public.profiles;
create trigger trg_profiles_after_delete
  after delete on public.profiles
  for each row execute function public.trg_recompute_user_count();


-- ---------------------------------------------------------------------------
-- 8. RPC / onboarding
-- ---------------------------------------------------------------------------

-- Личная анкета (id = personal-<auth.uid()>), идемпотентно
create or replace function public.ensure_personal_profile(
  p_full_name text,
  p_avatar_url text default '',
  p_phone text default ''
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.profiles;
  v_personal_id text;
  v_row public.profiles;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_personal_id := 'personal-' || v_user_id::text;

  select * into v_existing
    from public.profiles
   where id = v_personal_id;
  if found then
    return v_existing;
  end if;

  insert into public.profiles (
    id, owner_id, full_name, avatar_url, is_specialist, is_personal,
    bio, workplace_address, workplace_coords, phone, hide_phone,
    same_as_phone_whatsapp, settlement
  ) values (
    v_personal_id,
    v_user_id,
    coalesce(nullif(trim(p_full_name), ''), 'Житель Даймохк'),
    coalesce(p_avatar_url, ''),
    false,
    true,
    'Житель Даймохк. Личная анкета.',
    'Даймохк',
    '{"lat":43.288024,"lng":45.298989}'::jsonb,
    coalesce(p_phone, ''),
    true,
    false,
    'Даймохк'
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.ensure_personal_profile(text, text, text) from public;
grant execute on function public.ensure_personal_profile(text, text, text) to authenticated;

-- Список анкет владельца (для админ-панели)
create or replace function public.list_profiles_for_owner(p_owner_id uuid)
returns setof public.profiles
language sql
security definer
set search_path = public
stable
as $$
  select * from public.profiles where owner_id = p_owner_id
  order by is_personal desc, created_at desc;
$$;

revoke all on function public.list_profiles_for_owner(uuid) from public;
grant execute on function public.list_profiles_for_owner(uuid) to authenticated;

-- Onboarding: авто-создание user_profiles + личной анкеты при регистрации
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text;
  v_avatar_url text;
  v_phone text;
  v_personal_id text;
  v_is_admin boolean;
begin
  v_full_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    ''
  );
  v_avatar_url := coalesce(new.raw_user_meta_data->>'avatar_url', '');
  v_phone := coalesce(new.phone, '');
  v_personal_id := 'personal-' || new.id::text;
  v_is_admin := lower(coalesce(new.email, '')) in (
    'mr.hamzik1026@gmail.com',
    'nabis95@gmail.com'
  );

  insert into public.user_profiles (id, email, full_name, avatar_url, phone, is_admin)
  values (new.id, new.email, v_full_name, v_avatar_url, v_phone, v_is_admin)
  on conflict (id) do nothing;

  insert into public.profiles (
    id, owner_id, full_name, avatar_url, is_specialist, is_personal,
    bio, workplace_address, workplace_coords, phone, hide_phone,
    same_as_phone_whatsapp, settlement
  ) values (
    v_personal_id,
    new.id,
    v_full_name,
    v_avatar_url,
    false,
    true,
    'Житель Даймохк. Личная анкета.',
    'Даймохк',
    '{"lat":43.288024,"lng":45.298989}'::jsonb,
    v_phone,
    true,
    false,
    'Даймохк'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Бэкфилл для уже существующих auth.users (идемпотентно)
insert into public.user_profiles (id, email, full_name, avatar_url, phone, is_admin)
select
  au.id,
  au.email,
  coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', ''),
  coalesce(au.raw_user_meta_data->>'avatar_url', ''),
  coalesce(au.phone, ''),
  lower(coalesce(au.email, '')) in ('mr.hamzik1026@gmail.com', 'nabis95@gmail.com')
from auth.users au
on conflict (id) do nothing;

insert into public.profiles (
  id, owner_id, full_name, avatar_url, is_specialist, is_personal,
  bio, workplace_address, workplace_coords, phone, hide_phone,
  same_as_phone_whatsapp, settlement
)
select
  'personal-' || au.id::text,
  au.id,
  coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', 'Житель Даймохк'),
  coalesce(au.raw_user_meta_data->>'avatar_url', ''),
  false,
  true,
  'Житель Даймохк. Личная анкета.',
  'Даймохк',
  '{"lat":43.288024,"lng":45.298989}'::jsonb,
  coalesce(au.phone, ''),
  true,
  false,
  'Даймохк'
from auth.users au
on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- 9. GRANT-ы (PostgreSQL 15+: PUBLIC больше не имеет CREATE на public)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to anon, authenticated, service_role;
