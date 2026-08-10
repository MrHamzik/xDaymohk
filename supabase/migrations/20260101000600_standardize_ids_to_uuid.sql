-- =============================================================================
-- Standardize all id columns to uuid
-- =============================================================================
-- See supabase/steps/10-standardize-ids-to-uuid.sql for the full
-- rationale and order of operations. This is the same file, intended
-- for use with `supabase db push` (fresh installs).
-- =============================================================================

-- 0a) Drop every RLS policy on the 5 tables we're about to convert.
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

-- 0b) Drop the convenience views.
drop view if exists public.v_public_profiles;
drop view if exists public.v_all_profiles;
drop view if exists public.v_user_directory;
drop view if exists public.v_current_donations;

-- 1) user_profiles.id
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

-- 2) profiles.owner_id
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

-- 3) reviews.author_id
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

-- 4) complaints.author_id + target_user_id
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

-- 5) notifications.recipient_id
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

-- 6) Validate the new FKs
alter table public.profiles      validate constraint profiles_owner_id_fkey;
alter table public.reviews       validate constraint reviews_author_id_fkey;
alter table public.complaints    validate constraint complaints_author_id_fkey;
alter table public.complaints    validate constraint complaints_target_user_id_fkey;
alter table public.notifications validate constraint notifications_recipient_id_fkey;

-- 7) Recreate the convenience views
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
