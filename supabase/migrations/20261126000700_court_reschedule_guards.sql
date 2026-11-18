-- ===========================================================================
-- Booking lapangan: pengaman jadwal ulang (review Task 3, putaran 1).
--
--   - court_slot_fits: satu aturan jam kerja dan grid unit untuk sewa, dipakai
--     create_booking DAN move_booking_slot (jadi semua jalur jadwal ulang).
--     Dihitung dalam detik, jadi rentang tidak bisa lewat tengah malam.
--   - move_booking_slot mempertahankan lapangan sendiri bila masih aktif dan
--     kosong, walau layanannya sudah dihapus.
--   - reschedule_booking (pelanggan, lewat token): BK073 bila harga sewa di
--     jam baru lebih tinggi dari service_price. Jalur merchant tidak berubah.
--   - get_court_availability: kosong untuk layanan nonaktif atau bukan sewa.
-- ===========================================================================

-- Rentang [p_start, p_start + durasi) muat dalam satu jendela jam usaha di
-- hari Jakarta jam mulai, dan jam mulai di grid p_unit dari awal jendela.
-- p_unit null = tanpa cek grid. Sama dengan computeCourtSlots (court.ts).
create function public.court_slot_fits(p_merchant_id uuid, p_start timestamptz, p_duration integer, p_unit integer)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.availability a
    where a.merchant_id = p_merchant_id
      and a.day_of_week = extract(isodow from (p_start at time zone 'Asia/Jakarta'))::integer
      and a.start_time <= (p_start at time zone 'Asia/Jakarta')::time
      and extract(epoch from a.end_time)
          >= extract(epoch from (p_start at time zone 'Asia/Jakarta')::time) + p_duration * 60
      and (p_unit is null
           or mod(extract(epoch from (p_start at time zone 'Asia/Jakarta')::time - a.start_time), p_unit * 60) = 0));
$$;

revoke execute on function public.court_slot_fits(uuid, timestamptz, integer, integer) from public, anon, authenticated;

