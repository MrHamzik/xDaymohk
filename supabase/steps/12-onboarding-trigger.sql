-- =============================================================================
-- Step 12 — Auto-create user_profiles + personal profile on signup
-- =============================================================================
-- Run AFTER step 11. Idempotent.
--
-- Why this step exists:
--   Before this step, the personal profile was created from the Next.js
--   client via /api/account/ensure-personal-profile. That worked in
--   theory, but had two problems:
--
--     1) If the user never opened the app, they had no user_profiles
--        row. The admin panel would not see them in the user list,
--        and the view v_users_with_profile_count would not return
--        them either.
--
--     2) If the client failed to call ensure-personal-profile (the
--        RPC was missing because step 11 hadn't been applied, for
--        example), the user had a user_profiles row but no
--        personal profile. Their profileCount stayed at 0.
--
--   The canonical Supabase fix for both is to put the onboarding
--   logic on the server, in an AFTER INSERT trigger on auth.users.
--   The trigger fires for every signup (Google OAuth, magic link,
--   email/password, etc.) and is the documented pattern in
--   supabase.com/docs/guides/auth/managing-user-data.
--
--   This step also backfills user_profiles and the personal profile
--   for any auth.users rows that already exist at the time of
--   execution, so admins that ran the project before this trigger
--   was added will get their personal profiles retroactively.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1) A single SECURITY DEFINER function that handles all the onboarding
--    work: create user_profiles if missing, create the canonical
--    personal profile if missing. Both inserts go through the
--    SECURITY DEFINER role, which bypasses RLS so the trigger
--    doesn't get tangled up in self-insert RLS policies.
-- ---------------------------------------------------------------------------
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

  -- 1a) Create the user_profiles row if it doesn't exist.
  --     ON CONFLICT DO NOTHING is idempotent: re-running the
  --     trigger for the same user is a no-op.
  insert into public.user_profiles (
    id, email, full_name, avatar_url, phone, is_admin
  ) values (
    new.id, new.email, v_full_name, v_avatar_url, v_phone, v_is_admin
  )
  on conflict (id) do nothing;

  -- 1b) Create the canonical personal profile if it doesn't exist.
  --     Same idempotency trick.
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
    'Самашки'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- The trigger function runs as SECURITY DEFINER (the table owner)
-- because we need to bypass RLS when inserting the new rows on
-- behalf of the new user. Without this, the "user_profiles self
-- insert" and "profiles owner insert" RLS policies would block the
-- inserts (because auth.uid() is the new user, but the role
-- executing the trigger is the function owner, not the new user).
-- We grant execute only to the postgres role, which is what the
-- trigger uses to invoke the function.

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();


-- ---------------------------------------------------------------------------
-- 2) Backfill: every auth.users row that doesn't yet have a
--    user_profiles entry gets one; every auth.users row that
--    doesn't yet have a personal-<id> profile gets one.
--    Safe to re-run: ON CONFLICT DO NOTHING everywhere.
-- ---------------------------------------------------------------------------
insert into public.user_profiles (id, email, full_name, avatar_url, phone, is_admin)
select
  au.id,
  au.email,
  coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', ''),
  coalesce(au.raw_user_meta_data->>'avatar_url', ''),
  coalesce(au.phone, ''),
  lower(coalesce(au.email, '')) in (
    'mr.hamzik1026@gmail.com', 'nabis95@gmail.com'
  )
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
  'Самашки'
from auth.users au
on conflict (id) do nothing;
