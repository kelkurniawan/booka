-- ===========================================================================
-- Pengetatan path media dan penyimpanan FAQ yang aman gagal.
--
-- Dua hal yang diperbaiki:
--
-- 1. Path berkas datang dari browser dan sebelumnya diterima apa adanya.
--    `background_image_path` berakhir di dalam `url("...")` pada CSS halaman
--    publik, sehingga nilai seperti
--      x.webp"), url("https://pihak-ketiga/beacon.png
--    menghasilkan daftar background-image yang SAH menurut CSS -- halaman di
--    domain kita memuat URL pihak ketiga dan membocorkan IP pengunjung.
--    Path juga tidak dibatasi ke folder pemiliknya, padahal policy Storage
--    sudah membatasi penulisan berkasnya.
--
--    Ditegakkan di database, bukan cuma di Zod: kalau suatu saat ada jalur
--    tulis baru yang lupa memvalidasi, constraint ini tetap menahan.
--
-- 2. Penyimpanan FAQ sebelumnya menghapus seluruh baris lalu menyisipkan ulang
--    lewat dua panggilan terpisah. Kalau insert-nya ditolak (constraint atau
--    trigger batas), penghapusannya sudah terlanjur commit dan FAQ merchant
--    hilang. Sekarang dibungkus satu fungsi, jadi satu statement, jadi atomik.
-- ===========================================================================

-- --- 1. Path wajib berada di dalam folder merchant sendiri -------------------
-- Charset sengaja sempit: tanpa kutip, kurung, koma, dan spasi, tidak ada lagi
-- cara keluar dari url("...") di CSS. '..' ditolak terpisah supaya path tidak
-- bisa memanjat ke bucket lain.
alter table public.service_media
  add constraint service_media_path_scoped check (
    path ~ ('^' || merchant_id::text || '/[A-Za-z0-9._/-]+$')
    and path !~ '\.\.'
  ),
  add constraint service_media_poster_path_scoped check (
    poster_path is null
    or (
      poster_path ~ ('^' || merchant_id::text || '/[A-Za-z0-9._/-]+$')
      and poster_path !~ '\.\.'
    )
  );

alter table public.merchant_themes
  add constraint merchant_themes_background_path_scoped check (
    background_image_path is null
    or (
      background_image_path ~ ('^' || merchant_id::text || '/[A-Za-z0-9._/-]+$')
      and background_image_path !~ '\.\.'
    )
  );

-- --- 2. Penyimpanan FAQ dalam satu transaksi ---------------------------------
-- security invoker: RLS tetap berlaku, jadi merchant hanya bisa menyentuh
-- barisnya sendiri. Satu pemanggilan fungsi adalah satu statement, sehingga
-- delete dan insert di dalamnya berhasil bersama atau gagal bersama.
create or replace function public.replace_merchant_faqs(p_faqs jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Tidak ada sesi.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_faqs) <> 'array' then
    raise exception 'Data FAQ harus berupa array.' using errcode = '22023';
  end if;

  delete from public.merchant_faqs where merchant_id = uid;

  -- Trigger merchant_faqs_enforce_limit tetap menyala per baris. Karena
  -- penghapusan di atas ada dalam transaksi yang sama, hitungannya mulai dari
  -- nol -- dan baris kesebelas tetap ditolak, membatalkan seluruh pemanggilan.
  insert into public.merchant_faqs (merchant_id, question, answer, sort_order)
  select uid,
         item ->> 'question',
         item ->> 'answer',
         (urutan - 1)::integer
  from jsonb_array_elements(p_faqs) with ordinality as t(item, urutan);
end;
$$;

-- Fungsi baru tertutup secara default sejak 20260730000300. Ini dipanggil dari
-- Server Action dengan sesi merchant, jadi butuh grant eksplisit.
revoke execute on function public.replace_merchant_faqs(jsonb) from public;
grant execute on function public.replace_merchant_faqs(jsonb) to authenticated;

notify pgrst, 'reload schema';
