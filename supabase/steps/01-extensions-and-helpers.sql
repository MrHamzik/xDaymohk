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
    (select email from auth.users where id::text = auth.uid()::text),
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
-- plpgsql + exception handler so an invalid/null auth.uid() returns
-- the all-zeros UUID (matches the behaviour of the literal cast).
create or replace function public.uid() returns uuid
language plpgsql
stable
as $$
declare
  raw text;
begin
  raw := auth.uid();
  if raw is null or raw = '' then
    return '00000000-0000-0000-0000-000000000000'::uuid;
  end if;
  return raw::uuid;
exception when invalid_text_representation then
  return '00000000-0000-0000-0000-000000000000'::uuid;
end;
$$;

grant execute on function public.uid() to authenticated, anon;
