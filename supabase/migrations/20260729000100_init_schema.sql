-- ===========================================================================
-- Smart Booking & Invoicing SaaS — Skema Awal
-- Referensi: docs/PRD-Smart-Booking-Invoicing-SaaS-V3.md bagian 4
-- ===========================================================================

-- --- Extensions ------------------------------------------------------------
create extension if not exists "pgcrypto" with schema extensions;
-- btree_gist dibutuhkan agar kolom scalar (uuid, integer) bisa ikut dalam
-- exclusion constraint bersama tipe range.
create extension if not exists "btree_gist" with schema extensions;

-- --- Schema privat ---------------------------------------------------------
-- Schema ini sengaja TIDAK didaftarkan ke "Exposed schemas" Supabase, sehingga
-- isinya tidak bisa disentuh lewat PostgREST dengan kunci apa pun dari browser.
-- Token payment gateway milik merchant disimpan di sini.
create schema if not exists private;
revoke all on schema private from anon, authenticated;

-- --- Tipe --------------------------------------------------------------------
create type public.subscription_tier as enum ('STARTER', 'PRO', 'STUDIO');
create type public.booking_status as enum ('PENDING', 'PAID', 'CANCELLED');
create type public.payment_provider as enum ('MIDTRANS', 'XENDIT');
create type public.connection_status as enum ('ACTIVE', 'EXPIRED', 'REVOKED');

-- Postgres tidak menyediakan range untuk tipe `time`, jadi kita buat sendiri.
-- Dipakai untuk mencegah jam kerja yang saling tumpang tindih.
create type public.timerange as range (subtype = time);

-- --- Helper: updated_at ------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ===========================================================================
-- Table: reserved_usernames
-- Username merchant dipakai sebagai segmen URL paling atas (/[username]),
-- jadi kata yang bentrok dengan route aplikasi harus diblokir di level DB.
-- ===========================================================================
create table public.reserved_usernames (
  name text primary key
);

insert into public.reserved_usernames (name) values
  ('_next'), ('about'), ('admin'), ('api'), ('app'), ('assets'), ('auth'),
  ('billing'), ('blog'), ('book'), ('booking'), ('bookings'), ('cdn'),
  ('checkout'), ('contact'), ('cron'), ('dashboard'), ('docs'), ('help'),
  ('home'), ('images'), ('invoice'), ('invoices'), ('login'), ('logout'),
  ('me'), ('new'), ('onboarding'), ('payment'), ('payments'), ('pricing'),
  ('privacy'), ('public'), ('register'), ('root'), ('settings'), ('signin'),
  ('signup'), ('static'), ('status'), ('support'), ('terms'), ('u'),
  ('undefined'), ('null'), ('webhook'), ('webhooks'), ('www');

-- ===========================================================================
-- Table: merchants
-- Profil merchant, 1:1 dengan auth.users.
-- `username` sengaja NULLABLE: baris dibuat otomatis saat signup, lalu diisi
-- pada halaman onboarding. Middleware memaksa onboarding selama masih NULL.
-- ===========================================================================
create table public.merchants (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  full_name text,
  whatsapp_number text,
  bio text,
  avatar_url text,
  subscription_tier public.subscription_tier not null default 'STARTER',
  -- Provider mana yang dipakai saat men-generate QRIS. NULL = belum connect.
  active_payment_provider public.payment_provider,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 3–30 karakter, huruf kecil/angka/tanda hubung, tidak diawali/diakhiri '-'.
  constraint merchants_username_format check (
    username is null
    or username ~ '^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$'
  ),
  constraint merchants_full_name_length check (
    full_name is null or char_length(full_name) between 2 and 80
  ),
  constraint merchants_bio_length check (
    bio is null or char_length(bio) <= 300
  ),
  -- Nomor disimpan dalam format E.164, misal +6281234567890.
  constraint merchants_whatsapp_format check (
    whatsapp_number is null or whatsapp_number ~ '^\+[1-9][0-9]{7,14}$'
  )
);

create trigger merchants_set_updated_at
  before update on public.merchants
  for each row execute function public.set_updated_at();

-- Tolak username yang bentrok dengan route aplikasi.
create or replace function public.reject_reserved_username()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.username is not null
     and exists (select 1 from public.reserved_usernames r where r.name = new.username)
  then
    raise exception 'Username "%" sudah dipakai sistem', new.username
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger merchants_reject_reserved_username
  before insert or update of username on public.merchants
  for each row execute function public.reject_reserved_username();

-- Buat baris merchant otomatis begitu user mendaftar lewat Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.merchants (id, full_name, avatar_url)
  values (
    new.id,
    nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    )), ''),
    nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture',
      ''
    )), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- Table: services
