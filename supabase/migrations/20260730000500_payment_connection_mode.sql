-- ===========================================================================
-- Membedakan kredensial hasil OAuth dari Server Key yang di-paste manual, dan
-- menandai apakah koneksi mengarah ke akun sandbox atau produksi provider.
--
-- Dibutuhkan sebelum halaman Pembayaran (Task 4) bisa membedakan alur "Connect
-- with Xendit/Midtrans" (OAUTH) dari alur tempel Server Key manual
-- (MANUAL_KEY), dan supaya merchant tidak salah pakai kredensial sandbox saat
-- production atau sebaliknya.
-- ===========================================================================

create type public.connection_mode as enum ('OAUTH', 'MANUAL_KEY');
create type public.payment_environment as enum ('SANDBOX', 'PRODUCTION');

alter table public.payment_connections
  add column connection_mode public.connection_mode not null default 'MANUAL_KEY',
  add column environment public.payment_environment not null default 'SANDBOX';

-- Kolom baru pada tabel yang sudah ada tidak otomatis ikut grant `select`
-- yang dipasang migration awal — grant di sana per kolom, bukan per tabel,
-- jadi kolom baru butuh grant sendiri. Policy `payment_connections_read_own`
-- (20260729000200_rls_policies.sql) sudah membatasi baris ke milik merchant
-- sendiri; ini hanya membuka akses kolomnya.
grant select (connection_mode, environment)
  on public.payment_connections to authenticated;
