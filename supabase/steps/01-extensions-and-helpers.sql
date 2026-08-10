-- =============================================================================
-- Step 01 / 07 — Extensions + helper functions
-- =============================================================================
-- Paste this into Supabase Dashboard -> SQL Editor and Run.
-- Safe to re-run: every CREATE uses IF NOT EXISTS or OR REPLACE.
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

-- ---------------------------------------------------------------------------
-- 2. Convenience: cast auth.uid() to uuid explicitly
-- ---------------------------------------------------------------------------
-- In some Supabase setups auth.uid() returns text; the wrapper below
-- guarantees a uuid return type and is used by all RLS policies in step 05.
create or replace function public.uid() returns uuid
language sql
stable
as $$
  select auth.uid()::uuid
$$;

grant execute on function public.uid() to authenticated, anon;
