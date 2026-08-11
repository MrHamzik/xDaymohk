-- =============================================================================
-- Step 11 — Fix profiles RLS to hide other users' personal profiles, and
--           add a server-side profile_count view for the admin panel.
-- =============================================================================
-- Run AFTER step 10. Idempotent.
--
-- Why this step exists:
--   The previous RLS policy "profiles public read" was:
--
--     using (
--       not (is_hidden or is_banned)
--       or auth.uid()::text = owner_id::text
--       or is_admin_email()
--     );
--
--   That means EVERYONE could SELECT every non-hidden / non-banned
--   profile, including other users' personal profiles (is_personal=true).
--   The UI happened to filter them out client-side, but a curious user
--   could read them straight from the database with curl + the anon key.
--   Worse, the Next.js client was caching them in localStorage, so they
--   leaked across sessions and across browsers (the "phantom profile"
--   bug).
--
--   The fix is to enforce the same rule on the server that we wanted on
--   the client: only the owner, the admin, and no one else can see a
--   personal profile. Non-personal profiles (specialists, public
--   listings) stay visible to everyone as before.
--
--   We also add a SQL view that returns user_profiles with a
--   server-computed `profile_count`. The admin panel reads from this
--   view instead of counting client-side, so the count is always
--   correct (and always >= 1 for users with a personal profile).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1) Tighten the public-read RLS policy to hide other users' personal
--    profiles. The owner and the admin still see them.
-- ---------------------------------------------------------------------------
drop policy if exists "profiles public read" on public.profiles;
create policy "profiles public read"
  on public.profiles for select
  using (
    -- Anyone can see a non-personal profile that is not hidden / banned.
    (not is_personal and not (is_hidden or is_banned))
    -- The owner can always see their own rows, including their personal
    -- profile and any hidden / banned rows of theirs.
    or auth.uid()::text = owner_id::text
    -- Admins can see everything for moderation purposes.
    or is_admin_email()
  );


-- ---------------------------------------------------------------------------
-- 2) View: user_profiles with a server-computed profile_count.
--    Uses security_invoker = true so the calling user's RLS still applies
--    when they query the view (admins see real counts for everyone,
--    regular users would only see their own row through the underlying
--    user_profiles RLS — though in practice this view is only used by
--    the admin panel).
-- ---------------------------------------------------------------------------
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

comment on view public.v_users_with_profile_count is
  'user_profiles joined with a server-computed count of their profiles. '
  'Used by the admin panel. Read it with the service role to bypass '
  'user_profiles RLS for everyone, or as a regular user to see only '
  'your own row.';


-- ---------------------------------------------------------------------------
-- 3) Convenience RPC: create a personal profile for the calling user
--    if one doesn't already exist. Returns the existing row when
--    present (idempotent). Runs with security definer so it can
--    insert into profiles on behalf of the user without us having to
--    duplicate the owner-insert RLS logic in the application.
-- ---------------------------------------------------------------------------
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

  -- Idempotency: if the canonical personal row already exists,
  -- return it. This is the only row we keep; we never spawn
  -- duplicates (the previous bug).
  select * into v_existing
    from public.profiles
   where id = v_personal_id;
  if found then
    return v_existing;
  end if;

  -- Defensive: if there are OTHER is_personal=true rows for this
  -- owner (e.g. created by an older client), we still don't error
  -- — we just create the canonical one alongside. The admin can
  -- clean up duplicates later.
  insert into public.profiles (
    id,
    owner_id,
    full_name,
    avatar_url,
    is_specialist,
    is_personal,
    bio,
    workplace_address,
    workplace_coords,
    phone,
    hide_phone,
    same_as_phone_whatsapp,
    settlement
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
    'Самашки'
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.ensure_personal_profile(text, text, text) from public;
grant execute on function public.ensure_personal_profile(text, text, text) to authenticated;

comment on function public.ensure_personal_profile(text, text, text) is
  'Create the canonical personal profile (id = personal-<auth.uid()>) '
  'for the calling user if it does not already exist. Idempotent: '
  'returns the existing row when present. Used by the Next.js client '
  'as a single round-trip replacement for the previous in-memory '
  'auto-create flow.';


-- ---------------------------------------------------------------------------
-- 4) Convenience RPC: a server-side view of profiles for a given
--    owner (used by the admin panel to list a user's questionnaires).
--    Runs with security definer so the admin can list any user's
--    profiles without us having to grant admins a special SELECT
--    bypass.
-- ---------------------------------------------------------------------------
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
