-- ===========================================================================
-- Multi-staf (paket Studio): jadwal dan booking per staf.
--
-- MODEL
--   staff                 -- orang yang menangani layanan, milik satu merchant
--   staff_availability    -- jam kerja staf, maksimal satu rentang per hari.
--                            Staf TANPA baris di sini mengikuti jam kerja usaha
--                            (tabel availability), supaya staf baru langsung
--                            bisa dipesan tanpa harus diatur dulu.
--   bookings.staff_id     -- staf yang menangani + snapshot staff_name (sama
--                            alasannya dengan snapshot layanan, DECISIONS #6)
--
-- Jam staf SENGAJA tabel terpisah, bukan kolom staff_id di availability:
-- banyak tempat membaca availability sebagai "jam kerja usaha" (slot publik,
-- onboarding, peringatan setup), dan baris staf di sana akan diam-diam
-- mengubah arti semuanya.
--
-- KALENDER
--   bookings_no_overlap kini per (merchant, staf): dua staf boleh melayani di
--   jam yang sama. Booking tanpa staf dihitung sebagai satu kalender sendiri
--   (staff_id NULL -> uuid nol), sama persis dengan perilaku lama.
--
-- PAKET
--   Staf hanya bisa DIBUAT oleh merchant Studio (trigger). Kalau merchant turun
--   paket, baris staf tetap ada tapi create_booking dan /api/slots
--   mengabaikannya -- kalendernya kembali satu, tanpa data yang hilang.
-- ===========================================================================

-- --- staff ----------------------------------------------------------------
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint staff_name_length check (char_length(btrim(name)) between 1 and 60),
  -- Target foreign key gabungan dari staff_availability.
  constraint staff_id_merchant_key unique (id, merchant_id)
);

create index staff_merchant_idx on public.staff (merchant_id, sort_order, created_at);

create trigger staff_set_updated_at
  before update on public.staff
  for each row execute function public.set_updated_at();

/** Batas staf per merchant -- cukup untuk studio, mencegah penyalahgunaan. */
create or replace function public.enforce_staff_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select m.subscription_tier from public.merchants m where m.id = new.merchant_id)
     is distinct from 'STUDIO' then
    raise exception 'Fitur staf khusus paket Studio' using errcode = 'BK010';
  end if;

  if (select count(*) from public.staff s where s.merchant_id = new.merchant_id) >= 20 then
    raise exception 'Maksimal 20 staf' using errcode = 'BK011';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_staff_limit() from public;

create trigger staff_enforce_limit
  before insert on public.staff
  for each row execute function public.enforce_staff_limit();

alter table public.staff enable row level security;
revoke all on public.staff from anon, authenticated;

-- Pelanggan memilih staf di halaman publik: anon butuh nama staf aktif.
grant select (id, merchant_id, name, is_active, sort_order) on public.staff to anon;
grant select, insert, delete on public.staff to authenticated;
grant update (name, is_active, sort_order) on public.staff to authenticated;

create policy "staff_public_read"
  on public.staff for select
  to anon
  using (
    is_active
    and exists (
      select 1 from public.merchants m
      where m.id = staff.merchant_id and m.username is not null
    )
  );

create policy "staff_read_own"
  on public.staff for select to authenticated
  using ((select auth.uid()) = merchant_id);

create policy "staff_insert_own"
  on public.staff for insert to authenticated
  with check ((select auth.uid()) = merchant_id);

create policy "staff_update_own"
  on public.staff for update to authenticated
  using ((select auth.uid()) = merchant_id)
  with check ((select auth.uid()) = merchant_id);

create policy "staff_delete_own"
  on public.staff for delete to authenticated
  using ((select auth.uid()) = merchant_id);

-- --- staff_availability ----------------------------------------------------
create table public.staff_availability (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null,
  merchant_id uuid not null,
  day_of_week integer not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),

  -- Gabungan (staff_id, merchant_id) memastikan merchant tidak bisa menulis
  -- jam kerja untuk staf milik merchant lain walau id stafnya diketahui.
  constraint staff_availability_staff_fk foreign key (staff_id, merchant_id)
    references public.staff (id, merchant_id) on delete cascade,
  constraint staff_availability_day_range check (day_of_week between 1 and 7),
  constraint staff_availability_time_order check (end_time > start_time),
  constraint staff_availability_one_per_day unique (staff_id, day_of_week)
);

alter table public.staff_availability enable row level security;
revoke all on public.staff_availability from anon, authenticated;

grant select (staff_id, merchant_id, day_of_week, start_time, end_time)
  on public.staff_availability to anon;
grant select, insert, delete on public.staff_availability to authenticated;

create policy "staff_availability_public_read"
  on public.staff_availability for select to anon
  using (
    exists (
      select 1 from public.staff s
      join public.merchants m on m.id = s.merchant_id
      where s.id = staff_availability.staff_id
        and s.is_active
        and m.username is not null
    )
  );

create policy "staff_availability_read_own"
  on public.staff_availability for select to authenticated
  using ((select auth.uid()) = merchant_id);

create policy "staff_availability_insert_own"
  on public.staff_availability for insert to authenticated
  with check ((select auth.uid()) = merchant_id);

create policy "staff_availability_delete_own"
  on public.staff_availability for delete to authenticated
  using ((select auth.uid()) = merchant_id);

/**
 * Mengganti seluruh jam kerja satu staf dalam satu statement (pola yang sama
 * dengan replace_merchant_faqs, DECISIONS #25). Array kosong berarti "ikut
 * jam kerja usaha". `security invoker`: RLS tetap berlaku.
 */
