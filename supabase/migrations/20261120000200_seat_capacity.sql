-- ===========================================================================
-- F8 Restoran, bagian 2: kapasitas kursi dan meja.
--
-- Eksklusi (Keputusan 5):
--   bookings_no_overlap hanya untuk booking slot eksklusif (capacity_mode =
--   'NONE'). Semua booking lama dan semua merchant non-restoran ber-NONE,
--   jadi bagi mereka constraint ini identik dengan sebelumnya. Reservasi
--   (AREA/TABLE) keluar dari situ; satu meja dijaga dua eksklusi per meja
--   (table_id dan joined_table_id). Yang tidak dijaga constraint: meja utama
--   satu booking vs meja gabungan booking lain, dan jumlah kursi AREA.
--   Keduanya dijaga fungsi di bawah kunci.
--
-- Konkurensi (Keputusan 6): semua penulis yang menambah beban kapasitas
-- (create_booking, move_booking_slot lewat pemanggilnya, save_dining_layout)
-- memegang pg_advisory_xact_lock(hashtext(merchant_id::text)) lebih dulu,
-- lalu reap_expired_bookings_for, lalu memeriksa kapasitas, lalu menulis
-- dalam transaksi yang sama. Di READ COMMITTED tiap pernyataan PL/pgSQL
-- mengambil snapshot baru, jadi pemeriksaan sesudah kunci melihat semua baris
-- yang di-commit pemegang kunci sebelumnya. Helper kapasitas `stable` (bukan
-- `immutable`) dan tidak pernah dipanggil sebelum kunci.
--
-- Kursi AREA (Keputusan 7) dihitung beban puncak, bukan jumlah irisan: beban
-- hanya naik di titik mulai, jadi puncak dalam [s, e) dicari di s dan di
-- setiap start booking lain dalam (s, e).
--
-- Errcode baru: BK060 kapasitas habis, BK061 meja pilihan tidak tersedia,
-- BK063 jumlah tamu di luar rentang layanan.
-- ===========================================================================

