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
    (select email from auth.users where id = auth.uid()),
    ''
  )) in ('mr.hamzik1026@gmail.com', 'nabis95@gmail.com');
$$;

revoke all on function public.is_admin_email() from public;
grant execute on function public.is_admin_email() to authenticated, anon;
