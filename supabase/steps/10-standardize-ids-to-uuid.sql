-- =============================================================================
-- Step 10 — Standardize all id columns to uuid
-- =============================================================================
-- This project's tables were originally created with text id columns
-- (because auth.uid() used to return text on this Supabase instance).
-- We're migrating everything to uuid to match the standard Supabase
-- schema and remove the need for ::text casts in RLS.
--
-- Pre-conditions (verified before this step is shipped):
--   * Every row in public.user_profiles.id is a valid UUID string
--   * The same is true for profiles.owner_id, complaints.author_id,
--     complaints.target_user_id, notifications.recipient_id and
--     reviews.author_id (confirmed via information_schema.columns +
--     sample SELECTs)
--   * auth.users.id is already uuid (we never touch that table)
--
-- If any of the above is false, the ALTER COLUMN will fail with
-- "invalid input syntax for type uuid" and no data will be lost
-- (Postgres wraps the statement in an implicit transaction).
--
-- Order matters: user_profiles must convert first because the others
-- have FK constraints pointing at it. We drop and re-add the FK
-- constraints as plain (no validation) to avoid full-table scans
-- during the conversion.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) user_profiles.id → uuid
-- ---------------------------------------------------------------------------
alter table public.user_profiles
  alter column id type uuid using id::uuid;

-- ---------------------------------------------------------------------------
-- 2) profiles.owner_id → uuid  (FK → user_profiles.id)
-- ---------------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_owner_id_fkey;
alter table public.profiles
  alter column owner_id type uuid using owner_id::uuid;
alter table public.profiles
  add constraint profiles_owner_id_fkey
  foreign key (owner_id) references public.user_profiles(id) on delete cascade
  not valid;

-- ---------------------------------------------------------------------------
-- 3) reviews.author_id → uuid  (FK → user_profiles.id)
-- ---------------------------------------------------------------------------
alter table public.reviews
  drop constraint if exists reviews_author_id_fkey;
alter table public.reviews
  alter column author_id type uuid using author_id::uuid;
alter table public.reviews
  add constraint reviews_author_id_fkey
  foreign key (author_id) references public.user_profiles(id) on delete set null
  not valid;

-- ---------------------------------------------------------------------------
-- 4) complaints.author_id + target_user_id → uuid  (FK → user_profiles.id)
-- ---------------------------------------------------------------------------
alter table public.complaints
  drop constraint if exists complaints_author_id_fkey;
alter table public.complaints
  drop constraint if exists complaints_target_user_id_fkey;
alter table public.complaints
  alter column author_id     type uuid using author_id::uuid;
alter table public.complaints
  alter column target_user_id type uuid using target_user_id::uuid;
alter table public.complaints
  add constraint complaints_author_id_fkey
  foreign key (author_id) references public.user_profiles(id) on delete cascade
  not valid;
alter table public.complaints
  add constraint complaints_target_user_id_fkey
  foreign key (target_user_id) references public.user_profiles(id) on delete set null
  not valid;

-- ---------------------------------------------------------------------------
-- 5) notifications.recipient_id → uuid  (FK → user_profiles.id)
-- ---------------------------------------------------------------------------
alter table public.notifications
  drop constraint if exists notifications_recipient_id_fkey;
alter table public.notifications
  alter column recipient_id type uuid using recipient_id::uuid;
alter table public.notifications
  add constraint notifications_recipient_id_fkey
  foreign key (recipient_id) references public.user_profiles(id) on delete cascade
  not valid;

-- ---------------------------------------------------------------------------
-- 6) Validate the FKs we just re-added (this is the only step that does
--    a full-table scan; run it once at the end so the conversion is fast).
-- ---------------------------------------------------------------------------
alter table public.profiles      validate constraint profiles_owner_id_fkey;
alter table public.reviews       validate constraint reviews_author_id_fkey;
alter table public.complaints    validate constraint complaints_author_id_fkey;
alter table public.complaints    validate constraint complaints_target_user_id_fkey;
alter table public.notifications validate constraint notifications_recipient_id_fkey;
