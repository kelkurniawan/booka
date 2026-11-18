-- Panduan untuk halaman baru Tautan (links) dan Iklan (ads). save_onboarding_progress
-- hanya mengandalkan constraint ini untuk menolak kunci tur yang tidak dikenal.
alter table public.merchant_onboarding_progress
  drop constraint merchant_onboarding_progress_tours;
alter table public.merchant_onboarding_progress
  add constraint merchant_onboarding_progress_tours
  check (tours_seen <@ array['today', 'bookings', 'analytics', 'services', 'availability',
    'floor_plan', 'staff', 'payments', 'appearance', 'promo', 'domain', 'billing', 'settings',
    'links', 'ads']::text[]);
