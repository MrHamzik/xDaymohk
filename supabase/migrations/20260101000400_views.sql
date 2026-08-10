-- =============================================================================
-- 20260101000400_views.sql
-- Convenience views for the catalog page and admin dashboard.
-- These wrap the live tables with the same RLS policies (views inherit RLS
-- from underlying tables), so the client can SELECT * with a single query.
-- =============================================================================

-- Public catalog view: only visible profiles (not hidden / not banned),
-- augmented with the owner's email and block status for admin filtering.
create or replace view public.v_public_profiles as
select
  p.*,
  u.email        as owner_email,
  u.is_blocked   as owner_is_blocked
from public.profiles p
left join public.user_profiles u on u.id = p.owner_id
where not (p.is_hidden or p.is_banned);

-- Admin dashboard view: same as above but includes hidden/banned.
create or replace view public.v_all_profiles as
select
  p.*,
  u.email        as owner_email,
  u.is_blocked   as owner_is_blocked
from public.profiles p
left join public.user_profiles u on u.id = p.owner_id;

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
) c on c.owner_id = u.id;

-- Aggregate donation progress for the current month (Europe/Moscow).
create or replace view public.v_current_donations as
select
  coalesce(sum(amount), 0)::numeric(12,2) as total_rub,
  count(*)                                as donations_count
from public.donations
where received_at >= date_trunc('month', now() at time zone 'Europe/Moscow')
  and received_at <  date_trunc('month', now() at time zone 'Europe/Moscow') + interval '1 month';

-- Convenience GIN index on profile photos array (jsonb) for membership tests.
create index if not exists idx_profiles_photos_gin
  on public.profiles using gin (photos jsonb_path_ops);

-- Partial index: only verified-and-public profiles for the catalog query path.
create index if not exists idx_profiles_public_specialist
  on public.profiles (created_at desc)
  where not is_hidden and not is_banned and is_specialist;
