-- =============================================================================
-- 20260101000000_init.sql
-- Initial schema for Даймохк (Samashki community platform).
--
-- Tables created in this migration:
--   * user_profiles        — one row per authenticated user
--   * profiles             — public questionnaires (anonymised personal +
--                            specialist entries with work schedule)
--   * certificates         — uploaded docs/scans attached to a profile
--   * reviews              — public reviews on a profile
--   * complaints           — user reports about a profile / owner
--   * house_addresses      — admin-managed Samashki address book
--   * notifications        — per-user system notifications
--   * donations            — CloudTips webhook ledger
--   * project_support      — aggregated monthly donation progress
--   * profile_media bucket — Supabase Storage bucket for avatars + docs
--
-- All tables enable RLS. Policies are written assuming:
--   * Authentication via Supabase Auth (auth.uid() is the user's id).
--   * Administrators are looked up by email in `lib/admin.ts` (client-side)
--     AND matched by a SECURITY DEFINER function `is_admin_email()` (DB-side)
--     so RLS can authorise admin writes without leaking the allowlist.
--   * Service-role key bypasses RLS (used in webhook / account-delete routes).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. Helper: admin lookup by email
-- ---------------------------------------------------------------------------
-- Two admin emails are hard-coded to match lib/admin.ts on the client.
-- Update both in lockstep when the allowlist changes.
create or replace function public.is_admin_email()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(
    (select email from auth.users where id = auth.uid()::uuid),
    ''
  )) in ('mr.hamzik1026@gmail.com', 'nabis95@gmail.com');
$$;

revoke all on function public.is_admin_email() from public;
grant execute on function public.is_admin_email() to authenticated, anon;

-- Convenience: cast auth.uid() to uuid explicitly (some Supabase setups
-- declare auth.uid() as text; the wrapper guarantees uuid for RLS policies).
create or replace function public.uid() returns uuid
language sql
stable
as $$
  select auth.uid()::uuid
$$;

grant execute on function public.uid() to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2. user_profiles — per-user account metadata
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
-- 3. profiles — public catalogues (specialist + personal entries)
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
-- 4. certificates — uploaded documents per profile
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
-- 5. reviews
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
-- 6. complaints
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

-- ---------------------------------------------------------------------------
-- 7. house_addresses — admin-managed Samashki address book
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 8. notifications
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id            text primary key,
  recipient_id  uuid not null references public.user_profiles(id) on delete cascade,
  type          text not null default 'system'
    check (type in ('system', 'profile_hidden', 'profile_visible', 'user_blocked', 'user_unblocked')),
  title         text not null default 'Уведомление',
  message       text not null default '',
  is_read       boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists idx_notifications_recipient on public.notifications (recipient_id, created_at desc);
create index if not exists idx_notifications_unread on public.notifications (recipient_id) where not is_read;

-- ---------------------------------------------------------------------------
-- 9. donations — CloudTips ledger (idempotent by operation_id)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 10. project_support — aggregated monthly donation progress
-- ---------------------------------------------------------------------------
create table if not exists public.project_support (
  month_key        text primary key, -- e.g. '2026-08'
  collected_rub    numeric(12,2) not null default 0,
  other_costs_rub  numeric(12,2) not null default 500,
  updated_at       timestamptz not null default now()
);

drop trigger if exists trg_project_support_updated on public.project_support;
create trigger trg_project_support_updated
  before update on public.project_support
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 11. Storage: profile-media bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('profile-media', 'profile-media', true)
on conflict (id) do nothing;

-- Storage RLS: anyone can read public bucket; only the owner can write.
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
-- 12. RLS — enable on all tables
-- ---------------------------------------------------------------------------
alter table public.user_profiles   enable row level security;
alter table public.profiles         enable row level security;
alter table public.certificates     enable row level security;
alter table public.reviews          enable row level security;
alter table public.complaints       enable row level security;
alter table public.house_addresses  enable row level security;
alter table public.notifications    enable row level security;
alter table public.donations        enable row level security;
alter table public.project_support  enable row level security;
