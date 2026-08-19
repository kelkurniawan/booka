-- ===========================================================================
-- Pembatalan booking oleh merchant (Task 2 dari rencana Phase 5-6: ledger
-- /dashboard/bookings)
--
-- Sampai migration ini, `authenticated` hanya punya SELECT ke public.bookings
-- (grant tabel di 20260729000100_init_schema.sql, policy `bookings_read_own`
-- di 20260729000200_rls_policies.sql) -- tidak ada UPDATE sama sekali, jadi
-- merchant tidak bisa membatalkan booking miliknya sendiri lewat
-- src/app/dashboard/bookings/actions.ts. Migration ini menambah persis yang
-- dibutuhkan untuk itu, tidak lebih:
--
--   1. GRANT UPDATE per kolom (BUKAN grant tabel, beda dengan SELECT yang
--      sudah terlanjur tingkat tabel -- lihat catatan di
--      20260819000100_booking_access_token.sql) untuk tiga kolom yang
--      benar-benar diubah pembatalan: status, cancelled_at, cancel_reason.
--   2. Policy RLS "bookings_cancel_own" yang membatasi UPDATE hanya ke baris
--      milik merchant yang login (USING), DAN memaksa status baru SELALU
--      'CANCELLED' (WITH CHECK) -- mencegah merchant memalsukan status
--      pembayaran (mis. mengubah status jadi 'PAID' lewat request yang
--      dibuat tangan) meski kolom status sudah ter-grant UPDATE untuknya.
--
-- Kolom mana yang boleh diupdate (dan ke nilai apa) tetap dijaga berlapis:
-- GRANT per kolom di sini, WITH CHECK di bawah, dan filter eksplisit
-- `.eq("id", ...).eq("merchant_id", ...).in("status", [...])` di
-- actions.ts -- kepemilikan ditegakkan oleh filter + RLS bersama, bukan oleh
-- pemeriksaan terpisah di kode aplikasi sebelum update dikirim.
-- ===========================================================================

grant update (status, cancelled_at, cancel_reason) on public.bookings to authenticated;

create policy "bookings_cancel_own"
  on public.bookings
  for update
  to authenticated
  using ((select auth.uid()) = merchant_id)
  with check ((select auth.uid()) = merchant_id and status = 'CANCELLED');
