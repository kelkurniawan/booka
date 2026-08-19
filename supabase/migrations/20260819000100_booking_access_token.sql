-- ===========================================================================
-- Fondasi halaman /pesanan/[token] (Task 1 dari rencana Phase 5-6)
--
-- Booking pelanggan sampai sekarang cuma bisa dilihat lewat state klien di
-- /[username] -- tutup tab, hilang. access_token adalah kunci rahasia yang
-- nanti dipakai membuka /pesanan/[token] tanpa login, tanpa membocorkan PII
-- ke siapa pun yang menebak id booking (uuid booking sendiri BUKAN rahasia --
-- dipakai sebagai orderId di charge QRIS, lihat src/app/api/bookings/route.ts).
--
-- extensions.gen_random_bytes dipakai (bukan gen_random_uuid) supaya panjang
-- entropinya eksplisit dan tidak bergantung pada bagaimana pembuat UUID versi
-- Postgres mengalokasikan bit -- 24 byte acak -> 48 karakter hex -> 192 bit,
-- jauh di atas cukup untuk token URL yang tidak boleh ditebak.
--
-- Skema qualified `extensions.gen_random_bytes` (bukan gen_random_uuid yang
-- built-in sejak PG13): pgcrypto di-install ke schema `extensions`
-- (20260729000100_init_schema.sql), dan harness docker:test menjalankan
-- Postgres polos tanpa search_path yang menyertakan schema itu.
-- ===========================================================================

alter table public.bookings
  add column access_token text not null
    default encode(extensions.gen_random_bytes(24), 'hex');

create unique index bookings_access_token_key on public.bookings (access_token);

-- ---------------------------------------------------------------------------
-- Grant -- SENGAJA TIDAK ADA.
--
-- access_token seharusnya tidak pernah terbaca lewat query PostgREST biasa,
-- hanya lewat RPC create_booking (service role, di dalam POST /api/bookings)
-- dan nanti RPC khusus /pesanan/[token] yang menerima token sebagai
-- parameter, bukan membaca kolomnya.
--
-- TEMUAN: bookings di-grant TINGKAT TABEL, bukan per kolom --
-- `grant select on public.bookings to authenticated;` di
-- 20260729000100_init_schema.sql. Di Postgres, hak tingkat tabel tidak bisa
-- dipreteli per kolom lewat REVOKE (AGENTS.md), jadi access_token TIDAK BISA
-- disembunyikan dari `authenticated` tanpa menulis ulang seluruh model grant
-- tabel bookings (mis. revoke all + grant per kolom untuk semua kolom yang
-- sudah dipakai src/app/dashboard/bookings). Itu di luar cakupan migration
-- ini -- lihat task-1-report.md untuk detail dan rekomendasi tindak lanjut.
--
-- Dampaknya TERBATAS: RLS bookings_read_own membatasi authenticated hanya ke
-- baris booking miliknya sendiri, dan merchant yang sama sudah bisa melihat
-- customer_name/customer_whatsapp booking itu lewat dashboard -- access_token
-- bukan data baru yang bocor ke pihak yang sebelumnya tidak punya akses.
-- `anon` TETAP tidak dapat hak apa pun ke tabel ini (tidak ada perubahan).
-- ---------------------------------------------------------------------------
