-- =============================================================================
-- Step 13 — Profile questions (Q&A lite)
-- =============================================================================
-- Run AFTER step 12. Idempotent.
--
-- Why this step exists:
--   The profile modal has an empty "Вопросы" tab and the user asked
--   for the ability to ask a question to a profile owner. The full
--   Q&A flow (with owner replies) is a follow-up commit; this step
--   only adds the minimum needed to:
--     - persist a question to the database
--     - show a list of existing questions on the profile
--   Replies (with an `answer` column and a separate `answered_at`)
--   will be added in step 14 / 15 once the UI is in place.
--
-- Schema:
--   profile_questions
--     id           text  primary key (matches the client-side format)
--     profile_id   text  references public.profiles.id on delete cascade
--     author_id    uuid  references public.user_profiles.id on delete set null
--     author_name  text  not null default ''     (cached for display)
--     question     text  not null                (1..500 chars)
--     created_at   date  not null default current_date
--
--   `author_id` is nullable so we can still keep the row when a user
--   deletes their account (matches the existing pattern in
--   complaints.target_user_id and reviews.author_id).
--
-- RLS:
--   - public read for everyone (questions are part of the public
--     catalogue, just like reviews)
--   - only the author can delete their own question
--   - inserts are routed through /api/profile-questions (service
--     role) so we don't need a complex RLS-insert policy that
--     requires `author_id = auth.uid()` (avoids the same FK /
--     auth.uid() text-vs-uuid dance we hit with complaints).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------------
create table if not exists public.profile_questions (
  id           text primary key,
  profile_id   text not null references public.profiles(id) on delete cascade,
  author_id    uuid references public.user_profiles(id) on delete set null,
  author_name  text not null default '',
  question     text not null check (char_length(question) between 1 and 500),
  created_at   date not null default current_date
);

create index if not exists idx_profile_questions_profile
  on public.profile_questions (profile_id, created_at desc);


-- ---------------------------------------------------------------------------
-- 2) Realtime
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.profile_questions;
  exception when duplicate_object then null;
  end;
end $$;


-- ---------------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------------
alter table public.profile_questions enable row level security;

drop policy if exists "profile_questions public read" on public.profile_questions;
create policy "profile_questions public read"
  on public.profile_questions for select
  using (true);

-- We do NOT add an INSERT policy. The /api/profile-questions route
-- inserts with the service role (bypasses RLS), and the request
-- handler verifies the caller is authenticated before doing so. This
-- keeps the auth check on the server, where we control it, instead
-- of relying on the client to send a valid auth.uid().
--
-- If you ever want to let the client insert directly, add:
--   create policy "profile_questions author insert" on
--     public.profile_questions for insert with check
--     (auth.uid()::text = author_id::text);

drop policy if exists "profile_questions author delete" on public.profile_questions;
create policy "profile_questions author delete"
  on public.profile_questions for delete
  using (auth.uid()::text = author_id::text or is_admin_email());
