-- ===========================================================================
-- Nama merek Marky (dan nama lama Booka) dicadangkan supaya tidak ada merchant
-- yang bisa meniru merek atau membuat halaman booking dengan nama platform.
-- Nama "booka" tetap dicadangkan karena masih dipakai di domain verifikasi
-- lama dan tautan yang sudah beredar.
-- ===========================================================================

do $$
begin
  if exists (select 1 from public.merchants where username in ('marky', 'booka')) then
    raise exception 'Merchant dengan username marky/booka sudah ada. Ganti username-nya dulu sebelum migration ini dijalankan, kalau tidak akun itu terkunci.';
  end if;
end $$;

insert into public.reserved_usernames (name) values
  ('marky'), ('booka')
on conflict (name) do nothing;
