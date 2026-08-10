-- =============================================================================
-- Add missing author_id column to public.reviews
-- =============================================================================
-- Some Supabase projects have a public.reviews table that was created before
-- step 02 introduced the author_id column. The RLS policies and the Next.js
-- client code both reference reviews.author_id, so the column is required.
--
-- IMPORTANT: the column type here matches the id column of user_profiles.
-- On this project user_profiles.id is text (not uuid), so author_id must
-- also be text. If your project uses uuid for user_profiles.id, change
-- "text" to "uuid" in the line below before running.
--
-- This migration is idempotent and safe to re-run. Existing rows get NULL.
-- =============================================================================

alter table public.reviews
  add column if not exists author_id text references public.user_profiles(id) on delete set null;

create index if not exists idx_reviews_author_id on public.reviews (author_id);
