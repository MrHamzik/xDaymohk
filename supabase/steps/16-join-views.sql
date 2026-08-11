-- =============================================================================
-- Step 16 — Live-JOIN views for reviews and profile_questions (v2)
-- =============================================================================
-- Run AFTER step 15. Idempotent.
--
-- Why this step exists (and why v2):
--   Step 02 stored the author's display name and avatar URL as
--   denormalized columns on reviews / profile_questions. When the
--   user later edited their name or avatar in the account modal,
--   every old review / question kept showing the OLD name and
--   OLD avatar ("I changed my name, why does my old review still
--   show the old one?").
--
--   The standard Supabase fix is to expose the data through views
--   that LEFT JOIN user_profiles and project the live values. The
--   Next.js API endpoints read the views, not the base tables,
--   and the UI receives the same field names it has always used.
--
--   v1 of this step failed with 2BP01 ("cannot drop column author
--   of table reviews because other objects depend on it") because
--   the v_reviews view still referenced reviews.author. v2 fixes
--   that by:
--     1) creating the views with a definition that does NOT
--        reference the soon-to-be-dropped columns, and
--     2) dropping the columns afterwards.
--   The intermediate cached_* columns are also gone — there is no
--   value in keeping a snapshot of the broken state around.
--
--   For authors whose user_profiles row was deleted (account
--   deletion), the LEFT JOIN returns NULL and the view projects
--   the placeholder "Удалённый пользователь" so reviewers who
--   used to live in Samashki still have a stable identity in old
--   threads. Their avatar is NULL.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1) Backfill existing rows so the (still-present) denormalized
--    columns reflect the CURRENT user_profiles value. This is a
--    one-time correction: the views we create next will project
--    user_profiles directly, but we backfill first so that any
--    other code path that still reads the old columns gets the
--    right data for the rest of its lifetime.
--    (If the columns have already been dropped, this UPDATE is a
--    no-op error which we swallow with the IF EXISTS-style guard
--    below; just run the rest of the script in that case.)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reviews' and column_name = 'author'
  ) then
    update public.reviews r
       set author = coalesce(u.full_name, r.author)
      from public.user_profiles u
     where u.id = r.author_id
       and (r.author is null or r.author = '' or r.author <> u.full_name);
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reviews' and column_name = 'author_avatar_url'
  ) then
    update public.reviews r
       set author_avatar_url = u.avatar_url
      from public.user_profiles u
     where u.id = r.author_id
       and u.avatar_url is not null
       and (r.author_avatar_url is null or r.author_avatar_url <> u.avatar_url);
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profile_questions' and column_name = 'author_name'
  ) then
    update public.profile_questions q
       set author_name = coalesce(u.full_name, q.author_name)
      from public.user_profiles u
     where u.id = q.author_id
       and (q.author_name is null or q.author_name = '' or q.author_name <> u.full_name);
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profile_questions' and column_name = 'author_avatar_url'
  ) then
    update public.profile_questions q
       set author_avatar_url = u.avatar_url
      from public.user_profiles u
     where u.id = q.author_id
       and u.avatar_url is not null
       and (q.author_avatar_url is null or q.author_avatar_url <> u.avatar_url);
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 2) Drop the views first (if they exist from a previous failed
--    run of step 16), then recreate them with a definition that
--    does NOT touch the soon-to-be-dropped denormalized columns.
--    We use CREATE OR REPLACE for the final state so subsequent
--    re-runs of this step are a no-op.
-- ---------------------------------------------------------------------------
drop view if exists public.v_reviews cascade;
drop view if exists public.v_profile_questions cascade;

create or replace view public.v_reviews
  with (security_invoker = true) as
select
  r.id,
  r.profile_id,
  r.author_id,
  -- Live name: prefer the current user_profiles value; fall back
  -- to a generic placeholder only when the author really has no
  -- user_profiles row (account deleted). The base table's
  -- snapshot columns (reviews.author, reviews.author_avatar_url)
  -- are not referenced here on purpose — we drop them at the end
  -- of this step.
  coalesce(u.full_name, 'Удалённый пользователь') as author,
  u.avatar_url                                       as author_avatar_url,
  r.rating,
  r.text,
  r.created_at
from public.reviews r
left join public.user_profiles u on u.id = r.author_id;

comment on view public.v_reviews is
  'reviews LEFT JOIN user_profiles. The view projects the live '
  'author full_name and avatar_url so name / avatar changes are '
  'reflected on every read, not just on new rows. The base '
  'reviews.author / reviews.author_avatar_url columns are kept '
  'as denormalized snapshots (and are dropped by the rest of '
  'this step) so any code that still reads them in flight gets '
  'the most recently backfilled value.';

create or replace view public.v_profile_questions
  with (security_invoker = true) as
select
  q.id,
  q.profile_id,
  q.author_id,
  coalesce(u.full_name, 'Удалённый пользователь') as author_name,
  u.avatar_url                                       as author_avatar_url,
  q.question,
  q.created_at
from public.profile_questions q
left join public.user_profiles u on u.id = q.author_id;

comment on view public.v_profile_questions is
  'profile_questions LEFT JOIN user_profiles. Same contract as '
  'v_reviews: live name / avatar from user_profiles, with a '
  'generic placeholder for accounts that have been deleted.';


-- ---------------------------------------------------------------------------
-- 3) Drop the denormalized columns. Each DROP is guarded by an
--    information_schema check so re-running the script on a
--    database where the column is already gone is a no-op
--    (instead of an error). We DROP CASCADE as a belt-and-braces
--    measure for any leftover view that might reference the
--    column from a future change; the views defined above don't
--    reference these columns, so CASCADE will not actually drop
--    anything user-visible.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reviews' and column_name = 'author'
  ) then
    alter table public.reviews drop column author cascade;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reviews' and column_name = 'author_avatar_url'
  ) then
    alter table public.reviews drop column author_avatar_url cascade;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profile_questions' and column_name = 'author_name'
  ) then
    alter table public.profile_questions drop column author_name cascade;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profile_questions' and column_name = 'author_avatar_url'
  ) then
    alter table public.profile_questions drop column author_avatar_url cascade;
  end if;
end $$;
