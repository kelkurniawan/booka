-- ===========================================================================
-- Task 1 rencana optimasi dashboard: index yang hilang + RPC agregat.
--
-- Dua index menutup sequential scan yang sampai sekarang tidak terhindarkan
-- untuk query pendapatan bulanan dan ledger yang difilter status. RPC-nya
-- menggantikan 4 query terpisah di bookings/page.tsx (bulan ini, pendapatan
-- terkonfirmasi, jumlah pending, ledger) dengan satu round-trip -- SUM
-- dipindah ke Postgres, bukan dihitung di client setelah fetch semua baris.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1a. Index yang hilang
--
-- Index yang sudah ada (lihat init_schema.sql:319-335) tidak diulang di
-- sini: bookings_merchant_start_idx (merchant_id, start_datetime desc),
-- bookings_pending_expiry_idx (expires_at) where status='PENDING',
-- bookings_merchant_created_idx (merchant_id, created_at desc).
-- ---------------------------------------------------------------------------

-- Query pendapatan bulanan memfilter paid_at, yang sampai sekarang tidak
-- punya index sama sekali -- satu-satunya jalan adalah sequential scan.
create index bookings_merchant_paid_idx
  on public.bookings (merchant_id, paid_at desc)
  where status = 'PAID';

-- Ledger yang difilter status (?status=PAID) dan jadwal terdekat di
-- Ringkasan. bookings_merchant_start_idx tidak memuat status, sehingga
-- setiap filter status harus memeriksa ulang tiap baris.
create index bookings_merchant_status_start_idx
  on public.bookings (merchant_id, status, start_datetime desc);

-- ---------------------------------------------------------------------------
-- 1b. RPC agregat
--
-- Tanpa parameter, merchant diambil dari (select auth.uid()) -- mengikuti
-- pola my_quota_usage() di 20260730000200_enforce_booking_quota.sql, supaya
-- SECURITY DEFINER-nya tidak bisa dipakai mengintip merchant lain.
--
-- bookings_this_month WAJIB sama persis dengan count_bookings_this_month
-- (lihat versi terbaru di 20260813051417_reap_expired_pending_inline.sql,
-- yang sudah mengecualikan PENDING kedaluwarsa). Fungsi itu DIPANGGIL
-- LANGSUNG di sini, bukan disalin ulang logikanya, supaya kedua angka itu
-- dijamin tidak pernah berbeda -- lihat tes t17c di 99_verify.sql.
--
-- Bentuk SELECT tanpa FROM (tiga sub-select skalar) menjamin hasilnya
-- selalu tepat satu baris, termasuk untuk merchant yang belum punya
-- booking sama sekali (coalesce menutup sum yang kosong, count(*) sub-select
-- selalu mengembalikan baris meski 0).
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_booking_summary()
returns table (
  bookings_this_month integer,
  confirmed_revenue numeric,
  pending_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.count_bookings_this_month((select auth.uid())),
    (
      select coalesce(sum(b.service_price), 0)
      from public.bookings b
      where b.merchant_id = (select auth.uid())
        and b.status = 'PAID'
        and b.paid_at >= (
          date_trunc('month', (now() at time zone 'Asia/Jakarta')) at time zone 'Asia/Jakarta'
        )
    ),
    (
      -- Tanpa batas bulan, meniru pendingResult yang sekarang di
      -- bookings/page.tsx: PENDING yang belum kedaluwarsa, apa pun bulan
      -- pembuatannya.
      select count(*)::integer
      from public.bookings b
      where b.merchant_id = (select auth.uid())
        and b.status = 'PENDING'
        and b.expires_at > now()
    );
$$;

-- ---------------------------------------------------------------------------
-- 1c. Grants
--
-- Fungsi baru tertutup secara default sejak
-- 20260730000300_lock_down_function_execute.sql -- REVOKE ... FROM PUBLIC
-- saja tidak mencabut grant langsung ke anon/authenticated, jadi keduanya
-- disebut eksplisit di sini.
-- ---------------------------------------------------------------------------
revoke execute on function public.dashboard_booking_summary() from public, anon;
grant execute on function public.dashboard_booking_summary() to authenticated;
