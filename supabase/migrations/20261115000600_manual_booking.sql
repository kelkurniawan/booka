-- ===========================================================================
-- F3: sumber booking, booking manual oleh merchant, dan jadwal ulang.
--
-- bookings.source membedakan booking dari halaman publik (ONLINE) dan yang
-- dicatat merchant dari dashboard (MANUAL).
--
-- create_booking disalin dari 20261115000500 dengan tiga perubahan:
--   a) Pembersih booking kedaluwarsa pindah ke reap_expired_bookings_for,
--      supaya reschedule_booking_by_merchant memakai logika yang sama.
--   b) p_source = 'MANUAL' melewati aturan cara bayar dan langsung
--      menetapkan bayar di tempat yang terkonfirmasi.
--   c) Kolom source disimpan.
--
-- Tabel keputusan (sumber -> cara bayar efektif -> status, bayar sekarang / di tempat):
--   ONLINE -> aturan F2 (20261115000500), tidak berubah
--   MANUAL -> ON_SITE -> CONFIRMED 0 / harga, tanpa BK020/BK021
--
-- Slot, jam kerja, staf, kuota paket (P0002), dan bookings_no_overlap tetap
-- berlaku untuk booking manual.
-- ===========================================================================

create type public.booking_source as enum ('ONLINE', 'MANUAL');

alter table public.bookings
  add column source public.booking_source not null default 'ONLINE';

-- Internal: hanya dipanggil fungsi security definer lain (create_booking,
-- reschedule_booking_by_merchant) yang sudah memegang kunci merchant.
-- Booking kedaluwarsa masih ikut bookings_no_overlap sampai statusnya berubah.
create or replace function public.reap_expired_bookings_for(p_merchant_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.bookings
  set status = 'CANCELLED',
      cancelled_at = now(),
      cancel_reason = case when status = 'REQUESTED'
        then 'Permintaan tidak dijawab dalam batas waktu'
        else 'DP tidak dibayar dalam batas waktu' end
  where merchant_id = p_merchant_id
    and status in ('PENDING', 'REQUESTED')
    and expires_at <= now();
$$;

revoke execute on function public.reap_expired_bookings_for(uuid) from public, anon, authenticated;

drop function public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean);

create or replace function public.create_booking(
  p_merchant_id uuid,
  p_service_id uuid,
  p_start_datetime timestamptz,
  p_customer_name text,
  p_customer_whatsapp text,
  p_staff_id uuid default null,
  -- false bila merchant tidak punya koneksi payment ACTIVE.
  p_can_charge boolean default true,
  p_source public.booking_source default 'ONLINE'
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
begin
  perform pg_advisory_xact_lock(hashtext(p_merchant_id::text));

  perform public.reap_expired_bookings_for(p_merchant_id);

  if p_start_datetime <= now() then
    raise exception 'Jam tersebut sudah lewat' using errcode = 'P0006';
  end if;

  select s.name, s.price, s.duration_minutes, s.is_active,
         s.payment_mode, s.deposit_type, s.deposit_value
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

  if p_source = 'MANUAL' then
    -- Dicatat merchant sendiri: bayar di tempat, langsung terkonfirmasi,
    -- tanpa koneksi payment (BK021) dan tanpa batas per nomor (BK020).
    v_mode := 'ON_SITE';
    v_due_now := 0;
    v_status := 'CONFIRMED';
    v_expires_at := now() + interval '15 minutes';
  else
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
        then round(v_service.price * v_service.deposit_value / 100.0)
      when v_mode in ('DEPOSIT', 'REQUEST') and v_service.deposit_type = 'FIXED'
        then least(v_service.deposit_value, v_service.price)
      else v_service.price
    end;

    -- Minimum QRIS: DP (DEPOSIT, atau REQUEST ber-DP) tidak boleh di bawah
    -- 1500 kecuali harga itu sendiri lebih kecil (lalu ditolak BK022 di bawah).
    if v_service.price > 0 and v_service.deposit_type is not null
       and v_mode in ('DEPOSIT', 'REQUEST') then
      v_due_now := greatest(v_due_now, least(v_service.price, 1500));
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

  v_end_datetime := p_start_datetime + (v_service.duration_minutes || ' minutes')::interval;
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

  if coalesce(v_uses_staff, false) then
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

  return query
    insert into public.bookings (
      merchant_id, service_id, service_name, service_price, duration_minutes,
      start_datetime, end_datetime, customer_name, customer_whatsapp,
      staff_id, staff_name,
      payment_mode, amount_due_now, amount_due_on_site, status, expires_at, source
    )
    values (
      p_merchant_id, p_service_id, v_service.name, v_service.price, v_service.duration_minutes,
      p_start_datetime, v_end_datetime, p_customer_name, p_customer_whatsapp,
      v_staff_id, v_staff_name,
      v_mode, v_due_now, v_service.price - v_due_now, v_status, v_expires_at, p_source
    )
    returning *;
end;
$$;

revoke execute on function public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source)
  from public, anon, authenticated;
