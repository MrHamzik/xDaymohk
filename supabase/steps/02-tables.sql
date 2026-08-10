-- =============================================================================
-- Step 02 / 07 — Core tables (user_profiles, profiles, certificates, reviews, complaints)
-- =============================================================================
-- Paste into SQL Editor and Run.
-- After this step you should have 5 tables in the Table Editor.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- user_profiles — per-user account metadata
-- ---------------------------------------------------------------------------
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
  settlement      text default 'Самашки',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_user_profiles_email on public.user_profiles (lower(email));

-- updated_at trigger
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

-- ---------------------------------------------------------------------------
-- profiles — public catalogues
-- ---------------------------------------------------------------------------
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
  settlement               text default 'Самашки',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_profiles_owner_id        on public.profiles (owner_id);
create index if not exists idx_profiles_is_hidden       on public.profiles (is_hidden) where not is_hidden;
create index if not exists idx_profiles_specialist      on public.profiles (is_specialist);
create index if not exists idx_profiles_verif_status    on public.profiles (verification_status);
create index if not exists idx_profiles_profession_cat  on public.profiles (profession_category);
create index if not exists idx_profiles_created_at      on public.profiles (created_at desc);

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- certificates — uploaded documents per profile
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id                  text primary key,
  profile_id          text not null references public.profiles(id) on delete cascade,
  author              text not null default 'Житель Самашек',
  author_id           uuid references public.user_profiles(id) on delete set null,
  author_avatar_url   text,
  rating              numeric(2,1) not null check (rating between 0 and 5),
  text                text not null default '',
  created_at          date not null default current_date
);

create index if not exists idx_reviews_profile_id on public.reviews (profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- complaints
-- ---------------------------------------------------------------------------
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
create index if not exists idx_complaints_profile on public.complaints (profile_id);
