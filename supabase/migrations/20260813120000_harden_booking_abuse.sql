-- ===========================================================================
-- Pengerasan terhadap penyalahgunaan endpoint booking publik.
--
-- Menutup dua hal yang sebelumnya sengaja ditunda:
--   1. POST /api/bookings tidak punya rate limit sama sekali
--   2. Pembersihan booking kedaluwarsa bergantung pada cron Vercel yang --
--      sejak turun ke paket Hobby -- hanya boleh jalan SEKALI SEHARI
--
-- Keduanya saling menguatkan: tanpa rate limit, penyerang bisa membuat
-- booking beruntun; dan selama booking itu belum dibersihkan, slotnya
-- terkunci dan kuota bulanan merchant terpakai.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Rate limit percobaan booking
--
-- Disimpan sebagai hash, BUKAN alamat IP mentah: nilai ini tidak pernah perlu
-- dibaca balik, hanya dicocokkan, dan menyimpan IP mentah pelanggan berarti
-- menyimpan data pribadi tanpa alasan.
-- ---------------------------------------------------------------------------
create table public.booking_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Satu-satunya pola query: "berapa percobaan dari ip+merchant ini sejak X".
create index booking_attempts_lookup_idx
  on public.booking_attempts (ip_hash, merchant_id, created_at desc);

-- Dipakai pembersihan berkala.
create index booking_attempts_created_idx
  on public.booking_attempts (created_at);

-- Tabel ini hanya disentuh service role lewat fungsi di bawah. Supabase
-- memberi ALL pada tabel baru di `public` lewat ALTER DEFAULT PRIVILEGES,
-- jadi harus dicabut eksplisit.
revoke all on public.booking_attempts from anon, authenticated;
alter table public.booking_attempts enable row level security;


/**
 * Mencatat satu percobaan booking dan melaporkan apakah masih di bawah batas.
 *
 * Batas: 3 percobaan per (ip, merchant) per 15 menit. Angka 15 menit sengaja
 * disamakan dengan masa berlaku pembayaran booking (`expires_at`), supaya
 * jendela rate limit dan jendela "slot masih tertahan" selalu sama panjang --
 * penyerang tidak bisa menahan slot lebih lama daripada yang bisa ia buat.
 *
 * Tiga percobaan cukup longgar untuk pelanggan sungguhan (yang biasanya
 * memesan sekali, dan sesekali mengulang karena salah isi form), tapi
 * membuat penghabisan kuota bulanan paket STARTER (10 transaksi) butuh
 * beberapa jam dan beberapa alamat IP, bukan beberapa detik dari satu mesin.
 *
 * Mengembalikan true kalau permintaan boleh lanjut.
 */
create or replace function public.check_booking_rate_limit(
  p_ip_hash text,
  p_merchant_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window constant interval := interval '15 minutes';
  v_max constant integer := 3;
  v_recent integer;
begin
  -- Tanpa identitas pemanggil, rate limit tidak bisa ditegakkan. Membiarkan
  -- lewat lebih aman daripada memblokir semua orang kalau header proxy
  -- hilang, tapi kasus ini dicatat supaya terlihat kalau sering terjadi.
  if p_ip_hash is null or p_ip_hash = '' then
    raise warning 'check_booking_rate_limit dipanggil tanpa ip_hash';
    return true;
  end if;

  insert into public.booking_attempts (ip_hash, merchant_id)
  values (p_ip_hash, p_merchant_id);

  select count(*) into v_recent
  from public.booking_attempts
  where ip_hash = p_ip_hash
    and merchant_id = p_merchant_id
    and created_at > now() - v_window;

  return v_recent <= v_max;
end;
$$;


-- ---------------------------------------------------------------------------
-- 2. Pembersihan berkala di dalam database
--
-- create_booking sudah membersihkan booking kedaluwarsa milik merchant yang
-- sedang dipesan (migration sebelumnya), tapi itu hanya terpicu kalau ada
-- pesanan baru. Merchant yang sepi tidak pernah terbersihkan, dan cron Vercel
-- pada paket Hobby cuma jalan sekali sehari.
--
-- pg_cron menjalankannya tiap 5 menit langsung di database: tanpa HTTP, tanpa
-- batas paket hosting, dan tanpa bergantung pada CRON_SECRET.
-- ---------------------------------------------------------------------------

/**
 * Membatalkan semua booking PENDING yang sudah lewat batas bayar, lintas
 * merchant. Mengembalikan jumlah baris yang dibatalkan supaya hasil tiap
 * jalannya bisa dilihat di `cron.job_run_details`.
 */
create or replace function public.reap_expired_bookings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.bookings
  set status = 'CANCELLED',
      cancelled_at = now(),
      cancel_reason = 'DP tidak dibayar dalam batas waktu'
  where status = 'PENDING'
    and expires_at <= now();

  get diagnostics v_count = row_count;

  -- Sekalian buang jejak rate limit yang sudah tidak relevan, supaya tabelnya
  -- tidak tumbuh selamanya. Ambang 1 jam jauh di atas jendela 15 menit.
  delete from public.booking_attempts where created_at < now() - interval '1 hour';

  return v_count;
end;
$$;


-- Penjadwalan dibungkus pengecekan ketersediaan: harness uji lokal memakai
-- image postgres polos yang TIDAK punya pg_cron, dan tanpa penjagaan ini
-- seluruh migration akan gagal di sana. Dynamic SQL dipakai karena schema
-- `cron` belum tentu ada saat migration ini di-parse.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';

    -- cron.schedule dengan nama job bersifat upsert sejak pg_cron 1.4, jadi
    -- migration ini aman dijalankan ulang.
    execute $cron$
      select cron.schedule(
        'reap-expired-bookings',
        '*/5 * * * *',
        'select public.reap_expired_bookings()'
      )
    $cron$;

    raise notice 'pg_cron: job reap-expired-bookings dijadwalkan tiap 5 menit';
  else
    raise notice 'pg_cron tidak tersedia di server ini -- penjadwalan dilewati (normal untuk harness uji lokal)';
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- Grants
-- Kedua fungsi hanya dipanggil service role (API route) atau scheduler.
-- ---------------------------------------------------------------------------
revoke execute on function public.check_booking_rate_limit(text, uuid) from public;
grant execute on function public.check_booking_rate_limit(text, uuid) to service_role;

revoke execute on function public.reap_expired_bookings() from public;
grant execute on function public.reap_expired_bookings() to service_role;
