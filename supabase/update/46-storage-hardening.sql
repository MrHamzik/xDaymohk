-- =============================================================================
-- Даймохк — обновление 46
-- Защита хранилища: лимит размера и белый список типов файлов.
--
-- Дыра, которую это закрывает
-- ---------------------------
-- Файлы уходят в Storage НАПРЯМУЮ с клиента (lib/media.ts). Размер и
-- тип проверяются в браузере — то есть в коде, который пользователь
-- полностью контролирует. Через консоль devtools можно вызвать
--
--   supabase.storage.from('profile-media').upload(path, hugeFile)
--
-- и положить файл на 100 МБ или HTML-страницу с именем `avatar.webp`.
--
-- Чем это грозит:
--   • переполнение платной квоты хранилища одним человеком за вечер;
--   • раздача чужого HTML/SVG с нашего домена — это XSS: браузер
--     выполнит скрипт из такого «изображения» в контексте daymohk.
--
-- Почему проверка именно здесь
-- ----------------------------
-- Клиентскую проверку обойти тривиально, а серверного прокси у
-- загрузки нет. Ограничения на самом bucket — единственное место,
-- которое действует независимо от того, кто и чем вызывает upload.
--
-- Идемпотентно, можно перезапускать.
-- =============================================================================
set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Лимит размера и разрешённые типы
--
-- 3 МБ: аватар после сжатия в webp весит 40–200 КБ, документ — до 1 МБ.
-- Запас втрое покрывает исходники с плохих камер, но не даёт залить
-- видео под видом картинки.
--
-- allowed_mime_types — БЕЛЫЙ список: разрешаем ровно три формата, а не
-- «запрещаем плохие». SVG в него намеренно НЕ входит: это XML, внутри
-- которого исполняется JavaScript.
-- ---------------------------------------------------------------------------
update storage.buckets
   set file_size_limit = 3145728,  -- 3 МБ
       allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png']
 where id = 'profile-media';

-- Если bucket ещё не создан — создаём сразу с ограничениями.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select 'profile-media', 'profile-media', true, 3145728,
       array['image/webp', 'image/jpeg', 'image/png']
where not exists (select 1 from storage.buckets where id = 'profile-media');

-- ---------------------------------------------------------------------------
-- 2. Запись только в свою папку
--
-- Путь файла — `avatars/<uuid владельца>.webp` (см. lib/media.ts).
-- Без этой политики любой вошедший мог бы перезаписать чужой аватар,
-- подставив чужой uuid в путь.
--
-- storage.foldername(name) отдаёт массив сегментов пути, вторая часть
-- имени файла до точки должна совпадать с uid() автора запроса.
-- ---------------------------------------------------------------------------
drop policy if exists "profile-media insert own" on storage.objects;
create policy "profile-media insert own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] in ('avatars', 'documents')
    and split_part(split_part(name, '/', 2), '.', 1) = auth.uid()::text
  );

drop policy if exists "profile-media update own" on storage.objects;
create policy "profile-media update own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'profile-media'
    and split_part(split_part(name, '/', 2), '.', 1) = auth.uid()::text
  );

drop policy if exists "profile-media delete own" on storage.objects;
create policy "profile-media delete own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-media'
    and split_part(split_part(name, '/', 2), '.', 1) = auth.uid()::text
  );

-- Чтение публичное: анкеты и аватары видны в каталоге без входа.
drop policy if exists "profile-media public read" on storage.objects;
create policy "profile-media public read"
  on storage.objects for select to public
  using (bucket_id = 'profile-media');

-- ---------------------------------------------------------------------------
-- 3. Готово
-- ---------------------------------------------------------------------------
do $$
begin
  raise notice 'Обновление 46 применено: лимит 3 МБ, только webp/jpeg/png, запись только в свою папку.';
end $$;

-- =============================================================================
-- Проверка:
--   select id, file_size_limit, allowed_mime_types
--     from storage.buckets where id = 'profile-media';
--   select policyname from pg_policies
--    where tablename = 'objects' and policyname like 'profile-media%';
-- =============================================================================
