-- ===========================================================================
-- Task 1 rencana optimasi dashboard: index yang hilang + RPC agregat.
--
-- Dua index menutup sequential scan yang sampai sekarang tidak terhindarkan
-- untuk query pendapatan bulanan dan ledger yang difilter status. RPC-nya
-- menggantikan 4 query kartu ringkasan terpisah di bookings/page.tsx (PAID
-- bulan ini, PENDING bulan ini, pendapatan terkonfirmasi, jumlah pending)
-- dengan satu round-trip -- SUM dipindah ke Postgres, bukan dihitung di
-- client setelah fetch semua baris. Query ledger (tabel booking yang
-- dipaginasi) TIDAK termasuk di sini -- itu tetap query tersendiri, lihat
-- bookings-list.tsx.
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
      -- Batas awal bulan berjalan di Asia/Jakarta (UTC+7, TETAP, tanpa DST
      -- -- Indonesia tidak pernah menerapkan pergantian musim untuk WIB).
      -- `now() at time zone 'Asia/Jakarta'` menggeser instant now() ke jam
      -- dinding Jakarta (dibaca sebagai timestamp TANPA zona), date_trunc
      -- memotongnya ke awal bulan pada jam dinding itu, lalu `at time zone
      -- 'Asia/Jakarta'` yang kedua menafsirkan hasilnya SEBAGAI jam dinding
      -- Jakarta dan mengembalikannya ke timestamptz UTC untuk dibandingkan
      -- dengan paid_at. Sebelum RPC ini ada, perhitungan yang setara
      -- dilakukan di TypeScript oleh startOfMonthJakartaIso di
      -- src/app/dashboard/bookings/page.tsx -- dipindah ke sini begitu
      -- query pendapatan pindah ke RPC, supaya tidak ada dua sumber
      -- kebenaran soal "awal bulan ini" di codebase. SENGAJA memakai cara
      -- yang sama (geser +7 jam / date_trunc di zona Jakarta) seperti
      -- count_bookings_this_month (20260813051417_reap_expired_pending_inline.sql)
      -- supaya "bulan ini" untuk kartu pendapatan dan kartu booking bulan
      -- ini konsisten satu sama lain.
      select coalesce(sum(b.service_price), 0)
      from public.bookings b
      where b.merchant_id = (select auth.uid())
        and b.status = 'PAID'
        and b.paid_at >= (
          date_trunc('month', (now() at time zone 'Asia/Jakarta')) at time zone 'Asia/Jakarta'
        )
    ),
    (
      -- Tanpa batas bulan -- sebelum RPC ini ada, ini adalah query
      -- pendingResult terpisah di bookings/page.tsx (kini digantikan
      -- RPC ini sepenuhnya, lihat bookings-summary.tsx): PENDING yang
      -- belum kedaluwarsa, apa pun bulan pembuatannya.
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