grant execute on function public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source)
  to service_role;

-- Booking yang dicatat merchant sendiri dari dashboard. Notifikasi dikirim
-- dari TS, bukan dari sini.
create or replace function public.create_manual_booking(
  p_service_id uuid,
  p_start_datetime timestamptz,
  p_customer_name text,
  p_customer_whatsapp text,
  p_staff_id uuid default null
)
returns table (id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant uuid;
begin
  v_merchant := (select auth.uid());
  if v_merchant is null then
    raise exception 'Perlu login' using errcode = '42501';
  end if;

  return query
    select b.id
    from public.create_booking(
      v_merchant, p_service_id, p_start_datetime, p_customer_name, p_customer_whatsapp,
      p_staff_id, false, 'MANUAL'
    ) b;
end;
$$;

revoke execute on function public.create_manual_booking(uuid, timestamptz, text, text, uuid) from public, anon;
grant execute on function public.create_manual_booking(uuid, timestamptz, text, text, uuid) to authenticated;

-- Pindah jam booking yang sudah pasti (PAID/CONFIRMED) dan belum dicatat
-- kehadirannya. Staf, layanan, dan durasi tetap.
create or replace function public.reschedule_booking_by_merchant(p_booking_id uuid, p_new_start timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant uuid;
  b public.bookings;
  v_end timestamptz;
  v_uses_staff boolean;
begin
  v_merchant := (select auth.uid());
  if v_merchant is null then
    raise exception 'Perlu login' using errcode = '42501';
  end if;

  -- Kunci yang sama dengan create_booking: jadwal ulang dan booking baru tidak bisa balapan.
  perform pg_advisory_xact_lock(hashtext(v_merchant::text));
  perform public.reap_expired_bookings_for(v_merchant);

  select * into b from public.bookings x
    where x.id = p_booking_id and x.merchant_id = v_merchant
      and x.status in ('PAID', 'CONFIRMED')
      and x.attended_at is null and x.no_show_at is null
    for update;
  if not found then
    raise exception 'Booking tidak bisa dijadwal ulang' using errcode = 'BK034';
  end if;

  if p_new_start <= now() then
    raise exception 'Jam tersebut sudah lewat' using errcode = 'P0006';
  end if;

  v_end := p_new_start + (b.duration_minutes || ' minutes')::interval;

  -- Sama dengan create_booking: kalender per staf hanya untuk STUDIO yang punya staf aktif.
  select m.subscription_tier = 'STUDIO'
         and exists (
           select 1 from public.staff st
           where st.merchant_id = v_merchant and st.is_active
         )
    into v_uses_staff
    from public.merchants m
    where m.id = v_merchant;

  if not public.slot_within_hours(
       v_merchant,
       case when coalesce(v_uses_staff, false) then b.staff_id end,
       extract(isodow from (p_new_start at time zone 'Asia/Jakarta'))::integer,
       (p_new_start at time zone 'Asia/Jakarta')::time,
       (v_end at time zone 'Asia/Jakarta')::time) then
    raise exception 'Slot di luar jam kerja' using errcode = 'BK001';
  end if;

  -- Bentrok dengan booking lain ditangkap bookings_no_overlap (23P01);
  -- baris yang sedang diubah tidak bentrok dengan dirinya sendiri.
  update public.bookings
    set start_datetime = p_new_start, end_datetime = v_end
    where id = b.id;

  -- Pengingat H-1 idempoten per (booking, kind, channel); hapus supaya terkirim lagi untuk tanggal baru.
  delete from public.notification_log
    where booking_id = b.id and kind = 'REMINDER_CUSTOMER';
end;
$$;

revoke execute on function public.reschedule_booking_by_merchant(uuid, timestamptz) from public, anon;
grant execute on function public.reschedule_booking_by_merchant(uuid, timestamptz) to authenticated;

notify pgrst, 'reload schema';
