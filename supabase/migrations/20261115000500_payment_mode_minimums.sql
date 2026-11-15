-- ===========================================================================
-- F2: nominal minimum QRIS dan booking gratis.
--
-- create_booking disalin dari 20261115000300 dengan tiga perubahan:
--   a) PENDING dengan bayar sekarang 0 (layanan gratis) menjadi CONFIRMED,
--      jadi tidak pernah ditagih dan tidak butuh koneksi payment (BK021).
--   b) DP (DEPOSIT, atau REQUEST ber-DP) minimal min(harga, 1500).
--   c) PENDING dengan bayar sekarang < 1500 ditolak BK022.
--
-- decide_booking_request dan mark_booking_attendance kini menolak NULL
-- (22004): sebelumnya NULL jatuh ke cabang else, yaitu tolak / tidak datang.
--
-- merchant_settings diisi ulang untuk merchant yang lahir di antara backfill
-- 20261115000200 dan pemasangan trigger create_merchant_settings.
-- ===========================================================================

insert into public.merchant_settings (merchant_id)
select id from public.merchants
on conflict do nothing;

create or replace function public.create_booking(
  p_merchant_id uuid,
  p_service_id uuid,
  p_start_datetime timestamptz,
  p_customer_name text,
  p_customer_whatsapp text,
  p_staff_id uuid default null,
  -- false bila merchant tidak punya koneksi payment ACTIVE.
  p_can_charge boolean default true
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

  -- Sama dengan reap_expired_bookings, tapi hanya merchant ini: booking
  -- kedaluwarsa masih ikut bookings_no_overlap sampai statusnya berubah.
  update public.bookings
  set status = 'CANCELLED',
      cancelled_at = now(),
      cancel_reason = case when status = 'REQUESTED'
        then 'Permintaan tidak dijawab dalam batas waktu'
        else 'DP tidak dibayar dalam batas waktu' end
  where merchant_id = p_merchant_id
    and status in ('PENDING', 'REQUESTED')
    and expires_at <= now();

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
  if v_status = 'PENDING' and v_due_now < 1500 then
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

  if v_mode in ('ON_SITE', 'REQUEST') and v_max_active_per_phone is not null then
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
      payment_mode, amount_due_now, amount_due_on_site, status, expires_at
    )
    values (
      p_merchant_id, p_service_id, v_service.name, v_service.price, v_service.duration_minutes,
      p_start_datetime, v_end_datetime, p_customer_name, p_customer_whatsapp,
      v_staff_id, v_staff_name,
      v_mode, v_due_now, v_service.price - v_due_now, v_status, v_expires_at
    )
    returning *;
end;
$$;

revoke execute on function public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean)
  to service_role;

-- Disalin dari 20261115000400, hanya menambah penolakan NULL. CREATE OR
-- REPLACE mempertahankan grant yang sudah ada.
create or replace function public.decide_booking_request(p_booking_id uuid, p_approve boolean)
returns table (id uuid, status public.booking_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
begin
  if p_approve is null then
    raise exception 'Keputusan wajib diisi' using errcode = '22004';
  end if;
  select * into b from public.bookings x
  where x.id = p_booking_id and x.merchant_id = (select auth.uid()) and x.status = 'REQUESTED'
  for update;
  if not found then
    raise exception 'Permintaan tidak ditemukan' using errcode = 'BK030';
  end if;
  if b.expires_at <= now() then
    raise exception 'Permintaan sudah kedaluwarsa' using errcode = 'BK031';
  end if;

  if p_approve then
    if b.amount_due_now > 0 then
      return query update public.bookings u
        set status = 'PENDING', expires_at = least(now() + interval '24 hours', u.start_datetime)
        where u.id = b.id returning u.id, u.status;
    else
      return query update public.bookings u
        set status = 'CONFIRMED'
        where u.id = b.id returning u.id, u.status;
    end if;
  else
    return query update public.bookings u
      set status = 'CANCELLED', cancelled_at = now(), cancel_reason = 'Permintaan ditolak merchant'
      where u.id = b.id returning u.id, u.status;
  end if;
end;
$$;

create or replace function public.mark_booking_attendance(p_booking_id uuid, p_attended boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_attended is null then
    raise exception 'Kehadiran wajib diisi' using errcode = '22004';
  end if;
  update public.bookings b
  set attended_at = case when p_attended then now() end,
      no_show_at = case when p_attended then null else now() end
  where b.id = p_booking_id and b.merchant_id = (select auth.uid())
    and b.status in ('PAID', 'CONFIRMED')
    and now() >= b.start_datetime - case when p_attended then interval '1 hour' else interval '0' end;
  if not found then
    raise exception 'Kehadiran belum bisa dicatat' using errcode = 'BK033';
  end if;
end;
$$;

notify pgrst, 'reload schema';
