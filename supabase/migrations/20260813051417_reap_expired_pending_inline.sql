-- ===========================================================================
-- Booking PENDING yang sudah kedaluwarsa tidak boleh lagi memakan kuota
-- maupun mengunci slot sambil menunggu cron.
--
-- MASALAH YANG DIPERBAIKI
-- Sampai sebelum migration ini, satu-satunya yang mengubah PENDING kedaluwarsa
-- menjadi CANCELLED adalah cron /api/cron/cancel-unpaid. Selama baris itu masih
-- PENDING:
--   * `count_bookings_this_month` tetap menghitungnya  -> kuota bulanan terpakai
--   * `get_booked_ranges` tetap mengembalikannya       -> slot hilang dari picker
--   * `bookings_no_overlap` tetap menganggapnya bentrok -> insert baru ditolak
--
-- Itu bisa diterima ketika cron jalan tiap 5 menit. Sejak jadwalnya turun jadi
-- SEKALI SEHARI (batas paket Vercel Hobby, lihat komentar di
-- src/app/api/cron/cancel-unpaid/route.ts), jendela itu melebar sampai 24 jam:
-- pelanggan yang membuka QRIS lalu pergi bisa mengunci satu slot seharian, dan
-- 10 percobaan iseng menghabiskan seluruh kuota bulanan merchant Starter.
--
-- PENDEKATAN
-- Kedaluwarsa diperlakukan sebagai keadaan yang dihitung dari `expires_at`,
-- bukan sesuatu yang baru "menjadi benar" setelah cron menulis. Tiga tempat
-- disesuaikan:
--   1. count_bookings_this_month -- PENDING kedaluwarsa tidak dihitung
--   2. get_booked_ranges         -- PENDING kedaluwarsa tidak menutup slot
--   3. create_booking            -- membatalkan PENDING kedaluwarsa milik
--      merchant ini lebih dulu, DI DALAM advisory lock, sebelum insert
--
-- Nomor 3 wajib ada. Constraint `bookings_no_overlap` tidak bisa ikut
-- memfilter `expires_at`: predikat partial index/exclusion harus IMMUTABLE,
-- sedangkan `now()` tidak. Jadi tanpa pembersihan nyata, insert baru tetap
-- ditolak 23P01 oleh baris basi walaupun picker sudah menampilkan slotnya
-- sebagai kosong. Karena pembersihan berjalan di dalam lock per merchant,
-- tidak ada balapan dengan booking lain milik merchant yang sama.
--
-- Cron tetap dipertahankan sebagai jaring pengaman untuk merchant yang lama
-- tidak menerima pesanan baru (tidak ada yang memicu pembersihan inline).
-- ===========================================================================

