-- =============================================================================
-- Standardize all id columns to uuid
-- =============================================================================
-- See supabase/steps/10-standardize-ids-to-uuid.sql for the full
-- rationale and order of operations. This is the same file, intended
-- for use with `supabase db push` (fresh installs).
-- =============================================================================

-- 0) Drop every RLS policy on the 5 tables we're about to convert.
--    step 05 will recreate them with the correct names after this
--    migration runs.
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

-- 1) user_profiles.id
alter table public.user_profiles
  alter column id type uuid using id::uuid;

-- 2) profiles.owner_id
alter table public.profiles
  drop constraint if exists profiles_owner_id_fkey;
alter table public.profiles
  alter column owner_id type uuid using owner_id::uuid;
alter table public.profiles
  add constraint profiles_owner_id_fkey
  foreign key (owner_id) references public.user_profiles(id) on delete cascade
  not valid;

-- 3) reviews.author_id
alter table public.reviews
  drop constraint if exists reviews_author_id_fkey;
alter table public.reviews
  alter column author_id type uuid using author_id::uuid;
alter table public.reviews
  add constraint reviews_author_id_fkey
  foreign key (author_id) references public.user_profiles(id) on delete set null
  not valid;

-- 4) complaints.author_id + target_user_id
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

-- 5) notifications.recipient_id
alter table public.notifications
  drop constraint if exists notifications_recipient_id_fkey;
alter table public.notifications
  alter column recipient_id type uuid using recipient_id::uuid;
alter table public.notifications
  add constraint notifications_recipient_id_fkey
  foreign key (recipient_id) references public.user_profiles(id) on delete cascade
  not valid;

-- 6) Validate the new FKs
alter table public.profiles      validate constraint profiles_owner_id_fkey;
alter table public.reviews       validate constraint reviews_author_id_fkey;
alter table public.complaints    validate constraint complaints_author_id_fkey;
alter table public.complaints    validate constraint complaints_target_user_id_fkey;
alter table public.notifications validate constraint notifications_recipient_id_fkey;
