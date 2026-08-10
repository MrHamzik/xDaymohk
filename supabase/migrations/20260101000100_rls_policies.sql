-- =============================================================================
-- Step 05 / 07 — Row Level Security policies
-- =============================================================================
-- Paste into SQL Editor and Run.
--
-- IMPORTANT: auth.uid() in Supabase returns uuid but in older setups it
-- may be text. All comparisons in this file cast auth.uid() to uuid
-- explicitly so policies work regardless of the project's auth.uid()
-- declaration.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- user_profiles
-- ---------------------------------------------------------------------------
drop policy if exists "user_profiles self select" on public.user_profiles;
create policy "user_profiles self select"
  on public.user_profiles for select
  using (auth.uid()::text = id or is_admin_email());

drop policy if exists "user_profiles self insert" on public.user_profiles;
create policy "user_profiles self insert"
  on public.user_profiles for insert
  with check (auth.uid()::text = id);

drop policy if exists "user_profiles self update" on public.user_profiles;
create policy "user_profiles self update"
  on public.user_profiles for update
  using (auth.uid()::text = id)
  with check (auth.uid()::text = id);

drop policy if exists "user_profiles admin update" on public.user_profiles;
create policy "user_profiles admin update"
  on public.user_profiles for update
  using (is_admin_email())
  with check (is_admin_email());

-- ---------------------------------------------------------------------------
-- profiles — public catalogue
-- ---------------------------------------------------------------------------
drop policy if exists "profiles public read" on public.profiles;
create policy "profiles public read"
  on public.profiles for select
  using (
    not (is_hidden or is_banned)
    or auth.uid()::text = owner_id
    or is_admin_email()
  );

drop policy if exists "profiles owner insert" on public.profiles;
create policy "profiles owner insert"
  on public.profiles for insert
  with check (auth.uid()::text = owner_id or owner_id is null);

drop policy if exists "profiles owner update" on public.profiles;
create policy "profiles owner update"
  on public.profiles for update
  using (auth.uid()::text = owner_id)
  with check (auth.uid()::text = owner_id);

drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles admin update"
  on public.profiles for update
  using (is_admin_email())
  with check (is_admin_email());

drop policy if exists "profiles owner delete" on public.profiles;
create policy "profiles owner delete"
  on public.profiles for delete
  using (
    (auth.uid()::text = owner_id::text and not is_personal)
    or is_admin_email()
  );

-- ---------------------------------------------------------------------------
-- certificates
-- ---------------------------------------------------------------------------
drop policy if exists "certificates public read" on public.certificates;
create policy "certificates public read"
  on public.certificates for select
  using (true);

drop policy if exists "certificates owner write" on public.certificates;
create policy "certificates owner write"
  on public.certificates for all
  using (
    exists (select 1 from public.profiles p where p.id = certificates.profile_id and p.owner_id = public.uid())
    or is_admin_email()
  )
  with check (
    exists (select 1 from public.profiles p where p.id = certificates.profile_id and p.owner_id = public.uid())
    or is_admin_email()
  );

-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------
drop policy if exists "reviews public read" on public.reviews;
create policy "reviews public read"
  on public.reviews for select
  using (true);

drop policy if exists "reviews author write" on public.reviews;
create policy "reviews author write"
  on public.reviews for insert
  with check (auth.uid()::text = author_id);

drop policy if exists "reviews author delete" on public.reviews;
create policy "reviews author delete"
  on public.reviews for delete
  using (auth.uid()::text = author_id or is_admin_email());

-- ---------------------------------------------------------------------------
-- complaints
-- ---------------------------------------------------------------------------
drop policy if exists "complaints author read" on public.complaints;
create policy "complaints author read"
  on public.complaints for select
  using (auth.uid()::text = author_id or is_admin_email());

drop policy if exists "complaints author insert" on public.complaints;
create policy "complaints author insert"
  on public.complaints for insert
  with check (auth.uid()::text = author_id);

drop policy if exists "complaints admin update" on public.complaints;
create policy "complaints admin update"
  on public.complaints for update
  using (is_admin_email())
  with check (is_admin_email());

-- ---------------------------------------------------------------------------
-- house_addresses
-- ---------------------------------------------------------------------------
drop policy if exists "house_addresses public read" on public.house_addresses;
create policy "house_addresses public read"
  on public.house_addresses for select
  using (true);

drop policy if exists "house_addresses admin write" on public.house_addresses;
create policy "house_addresses admin write"
  on public.house_addresses for all
  using (is_admin_email())
  with check (is_admin_email());

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
drop policy if exists "notifications self read" on public.notifications;
create policy "notifications self read"
  on public.notifications for select
  using (auth.uid()::text = recipient_id);

drop policy if exists "notifications self update" on public.notifications;
create policy "notifications self update"
  on public.notifications for update
  using (auth.uid()::text = recipient_id)
  with check (auth.uid()::text = recipient_id);

drop policy if exists "notifications admin insert" on public.notifications;
create policy "notifications admin insert"
  on public.notifications for insert
  with check (is_admin_email() or auth.uid()::text = recipient_id);

-- ---------------------------------------------------------------------------
-- donations + project_support — public read, service-role writes
-- ---------------------------------------------------------------------------
drop policy if exists "donations public read" on public.donations;
create policy "donations public read"
  on public.donations for select
  using (true);

drop policy if exists "project_support public read" on public.project_support;
create policy "project_support public read"
  on public.project_support for select
  using (true);

-- ---------------------------------------------------------------------------
-- Storage RLS policies
-- ---------------------------------------------------------------------------
drop policy if exists "profile-media read" on storage.objects;
create policy "profile-media read"
  on storage.objects
  for select
  using (bucket_id = 'profile-media');

drop policy if exists "profile-media owner write" on storage.objects;
create policy "profile-media owner write"
  on storage.objects
  for insert
  with check (
    bucket_id = 'profile-media'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] in ('avatars', 'documents')
    and (storage.foldername(name))[2] like (public.uid()::text || '-%')
  );

drop policy if exists "profile-media owner delete" on storage.objects;
create policy "profile-media owner delete"
  on storage.objects
  for delete
  using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[2] like (public.uid()::text || '-%')
  );
