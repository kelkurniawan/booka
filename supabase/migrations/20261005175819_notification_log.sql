-- ===========================================================================
-- Log notifikasi booking (email + WhatsApp).
--
-- Tabel ini sekaligus KUNCI IDEMPOTENSI. Gateway pembayaran me-retry webhook,
-- dan cron bisa terpanggil ulang; tanpa penanda, pelanggan menerima pesan
-- "pembayaran diterima" berkali-kali. Pengirim lebih dulu menyisipkan baris
-- (booking_id, kind, channel) berstatus PENDING -- unique constraint memastikan
-- hanya satu pemanggil yang menang -- baru kemudian mengirim dan memperbarui
-- statusnya.
--
-- Ditulis HANYA oleh service role (webhook, cron). Merchant boleh membaca log
-- miliknya sendiri supaya detail booking bisa menunjukkan pesan mana yang
-- sudah terkirim.
-- ===========================================================================

create type public.notification_kind as enum (
  'BOOKING_PAID_MERCHANT',
  'BOOKING_PAID_CUSTOMER',
  'REMINDER_CUSTOMER'
);

create type public.notification_channel as enum ('EMAIL', 'WHATSAPP');

create type public.notification_status as enum ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  kind public.notification_kind not null,
  channel public.notification_channel not null,
  status public.notification_status not null default 'PENDING',
  -- Alasan gagal/dilewati yang sudah dirangkai pengirim, bukan body mentah
  -- penyedia (bisa memuat nomor tujuan).
  detail text check (detail is null or char_length(detail) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_log_once unique (booking_id, kind, channel)
);

create index notification_log_merchant_idx on public.notification_log (merchant_id, created_at desc);

create trigger notification_log_set_updated_at
  before update on public.notification_log
  for each row execute function public.set_updated_at();

alter table public.notification_log enable row level security;

revoke all on public.notification_log from anon, authenticated;
grant select on public.notification_log to authenticated;

create policy "notification_log_read_own"
  on public.notification_log for select
  to authenticated
  using (merchant_id = (select auth.uid()));
