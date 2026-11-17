-- Indeks penutup untuk foreign key yang ditandai Supabase performance advisor
-- (unindexed_foreign_keys). Tanpa indeks ini, hapus merchant (fitur hapus
-- akun) dan hapus layanan/area/staf memindai seluruh tabel anak, dan query
-- per layanan atau per area di bookings ikut memindai penuh.
create index if not exists booking_attempts_merchant_idx on public.booking_attempts (merchant_id);
create index if not exists booking_reminder_prefs_merchant_idx on public.booking_reminder_prefs (merchant_id);
create index if not exists voucher_attempts_merchant_idx on public.voucher_attempts (merchant_id);
create index if not exists bookings_service_idx on public.bookings (service_id);
create index if not exists bookings_area_idx on public.bookings (area_id) where area_id is not null;
create index if not exists dining_tables_area_merchant_idx on public.dining_tables (area_id, merchant_id);
create index if not exists service_media_service_merchant_idx on public.service_media (service_id, merchant_id);
create index if not exists staff_availability_staff_merchant_idx on public.staff_availability (staff_id, merchant_id);
