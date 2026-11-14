-- ===========================================================================
-- Nama merek Marky (dan nama lama Booka) dicadangkan supaya tidak ada merchant
-- yang bisa meniru merek atau membuat halaman booking dengan nama platform.
-- Nama "booka" tetap dicadangkan karena masih dipakai di domain verifikasi
-- lama dan tautan yang sudah beredar.
-- ===========================================================================

insert into public.reserved_usernames (name) values
  ('marky'), ('booka')
on conflict (name) do nothing;
