-- =============================================================================
-- Step 10 — Standardize all id columns to uuid
-- =============================================================================
-- This project's tables were originally created with text id columns
-- (because auth.uid() used to return text on this Supabase instance).
-- We're migrating everything to uuid to match the standard Supabase
-- schema and remove the need for ::text casts in RLS.
--
-- This step is fully idempotent and safe to re-run on any state:
--   * If a column is already uuid, ALTER COLUMN … TYPE uuid USING col::uuid
--     is a no-op (Postgres skips the rewrite when types match).
--   * If a FK already exists with the right name, drop constraint
--     if exists is a no-op; add constraint below either succeeds or
--     is a no-op if the same constraint already exists.
--   * If a column has non-uuid text in it, the USING col::uuid cast
--     will fail loudly so we can fix the data manually.
--
-- Pre-conditions (verified before this step is shipped):
--   * Every row in public.user_profiles.id is a valid UUID string
--   * The same is true for profiles.owner_id, complaints.author_id,
--     complaints.target_user_id, notifications.recipient_id and
--     reviews.author_id (confirmed via information_schema.columns +
--     sample SELECTs)
--   * auth.users.id is already uuid (we never touch that table)
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
--   3. Drop every FK that points at user_profiles.id or at any of the
--      columns we are about to convert, so the ALTER COLUMN can run
--      without the type-mismatch error described in the
--      "reviews_author_id_fkey cannot be implemented" issue.
--   4. ALTER COLUMN with USING col::uuid (idempotent: same-type ALTER
--      is a no-op).
--   5. Recreate the FKs as NOT VALID (so the conversion is fast) and
--      VALIDATE them all at the end.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0a) Drop every RLS policy in the public schema. We don't try to
--     limit this to specific tables because policies can reference
--     columns from other tables via sub-queries (e.g.
--     'certificates owner write' depends on profiles.owner_id through
--     'exists (select … p.owner_id = auth.uid())'), and Postgres
--     blocks ALTER on any column that appears in any policy on any
--     table in the schema. step 05 will recreate them at the end of
--     the migration.
-- ---------------------------------------------------------------------------
do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
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
-- 0c) Drop every FK that points at user_profiles.id or at any of the
--     columns we are about to convert. We don't try to be clever about
--     which FKs exist; we drop the 5 known names and recreate them at
--     the end. drop constraint if exists makes each line a no-op when
--     the FK was already dropped in a previous run.
-- ---------------------------------------------------------------------------
alter table public.profiles      drop constraint if exists profiles_owner_id_fkey;
alter table public.reviews       drop constraint if exists reviews_author_id_fkey;
alter table public.complaints    drop constraint if exists complaints_author_id_fkey;
alter table public.complaints    drop constraint if exists complaints_target_user_id_fkey;
alter table public.notifications drop constraint if exists notifications_recipient_id_fkey;

-- ---------------------------------------------------------------------------
-- 1) user_profiles.id → uuid
--     ALTER COLUMN … TYPE uuid USING id::uuid is a no-op when the column
--     is already uuid, so this is safe on a partially-migrated project.
-- ---------------------------------------------------------------------------
alter table public.user_profiles
  alter column id type uuid using id::uuid;

-- ---------------------------------------------------------------------------
-- 2) profiles.owner_id → uuid
-- ---------------------------------------------------------------------------
alter table public.profiles
  alter column owner_id type uuid using owner_id::uuid;
alter table public.profiles
  add constraint profiles_owner_id_fkey
  foreign key (owner_id) references public.user_profiles(id) on delete cascade
  not valid;

-- ---------------------------------------------------------------------------
-- 3) reviews.author_id → uuid
-- ---------------------------------------------------------------------------
alter table public.reviews
  alter column author_id type uuid using author_id::uuid;
alter table public.reviews
  add constraint reviews_author_id_fkey
  foreign key (author_id) references public.user_profiles(id) on delete set null
  not valid;

-- ---------------------------------------------------------------------------
-- 4) complaints.author_id + target_user_id → uuid
-- ---------------------------------------------------------------------------
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
-- 5) notifications.recipient_id → uuid
-- ---------------------------------------------------------------------------
alter table public.notifications
  alter column recipient_id type uuid using recipient_id::uuid;
alter table public.notifications
  add constraint notifications_recipient_id_fkey
  foreign key (recipient_id) references public.user_profiles(id) on delete cascade
  not valid;

-- ---------------------------------------------------------------------------
-- 6) Validate the FKs we just re-added. VALIDATE CONSTRAINT is a no-op
--    if the constraint is already validated, so this is safe on a
--    project where these FKs already existed.
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
