-- ===========================================================================
-- Funnel iklan, Task 2: kejadian funnel, atribusi booking, ringkasan funnel.
--
-- BOOKED ditulis create_booking hanya untuk booking ONLINE yang membawa
-- session_id; PAID ditulis record_paid_event hanya untuk booking ber-session_id.
-- Jadi Dibayar <= Booking dibuat, dan booking manual/lama tidak masuk funnel.
-- Batas panjang UTM (64) dan referrer_host (100, host saja) sama dengan
-- src/lib/funnel/*.
-- ===========================================================================

-- FK gabungan funnel_events.merchant_link_id: tautan merchant lain tertolak.
alter table public.merchant_links
  add constraint merchant_links_id_merchant_key unique (id, merchant_id);

-- ---------------------------------------------------------------------------
-- funnel_events
-- ---------------------------------------------------------------------------
create table public.funnel_events (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  session_id uuid not null,
  kind public.funnel_event_kind not null,
  ad_link_id uuid,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer_host text,
  service_id uuid,
  booking_id uuid references public.bookings (id) on delete cascade,
  merchant_link_id uuid,
  created_at timestamptz not null default now(),
  constraint funnel_events_utm_length check (
    char_length(utm_source) <= 64 and char_length(utm_medium) <= 64 and char_length(utm_campaign) <= 64),
  constraint funnel_events_referrer_host_format check (referrer_host ~ '^[a-z0-9.-]{1,100}$'),
  constraint funnel_events_ad_link_fk foreign key (ad_link_id, merchant_id)
    references public.ad_links (id, merchant_id) on delete set null (ad_link_id),
  constraint funnel_events_service_fk foreign key (service_id, merchant_id)
    references public.services (id, merchant_id) on delete set null (service_id),
  constraint funnel_events_merchant_link_fk foreign key (merchant_link_id, merchant_id)
    references public.merchant_links (id, merchant_id) on delete set null (merchant_link_id)
);

create index funnel_events_merchant_created_idx on public.funnel_events (merchant_id, created_at);
-- Satu BOOKED dan satu PAID per booking; dipakai on conflict di record_paid_event.
create unique index funnel_events_booking_kind_key on public.funnel_events (booking_id, kind)
  where booking_id is not null;
create index funnel_events_ad_link_idx on public.funnel_events (ad_link_id, merchant_id) where ad_link_id is not null;
create index funnel_events_service_idx on public.funnel_events (service_id, merchant_id) where service_id is not null;
create index funnel_events_merchant_link_idx on public.funnel_events (merchant_link_id, merchant_id)
  where merchant_link_id is not null;
-- Tabel tambah-saja, urut waktu: BRIN kecil cukup untuk prune_funnel_events.
create index funnel_events_created_brin on public.funnel_events using brin (created_at);

alter table public.funnel_events enable row level security;
revoke all on public.funnel_events from anon, authenticated;
-- Ditulis service_role (/api/events) dan fungsi definer saja.
grant select on public.funnel_events to authenticated;

create policy "funnel_events_select_own" on public.funnel_events for select to authenticated
  using ((select auth.uid()) = merchant_id);

-- ---------------------------------------------------------------------------
-- bookings: atribusi
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column session_id uuid,
  add column ad_link_id uuid,
  add column utm_source text,
  add column utm_medium text,
  add column utm_campaign text,
  add column referrer_host text,
  -- event_id pixel (Lead; Purchase = ini + ":paid"). Bukan token akses.
  add column pixel_event_id uuid not null default gen_random_uuid(),
  add constraint bookings_utm_length check (
    char_length(utm_source) <= 64 and char_length(utm_medium) <= 64 and char_length(utm_campaign) <= 64),
  add constraint bookings_referrer_host_format check (referrer_host ~ '^[a-z0-9.-]{1,100}$'),
  add constraint bookings_ad_link_fk foreign key (ad_link_id, merchant_id)
    references public.ad_links (id, merchant_id) on delete set null (ad_link_id);

create unique index bookings_pixel_event_id_key on public.bookings (pixel_event_id);
create index bookings_ad_link_idx on public.bookings (ad_link_id, merchant_id) where ad_link_id is not null;

-- ---------------------------------------------------------------------------
-- create_booking: disalin dari 20261120000200 dengan tambahan parameter
-- atribusi (semua default null). Urutan kunci, harga, dan errcode tidak
-- berubah; atribusi dinormalkan sesudah semua pemeriksaan, tepat sebelum
-- insert, lalu BOOKED ditulis dalam transaksi yang sama.
-- ---------------------------------------------------------------------------

drop function public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source, text, integer, uuid, uuid, text);

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
  p_referrer_host text default null
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
    session_id, ad_link_id, utm_source, utm_medium, utm_campaign, referrer_host
  )
  values (
    p_merchant_id, p_service_id, v_service.name, v_service.price, v_duration,
    p_start_datetime, v_end_datetime, p_customer_name, p_customer_whatsapp,
    v_staff_id, v_staff_name,
    v_mode, v_due_now, v_price - v_due_now, v_status, v_expires_at, p_source,
    v_voucher_id, v_voucher_code, v_discount,
    v_party, v_area_id, v_table_id, v_joined_table_id, v_table_label,
    nullif(btrim(p_customer_note), ''), v_capacity_mode,
    p_session_id, p_ad_link_id, p_utm_source, p_utm_medium, p_utm_campaign, p_referrer_host
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

revoke execute on function public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source, text, integer, uuid, uuid, text,
  uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source, text, integer, uuid, uuid, text,
  uuid, uuid, text, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- record_paid_event: dipanggil webhook sesudah status jadi PAID. Idempoten
-- lewat funnel_events_booking_kind_key; booking tanpa sesi (manual, lama)
-- tidak pernah punya BOOKED, jadi juga tidak mendapat PAID.
-- ---------------------------------------------------------------------------
create function public.record_paid_event(p_booking_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.funnel_events (
    merchant_id, session_id, kind, ad_link_id, utm_source, utm_medium, utm_campaign,
    referrer_host, service_id, booking_id
  )
  select b.merchant_id, b.session_id, 'PAID'::public.funnel_event_kind, b.ad_link_id, b.utm_source, b.utm_medium, b.utm_campaign,
         b.referrer_host, b.service_id, b.id
  from public.bookings b
  where b.id = p_booking_id and b.status = 'PAID' and b.session_id is not null
  on conflict (booking_id, kind) where booking_id is not null do nothing;
$$;
revoke execute on function public.record_paid_event(uuid) from public, anon, authenticated;
grant execute on function public.record_paid_event(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- get_paid_event: ringkasan untuk halaman terima kasih (tanpa token, tanpa
-- data pelanggan). Hanya PAID yang dibayar dalam 24 jam terakhir.
-- amount = yang dibayar lewat QRIS.
-- ---------------------------------------------------------------------------
create function public.get_paid_event(p_event_id uuid)
returns table (merchant_id uuid, service_name text, amount numeric, currency text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.merchant_id, b.service_name, b.amount_due_now, 'IDR'::text
  from public.bookings b
  where b.pixel_event_id = p_event_id
    and b.status = 'PAID'
    and b.paid_at > now() - interval '24 hours';
$$;
revoke execute on function public.get_paid_event(uuid) from public, anon, authenticated;
grant execute on function public.get_paid_event(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- funnel_summary: baris per kanal untuk merchant yang login. Langkah browser
-- dihitung per sesi unik; Booking dan Dibayar per booking (unik lewat
-- funnel_events_booking_kind_key). Omzet = nominal QRIS booking PAID.
-- ---------------------------------------------------------------------------
create function public.funnel_summary(p_from timestamptz, p_to timestamptz)
returns table (
  channel text, views integer, service_views integer, checkouts integer,
  booked integer, paid integer, revenue numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(l.channel::text, e.utm_source, 'LANGSUNG'),
         (count(distinct e.session_id) filter (where e.kind = 'VIEW'))::integer,
         (count(distinct e.session_id) filter (where e.kind = 'SERVICE'))::integer,
         (count(distinct e.session_id) filter (where e.kind = 'CHECKOUT'))::integer,
         (count(*) filter (where e.kind = 'BOOKED'))::integer,
         (count(*) filter (where e.kind = 'PAID'))::integer,
         coalesce(sum(b.amount_due_now) filter (where e.kind = 'PAID'), 0)
  from public.funnel_events e
  left join public.ad_links l on l.id = e.ad_link_id and l.merchant_id = e.merchant_id
  left join public.bookings b on b.id = e.booking_id and b.merchant_id = e.merchant_id
  where e.merchant_id = (select auth.uid())
    and e.created_at >= p_from and e.created_at < p_to
  group by 1
  order by 2 desc, 1;
$$;
revoke execute on function public.funnel_summary(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.funnel_summary(timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- ad_link_stats: angka per tautan iklan untuk tabel di /dashboard/iklan.
-- ---------------------------------------------------------------------------
create function public.ad_link_stats(p_from timestamptz, p_to timestamptz)
returns table (ad_link_id uuid, views integer, booked integer, paid integer, revenue numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select e.ad_link_id,
         (count(distinct e.session_id) filter (where e.kind = 'VIEW'))::integer,
         (count(*) filter (where e.kind = 'BOOKED'))::integer,
         (count(*) filter (where e.kind = 'PAID'))::integer,
         coalesce(sum(b.amount_due_now) filter (where e.kind = 'PAID'), 0)
  from public.funnel_events e
  left join public.bookings b on b.id = e.booking_id and b.merchant_id = e.merchant_id
  where e.merchant_id = (select auth.uid())
    and e.ad_link_id is not null
    and e.created_at >= p_from and e.created_at < p_to
  group by e.ad_link_id;
$$;
revoke execute on function public.ad_link_stats(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.ad_link_stats(timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- prune_funnel_events: retensi 13 bulan, dipanggil cron. Mengembalikan jumlah
-- baris yang dihapus.
-- ---------------------------------------------------------------------------
create function public.prune_funnel_events()
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with d as (
    delete from public.funnel_events where created_at < now() - interval '13 months' returning 1
  )
  select count(*)::integer from d;
$$;
revoke execute on function public.prune_funnel_events() from public, anon, authenticated;
grant execute on function public.prune_funnel_events() to service_role;

notify pgrst, 'reload schema';
