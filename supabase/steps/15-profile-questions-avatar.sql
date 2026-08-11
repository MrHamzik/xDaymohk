-- =============================================================================
-- Step 15 — Add author_avatar_url to profile_questions
-- =============================================================================
-- Run AFTER step 14. Idempotent.
--
-- Why this step exists:
--   Step 13 created profile_questions without an avatar column,
--   because we were unsure whether the moderator wanted to display
--   author avatars in the question thread. After implementing the
--   reviews flow with the same column, the question list looks
--   visually inconsistent — every review has the author's avatar
--   bubble, every question is just text. This step fixes that.
--
--   We use ADD COLUMN IF NOT EXISTS so re-running on a database
--   that already has the column is a no-op.
-- =============================================================================


alter table public.profile_questions
  add column if not exists author_avatar_url text;