alter table public.bookings drop constraint bookings_no_overlap;
alter table public.bookings add constraint bookings_no_overlap exclude using gist (
  merchant_id with =,
  (coalesce(staff_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
  tstzrange(start_datetime, end_datetime, '[)') with &&
) where (status in ('PENDING', 'PAID', 'CONFIRMED', 'REQUESTED') and capacity_mode = 'NONE');
alter table public.bookings add constraint bookings_table_no_overlap exclude using gist (
  table_id with =,
  tstzrange(start_datetime, end_datetime, '[)') with &&
) where (table_id is not null and status in ('PENDING', 'PAID', 'CONFIRMED', 'REQUESTED'));
alter table public.bookings add constraint bookings_joined_table_no_overlap exclude using gist (
  joined_table_id with =,
  tstzrange(start_datetime, end_datetime, '[)') with &&
) where (joined_table_id is not null and status in ('PENDING', 'PAID', 'CONFIRMED', 'REQUESTED'));

-- ---------------------------------------------------------------------------
-- Helper internal (tanpa grant). Hanya dipanggil sesudah kunci merchant.
-- ---------------------------------------------------------------------------

-- Kursi terpakai puncak dalam [p_start, p_end) oleh booking kapasitas
-- pemegang slot. Booking TABLE sisa pergantian mode ikut terhitung.
create function public.seats_in_use(p_merchant_id uuid, p_start timestamptz, p_end timestamptz, p_exclude uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  with r as (
    select b.start_datetime as s, b.end_datetime as e, b.party_size as p
    from public.bookings b
    where b.merchant_id = p_merchant_id
      and b.capacity_mode <> 'NONE'
      and b.id is distinct from p_exclude
      and public.booking_holds_slot(b.status, b.expires_at)
      and tstzrange(b.start_datetime, b.end_datetime, '[)') && tstzrange(p_start, p_end, '[)')
  ), pts as (
    select p_start as t
    union
    select r.s from r where r.s > p_start
  )
  select coalesce(max((select coalesce(sum(r.p), 0) from r where r.s <= pts.t and r.e > pts.t)), 0)::integer
  from pts;
$$;

create function public.dining_table_busy(p_table_id uuid, p_start timestamptz, p_end timestamptz, p_exclude uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.bookings b
    where (b.table_id = p_table_id or b.joined_table_id = p_table_id)
      and b.id is distinct from p_exclude
      and public.booking_holds_slot(b.status, b.expires_at)
      and tstzrange(b.start_datetime, b.end_datetime, '[)') && tstzrange(p_start, p_end, '[)')
  );
$$;

-- Keputusan 8. Nol atau satu baris: meja pilihan, lalu satu meja paling pas,
-- lalu (bila auto_join_tables) dua meja yang boleh digabung. Online = hanya
-- meja bookable_online; booking MANUAL boleh memakai meja offline.
create function public.pick_dining_tables(
  p_merchant_id uuid, p_start timestamptz, p_end timestamptz, p_party integer,
  p_area_id uuid, p_table_id uuid, p_online boolean, p_exclude uuid
)
returns table (table_id uuid, joined_table_id uuid, area_id uuid, table_label text)
language sql
stable
set search_path = ''
as $$
  with c as (
    select t.id, t.area_id, t.name, t.min_seats, t.max_seats, t.sort_order, t.joinable_with
    from public.dining_tables t
    where t.merchant_id = p_merchant_id
      and (t.bookable_online or not p_online)
      and (p_area_id is null or t.area_id = p_area_id)
      and not public.dining_table_busy(t.id, p_start, p_end, p_exclude)
  ), picks as (
    select 1 as step, c.id as a_id, null::uuid as b_id, c.area_id as a_area, c.name as label,
           0 as seats, 0 as sort, ''::text as tie
    from c
    where c.id = p_table_id and p_party between c.min_seats and c.max_seats
    union all
    select 2, c.id, null, c.area_id, c.name, c.max_seats, c.sort_order, c.name
    from c
    where p_table_id is null and p_party between c.min_seats and c.max_seats
    union all
    -- min_seats diabaikan untuk gabungan.
    select 3, a.id, b.id, a.area_id, a.name || ' + ' || b.name, a.max_seats + b.max_seats, a.sort_order, a.name
    from c a
    join c b on a.id < b.id and a.area_id = b.area_id
      and (b.id = any (a.joinable_with) or a.id = any (b.joinable_with))
    where p_table_id is null
      and a.max_seats + b.max_seats >= p_party
      and coalesce((select ms.auto_join_tables from public.merchant_settings ms
                    where ms.merchant_id = p_merchant_id), true)
  )
  select p.a_id, p.b_id, p.a_area, p.label
  from picks p
  order by p.step, p.seats, p.sort, p.tie
  limit 1;
$$;

revoke execute on function public.seats_in_use(uuid, timestamptz, timestamptz, uuid)
  from public, anon, authenticated;
revoke execute on function public.dining_table_busy(uuid, timestamptz, timestamptz, uuid)
  from public, anon, authenticated;
revoke execute on function public.pick_dining_tables(uuid, timestamptz, timestamptz, integer, uuid, uuid, boolean, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_booking: disalin dari 20261117000200 (F5) dengan tambahan
-- p_party_size, p_area_id, p_table_id, p_customer_note. Layanan reservasi
-- (seat_duration_minutes terisi) di merchant ber-table_mode selain NONE
-- memakai kapasitas, tanpa staf, durasi = seat_duration_minutes. Selain itu
-- perilaku lama persis.
-- ---------------------------------------------------------------------------

drop function public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source, text);

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
  p_customer_note text default null
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
begin
  perform pg_advisory_xact_lock(hashtext(p_merchant_id::text));

  p_source := coalesce(p_source, 'ONLINE');

  perform public.reap_expired_bookings_for(p_merchant_id);

  if p_start_datetime <= now() then
    raise exception 'Jam tersebut sudah lewat' using errcode = 'P0006';
  end if;

  select s.name, s.price, s.duration_minutes, s.is_active,
         s.payment_mode, s.deposit_type, s.deposit_value,
         s.party_min, s.party_max, s.seat_duration_minutes
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

  if p_source = 'MANUAL' then
    -- Dicatat merchant sendiri: bayar di tempat, langsung terkonfirmasi,
    -- tanpa koneksi payment (BK021) dan tanpa batas per nomor (BK020).
    -- Booking manual tidak pernah memakai voucher (Keputusan 6).
    v_price := v_service.price;
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
        from public.evaluate_voucher(p_merchant_id, p_voucher_code, p_service_id, p_customer_whatsapp);

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

    v_price := v_service.price - v_discount;

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

  -- Reservasi tidak memakai staf: jam kerja = jam usaha (Keputusan 10).
  if coalesce(v_uses_staff, false) and not v_seat then
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

  return query
    insert into public.bookings (
      merchant_id, service_id, service_name, service_price, duration_minutes,
      start_datetime, end_datetime, customer_name, customer_whatsapp,
      staff_id, staff_name,
      payment_mode, amount_due_now, amount_due_on_site, status, expires_at, source,
      voucher_id, voucher_code, discount_amount,
      party_size, area_id, table_id, joined_table_id, table_label, customer_note, capacity_mode
    )
    values (
      p_merchant_id, p_service_id, v_service.name, v_service.price, v_duration,
      p_start_datetime, v_end_datetime, p_customer_name, p_customer_whatsapp,
      v_staff_id, v_staff_name,
      v_mode, v_due_now, v_price - v_due_now, v_status, v_expires_at, p_source,
      v_voucher_id, v_voucher_code, v_discount,
      v_party, v_area_id, v_table_id, v_joined_table_id, v_table_label,
      nullif(btrim(p_customer_note), ''), v_capacity_mode
    )
    returning *;
end;
$$;

revoke execute on function public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source, text, integer, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source, text, integer, uuid, uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- create_manual_booking: disalin dari 20261115000600, meneruskan jumlah tamu,
-- meja, dan catatan. Booking manual boleh memakai meja offline.
-- ---------------------------------------------------------------------------

drop function public.create_manual_booking(uuid, timestamptz, text, text, uuid);

create or replace function public.create_manual_booking(
  p_service_id uuid,
  p_start_datetime timestamptz,
  p_customer_name text,
  p_customer_whatsapp text,
  p_staff_id uuid default null,
  p_party_size integer default null,
  p_table_id uuid default null,
  p_customer_note text default null
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
      p_staff_id, false, 'MANUAL', null, p_party_size, null, p_table_id, p_customer_note
    ) b;
end;
$$;

revoke execute on function public.create_manual_booking(uuid, timestamptz, text, text, uuid, integer, uuid, text)
  from public, anon;
grant execute on function public.create_manual_booking(uuid, timestamptz, text, text, uuid, integer, uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- move_booking_slot: disalin dari 20261116000200 (F4). Reservasi AREA
-- diperiksa kursinya; reservasi TABLE mempertahankan mejanya bila masih
-- kosong, selain itu mendapat meja lain lewat pick_dining_tables.
-- ---------------------------------------------------------------------------

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
begin
  if p_new_start <= now() then
    raise exception 'Jam tersebut sudah lewat' using errcode = 'P0006';
  end if;

  select x.duration_minutes, x.staff_id,
         x.capacity_mode, x.party_size, x.table_id, x.joined_table_id, x.area_id, x.table_label, x.source
    into v_duration, v_staff_id,
         v_capacity_mode, v_party, v_table_id, v_joined_table_id, v_area_id, v_table_label, v_source
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

  if not public.slot_within_hours(
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

  -- Booking NONE: bentrok dengan booking lain ditangkap bookings_no_overlap (23P01);
  -- baris yang sedang diubah tidak bentrok dengan dirinya sendiri.
  update public.bookings
    set start_datetime = p_new_start, end_datetime = v_end,
        table_id = v_table_id, joined_table_id = v_joined_table_id,
        area_id = v_area_id, table_label = v_table_label
    where id = p_booking_id and merchant_id = p_merchant_id;

  -- Log idempoten per (booking, kind, channel): hapus supaya pengingat dan
  -- pemberitahuan ubah jadwal terkirim lagi untuk jam baru.
  delete from public.notification_log
    where booking_id = p_booking_id
      and kind in ('REMINDER_CUSTOMER', 'REMINDER_CUSTOMER_SAME_DAY', 'BOOKING_RESCHEDULED_MERCHANT');
end;
$$;

revoke execute on function public.move_booking_slot(uuid, uuid, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_booked_ranges: disalin dari 20261115000200 (F2), hanya slot eksklusif.
-- ---------------------------------------------------------------------------

create or replace function public.get_booked_ranges(
  p_username text,
  p_from timestamptz,
  p_to timestamptz
)
returns table (start_datetime timestamptz, end_datetime timestamptz, staff_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select b.start_datetime, b.end_datetime, b.staff_id
  from public.bookings b
  join public.merchants m on m.id = b.merchant_id
  where m.username = p_username
    -- Rentang reservasi tidak menghalangi slot eksklusif, sama dengan
    -- predikat bookings_no_overlap.
    and b.capacity_mode = 'NONE'
    and public.booking_holds_slot(b.status, b.expires_at)
    and b.start_datetime < p_to
    and b.end_datetime > p_from
  order by b.start_datetime;
$$;

revoke execute on function public.get_booked_ranges(text, timestamptz, timestamptz) from public;
grant execute on function public.get_booked_ranges(text, timestamptz, timestamptz) to anon, authenticated;

notify pgrst, 'reload schema';
