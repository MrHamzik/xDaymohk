-- =============================================================================
-- Step 10 — Standardize all id columns to uuid
-- =============================================================================
-- This project's tables were originally created with text id columns
-- (because auth.uid() used to return text on this Supabase instance).
-- We're migrating everything to uuid to match the standard Supabase
-- schema and remove the need for ::text casts in RLS.
--
-- This step is fully idempotent: every ALTER COLUMN is wrapped in a
-- DO block that checks information_schema.columns first and skips the
-- conversion if the column is already uuid. This means it is safe to
-- re-run on a partially-migrated project (where some columns are
-- already uuid because of an earlier interrupted run).
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
-- Order matters:
--   1. Drop every RLS policy that references any of the columns we are
--      about to convert. Postgres refuses to ALTER a column that is
--      referenced by a policy (ERROR 0A000), so we must drop them first.
--      step 05 will recreate them with the new (uuid) types.
--   2. Drop the convenience views that SELECT from those columns for the
--      same reason (Postgres raises "cannot alter type of a column used
--      by a view or rule" otherwise). step 06 will recreate them after
--      the type change.
--   3. Convert user_profiles.id first because the others have FK
--      constraints pointing at it. We drop and re-add the FK
--      constraints as NOT VALID to avoid full-table scans during the
--      conversion; we VALIDATE them all at the end.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0a) Drop every RLS policy on the 5 tables we're about to convert.
-- ---------------------------------------------------------------------------
do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'user_profiles',
        'profiles',
        'reviews',
        'complaints',
        'notifications'
      )
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 0b) Drop the convenience views defined in step 06.
-- ---------------------------------------------------------------------------
drop view if exists public.v_public_profiles;
drop view if exists public.v_all_profiles;
drop view if exists public.v_user_directory;
drop view if exists public.v_current_donations;

-- ---------------------------------------------------------------------------
-- 1) user_profiles.id → uuid  (skip if already uuid)
-- ---------------------------------------------------------------------------
do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'user_profiles' and column_name = 'id')
      = 'text'
  then
    alter table public.user_profiles
      alter column id type uuid using id::uuid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) profiles.owner_id → uuid  (FK → user_profiles.id)
-- ---------------------------------------------------------------------------
do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = 'owner_id')
      = 'text'
  then
    alter table public.profiles drop constraint if exists profiles_owner_id_fkey;
    alter table public.profiles
      alter column owner_id type uuid using owner_id::uuid;
    alter table public.profiles
      add constraint profiles_owner_id_fkey
      foreign key (owner_id) references public.user_profiles(id) on delete cascade
      not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) reviews.author_id → uuid  (FK → user_profiles.id)
-- ---------------------------------------------------------------------------
do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'reviews' and column_name = 'author_id')
      = 'text'
  then
    alter table public.reviews drop constraint if exists reviews_author_id_fkey;
    alter table public.reviews
      alter column author_id type uuid using author_id::uuid;
    alter table public.reviews
      add constraint reviews_author_id_fkey
      foreign key (author_id) references public.user_profiles(id) on delete set null
      not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) complaints.author_id + target_user_id → uuid
-- ---------------------------------------------------------------------------
do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'complaints' and column_name = 'author_id')
      = 'text'
  then
    alter table public.complaints drop constraint if exists complaints_author_id_fkey;
    alter table public.complaints drop constraint if exists complaints_target_user_id_fkey;
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
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5) notifications.recipient_id → uuid
-- ---------------------------------------------------------------------------
do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'notifications' and column_name = 'recipient_id')
      = 'text'
  then
    alter table public.notifications drop constraint if exists notifications_recipient_id_fkey;
    alter table public.notifications
      alter column recipient_id type uuid using recipient_id::uuid;
    alter table public.notifications
      add constraint notifications_recipient_id_fkey
      foreign key (recipient_id) references public.user_profiles(id) on delete cascade
      not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6) Validate the FKs we just re-added. VALIDATE CONSTRAINT is a no-op
--    if the constraint is already validated, so this is safe to run on
--    a project that already has these FKs from a prior run.
-- ---------------------------------------------------------------------------
alter table public.profiles      validate constraint profiles_owner_id_fkey;
alter table public.reviews       validate constraint reviews_author_id_fkey;
alter table public.complaints    validate constraint complaints_author_id_fkey;
alter table public.complaints    validate constraint complaints_target_user_id_fkey;
alter table public.notifications validate constraint notifications_recipient_id_fkey;

-- ---------------------------------------------------------------------------
-- 7) Recreate the convenience views (same definitions as step 06, but
--    with the ::text casts removed now that the join keys are uuid).
-- ---------------------------------------------------------------------------
create or replace view public.v_public_profiles
  with (security_invoker = true) as
select
  p.*,
  u.email        as owner_email,
  u.is_blocked   as owner_is_blocked
from public.profiles p
left join public.user_profiles u on u.id = p.owner_id
where not (p.is_hidden or p.is_banned);

create or replace view public.v_all_profiles
  with (security_invoker = true) as
select
  p.*,
  u.email        as owner_email,
  u.is_blocked   as owner_is_blocked
from public.profiles p
left join public.user_profiles u on u.id = p.owner_id;

create or replace view public.v_user_directory
  with (security_invoker = true) as
select
  u.id,
  u.email,
  u.full_name,
  u.avatar_url,
  u.is_admin,
  u.is_blocked,
  u.created_at,
  coalesce(c.profiles_total, 0) as profile_count,
  coalesce(c.hidden_total, 0)   as hidden_count
from public.user_profiles u
left join (
  select
    owner_id,
    count(*)                          as profiles_total,
    count(*) filter (where is_hidden) as hidden_total
  from public.profiles
  group by owner_id
) c on c.owner_id = u.id;

create or replace view public.v_current_donations
  with (security_invoker = true) as
select
  coalesce(sum(amount), 0)::numeric(12,2) as total_rub,
  count(*)                                as donations_count
from public.donations
where received_at >= date_trunc('month', now() at time zone 'Europe/Moscow')
  and received_at <  date_trunc('month', now() at time zone 'Europe/Moscow') + interval '1 month';
