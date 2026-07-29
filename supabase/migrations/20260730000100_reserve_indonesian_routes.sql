-- ===========================================================================
-- Rute auth berbahasa Indonesia menempati segmen URL teratas, satu ruang nama
-- dengan /[username]. Tanpa ini, merchant bisa mengklaim "masuk" atau "daftar"
-- dan menaungi halaman login aplikasi.
-- ===========================================================================

insert into public.reserved_usernames (name) values
  -- Rute yang benar-benar ada di src/lib/routes.ts
  ('masuk'), ('daftar'), ('keluar'), ('lupa-password'), ('reset-password'),

  -- Dicadangkan untuk halaman yang sudah direncanakan
  ('harga'), ('bantuan'), ('tentang'), ('syarat'), ('privasi'), ('kontak'),

  -- Kata umum yang berisiko membingungkan kalau jadi tautan merchant
  ('akun'), ('profil'), ('jadwal'), ('layanan'), ('pesan'), ('pesanan'),
  ('konfirmasi'), ('verifikasi'), ('undangan')
on conflict (name) do nothing;
