-- ===========================================================================
-- Row Level Security
--
-- Aturan main:
--   * Halaman publik (/[username]) dibaca memakai klien anon TANPA sesi,
--     lewat `createPublicClient()`. Karena itu policy `anon` dan policy
--     `authenticated` bisa dipisah tegas — merchant yang sedang login tetap
--     tidak bisa membaca baris milik merchant lain.
--   * Penulisan booking berjalan di server dengan service role, yang melewati
--     RLS, karena harus satu transaksi dengan pengecekan bentrok.
-- ===========================================================================

alter table public.reserved_usernames enable row level security;
alter table public.merchants enable row level security;
alter table public.services enable row level security;
alter table public.availability enable row level security;
alter table public.bookings enable row level security;
alter table public.payment_connections enable row level security;
alter table private.payment_credentials enable row level security;

-- ---------------------------------------------------------------------------
-- reserved_usernames — hanya perlu dibaca untuk validasi form onboarding.
-- ---------------------------------------------------------------------------
create policy "reserved_usernames_read_all"
  on public.reserved_usernames
  for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- merchants
-- ---------------------------------------------------------------------------

-- Profil publik: hanya merchant yang sudah menyelesaikan onboarding
-- (username terisi) yang muncul. Kolom yang terbaca dibatasi lewat GRANT
-- per kolom di migration sebelumnya — `whatsapp_number` tidak termasuk.
create policy "merchants_public_read"
  on public.merchants
  for select
  to anon
  using (username is not null);

create policy "merchants_read_own"
  on public.merchants
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "merchants_insert_own"
  on public.merchants
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "merchants_update_own"
  on public.merchants
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------------

create policy "services_public_read"
  on public.services
  for select
  to anon
  using (
    is_active
    and exists (
      select 1
      from public.merchants m
      where m.id = services.merchant_id
        and m.username is not null
    )
  );

create policy "services_read_own"
  on public.services
  for select
  to authenticated
  using ((select auth.uid()) = merchant_id);

create policy "services_insert_own"
  on public.services
  for insert
  to authenticated
  with check ((select auth.uid()) = merchant_id);

create policy "services_update_own"
  on public.services
  for update
  to authenticated
  using ((select auth.uid()) = merchant_id)
  with check ((select auth.uid()) = merchant_id);

create policy "services_delete_own"
  on public.services
  for delete
  to authenticated
  using ((select auth.uid()) = merchant_id);

-- ---------------------------------------------------------------------------
-- availability
-- ---------------------------------------------------------------------------

create policy "availability_public_read"
  on public.availability
  for select
  to anon
  using (
    exists (
      select 1
      from public.merchants m
      where m.id = availability.merchant_id
        and m.username is not null
    )
  );

create policy "availability_read_own"
  on public.availability
  for select
  to authenticated
  using ((select auth.uid()) = merchant_id);

create policy "availability_insert_own"
  on public.availability
  for insert
  to authenticated
  with check ((select auth.uid()) = merchant_id);

create policy "availability_update_own"
  on public.availability
  for update
  to authenticated
  using ((select auth.uid()) = merchant_id)
  with check ((select auth.uid()) = merchant_id);

create policy "availability_delete_own"
  on public.availability
  for delete
  to authenticated
  using ((select auth.uid()) = merchant_id);

-- ---------------------------------------------------------------------------
-- bookings
--
-- Merchant hanya melihat booking miliknya sendiri. Pengunjung anonim tidak
-- punya policy sama sekali: pengecekan slot bentrok memakai fungsi
-- public.get_booked_ranges() yang hanya mengembalikan waktu, tanpa nama atau
-- nomor WhatsApp customer.
-- ---------------------------------------------------------------------------

create policy "bookings_read_own"
  on public.bookings
  for select
  to authenticated
  using ((select auth.uid()) = merchant_id);

-- ---------------------------------------------------------------------------
-- payment_connections — metadata koneksi, tanpa token.
-- ---------------------------------------------------------------------------

create policy "payment_connections_read_own"
  on public.payment_connections
  for select
  to authenticated
  using ((select auth.uid()) = merchant_id);

-- ---------------------------------------------------------------------------
-- private.payment_credentials
--
-- RLS aktif tanpa satu pun policy: tidak ada peran selain service role
-- (yang melewati RLS) yang bisa menyentuh baris di sini. Schema `private`
-- juga tidak boleh didaftarkan sebagai exposed schema di Supabase.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- Hardening fungsi
-- Postgres memberi EXECUTE ke PUBLIC secara default untuk setiap fungsi baru.
-- ===========================================================================
revoke execute on function public.get_booked_ranges(text, timestamptz, timestamptz)
  from public;
grant execute on function public.get_booked_ranges(text, timestamptz, timestamptz)
  to anon, authenticated, service_role;

revoke execute on function public.set_updated_at() from public;
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.reject_reserved_username() from public;
revoke execute on function public.enforce_service_limit() from public;