-- --- 1. Kuota: PENDING kedaluwarsa tidak dihitung ---------------------------
create or replace function public.count_bookings_this_month(p_merchant_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.bookings b
  where b.merchant_id = p_merchant_id
    and (
      b.status = 'PAID'
      -- PENDING hanya dihitung selama belum lewat batas bayarnya.
      or (b.status = 'PENDING' and b.expires_at > now())
    )
    and b.created_at >= (
      date_trunc('month', (now() at time zone 'Asia/Jakarta')) at time zone 'Asia/Jakarta'
    );
$$;

-- --- 2. Slot publik: PENDING kedaluwarsa tidak menutup slot -----------------
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
    and (
      b.status = 'PAID'
      or (b.status = 'PENDING' and b.expires_at > now())
    )
    and b.start_datetime < p_to
    and b.end_datetime > p_from
  order by b.start_datetime;
$$;

-- --- 3. create_booking: bersihkan dulu, baru insert -------------------------
create or replace function public.create_booking(
  p_merchant_id uuid,
  p_service_id uuid,
  p_start_datetime timestamptz,
  p_customer_name text,
  p_customer_whatsapp text
)
returns setof public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service record;
  v_end_datetime timestamptz;
  v_day_of_week integer;
  v_start_time time;
  v_end_time time;
  v_within_availability boolean;
begin
  -- a. Advisory lock per merchant.
  perform pg_advisory_xact_lock(hashtext(p_merchant_id::text));

  -- a2. Bersihkan booking PENDING milik merchant ini yang sudah lewat batas
  -- bayar. Dijalankan DI DALAM lock, jadi aman dari balapan dengan booking
  -- lain untuk merchant yang sama. Ini yang membebaskan slot dari
  -- bookings_no_overlap (yang tidak bisa memfilter expires_at sendiri) dan
  -- mengembalikan kuota, tanpa menunggu cron harian.
  update public.bookings
  set status = 'CANCELLED',
      cancelled_at = now(),
      cancel_reason = 'DP tidak dibayar dalam batas waktu'
  where merchant_id = p_merchant_id
    and status = 'PENDING'
    and expires_at <= now();

  -- Slot yang diminta tidak boleh berada di masa lalu.
  if p_start_datetime <= now() then
    raise exception 'Jam tersebut sudah lewat' using errcode = 'P0006';
  end if;

  -- Baca ulang layanan DI DALAM lock ini. merchant_id ikut difilter supaya
  -- service_id milik merchant lain tidak bisa dipakai membuat booking di
  -- kalender merchant ini.
  select s.name, s.price, s.duration_minutes, s.is_active
    into v_service
    from public.services s
    where s.id = p_service_id
      and s.merchant_id = p_merchant_id;

  if not found then
    raise exception 'Layanan tidak ditemukan' using errcode = 'P0005';
  end if;

  if not v_service.is_active then
    raise exception 'Layanan sudah tidak aktif' using errcode = 'P0005';
  end if;

  v_end_datetime := p_start_datetime + (v_service.duration_minutes || ' minutes')::interval;

  -- b. Slot wajib berada di dalam salah satu jam kerja merchant pada hari ISO
  -- yang sesuai. Wall-clock Jakarta, konsisten dengan src/lib/booking/slots.ts.
  v_day_of_week := extract(isodow from (p_start_datetime at time zone 'Asia/Jakarta'));
  v_start_time := (p_start_datetime at time zone 'Asia/Jakarta')::time;
  v_end_time := (v_end_datetime at time zone 'Asia/Jakarta')::time;

  select exists (
    select 1
    from public.availability a
    where a.merchant_id = p_merchant_id
      and a.day_of_week = v_day_of_week
      and a.start_time <= v_start_time
      and a.end_time >= v_end_time
  ) into v_within_availability;

  -- Booking yang melewati tengah malam Jakarta otomatis tertolak di sini.
  -- Errcode 'BK001', BUKAN 'P0004'.
  --
  -- 'P0004' adalah SQLSTATE bawaan PL/pgSQL `assert_failure`, dan PostgreSQL
  -- secara eksplisit TIDAK menangkapnya lewat `WHEN OTHERS` (sama seperti
  -- query_canceled) -- harus disebut namanya. Akibatnya, setiap pembungkus
  -- PL/pgSQL yang memakai `WHEN OTHERS` di sekitar create_booking akan
  -- meledak alih-alih menangani "di luar jam kerja" dengan rapi; itulah yang
  -- membuat kasus uji 11c di 99_verify.sql tidak pernah menghasilkan baris
  -- hasil sama sekali. Kode kustom di luar kelas 'P0' aman ditangkap.
  if not v_within_availability then
    raise exception 'Slot % - % (WIB) di luar jam kerja merchant', v_start_time, v_end_time
      using errcode = 'BK001';
  end if;

  -- c. Insert. bookings_no_overlap dan bookings_enforce_quota tetap jadi
  -- penjaga terakhir.
  return query
    insert into public.bookings (
      merchant_id,
      service_id,
      service_name,
      service_price,
      duration_minutes,
      start_datetime,
      end_datetime,
      customer_name,
      customer_whatsapp
    )
    values (
      p_merchant_id,
      p_service_id,
      v_service.name,
      v_service.price,
      v_service.duration_minutes,
      p_start_datetime,
      v_end_datetime,
      p_customer_name,
      p_customer_whatsapp
    )
    returning *;
end;
$$;

-- Grant ulang: CREATE OR REPLACE mempertahankan ACL, tapi ditulis eksplisit
-- supaya migration ini tetap benar kalau dijalankan di database bersih.
revoke execute on function public.create_booking(uuid, uuid, timestamptz, text, text) from public;
grant execute on function public.create_booking(uuid, uuid, timestamptz, text, text) to service_role;

revoke execute on function public.count_bookings_this_month(uuid) from public;

revoke execute on function public.get_booked_ranges(text, timestamptz, timestamptz) from public;
grant execute on function public.get_booked_ranges(text, timestamptz, timestamptz)
  to anon, authenticated, service_role;