-- ===========================================================================
create table public.services (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  name text not null,
  description text,
  price numeric(12, 2) not null,
  duration_minutes integer not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint services_name_length check (char_length(trim(name)) between 2 and 80),
  constraint services_description_length check (
    description is null or char_length(description) <= 500
  ),
  constraint services_price_non_negative check (price >= 0),
  -- 5 menit sampai 8 jam.
  constraint services_duration_range check (duration_minutes between 5 and 480)
);

create index services_merchant_active_idx
  on public.services (merchant_id, sort_order)
  where is_active;

create trigger services_set_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

-- Batas jumlah layanan per paket langganan (PRD bagian 1).
-- STARTER dibatasi 1 layanan; PRO & STUDIO unlimited.
create or replace function public.enforce_service_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tier public.subscription_tier;
  current_count integer;
  max_allowed integer;
begin
  select m.subscription_tier into tier
  from public.merchants m
  where m.id = new.merchant_id;

  max_allowed := case tier when 'STARTER' then 1 else null end;

  if max_allowed is null then
    return new;
  end if;

  select count(*) into current_count
  from public.services s
  where s.merchant_id = new.merchant_id;

  if current_count >= max_allowed then
    raise exception 'Paket % hanya mengizinkan % layanan. Upgrade untuk menambah layanan.',
      tier, max_allowed
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger services_enforce_limit
  before insert on public.services
  for each row execute function public.enforce_service_limit();

-- ===========================================================================
-- Table: availability
-- Jam kerja mingguan. day_of_week mengikuti ISO-8601: 1 = Senin ... 7 = Minggu
-- (sama dengan hasil `extract(isodow from ...)` di Postgres).
-- ===========================================================================
create table public.availability (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  day_of_week integer not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint availability_day_range check (day_of_week between 1 and 7),
  constraint availability_time_order check (end_time > start_time),

  -- Dua rentang jam pada hari yang sama tidak boleh tumpang tindih.
  constraint availability_no_overlap exclude using gist (
    merchant_id with =,
    day_of_week with =,
    public.timerange(start_time, end_time, '[)') with &&
  )
);

create index availability_merchant_day_idx
  on public.availability (merchant_id, day_of_week, start_time);

create trigger availability_set_updated_at
  before update on public.availability
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- Table: bookings
--
-- Kolom snapshot (service_name / service_price / duration_minutes) disimpan
-- agar riwayat booking tetap utuh walaupun merchant kemudian mengubah harga
-- atau menghapus layanannya.
-- ===========================================================================
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  service_id uuid references public.services (id) on delete set null,

  service_name text not null,
  service_price numeric(12, 2) not null,
  duration_minutes integer not null,

  start_datetime timestamptz not null,
  end_datetime timestamptz not null,

  customer_name text not null,
  customer_whatsapp text not null,

  status public.booking_status not null default 'PENDING',

  payment_provider public.payment_provider,
  payment_url text,
  -- order_id / external_id yang dikirim ke payment gateway.
  payment_reference text,
  paid_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,

  -- Batas waktu pembayaran. Cron membatalkan PENDING yang sudah lewat.
  expires_at timestamptz not null default (now() + interval '15 minutes'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint bookings_time_order check (end_datetime > start_datetime),
  constraint bookings_customer_name_length check (
    char_length(trim(customer_name)) between 2 and 80
  ),
  constraint bookings_customer_whatsapp_format check (
    customer_whatsapp ~ '^\+[1-9][0-9]{7,14}$'
  ),
  constraint bookings_price_non_negative check (service_price >= 0),

  -- ---------------------------------------------------------------------
  -- Jaminan anti double-booking di level database.
  --
  -- Pessimistic locking (SELECT ... FOR UPDATE) di API route tetap dipakai
  -- pada Phase 5 untuk menghasilkan pesan error yang ramah, tetapi constraint
  -- inilah yang membuat slot bentrok mustahil tersimpan — termasuk kalau ada
  -- request yang lolos lewat jalur lain atau race condition di aplikasi.
  -- ---------------------------------------------------------------------
  constraint bookings_no_overlap exclude using gist (
    merchant_id with =,
    tstzrange(start_datetime, end_datetime, '[)') with &&
  ) where (status in ('PENDING', 'PAID'))
);

-- Ledger merchant: urut berdasarkan jadwal.
create index bookings_merchant_start_idx
  on public.bookings (merchant_id, start_datetime desc);

-- Cron auto-cancel: cari PENDING yang sudah kedaluwarsa.
create index bookings_pending_expiry_idx
  on public.bookings (expires_at)
  where status = 'PENDING';

-- Perhitungan kuota transaksi bulanan paket STARTER.
create index bookings_merchant_created_idx
  on public.bookings (merchant_id, created_at desc);