create or replace function public.replace_staff_availability(p_staff_id uuid, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.staff_availability
  where staff_id = p_staff_id
    and merchant_id = (select auth.uid());

  insert into public.staff_availability (staff_id, merchant_id, day_of_week, start_time, end_time)
  select p_staff_id, (select auth.uid()), r.day_of_week, r.start_time, r.end_time
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
    as r(day_of_week integer, start_time time, end_time time);
end;
$$;

revoke execute on function public.replace_staff_availability(uuid, jsonb) from public;
grant execute on function public.replace_staff_availability(uuid, jsonb) to authenticated;

-- --- bookings ---------------------------------------------------------------
alter table public.bookings
  -- NO ACTION (bawaan), bukan SET NULL: memindahkan booking staf ke kalender
  -- "tanpa staf" bisa menabrak booking lain di sana. Staf yang pernah
  -- menangani booking dinonaktifkan, bukan dihapus. Hapus akun tetap jalan
  -- karena NO ACTION baru diperiksa di akhir statement cascade.
  add column staff_id uuid references public.staff (id),
  add column staff_name text,
  add constraint bookings_staff_name_length
    check (staff_name is null or char_length(staff_name) <= 60);

create index bookings_staff_idx on public.bookings (staff_id) where staff_id is not null;

alter table public.bookings drop constraint bookings_no_overlap;
alter table public.bookings add constraint bookings_no_overlap exclude using gist (
  merchant_id with =,
  (coalesce(staff_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
  tstzrange(start_datetime, end_datetime, '[)') with &&
) where (status in ('PENDING', 'PAID'));

-- --- Jam kerja efektif ------------------------------------------------------
/**
 * True bila [p_start, p_end) (jam dinding WIB pada hari p_dow) masuk jam kerja
 * staf -- atau jam kerja usaha bila staf tidak punya jam sendiri. NULL
 * p_staff_id berarti jam kerja usaha. Dipanggil dari create_booking.
 */
create or replace function public.slot_within_hours(
  p_merchant_id uuid,
  p_staff_id uuid,
  p_dow integer,
  p_start time,
  p_end time
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_staff_id is not null and exists (
      select 1 from public.staff_availability sa where sa.staff_id = p_staff_id
    ) then exists (
      select 1 from public.staff_availability sa
      where sa.staff_id = p_staff_id
        and sa.day_of_week = p_dow
        and sa.start_time <= p_start
        and sa.end_time >= p_end
    )
    else exists (
      select 1 from public.availability a
      where a.merchant_id = p_merchant_id
        and a.day_of_week = p_dow
        and a.start_time <= p_start
        and a.end_time >= p_end
    )
  end;
$$;

revoke execute on function public.slot_within_hours(uuid, uuid, integer, time, time) from public;

-- --- create_booking ---------------------------------------------------------
drop function public.create_booking(uuid, uuid, timestamptz, text, text);

/**
 * Sama dengan versi sebelumnya (reap_expired_pending_inline), ditambah staf:
 *   - Merchant Studio yang punya staf aktif: p_staff_id dipakai bila diisi;
 *     NULL berarti "siapa saja" -- staf aktif pertama (sort_order) yang jam
 *     kerjanya mencakup slot dan belum punya booking yang beririsan.
 *   - Selain itu p_staff_id diabaikan dan kalendernya satu seperti dulu.
 */
create or replace function public.create_booking(
  p_merchant_id uuid,
  p_service_id uuid,
  p_start_datetime timestamptz,
  p_customer_name text,
  p_customer_whatsapp text,
  p_staff_id uuid default null
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
begin
  perform pg_advisory_xact_lock(hashtext(p_merchant_id::text));

  update public.bookings
  set status = 'CANCELLED',
      cancelled_at = now(),
      cancel_reason = 'DP tidak dibayar dalam batas waktu'
  where merchant_id = p_merchant_id
    and status = 'PENDING'
    and expires_at <= now();

  if p_start_datetime <= now() then
    raise exception 'Jam tersebut sudah lewat' using errcode = 'P0006';
  end if;

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
              and b.status in ('PENDING', 'PAID')
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
      staff_id, staff_name
    )
    values (
      p_merchant_id, p_service_id, v_service.name, v_service.price, v_service.duration_minutes,
      p_start_datetime, v_end_datetime, p_customer_name, p_customer_whatsapp,
      v_staff_id, v_staff_name
    )
    returning *;
end;
$$;

revoke execute on function public.create_booking(uuid, uuid, timestamptz, text, text, uuid) from public;
revoke execute on function public.create_booking(uuid, uuid, timestamptz, text, text, uuid) from anon, authenticated;
grant execute on function public.create_booking(uuid, uuid, timestamptz, text, text, uuid) to service_role;

-- --- get_booked_ranges ------------------------------------------------------
-- Tipe kembalian berubah (kolom staff_id), jadi harus drop + create.
drop function public.get_booked_ranges(text, timestamptz, timestamptz);

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
    and (
      b.status = 'PAID'
      or (b.status = 'PENDING' and b.expires_at > now())
    )
    and b.start_datetime < p_to
    and b.end_datetime > p_from
  order by b.start_datetime;
$$;

revoke execute on function public.get_booked_ranges(text, timestamptz, timestamptz) from public;
grant execute on function public.get_booked_ranges(text, timestamptz, timestamptz)
  to anon, authenticated;

notify pgrst, 'reload schema';
