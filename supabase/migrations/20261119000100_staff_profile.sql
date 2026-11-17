-- F7: profil staf (peran, perkenalan, keahlian, foto, klip gerak) dan bucket
-- privat untuk berkas klip mentah.
--
-- Keputusan 2: berkas mentah (GIF/video) tidak pernah publik; route
--   /api/staff/clip mengubahnya ke MP4 lalu menulis motion_path.
-- Keputusan 3: motion_path hanya bisa ditulis service_role, jadi insert staf
--   untuk authenticated diubah jadi grant per kolom.
-- Keputusan 7: foto wajib .webp dan klip wajib .mp4 di bawah {merchant_id}/staff/.
-- Keputusan 8: kolom profil dibuka untuk anon (halaman publik).
-- Keputusan 9: batas isian lewat constraint tanpa fungsi (fungsi baru tertutup
--   bagi authenticated sejak 20260730000300).

alter table public.staff
  add column role text,
  add column bio text,
  add column tags text[] not null default '{}',
  add column photo_path text,
  add column motion_path text,
  add column show_motion boolean not null default true,
  add constraint staff_role_length check (role is null or char_length(btrim(role)) between 1 and 40),
  add constraint staff_bio_length check (bio is null or char_length(bio) <= 140),
  add constraint staff_tags_shape check (
    coalesce(array_ndims(tags), 1) = 1
    and cardinality(tags) <= 5
    and array_position(tags, null) is null
    and (cardinality(tags) = 0 or array_to_string(tags, E'\n') ~ '^[^\n]{1,24}(\n[^\n]{1,24})*$')
  ),
  add constraint staff_photo_path_scoped check (photo_path is null or (
    photo_path ~ ('^' || merchant_id::text || '/staff/[A-Za-z0-9._/-]+\.webp$') and photo_path !~ '\.\.')),
  add constraint staff_motion_path_scoped check (motion_path is null or (
    motion_path ~ ('^' || merchant_id::text || '/staff/[A-Za-z0-9._/-]+\.mp4$') and motion_path !~ '\.\.'));

grant select (role, bio, tags, photo_path, motion_path, show_motion) on public.staff to anon;
grant update (role, bio, tags, photo_path, show_motion) on public.staff to authenticated;

-- Insert diganti grant per kolom supaya motion_path tidak bisa diisi klien.
revoke insert on public.staff from authenticated;
grant insert (merchant_id, name, is_active, sort_order, role, bio, tags, photo_path, show_motion)
  on public.staff to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('staff-clip-uploads', 'staff-clip-uploads', false, 8388608,
        array['image/gif', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do nothing;

create policy "staff_clip_uploads_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'staff-clip-uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
-- Sengaja tanpa policy select/update/delete: berkas mentah tidak pernah dibaca klien.

notify pgrst, 'reload schema';