-- Lookup dari webhook payment gateway.
create unique index bookings_payment_reference_key
  on public.bookings (payment_reference)
  where payment_reference is not null;

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- Table: payment_connections (metadata) + private.payment_credentials (rahasia)
--
-- Pemisahan disengaja: metadata koneksi boleh dibaca merchant pemiliknya untuk
-- ditampilkan di dashboard, sementara access/refresh token berada di schema
-- `private` yang tidak diekspos PostgREST — hanya kode server (service role)
-- yang bisa membacanya, dan isinya pun sudah terenkripsi AES-256-GCM.
-- ===========================================================================
create table public.payment_connections (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  provider public.payment_provider not null,
  -- ID akun merchant di sisi provider (Midtrans merchant_id / Xendit user id).
  provider_account_id text,
  status public.connection_status not null default 'ACTIVE',
  scope text,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payment_connections_unique_provider unique (merchant_id, provider)
);

create trigger payment_connections_set_updated_at
  before update on public.payment_connections
  for each row execute function public.set_updated_at();

create table private.payment_credentials (
  connection_id uuid primary key
    references public.payment_connections (id) on delete cascade,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  updated_at timestamptz not null default now()
);

create trigger payment_credentials_set_updated_at
  before update on private.payment_credentials
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- Fungsi publik: rentang waktu yang sudah terisi
--
-- PRD meminta pengunjung anonim bisa "cek bentrok". Memberi anon hak SELECT
-- ke tabel bookings akan membocorkan nama & nomor WhatsApp customer lain,
-- jadi aksesnya dibungkus fungsi SECURITY DEFINER yang hanya mengembalikan
-- pasangan waktu mulai/selesai — tanpa data pribadi apa pun.
-- ===========================================================================
create or replace function public.get_booked_ranges(
  p_username text,
  p_from timestamptz,
  p_to timestamptz
)
returns table (start_datetime timestamptz, end_datetime timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.start_datetime, b.end_datetime
  from public.bookings b
  join public.merchants m on m.id = b.merchant_id
  where m.username = p_username
    and b.status in ('PENDING', 'PAID')
    and b.start_datetime < p_to
    and b.end_datetime > p_from
  order by b.start_datetime;
$$;

-- ===========================================================================
-- Grants
--
-- Supabase memasang ALTER DEFAULT PRIVILEGES yang memberi ALL pada tabel baru
-- di schema `public` kepada anon & authenticated. Karena itu setiap tabel
-- di-REVOKE dulu sampai bersih, baru diberi hak seminimal yang dibutuhkan.
-- RLS adalah lapisan kedua; grant inilah lapisan pertama.
-- ===========================================================================
grant usage on schema public to anon, authenticated;

revoke all on public.reserved_usernames from anon, authenticated;
revoke all on public.merchants from anon, authenticated;
revoke all on public.services from anon, authenticated;
revoke all on public.availability from anon, authenticated;
revoke all on public.bookings from anon, authenticated;
revoke all on public.payment_connections from anon, authenticated;

grant select on public.reserved_usernames to anon, authenticated;

-- --- merchants -------------------------------------------------------------
-- Nomor WhatsApp merchant bukan data publik. Halaman booking hanya butuh
-- identitas tampilan + tier (untuk menentukan watermark paket Starter).
-- Grant per kolom, bukan grant tabel lalu revoke: di Postgres, hak di level
-- tabel mencakup semua kolom dan tidak bisa dipreteli lewat REVOKE per kolom.
grant select (id, username, full_name, bio, avatar_url, subscription_tier)
  on public.merchants to anon;

grant select on public.merchants to authenticated;
grant insert on public.merchants to authenticated;

-- Kolom yang boleh diubah merchant dari browser. `subscription_tier` dan
-- `active_payment_provider` sengaja tidak masuk: keduanya hanya berubah lewat
-- alur billing / OAuth callback di server (service role).
grant update (username, full_name, whatsapp_number, bio, avatar_url, onboarded_at)
  on public.merchants to authenticated;

-- --- services & availability ------------------------------------------------
grant select on public.services to anon;
grant select, insert, update, delete on public.services to authenticated;

grant select on public.availability to anon;
grant select, insert, update, delete on public.availability to authenticated;

-- --- bookings ---------------------------------------------------------------
-- Pembuatan booking berjalan lewat POST /api/bookings (service role) karena
-- harus satu transaksi dengan pengecekan bentrok dan pemanggilan payment
-- gateway. Anon tidak mendapat hak apa pun ke tabel ini.
grant select on public.bookings to authenticated;

-- --- payment_connections ----------------------------------------------------
-- Hanya baca metadata; token-nya berada di private.payment_credentials.
grant select on public.payment_connections to authenticated;

grant execute on function public.get_booked_ranges(text, timestamptz, timestamptz)
  to anon, authenticated;
