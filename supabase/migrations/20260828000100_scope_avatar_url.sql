-- ===========================================================================
-- Batasi `merchants.avatar_url` ke sumber yang kita kenali.
--
-- Kolom ini menyimpan URL penuh (bukan path seperti background dan media
-- layanan), karena nilainya bisa datang dari dua tempat: berkas yang diunggah
-- merchant ke bucket kita, atau foto bawaan dari signup Google.
--
-- Tanpa batasan, `authenticated` yang punya `grant update (… avatar_url …)`
-- bisa menuliskan URL pihak ketiga apa pun langsung lewat PostgREST -- tanpa
-- melewati Server Action sama sekali. Nilai itu lalu dirender sebagai
-- <img src> di halaman publik `/[username]` yang berjalan di domain kita,
-- sehingga setiap pengunjung mengirim IP, User-Agent, dan Referer-nya ke host
-- pilihan merchant.
--
-- Pola bucket mengikat ke `id` baris itu sendiri, jadi merchant juga tidak
-- bisa menunjuk berkas milik merchant lain.
--
-- PENTING: constraint ini punya dua penulis, dan keduanya harus sepakat.
-- Selain Server Action, ada trigger `handle_new_user` yang menyalin
-- `avatar_url` mentah dari metadata OAuth saat signup. Kalau trigger itu
-- dibiarkan apa adanya, provider yang mengembalikan host di luar daftar akan
-- membuat SELURUH pendaftaran gagal -- kegagalan yang jauh lebih parah
-- daripada celah yang ditutup di sini. Karena itu trigger-nya ikut diperbarui
-- di bawah agar menyaring, bukan menolak.
--
-- Polanya sengaja ditulis ulang di dua tempat, bukan dipanggil lewat fungsi
-- bersama: ekspresi CHECK yang memanggil fungsi menuntut hak EXECUTE pada
-- peran yang melakukan DML, dan proyek ini menutup EXECUTE secara default.
-- ===========================================================================

alter table public.merchants
  add constraint merchants_avatar_url_scoped check (
    avatar_url is null
    -- Berkas di bucket merchant-media, di dalam folder merchant ini sendiri.
    or avatar_url ~ (
      '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/merchant-media/'
      || id::text || '/[A-Za-z0-9._-]+$'
    )
    -- Foto bawaan signup Google.
    or avatar_url ~ '^https://lh[0-9]+\.googleusercontent\.com/[A-Za-z0-9._~/=-]+$'
  );

-- --- Trigger signup ikut menyaring ------------------------------------------
-- Sama persis dengan versi di 20260729000100_init_schema.sql, kecuali
-- `avatar_url` kini disaring: yang tidak dikenali disimpan sebagai NULL, bukan
-- membuat pendaftarannya gagal. Merchant tetap bisa mengunggah fotonya sendiri
-- setelah masuk.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  kandidat text;
begin
  kandidat := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'picture',
    ''
  )), '');

  -- Pola ini WAJIB sama dengan constraint merchants_avatar_url_scoped di atas.
  if kandidat is not null
     and kandidat !~ '^https://lh[0-9]+\.googleusercontent\.com/[A-Za-z0-9._~/=-]+$'
  then
    kandidat := null;
  end if;

  insert into public.merchants (id, full_name, avatar_url)
  values (
    new.id,
    nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    )), ''),
    kandidat
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;

notify pgrst, 'reload schema';
