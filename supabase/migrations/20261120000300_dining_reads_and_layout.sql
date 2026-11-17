-- ===========================================================================
-- F8 Restoran, bagian 3: RPC baca untuk pelanggan dan RPC simpan denah.
--
-- get_seat_availability dan get_table_status (anon, authenticated) hanya
-- mengembalikan jam, id meja, status, dan angka; tidak pernah data pelanggan.
-- Keduanya memakai helper yang sama persis dengan create_booking
-- (seats_in_use, pick_dining_tables, dining_table_busy) dan tidak mengunci:
-- create_booking yang memutuskan di bawah kunci merchant (Keputusan 6).
--
-- save_dining_layout (authenticated) mengganti seluruh denah merchant dalam
-- satu transaksi di bawah kunci merchant yang sama dengan create_booking,
-- supaya hapus meja tidak balapan dengan booking baru (Keputusan 14).
--
-- Errcode baru: BK062 meja/area masih punya reservasi mendatang, BK064 denah
-- tidak valid.
-- ===========================================================================

create function public.get_seat_availability(
  p_username text,
  p_service_id uuid,
  p_party_size integer,
  p_area_id uuid,
  p_starts timestamptz[]
)
returns table (start_datetime timestamptz, available boolean, tables_left integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_merchant_id uuid;
  v_mode public.table_mode;
  v_seats integer;
  v_service record;
  v_fits boolean;
begin
  if cardinality(p_starts) > 96 or p_party_size is null or p_party_size not between 1 and 200 then
    raise exception 'Argumen ketersediaan tidak valid' using errcode = '22023';
  end if;

  select m.id, ms.table_mode, ms.seats_per_slot into v_merchant_id, v_mode, v_seats
    from public.merchants m
    left join public.merchant_settings ms on ms.merchant_id = m.id
    where m.username = p_username;

  -- Tidak ada baris merchant_settings = mode NONE: kembalian kosong.
  if coalesce(v_mode, 'NONE') = 'NONE' then
    return;
  end if;

  select s.party_min, s.party_max, s.seat_duration_minutes into v_service
    from public.services s
    where s.id = p_service_id
      and s.merchant_id = v_merchant_id
      and s.is_active
      and s.seat_duration_minutes is not null;

  if not found then
    return;
  end if;

  v_fits := p_party_size between v_service.party_min and v_service.party_max;

  -- Tidak memeriksa jam buka: pemanggil membuat kandidat dari jam buka.
  return query
  with c as (
    select distinct x.st, x.st + v_service.seat_duration_minutes * interval '1 minute' as en
    from unnest(p_starts) as x(st)
    where x.st is not null
  )
  select c.st,
         case when not v_fits or c.st <= now() then false
              when v_mode = 'AREA'
                then p_party_size + public.seats_in_use(v_merchant_id, c.st, c.en, null) <= v_seats
              else exists (select 1 from public.pick_dining_tables(
                             v_merchant_id, c.st, c.en, p_party_size, p_area_id, null, true, null))
         end,
         case when v_mode = 'AREA' then null::integer
              when not v_fits or c.st <= now() then 0
              else (select count(*)::integer
                    from public.dining_tables t
                    where t.merchant_id = v_merchant_id
                      and t.bookable_online
                      and (p_area_id is null or t.area_id = p_area_id)
                      and p_party_size between t.min_seats and t.max_seats
                      and not public.dining_table_busy(t.id, c.st, c.en, null))
         end
  from c
  order by c.st;
end;
$$;

create function public.get_table_status(
  p_username text,
  p_service_id uuid,
  p_start timestamptz,
  p_party_size integer
)
returns table (table_id uuid, status text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_merchant_id uuid;
  v_end timestamptz;
begin
  if p_start is null or p_party_size is null or p_party_size not between 1 and 200 then
    raise exception 'Argumen status meja tidak valid' using errcode = '22023';
  end if;

  select m.id, p_start + s.seat_duration_minutes * interval '1 minute' into v_merchant_id, v_end
    from public.merchants m
    join public.merchant_settings ms on ms.merchant_id = m.id and ms.table_mode = 'TABLE'
    join public.services s on s.merchant_id = m.id and s.id = p_service_id
      and s.is_active and s.seat_duration_minutes is not null
    where m.username = p_username;

  if not found then
    return;
  end if;

  -- Hanya meja online; meja offline tidak pernah terlihat pelanggan.
  return query
  select t.id,
         case when public.dining_table_busy(t.id, p_start, v_end, null) then 'TAKEN'
              when t.max_seats < p_party_size then 'TOO_SMALL'
              when t.min_seats > p_party_size then 'TOO_LARGE'
              else 'FREE'
         end
  from public.dining_tables t
  where t.merchant_id = v_merchant_id
    and t.bookable_online
  order by t.sort_order, t.name;
end;
$$;

revoke execute on function public.get_seat_availability(text, uuid, integer, uuid, timestamptz[])
  from public, anon, authenticated;
revoke execute on function public.get_table_status(text, uuid, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.get_seat_availability(text, uuid, integer, uuid, timestamptz[])
  to anon, authenticated;
grant execute on function public.get_table_status(text, uuid, timestamptz, integer)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- save_dining_layout: payload menggantikan seluruh denah merchant pemanggil.
-- Yang tidak ada di payload dihapus. Nama unik diperiksa di payload, bukan
-- unique index, supaya tukar nama dua meja dalam satu simpan tidak gagal.
-- ---------------------------------------------------------------------------

create function public.save_dining_layout(p_areas jsonb, p_tables jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_merchant_id uuid := auth.uid();
  v_area_ids uuid[];
  v_table_ids uuid[];
  v_count integer;
  v_bad boolean;
begin
  if v_merchant_id is null then
    raise exception 'Harus masuk' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_merchant_id::text));

  p_areas := coalesce(p_areas, '[]'::jsonb);
  p_tables := coalesce(p_tables, '[]'::jsonb);

  -- id ganda atau null juga BK064: upsert tidak boleh menyentuh satu baris dua kali.
  select coalesce(array_agg(a.id), '{}'),
         count(*) > 10 or count(distinct a.id) <> count(*)
           or count(distinct lower(btrim(a.name))) <> count(*)
    into v_area_ids, v_bad
    from jsonb_to_recordset(p_areas) as a(id uuid, name text);
  if v_bad then
    raise exception 'Denah tidak valid: area' using errcode = 'BK064';
  end if;

  select coalesce(array_agg(t.id), '{}'),
         count(*) > 100 or count(distinct t.id) <> count(*)
           or count(distinct lower(btrim(t.name))) <> count(*)
           or not coalesce(bool_and(coalesce(t.area_id = any (v_area_ids), false)), true)
    into v_table_ids, v_bad
    from jsonb_to_recordset(p_tables) as t(id uuid, name text, area_id uuid);
  if v_bad then
    raise exception 'Denah tidak valid: meja' using errcode = 'BK064';
  end if;

  -- Gabungan hanya ke meja payload di area yang sama.
  if exists (
    select 1
    from jsonb_to_recordset(p_tables) as t(id uuid, area_id uuid, joinable_with uuid[]),
         unnest(t.joinable_with) as j(id)
    where not exists (
      select 1 from jsonb_to_recordset(p_tables) as u(id uuid, area_id uuid)
      where u.id = j.id and u.area_id = t.area_id)
  ) then
    raise exception 'Denah tidak valid: gabungan meja' using errcode = 'BK064';
  end if;

  if exists (select 1 from public.dining_areas a
             where a.id = any (v_area_ids) and a.merchant_id <> v_merchant_id)
     or exists (select 1 from public.dining_tables t
                where t.id = any (v_table_ids) and t.merchant_id <> v_merchant_id) then
    raise exception 'Denah milik merchant lain' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.bookings b
    where b.merchant_id = v_merchant_id
      and public.booking_holds_slot(b.status, b.expires_at)
      and b.end_datetime > now()
      and (exists (select 1 from public.dining_tables t
                   where t.merchant_id = v_merchant_id
                     and not (t.id = any (v_table_ids))
                     and t.id in (b.table_id, b.joined_table_id))
           or exists (select 1 from public.dining_areas a
                      where a.merchant_id = v_merchant_id
                        and not (a.id = any (v_area_ids))
                        and a.id = b.area_id))
  ) then
    raise exception 'Meja atau area masih punya reservasi mendatang' using errcode = 'BK062';
  end if;

  -- Upsert dulu, hapus belakangan: meja yang pindah ke area baru sudah
  -- menunjuk area barunya sebelum area lama dihapus, jadi tidak ikut
  -- terhapus kaskade (dan booking-nya tidak kehilangan table_id).
  insert into public.dining_areas (id, merchant_id, name, sort_order)
  select a.id, v_merchant_id, btrim(a.name), a.sort_order
    from jsonb_to_recordset(p_areas) as a(id uuid, name text, sort_order integer)
  on conflict (id) do update
    set name = excluded.name, sort_order = excluded.sort_order
    where public.dining_areas.merchant_id = v_merchant_id;
  get diagnostics v_count = row_count;
  if v_count <> cardinality(v_area_ids) then
    raise exception 'Denah milik merchant lain' using errcode = '42501';
  end if;

  insert into public.dining_tables (id, merchant_id, area_id, name, min_seats, max_seats, shape,
                                    grid_x, grid_y, grid_w, grid_h, note, bookable_online,
                                    joinable_with, sort_order)
  select t.id, v_merchant_id, t.area_id, btrim(t.name), t.min_seats, t.max_seats, t.shape,
         t.grid_x, t.grid_y, t.grid_w, t.grid_h, t.note, t.bookable_online,
         t.joinable_with, t.sort_order
    from jsonb_to_recordset(p_tables) as t(
      id uuid, area_id uuid, name text, min_seats smallint, max_seats smallint,
      shape public.dining_table_shape, grid_x smallint, grid_y smallint, grid_w smallint,
      grid_h smallint, note text, bookable_online boolean, joinable_with uuid[], sort_order integer)
  on conflict (id) do update
    set area_id = excluded.area_id, name = excluded.name, min_seats = excluded.min_seats,
        max_seats = excluded.max_seats, shape = excluded.shape, grid_x = excluded.grid_x,
        grid_y = excluded.grid_y, grid_w = excluded.grid_w, grid_h = excluded.grid_h,
        note = excluded.note, bookable_online = excluded.bookable_online,
        joinable_with = excluded.joinable_with, sort_order = excluded.sort_order
    where public.dining_tables.merchant_id = v_merchant_id;
  get diagnostics v_count = row_count;
  if v_count <> cardinality(v_table_ids) then
    raise exception 'Denah milik merchant lain' using errcode = '42501';
  end if;

  delete from public.dining_tables t
    where t.merchant_id = v_merchant_id and not (t.id = any (v_table_ids));
  delete from public.dining_areas a
    where a.merchant_id = v_merchant_id and not (a.id = any (v_area_ids));
end;
$$;

revoke execute on function public.save_dining_layout(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_dining_layout(jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
