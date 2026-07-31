-- ===========================================================================
-- Booking engine fix round 1: create_booking() menolak slot yang sudah lewat
-- (Task 8, fix round 1).
--
-- Bug: create_booking() memverifikasi slot berada di dalam jam kerja
-- (availability), tapi tidak pernah memverifikasi slot itu ada di MASA
-- DEPAN. Skenario: merchant buka Senin 09:00-17:00, waktu sekarang Senin
-- 14:00; POST langsung ke /api/bookings untuk Senin 10:00 (sudah lewat)
-- tetap lolos pengecekan jam kerja, membuat booking PENDING, memakai kuota
-- bulanan merchant, mengunci slot yang sudah berlalu di kalender, DAN
-- memicu charge QRIS sungguhan di provider. Filter slot lampau di klien
-- (src/lib/booking/slots.ts) bukan jaminan apa pun -- endpoint publik POST
-- /api/bookings adalah batas otoritatif satu-satunya, jadi pengecekannya
-- wajib ada di sini, di dalam transaksi yang sama dengan advisory lock dan
-- pengecekan jam kerja lainnya (bukan cuma di route Next.js, yang bisa
-- dilewati kalau ada jalur lain memanggil RPC ini -- lihat juga komentar
-- "server" di migration 20260730000700_create_booking.sql).
--
-- CREATE OR REPLACE atas fungsi yang sama, bukan mengedit
-- 20260730000700_create_booking.sql -- AGENTS.md: perubahan skema (termasuk
-- definisi fungsi) butuh migration baru, bukan edit file lama.
-- ===========================================================================

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
  -- a. Advisory lock per merchant. hashtext(uuid text) -> integer, di-cast
  -- implisit ke bigint oleh overload pg_advisory_xact_lock(bigint).
  perform pg_advisory_xact_lock(hashtext(p_merchant_id::text));

  -- a2. Slot wajib di masa depan. now() adalah instant absolut, dibandingkan
  -- langsung dengan p_start_datetime yang juga timestamptz (instant absolut)
  -- -- tidak perlu konversi zona waktu apa pun di sini, beda dengan
  -- pengecekan jam kerja di bawah yang memang butuh wall-clock Jakarta.
  if p_start_datetime <= now() then
    raise exception 'Jam tersebut sudah lewat' using errcode = 'P0006';
  end if;

  -- Baca ulang layanan DI DALAM lock ini -- lihat komentar di atas fungsi.
  -- merchant_id ikut difilter supaya service_id milik merchant lain tidak
  -- bisa dipakai membuat booking di kalender merchant ini.
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

  -- b. Slot wajib berada di dalam salah satu jam kerja merchant pada hari
  -- ISO yang sesuai (1=Senin..7=Minggu, sama seperti day_of_week di tabel
  -- availability / extract(isodow from ...)). Wall-clock Jakarta dipakai
  -- supaya konsisten dengan src/lib/booking/slots.ts di sisi klien.
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

  -- Booking yang melewati tengah malam Jakarta otomatis tertolak di sini:
  -- v_end_time hasil wall-clock hari berikutnya jadi lebih kecil dari
  -- v_start_time, dan tidak ada baris availability yang bisa mencakupnya
  -- (constraint availability_time_order mewajibkan end_time > start_time
  -- pada baris yang sama, jadi jam kerja tidak pernah melewati tengah malam).
  if not v_within_availability then
    raise exception 'Slot % - % (WIB) di luar jam kerja merchant', v_start_time, v_end_time
      using errcode = 'P0004';
  end if;

  -- c. Insert. bookings_no_overlap (exclusion constraint GiST) dan
  -- bookings_enforce_quota (trigger) tetap berlaku persis seperti insert
  -- biasa -- keduanya penjaga terakhir yang membuat slot bentrok / kuota
  -- terlampaui mustahil tersimpan, apa pun yang lolos dari pengecekan (b).
  -- d. RETURN QUERY ... RETURNING * mengembalikan baris yang baru dibuat.
  return query
    insert into public.bookings (
      merchant_id, service_id, service_name, service_price, duration_minutes,
      start_datetime, end_datetime, customer_name, customer_whatsapp
    ) values (
      p_merchant_id, p_service_id, v_service.name, v_service.price, v_service.duration_minutes,
      p_start_datetime, v_end_datetime, p_customer_name, p_customer_whatsapp
    )
    returning *;
end;
$$;

-- Grant tidak berubah (CREATE OR REPLACE mempertahankan ACL yang sudah ada),
-- tapi tetap dinyatakan ulang eksplisit di sini supaya migration ini berdiri
-- sendiri dan tidak diam-diam bergantung urutan dengan migration sebelumnya.
revoke execute on function public.create_booking(uuid, uuid, timestamptz, text, text) from public;
grant execute on function public.create_booking(uuid, uuid, timestamptz, text, text) to service_role;
