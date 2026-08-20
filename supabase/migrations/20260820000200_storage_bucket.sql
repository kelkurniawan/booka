-- ===========================================================================
-- Bucket media merchant: foto profil, background, dan media layanan.
--
-- Batas ukuran dan tipe berkas ditegakkan DI SINI, bukan hanya di browser.
-- Pemeriksaan di browser bisa dilewati siapa pun yang menembak Storage
-- langsung dengan token sesinya sendiri.
--
-- Durasi video (maks ~30 detik) hanya diperiksa di browser; menegakkannya di
-- server butuh transcoding. Celah ini diterima sadar, bukan terlewat.
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'merchant-media',
  'merchant-media',
  true,
  20971520,
  array['image/webp', 'image/jpeg', 'image/png', 'video/mp4', 'video/webm']
)
on conflict (id) do nothing;

-- Seluruh pola path diawali id merchant:
--   {merchant_id}/avatar-{hash}.webp
--   {merchant_id}/bg-{hash}.webp
--   {merchant_id}/svc/{service_id}/{hash}.webp
-- Satu aturan "folder pertama harus sama dengan auth.uid()" menutup semuanya.
create policy "merchant_media_public_read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'merchant-media');

create policy "merchant_media_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'merchant-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "merchant_media_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'merchant-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'merchant-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "merchant_media_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'merchant-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
