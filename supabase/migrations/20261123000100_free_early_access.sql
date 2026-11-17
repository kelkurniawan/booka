-- Masa awal gratis: produk masih tahap awal, jadi semua merchant mendapat
-- akses penuh (tier STUDIO) tanpa biaya. Seluruh penegakan tier di database
-- (kuota, batas layanan, tema, voucher, staf, domain, dst.) tidak diubah dan
-- tetap hidup; untuk menagih lagi, ubah subscription_tier per merchant (dan
-- kembalikan default kolom ini bila perlu).
--
-- `handle_new_user` dan backfill tidak menyebut tier, jadi default kolom
-- cukup untuk merchant baru. Tidak ada trigger yang memblokir update tier
-- (hak UPDATE kolom ini memang hanya untuk service role / migration).
alter table public.merchants
  alter column subscription_tier set default 'STUDIO';

update public.merchants
set subscription_tier = 'STUDIO'
where subscription_tier <> 'STUDIO';
