-- ============================================================================
-- 08-storage-policies.sql
-- Чиним загрузку аватаров и закрываем предупреждение Supabase о листинге.
--
-- Проблема 1 (аватар не меняется):
--   Политика записи требовала имя файла вида `avatars/<uuid>-ЧТО-ТО`
--   (like '<uuid>-%'), а новый код грузит `avatars/<uuid>.webp` (без дефиса).
--   INSERT отклонялся политикой → upload молча падал → аватарка не менялась.
--   Теперь разрешаем и `<uuid>.webp`, и `<uuid>-*.webp`.
--
-- Проблема 2 (предупреждение Supabase):
--   Широкая SELECT-политика `profile-media read` позволяет клиентам
--   листинг всех файлов bucket'а. Убираем её: чтение файла остаётся
--   открытым (bucket public), а листинг — нет.
--
-- Применение: вставьте весь файл в Supabase SQL Editor и нажмите Run.
-- ============================================================================

-- 1) Политика записи: разрешаем аватар «<uuid>.webp» И «<uuid>-*.webp»
--    (и документы «<uuid>-*.webp» как раньше).
drop policy if exists "profile-media owner write" on storage.objects;

create policy "profile-media owner write"
  on storage.objects
  for insert
  with check (
    bucket_id = 'profile-media'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] in ('avatars', 'documents')
    and (
      -- аватар: avatars/<uuid>.webp (без суффикса) или avatars/<uuid>-*.webp
      (storage.foldername(name))[2] = (auth.uid()::text || '.webp')
      or (storage.foldername(name))[2] like (auth.uid()::text || '-%')
    )
  );

-- 2) Политика обновления (upsert перезаписывает файл) — та же логика.
drop policy if exists "profile-media owner update" on storage.objects;

create policy "profile-media owner update"
  on storage.objects
  for update
  using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] in ('avatars', 'documents')
    and (
      (storage.foldername(name))[2] = (auth.uid()::text || '.webp')
      or (storage.foldername(name))[2] like (auth.uid()::text || '-%')
    )
  )
  with check (
    bucket_id = 'profile-media'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] in ('avatars', 'documents')
    and (
      (storage.foldername(name))[2] = (auth.uid()::text || '.webp')
      or (storage.foldername(name))[2] like (auth.uid()::text || '-%')
    )
  );

-- 3) Политика удаления — та же логика.
drop policy if exists "profile-media owner delete" on storage.objects;

create policy "profile-media owner delete"
  on storage.objects
  for delete
  using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] in ('avatars', 'documents')
    and (
      (storage.foldername(name))[2] = (auth.uid()::text || '.webp')
      or (storage.foldername(name))[2] like (auth.uid()::text || '-%')
    )
  );

-- 4) Убираем широкую SELECT-политику (листинг всех файлов).
--    Чтение по-прежнему работает: bucket public + файлы доступны по URL.
drop policy if exists "profile-media read" on storage.objects;
