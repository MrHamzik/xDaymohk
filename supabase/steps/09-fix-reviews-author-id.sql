-- =============================================================================
-- Step 09 — Add missing author_id column to public.reviews
-- =============================================================================
-- Some Supabase projects have a public.reviews table that was created before
-- step 02 introduced the author_id column. The RLS policies and the Next.js
-- client code both reference reviews.author_id, so the column is required.
--
-- This step is idempotent and safe to re-run. Existing rows get NULL.
-- =============================================================================

alter table public.reviews
  add column if not exists author_id uuid references public.user_profiles(id) on delete set null;

create index if not exists idx_reviews_author_id on public.reviews (author_id);
