-- =============================================================================
-- Step 14 — Add reviews.author_avatar_url + orphan cleanup
-- =============================================================================
-- Run AFTER step 13. Idempotent.
--
-- Why this step exists:
--   The Next.js client and the /api/reviews route both populate
--   reviews.author_avatar_url so each review can show the author's
--   avatar in the catalog. The column was added in step 02, but
--   some projects that were created before the column existed
--   missed it (e.g. when step 02 was the first script that ran and
--   "create table if not exists" added the table with a partial
--   schema because Postgres sees the table as already present and
--   does NOT retrofit missing columns).
--
--   Without this column the /api/reviews POST returns
--     "Could not find the 'author_avatar_url' column of 'reviews'
--      in the schema cache"
--   and the insert is rejected, so reviews never make it to the
--   table and the rolling rating on the target profile never moves.
--
-- This step also removes an orphan specialist profile
-- (id starting with "profile-" and owner_id IS NULL) that the
-- admin was carrying from a manual test. It's a one-off cleanup
-- and a no-op on projects that don't have such a row.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1) Add the missing column. ADD COLUMN IF NOT EXISTS is idempotent
--    on Postgres 9.6+ and is safe to re-run.
-- ---------------------------------------------------------------------------
alter table public.reviews
  add column if not exists author_avatar_url text;


-- ---------------------------------------------------------------------------
-- 2) Orphan cleanup: profile rows with owner_id IS NULL and an id
--    that does NOT look like a personal profile (which always
--    starts with "personal-"). Deleting them is safe because they
--    have no FK references and no one owns them.
-- ---------------------------------------------------------------------------
delete from public.profiles
 where owner_id is null
   and id not like 'personal-%';
