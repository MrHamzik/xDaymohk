-- =============================================================================
-- Step 16 — Live-JOIN views for reviews and profile_questions
-- =============================================================================
-- Run AFTER step 15. Idempotent.
--
-- Why this step exists:
--   Steps 02 / 13 stored the author's display name and avatar URL as
--   denormalized columns on reviews / profile_questions. That
--   captured a snapshot at the moment the user submitted the
--   review/question, but it meant that when the user later edited
--   their name or avatar in the account modal, every old review /
--   question they had left kept showing the OLD name and OLD
--   avatar. From the UI this looked like a bug ("I changed my
--   name, why does the review I left yesterday still show the old
--   one?").
--
--   The standard Supabase fix is to expose the data through a view
--   that LEFT JOINs to user_profiles and projects the live values
--   (full_name, avatar_url) instead of the stale snapshot columns.
--   The Next.js API endpoints read the view, not the base tables,
--   and the UI receives the same field names it always has — no
--   client-side changes required.
--
--   For authors whose user_profiles row was deleted (account
--   deletion), the LEFT JOIN returns NULL, and the view falls back
--   to a generic "Удалённый пользователь" placeholder. We keep
--   this behaviour instead of just blanking the name so reviewers
--   who used to be Samashki residents still have a stable identity
--   in old threads.
--
-- After the view is in place, the denormalized columns
--   reviews.author_name, reviews.author_avatar_url,
--   profile_questions.author_name, profile_questions.author_avatar_url
--   are dropped. The /api/reviews and /api/profile-questions routes
--   insert into the base tables with NULL for those columns
--   (they are no longer used), and the view projects user_profiles
--   values for every read.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1) Backfill: make sure the existing denormalized columns reflect
--    the CURRENT user_profiles value. This is a one-time correction
--    so that, for as long as the columns exist, the data is at
--    least consistent with the source of truth. We backfill BEFORE
--    creating the view (which references these columns) so that the
--    DROP COLUMN later doesn't have to think about legacy rows.
-- ---------------------------------------------------------------------------
update public.reviews r
   set author = coalesce(u.full_name, r.author)
  from public.user_profiles u
 where u.id = r.author_id
   and (r.author is null or r.author = '' or r.author <> u.full_name);

update public.reviews r
   set author_avatar_url = u.avatar_url
  from public.user_profiles u
 where u.id = r.author_id
   and u.avatar_url is not null
   and (r.author_avatar_url is null or r.author_avatar_url <> u.avatar_url);

update public.profile_questions q
   set author_name = coalesce(u.full_name, q.author_name)
  from public.user_profiles u
 where u.id = q.author_id
   and (q.author_name is null or q.author_name = '' or q.author_name <> u.full_name);

update public.profile_questions q
   set author_avatar_url = u.avatar_url
  from public.user_profiles u
 where u.id = q.author_id
   and u.avatar_url is not null
   and (q.author_avatar_url is null or q.author_avatar_url <> u.avatar_url);


-- ---------------------------------------------------------------------------
-- 2) Views: LEFT JOIN user_profiles so the live name / avatar is
--    what the API returns. We use COALESCE(u.full_name, 'Удалённый
--    пользователь') so the placeholder only appears when the
--    author really has no user_profiles row (account deleted).
--    The denormalized snapshot columns are still projected as
--    `cached_author_name` / `cached_author_avatar_url` for
--    debugging — they are NOT used by the application after this
--    step is applied.
-- ---------------------------------------------------------------------------
create or replace view public.v_reviews
  with (security_invoker = true) as
select
  r.id,
  r.profile_id,
  r.author_id,
  -- Live name: prefer the current user_profiles value; fall back
  -- to a generic placeholder only when the user is genuinely gone.
  coalesce(u.full_name, 'Удалённый пользователь') as author,
  u.avatar_url                                       as author_avatar_url,
  r.rating,
  r.text,
  r.created_at,
  -- Snapshot columns (kept for debugging; the app does not read them)
  r.author       as cached_author_name,
  r.author_avatar_url as cached_author_avatar_url
from public.reviews r
left join public.user_profiles u on u.id = r.author_id;

comment on view public.v_reviews is
  'reviews LEFT JOIN user_profiles. The view projects the live '
  'author full_name and avatar_url so name / avatar changes are '
  'reflected on every read, not just on new rows. The base '
  'reviews.author / reviews.author_avatar_url columns are kept '
  'as cached_* for debugging only and will be dropped in step 17.';

create or replace view public.v_profile_questions
  with (security_invoker = true) as
select
  q.id,
  q.profile_id,
  q.author_id,
  coalesce(u.full_name, 'Удалённый пользователь') as author_name,
  u.avatar_url                                       as author_avatar_url,
  q.question,
  q.created_at,
  q.author_name       as cached_author_name,
  q.author_avatar_url as cached_author_avatar_url
from public.profile_questions q
left join public.user_profiles u on u.id = q.author_id;

comment on view public.v_profile_questions is
  'profile_questions LEFT JOIN user_profiles. Same contract as '
  'v_reviews: live name / avatar from user_profiles, with a '
  'generic placeholder for accounts that have been deleted.';


-- ---------------------------------------------------------------------------
-- 3) Drop the denormalized columns. They are no longer read by
--    the application; the view projects the live values instead.
--    After this DROP, any /api/reviews or /api/profile-questions
--    insert that still tries to write to these columns will fail
--    with a schema error — update the routes before applying this
--    step in production.
-- ---------------------------------------------------------------------------
alter table public.reviews
  drop column if exists author,
  drop column if exists author_avatar_url;

alter table public.profile_questions
  drop column if exists author_name,
  drop column if exists author_avatar_url;
