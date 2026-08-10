-- =============================================================================
-- Step 06 / 07 — Realtime publication + convenience views
-- =============================================================================
-- Paste into SQL Editor and Run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Realtime: attach tables to supabase_realtime publication
-- ---------------------------------------------------------------------------
-- Without this, the postgres_changes channels in the client
-- (ProfilesProvider, NotificationsProvider) are silent.
--
-- DO block makes each ALTER idempotent: if the table is already a
-- member, the EXCEPTION block swallows the duplicate error so re-running
-- this file (or running the bundled all-in-one.sql twice) is safe.
do $$
begin
  begin alter publication supabase_realtime add table public.profiles; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.user_profiles; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.complaints; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.house_addresses; exception when duplicate_object then null; end;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Convenience views
-- ---------------------------------------------------------------------------

-- Public catalog view: only visible profiles (not hidden / not banned),
-- augmented with the owner's email and block status for admin filtering.
--
-- Cast BOTH sides to text for the join. On this Supabase project
-- user_profiles.id is text while profiles.owner_id is uuid. The text
-- side stays text; the uuid side is text-cast so the comparison
-- succeeds regardless of which side is which type.
create or replace view public.v_public_profiles as
select
  p.*,
  u.email        as owner_email,
  u.is_blocked   as owner_is_blocked
from public.profiles p
left join public.user_profiles u on u.id::text = p.owner_id::text
where not (p.is_hidden or p.is_banned);

-- Admin dashboard view: same as above but includes hidden/banned.
create or replace view public.v_all_profiles as
select
  p.*,
  u.email        as owner_email,
  u.is_blocked   as owner_is_blocked
from public.profiles p
left join public.user_profiles u on u.id::text = p.owner_id::text;

-- Public users list for /admin → users tab.
create or replace view public.v_user_directory as
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
    count(*)                       as profiles_total,
    count(*) filter (where is_hidden) as hidden_total
  from public.profiles
  group by owner_id
) c on c.owner_id::text = u.id::text;

-- Aggregate donation progress for the current month (Europe/Moscow).
create or replace view public.v_current_donations as
select
  coalesce(sum(amount), 0)::numeric(12,2) as total_rub,
  count(*)                                as donations_count
from public.donations
where received_at >= date_trunc('month', now() at time zone 'Europe/Moscow')
  and received_at <  date_trunc('month', now() at time zone 'Europe/Moscow') + interval '1 month';

-- ---------------------------------------------------------------------------
-- 3. Extra indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_profiles_photos_gin
  on public.profiles using gin (photos jsonb_path_ops);

create index if not exists idx_profiles_public_specialist
  on public.profiles (created_at desc)
  where not is_hidden and not is_banned and is_specialist;