-- create_booking: disalin dari 20261126000400; hanya cek jam sewa diganti court_slot_fits.
create or replace function public.create_booking(
  p_merchant_id uuid,
  p_service_id uuid,
  p_start_datetime timestamptz,
  p_customer_name text,
  p_customer_whatsapp text,
  p_staff_id uuid default null,
  -- false bila merchant tidak punya koneksi payment ACTIVE.
  p_can_charge boolean default true,
  p_source public.booking_source default 'ONLINE',
  -- Null atau kosong = tanpa voucher. Diabaikan untuk MANUAL.
  p_voucher_code text default null,
  -- Wajib bila layanan punya party_max; diabaikan (null) bila tidak.
  p_party_size integer default null,
  -- Hanya untuk layanan reservasi di mode TABLE.
  p_area_id uuid default null,
  p_table_id uuid default null,
  p_customer_note text default null,
  -- Atribusi dari sessionStorage tab. Diabaikan selain ONLINE. ad_link milik
  -- merchant lain menjadi null; UTM dipotong 64, referrer_host disaring jadi host.
  p_session_id uuid default null,
  p_ad_link_id uuid default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_referrer_host text default null,
  -- Hanya layanan sewa lapangan; diabaikan untuk layanan lain. Null = "Mana saja".
  p_court_id uuid default null,
  -- Lama main layanan sewa (wajib untuk layanan sewa, BK071).
  p_duration_minutes integer default null
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
  v_uses_staff boolean;
  v_staff_id uuid;
  v_staff_name text;
  v_allow_pay_on_site boolean;
  v_auto_confirm_on_site boolean;
  v_max_active_per_phone integer;
  v_deposit_after_no_show boolean;
  v_mode public.payment_mode;
  v_due_now numeric(12, 2);
  v_status public.booking_status;
  v_expires_at timestamptz;
  v_active integer;
  v_voucher record;
  -- Record yang belum diisi tidak bisa dibaca kolomnya, jadi salinan skalar untuk insert.
  v_voucher_id uuid;
  v_voucher_code text;
  v_discount numeric(12, 2) := 0;
  v_price numeric(12, 2);
  v_table_mode public.table_mode;
  v_seats_per_slot integer;
  v_party integer;
  v_seat boolean;
  v_duration integer;
  v_capacity_mode public.table_mode := 'NONE';
  v_area_id uuid;
  v_table_id uuid;
  v_joined_table_id uuid;
  v_table_label text;
  v_booking public.bookings;
  v_court boolean;
  v_court_id uuid;
  v_court_name text;
  -- Harga sebelum diskon: court_price untuk sewa, services.price selain itu.
  v_base_price numeric(12, 2);
begin
  perform pg_advisory_xact_lock(hashtext(p_merchant_id::text));

  p_source := coalesce(p_source, 'ONLINE');

  perform public.reap_expired_bookings_for(p_merchant_id);

  if p_start_datetime <= now() then
    raise exception 'Jam tersebut sudah lewat' using errcode = 'P0006';
  end if;

  select s.name, s.price, s.duration_minutes, s.is_active,
         s.payment_mode, s.deposit_type, s.deposit_value,
         s.party_min, s.party_max, s.seat_duration_minutes,
         s.court_unit_minutes, s.court_max_minutes
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

  if v_service.party_max is not null then
    if p_party_size is null or p_party_size not between v_service.party_min and v_service.party_max then
      raise exception 'Jumlah tamu di luar rentang layanan' using errcode = 'BK063';
    end if;
    v_party := p_party_size;
  end if;

  -- Tidak ada baris = mode NONE (fitur restoran mati).
  select ms.table_mode, ms.seats_per_slot into v_table_mode, v_seats_per_slot
    from public.merchant_settings ms
    where ms.merchant_id = p_merchant_id;
  v_table_mode := coalesce(v_table_mode, 'NONE');
  v_seat := v_table_mode <> 'NONE' and v_service.seat_duration_minutes is not null;
  v_duration := case when v_seat then v_service.seat_duration_minutes else v_service.duration_minutes end;

  -- Layanan sewa (court_unit_minutes terisi, tidak pernah reservasi kursi):
  -- lama main dari pemanggil, harga dari court_price. Selain itu p_court_id
  -- dan p_duration_minutes diabaikan.
  v_court := v_service.court_unit_minutes is not null;
  if v_court then
    if p_duration_minutes is null
       or p_duration_minutes % v_service.court_unit_minutes <> 0
       or p_duration_minutes not between v_service.duration_minutes and v_service.court_max_minutes then
      raise exception 'Lama main tidak valid' using errcode = 'BK071';
    end if;
    v_duration := p_duration_minutes;
    v_base_price := public.court_price(p_service_id, p_start_datetime, v_duration);
  else
    v_base_price := v_service.price;
  end if;

  if p_source = 'MANUAL' then
    -- Dicatat merchant sendiri: bayar di tempat, langsung terkonfirmasi,
    -- tanpa koneksi payment (BK021) dan tanpa batas per nomor (BK020).
    -- Booking manual tidak pernah memakai voucher (Keputusan 6).
    v_price := v_base_price;
    v_mode := 'ON_SITE';
    v_due_now := 0;
    v_status := 'CONFIRMED';
    v_expires_at := now() + interval '15 minutes';

    -- Dihitung di bawah advisory lock supaya dua panggilan serentak tidak
    -- sama-sama lolos. Semua status, termasuk CANCELLED: batal lalu buat
    -- ulang tetap terhitung.
    if (select count(*) from public.bookings b
        where b.merchant_id = p_merchant_id
          and b.source = 'MANUAL'
          and b.created_at > now() - interval '24 hours') >= 50 then
      raise exception 'Batas booking manual harian tercapai' using errcode = 'BK035';
    end if;
  else
    -- Sesudah advisory lock dan reap_expired_bookings_for di atas: hitungan
    -- kuota dan per nomor di evaluate_voucher terserialisasi (Keputusan 2).
    if nullif(btrim(p_voucher_code), '') is not null then
      select * into v_voucher
        from public.evaluate_voucher(p_merchant_id, p_voucher_code, p_service_id, p_customer_whatsapp, v_base_price);

      -- Pesan sama dengan src/lib/booking/errors.ts.
      if v_voucher.reason is not null then
        raise exception '%', case v_voucher.reason
            when 'BK050' then 'Kode voucher tidak ditemukan atau sudah tidak berlaku.'
            when 'BK051' then 'Voucher ini belum berlaku atau sudah berakhir.'
            when 'BK052' then 'Kuota voucher ini sudah habis.'
            when 'BK053' then 'Nomor WhatsApp ini sudah memakai voucher ini.'
            when 'BK054' then 'Harga layanan belum memenuhi minimal transaksi voucher ini.'
            when 'BK055' then 'Voucher ini tidak berlaku untuk layanan yang dipilih.'
            when 'BK056' then 'Voucher ini khusus pelanggan baru.'
            else 'Layanan tidak ditemukan' end
          using errcode = v_voucher.reason;
      end if;

      v_voucher_id := v_voucher.voucher_id;
      v_voucher_code := v_voucher.code;
      v_discount := v_voucher.discount;
    end if;

    v_price := v_base_price - v_discount;

    select ms.allow_pay_on_site, ms.auto_confirm_on_site, ms.max_active_per_phone, ms.deposit_after_no_show
      into v_allow_pay_on_site, v_auto_confirm_on_site, v_max_active_per_phone, v_deposit_after_no_show
      from public.merchant_settings ms
      where ms.merchant_id = p_merchant_id;

    if not found then
      -- Default Keputusan 5, sama dengan default kolom merchant_settings.
      v_allow_pay_on_site := true;
      v_auto_confirm_on_site := true;
      v_max_active_per_phone := 2;
      v_deposit_after_no_show := false;
    end if;

    v_mode := v_service.payment_mode;
    if v_mode = 'ON_SITE' and (
         not v_allow_pay_on_site
         or (v_deposit_after_no_show and exists (
               select 1 from public.bookings b
               where b.merchant_id = p_merchant_id
                 and b.customer_whatsapp = p_customer_whatsapp
                 and b.no_show_at is not null))
       ) then
      v_mode := 'FULL';
    end if;

    v_due_now := case
      when v_mode = 'ON_SITE' then 0
      when v_mode in ('DEPOSIT', 'REQUEST') and v_service.deposit_type = 'PERCENT'
        then round(v_price * v_service.deposit_value / 100.0)
      when v_mode in ('DEPOSIT', 'REQUEST') and v_service.deposit_type = 'FIXED'
        then least(v_service.deposit_value, v_price)
      else v_price
    end;

    -- Minimum QRIS: DP (DEPOSIT, atau REQUEST ber-DP) tidak boleh di bawah
    -- 1500 kecuali harga itu sendiri lebih kecil (lalu ditolak BK022 di bawah).
    if v_price > 0 and v_service.deposit_type is not null
       and v_mode in ('DEPOSIT', 'REQUEST') then
      v_due_now := greatest(v_due_now, least(v_price, 1500));
    end if;

    v_status := case
      when v_mode in ('FULL', 'DEPOSIT') then 'PENDING'
      when v_mode = 'ON_SITE' and v_auto_confirm_on_site then 'CONFIRMED'
      else 'REQUESTED'
    end;

    -- Layanan gratis tidak pernah ditagih: langsung terkonfirmasi, tanpa
    -- koneksi payment (BK021 di bawah memeriksa status yang sudah final).
    if v_status = 'PENDING' and v_due_now = 0 then
      v_status := 'CONFIRMED';
    end if;

    -- MIN_ONLINE_CHARGE = 1500 Rupiah, sama dengan src/lib/booking/payment-mode.ts.
    -- Batas minimum QR Xendit; Zod menolak harga 1..1499 untuk layanan baru,
    -- ini menjaga layanan lama yang dibuat sebelum aturan itu.
    -- Juga REQUESTED: persetujuan mengubahnya ke PENDING dengan nominal yang sama.
    if v_due_now > 0 and v_due_now < 1500 then
      raise exception 'Nominal terlalu kecil untuk QRIS' using errcode = 'BK022';
    end if;

    -- Selain REQUESTED: sama dengan default kolom bookings.expires_at.
    v_expires_at := case when v_status = 'REQUESTED'
      then least(now() + interval '24 hours', p_start_datetime)
      else now() + interval '15 minutes' end;

    -- `is not true`: NULL diperlakukan sebagai tidak bisa menagih.
    if (v_status = 'PENDING' or v_due_now > 0) and p_can_charge is not true then
      raise exception 'Merchant belum mengaktifkan pembayaran' using errcode = 'BK021';
    end if;

    -- Batas per nomor untuk semua booking yang memegang slot tanpa bayar
    -- online: ON_SITE, REQUEST, dan booking gratis (bayar sekarang 0).
    if (v_mode in ('ON_SITE', 'REQUEST') or v_due_now = 0) and v_max_active_per_phone is not null then
      select count(*) into v_active
        from public.bookings b
        where b.merchant_id = p_merchant_id
          and b.customer_whatsapp = p_customer_whatsapp
          and public.booking_holds_slot(b.status, b.expires_at)
          and b.end_datetime > now();

      if v_active >= v_max_active_per_phone then
        raise exception 'Nomor ini sudah mencapai batas booking aktif' using errcode = 'BK020';
      end if;
    end if;
  end if;

  v_end_datetime := p_start_datetime + (v_duration || ' minutes')::interval;
  v_day_of_week := extract(isodow from (p_start_datetime at time zone 'Asia/Jakarta'));
  v_start_time := (p_start_datetime at time zone 'Asia/Jakarta')::time;
  v_end_time := (v_end_datetime at time zone 'Asia/Jakarta')::time;

  select m.subscription_tier = 'STUDIO'
         and exists (
           select 1 from public.staff st
           where st.merchant_id = p_merchant_id and st.is_active
         )
    into v_uses_staff
    from public.merchants m
    where m.id = p_merchant_id;

  -- Sewa lapangan tidak memakai staf; jam dan grid lewat court_slot_fits.
  if v_court then
    if not public.court_slot_fits(p_merchant_id, p_start_datetime, v_duration, v_service.court_unit_minutes) then
      raise exception 'Slot % (WIB) di luar jam kerja atau grid lapangan', v_start_time using errcode = 'BK001';
    end if;
  -- Reservasi tidak memakai staf: jam kerja = jam usaha (Keputusan 10).
  elsif coalesce(v_uses_staff, false) and not v_seat then
    if p_staff_id is not null then
      select st.id, st.name into v_staff_id, v_staff_name
        from public.staff st
        where st.id = p_staff_id
          and st.merchant_id = p_merchant_id
          and st.is_active;

      if v_staff_id is null then
        raise exception 'Staf tidak tersedia' using errcode = 'BK003';
      end if;

      if not public.slot_within_hours(p_merchant_id, v_staff_id, v_day_of_week, v_start_time, v_end_time) then
        raise exception 'Slot di luar jam kerja staf' using errcode = 'BK001';
      end if;
      -- Bentrok dengan booking lain staf ini ditangkap bookings_no_overlap.
    else
      select st.id, st.name into v_staff_id, v_staff_name
        from public.staff st
        where st.merchant_id = p_merchant_id
          and st.is_active
          and public.slot_within_hours(p_merchant_id, st.id, v_day_of_week, v_start_time, v_end_time)
          and not exists (
            select 1 from public.bookings b
            where b.merchant_id = p_merchant_id
              and b.staff_id = st.id
              and public.booking_holds_slot(b.status, b.expires_at)
              and tstzrange(b.start_datetime, b.end_datetime, '[)')
                  && tstzrange(p_start_datetime, v_end_datetime, '[)')
          )
        order by st.sort_order, st.created_at
        limit 1;

      if v_staff_id is null then
        raise exception 'Tidak ada staf yang kosong di jam ini' using errcode = 'BK002';
      end if;
    end if;
  else
    if not public.slot_within_hours(p_merchant_id, null, v_day_of_week, v_start_time, v_end_time) then
      raise exception 'Slot % - % (WIB) di luar jam kerja merchant', v_start_time, v_end_time
        using errcode = 'BK001';
    end if;
  end if;

  -- Lapangan dipilih sesudah kunci merchant dan reap di atas, jadi dua
  -- pelanggan yang berebut lapangan terakhir terserialisasi: yang kedua
  -- melihat baris yang sudah di-commit pertama. bookings_court_no_overlap
  -- tetap menjadi jaring terakhir.
  if v_court then
    select p.court_id, p.court_name into v_court_id, v_court_name
      from public.pick_court(p_merchant_id, p_service_id, p_start_datetime, v_end_datetime, p_court_id, null) p;
    if p_court_id is not null and v_court_id is distinct from p_court_id then
      raise exception 'Lapangan yang dipilih tidak tersedia' using errcode = 'BK070';
    elsif v_court_id is null then
      raise exception 'Tidak ada lapangan kosong di jam ini' using errcode = 'BK072';
    end if;
  end if;

  -- Sesudah kunci merchant dan reap di atas, jadi dua pelanggan yang berebut
  -- kursi atau meja terakhir terserialisasi (Keputusan 6).
  if v_seat then
    v_capacity_mode := v_table_mode;

    if v_table_mode = 'AREA' then
      if v_party + public.seats_in_use(p_merchant_id, p_start_datetime, v_end_datetime, null) > v_seats_per_slot then
        raise exception 'Kapasitas di jam ini sudah penuh' using errcode = 'BK060';
      end if;
    else
      select p.table_id, p.joined_table_id, p.area_id, p.table_label
        into v_table_id, v_joined_table_id, v_area_id, v_table_label
        from public.pick_dining_tables(p_merchant_id, p_start_datetime, v_end_datetime, v_party,
                                       p_area_id, p_table_id, p_source = 'ONLINE', null) p;

      if not found then
        if p_table_id is not null then
          raise exception 'Meja yang dipilih tidak tersedia' using errcode = 'BK061';
        end if;
        raise exception 'Kapasitas di jam ini sudah penuh' using errcode = 'BK060';
      end if;
    end if;
  end if;

  -- Atribusi hanya untuk booking ONLINE: MANUAL tidak pernah masuk funnel.
  if p_source = 'ONLINE' then
    if p_ad_link_id is not null and not exists (
         select 1 from public.ad_links l where l.id = p_ad_link_id and l.merchant_id = p_merchant_id) then
      p_ad_link_id := null;
    end if;
    p_utm_source := left(nullif(btrim(p_utm_source), ''), 64);
    p_utm_medium := left(nullif(btrim(p_utm_medium), ''), 64);
    p_utm_campaign := left(nullif(btrim(p_utm_campaign), ''), 64);
    -- Hanya host: skema, port, path, dan query dibuang (token tidak boleh ikut).
    p_referrer_host := left(substring(regexp_replace(lower(btrim(p_referrer_host)), '^[a-z][a-z0-9+.-]*://', '')
                                      from '^[a-z0-9.-]+'), 100);
  else
    p_session_id := null;
    p_ad_link_id := null;
    p_utm_source := null;
    p_utm_medium := null;
    p_utm_campaign := null;
    p_referrer_host := null;
  end if;

  insert into public.bookings (
    merchant_id, service_id, service_name, service_price, duration_minutes,
    start_datetime, end_datetime, customer_name, customer_whatsapp,
    staff_id, staff_name,
    payment_mode, amount_due_now, amount_due_on_site, status, expires_at, source,
    voucher_id, voucher_code, discount_amount,
    party_size, area_id, table_id, joined_table_id, table_label, customer_note, capacity_mode,
    session_id, ad_link_id, utm_source, utm_medium, utm_campaign, referrer_host,
    court_id, court_name
  )
  values (
    p_merchant_id, p_service_id, v_service.name, v_base_price, v_duration,
    p_start_datetime, v_end_datetime, p_customer_name, p_customer_whatsapp,
    v_staff_id, v_staff_name,
    v_mode, v_due_now, v_price - v_due_now, v_status, v_expires_at, p_source,
    v_voucher_id, v_voucher_code, v_discount,
    v_party, v_area_id, v_table_id, v_joined_table_id, v_table_label,
    nullif(btrim(p_customer_note), ''), v_capacity_mode,
    p_session_id, p_ad_link_id, p_utm_source, p_utm_medium, p_utm_campaign, p_referrer_host,
    v_court_id, v_court_name
  )
  returning * into v_booking;

  -- BOOKED hanya bila ada sesi: Booking dibuat tidak melebihi Kunjungan.
  if v_booking.session_id is not null then
    insert into public.funnel_events (
      merchant_id, session_id, kind, ad_link_id, utm_source, utm_medium, utm_campaign,
      referrer_host, service_id, booking_id
    )
    values (
      v_booking.merchant_id, v_booking.session_id, 'BOOKED', v_booking.ad_link_id, v_booking.utm_source,
      v_booking.utm_medium, v_booking.utm_campaign, v_booking.referrer_host, v_booking.service_id, v_booking.id
    );
  end if;

  return next v_booking;
end;
$$;

-- create or replace mempertahankan hak (service_role saja).

-- move_booking_slot: disalin dari 20261126000400.
create or replace function public.move_booking_slot(p_booking_id uuid, p_merchant_id uuid, p_new_start timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_duration integer;
  v_staff_id uuid;
  v_end timestamptz;
  v_uses_staff boolean;
  v_capacity_mode public.table_mode;
  v_party integer;
  v_table_id uuid;
  v_joined_table_id uuid;
  v_area_id uuid;
  v_table_label text;
  v_source public.booking_source;
  v_seats_per_slot integer;
  v_court_id uuid;
  v_court_name text;
  v_service_id uuid;
begin
  if p_new_start <= now() then
    raise exception 'Jam tersebut sudah lewat' using errcode = 'P0006';
  end if;

  select x.duration_minutes, x.staff_id,
         x.capacity_mode, x.party_size, x.table_id, x.joined_table_id, x.area_id, x.table_label, x.source,
         x.court_id, x.court_name, x.service_id
    into v_duration, v_staff_id,
         v_capacity_mode, v_party, v_table_id, v_joined_table_id, v_area_id, v_table_label, v_source,
         v_court_id, v_court_name, v_service_id
    from public.bookings x
    where x.id = p_booking_id and x.merchant_id = p_merchant_id;

  v_end := p_new_start + (v_duration || ' minutes')::interval;

  -- Sama dengan create_booking: kalender per staf hanya untuk STUDIO yang punya staf aktif.
  select m.subscription_tier = 'STUDIO'
         and exists (
           select 1 from public.staff st
           where st.merchant_id = p_merchant_id and st.is_active
         )
    into v_uses_staff
    from public.merchants m
    where m.id = p_merchant_id;

  if coalesce(v_uses_staff, false) and v_staff_id is not null and not exists (
       select 1 from public.staff st
       where st.id = v_staff_id and st.merchant_id = p_merchant_id and st.is_active) then
    raise exception 'Staf tidak tersedia' using errcode = 'BK003';
  end if;

  -- Booking lapangan: jam dan grid sama dengan create_booking. Layanan yang
  -- sudah dihapus (service_id null) hanya diperiksa jam kerjanya.
  if v_court_id is not null then
    if not public.court_slot_fits(p_merchant_id, p_new_start, v_duration,
         (select s.court_unit_minutes from public.services s
           where s.id = v_service_id and s.merchant_id = p_merchant_id)) then
      raise exception 'Slot di luar jam kerja atau grid lapangan' using errcode = 'BK001';
    end if;
  elsif not public.slot_within_hours(
       p_merchant_id,
       case when coalesce(v_uses_staff, false) then v_staff_id end,
       extract(isodow from (p_new_start at time zone 'Asia/Jakarta'))::integer,
       (p_new_start at time zone 'Asia/Jakarta')::time,
       (v_end at time zone 'Asia/Jakarta')::time) then
    raise exception 'Slot di luar jam kerja' using errcode = 'BK001';
  end if;

  -- Pemanggil sudah memegang kunci merchant dan sudah reap (Keputusan 6).
  -- p_booking_id dikecualikan: baris ini tidak bentrok dengan dirinya sendiri.
  if v_capacity_mode = 'AREA' then
    -- Null karena mode sudah berganti = tidak dibatasi.
    select ms.seats_per_slot into v_seats_per_slot
      from public.merchant_settings ms where ms.merchant_id = p_merchant_id;
    if v_party + public.seats_in_use(p_merchant_id, p_new_start, v_end, p_booking_id) > v_seats_per_slot then
      raise exception 'Kapasitas di jam ini sudah penuh' using errcode = 'BK060';
    end if;
  elsif v_capacity_mode = 'TABLE' then
    -- Meja lama dipertahankan bila masih kosong; selain itu cari meja lain di area yang sama.
    if v_table_id is null
       or public.dining_table_busy(v_table_id, p_new_start, v_end, p_booking_id)
       or (v_joined_table_id is not null
           and public.dining_table_busy(v_joined_table_id, p_new_start, v_end, p_booking_id)) then
      select p.table_id, p.joined_table_id, p.area_id, p.table_label
        into v_table_id, v_joined_table_id, v_area_id, v_table_label
        from public.pick_dining_tables(p_merchant_id, p_new_start, v_end, v_party,
                                       v_area_id, null, v_source = 'ONLINE', p_booking_id) p;
      if not found then
        raise exception 'Kapasitas di jam ini sudah penuh' using errcode = 'BK060';
      end if;
    end if;
  end if;

  -- Booking lapangan: lapangan dan durasi dipertahankan bila lapangan itu
  -- masih aktif dan kosong di jam baru, walau layanannya sudah dihapus atau
  -- tautannya dilepas. Selain itu lapangan aktif lain yang terkait layanan
  -- (urut sort_order lalu nama); tidak ada = BK072. Harga tidak dihitung ulang.
  if v_court_id is not null and (
       not exists (select 1 from public.courts c
                   where c.id = v_court_id and c.merchant_id = p_merchant_id and c.is_active)
       or exists (select 1 from public.bookings b
                  where b.court_id = v_court_id
                    and b.id <> p_booking_id
                    and public.booking_holds_slot(b.status, b.expires_at)
                    and tstzrange(b.start_datetime, b.end_datetime, '[)') && tstzrange(p_new_start, v_end, '[)'))) then
    select p.court_id, p.court_name into v_court_id, v_court_name
      from public.pick_court(p_merchant_id, v_service_id, p_new_start, v_end, v_court_id, p_booking_id) p;
    if v_court_id is null then
      raise exception 'Tidak ada lapangan kosong di jam ini' using errcode = 'BK072';
    end if;
  end if;

  -- Booking NONE: bentrok dengan booking lain ditangkap bookings_no_overlap (23P01);
  -- baris yang sedang diubah tidak bentrok dengan dirinya sendiri.
  update public.bookings
    set start_datetime = p_new_start, end_datetime = v_end,
        table_id = v_table_id, joined_table_id = v_joined_table_id,
        area_id = v_area_id, table_label = v_table_label,
        court_id = v_court_id, court_name = v_court_name
    where id = p_booking_id and merchant_id = p_merchant_id;

  -- Log idempoten per (booking, kind, channel): hapus supaya pengingat dan
  -- pemberitahuan ubah jadwal terkirim lagi untuk jam baru.
  delete from public.notification_log
    where booking_id = p_booking_id
      and kind in ('REMINDER_CUSTOMER', 'REMINDER_CUSTOMER_SAME_DAY', 'BOOKING_RESCHEDULED_MERCHANT');
end;
$$;

revoke execute on function public.move_booking_slot(uuid, uuid, timestamptz) from public, anon, authenticated;

-- reschedule_booking: disalin dari 20261116000200 dengan cek BK073.
create or replace function public.reschedule_booking(p_token text, p_new_start timestamptz)
returns table (booking_id uuid, old_start timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant uuid;
  b public.bookings;
  s public.merchant_settings;
  v_new_price numeric;
begin
  select x.merchant_id into v_merchant from public.bookings x where x.access_token = p_token;
  if not found then
    raise exception 'Booking tidak ditemukan' using errcode = 'BK040';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_merchant::text));
  perform public.reap_expired_bookings_for(v_merchant);

  select * into b from public.bookings x
    where x.access_token = p_token and x.merchant_id = v_merchant
    for update;
  select * into s from public.merchant_settings ms where ms.merchant_id = v_merchant;

  if b.status not in ('PAID', 'CONFIRMED') or b.attended_at is not null or b.no_show_at is not null then
    raise exception 'Booking tidak bisa diubah' using errcode = 'BK040';
  end if;

  if not coalesce(s.allow_customer_reschedule, false) then
    raise exception 'Merchant tidak mengizinkan ubah jadwal' using errcode = 'BK041';
  end if;

  if now() > b.start_datetime - make_interval(hours => s.reschedule_min_hours) then
    raise exception 'Batas waktu ubah jadwal sudah lewat' using errcode = 'BK042';
  end if;

  if b.reschedule_count >= s.max_reschedules then
    raise exception 'Kesempatan ubah jadwal sudah habis' using errcode = 'BK043';
  end if;

  if s.reschedule_min_hours > 0 and p_new_start < now() + make_interval(hours => s.reschedule_min_hours) then
    raise exception 'Jadwal baru terlalu dekat' using errcode = 'BK046';
  end if;

  -- Pelanggan tidak boleh pindah ke jam sewa yang lebih mahal dari harga yang
  -- disepakati (harga tidak dihitung ulang). Harga tidak bisa dihitung
  -- (layanan dihapus) = ditolak juga; merchant tetap bisa memindahkan.
  if b.court_id is not null then
    v_new_price := public.court_price(b.service_id, p_new_start, b.duration_minutes);
    if v_new_price is null or v_new_price > b.service_price then
      raise exception 'Jam baru harganya lebih tinggi' using errcode = 'BK073';
    end if;
  end if;

  perform public.move_booking_slot(b.id, v_merchant, p_new_start);

  update public.bookings x set reschedule_count = x.reschedule_count + 1 where x.id = b.id;

  return query select b.id, b.start_datetime;
end;
$$;

revoke execute on function public.reschedule_booking(text, timestamptz) from public, anon, authenticated;
grant execute on function public.reschedule_booking(text, timestamptz) to service_role;

-- get_court_availability: disalin dari 20261126000400, hanya layanan sewa aktif.
create or replace function public.get_court_availability(p_merchant_id uuid, p_service_id uuid, p_date date)
returns table (court_id uuid, court_name text, start_datetime timestamptz, end_datetime timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, b.start_datetime, b.end_datetime
  from public.merchants m
  -- Hanya layanan sewa yang aktif.
  join public.services s on s.id = p_service_id and s.merchant_id = m.id
    and s.is_active and s.court_unit_minutes is not null
  join public.service_courts sc on sc.merchant_id = m.id and sc.service_id = s.id
  join public.courts c on c.id = sc.court_id and c.merchant_id = m.id and c.is_active
  join public.bookings b on b.court_id = c.id
  where m.id = p_merchant_id
    and m.username is not null
    and public.booking_holds_slot(b.status, b.expires_at)
    and b.start_datetime < ((p_date + 1)::timestamp at time zone 'Asia/Jakarta')
    and b.end_datetime > (p_date::timestamp at time zone 'Asia/Jakarta')
  order by b.start_datetime, c.sort_order, c.name;
$$;

revoke execute on function public.get_court_availability(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.get_court_availability(uuid, uuid, date) to anon, authenticated;

notify pgrst, 'reload schema';
