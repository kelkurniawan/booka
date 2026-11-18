-- Booking lapangan, pengerasan dari review Task 2 (20261126000200 dan 0300
-- belum dirilis, jadi create or replace di sini aman):
--   - nama lapangan tanpa spasi di ujung, ciri lapangan tidak boleh null;
--   - save_court_pricing menolak lebih dari 50 aturan dan layanan bukan sewa;
--   - payload tidak valid di kedua RPC simpan selalu 22023 (23P01 tetap untuk
--     aturan tumpang tindih);
--   - save_venue_layout: cek id null yang benar, upsert hanya baris sendiri.

create or replace function public.court_features_valid(p_features text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not exists (select 1 from unnest(p_features) f where f is null or char_length(f) not between 1 and 40);
$$;

alter table public.courts add constraint courts_name_trimmed check (name = btrim(name));

create or replace function public.save_court_pricing(p_service_id uuid, p_rules jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_merchant_id uuid := auth.uid();
begin
  if v_merchant_id is null then
    raise exception 'Harus masuk' using errcode = '42501';
  end if;
  if p_rules is null or jsonb_typeof(p_rules) <> 'array' then
    raise exception 'Aturan harga harus berupa array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rules) > 50 then
    raise exception 'Aturan harga maksimal 50' using errcode = '22023';
  end if;

  -- Kunci yang sama dengan create_booking: harga tidak berubah di tengah booking.
  perform pg_advisory_xact_lock(hashtext(v_merchant_id::text));

  if not exists (select 1 from public.services s
                 where s.id = p_service_id and s.merchant_id = v_merchant_id) then
    raise exception 'Layanan bukan milik Anda' using errcode = '42501';
  end if;
  if not exists (select 1 from public.services s
                 where s.id = p_service_id and s.court_unit_minutes is not null) then
    raise exception 'Layanan ini bukan sewa lapangan' using errcode = '22023';
  end if;

  delete from public.court_price_rules
   where service_id = p_service_id and merchant_id = v_merchant_id;

  begin
    insert into public.court_price_rules
      (merchant_id, service_id, day_of_week, start_time, end_time, price_per_hour)
    select v_merchant_id, p_service_id, r.day_of_week, r.start_time, r.end_time, r.price_per_hour
      from jsonb_to_recordset(p_rules) as r(
        day_of_week smallint, start_time time, end_time time, price_per_hour numeric);
  exception
    when exclusion_violation then
      raise exception 'Aturan jam ramai tumpang tindih di hari yang sama' using errcode = '23P01';
    when check_violation or not_null_violation or data_exception then
      raise exception 'Aturan harga tidak valid: %', sqlerrm using errcode = '22023';
  end;
end;
$$;

create or replace function public.save_venue_layout(p_courts jsonb, p_areas jsonb, p_markers jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_merchant_id uuid := auth.uid();
  v_court_ids uuid[];
  v_area_ids uuid[];
  v_marker_ids uuid[];
  v_count integer;
begin
  if v_merchant_id is null then
    raise exception 'Harus masuk' using errcode = '42501';
  end if;

  p_courts := coalesce(p_courts, '[]'::jsonb);
  p_areas := coalesce(p_areas, '[]'::jsonb);
  p_markers := coalesce(p_markers, '[]'::jsonb);
  if jsonb_typeof(p_courts) <> 'array' or jsonb_typeof(p_areas) <> 'array'
     or jsonb_typeof(p_markers) <> 'array' then
    raise exception 'Denah harus berupa array' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_merchant_id::text));

  begin
    select coalesce(array_agg(c.id), '{}') into v_court_ids
      from jsonb_to_recordset(p_courts) as c(id uuid);
    select coalesce(array_agg(a.id), '{}') into v_area_ids
      from jsonb_to_recordset(p_areas) as a(id uuid);
    select coalesce(array_agg(k.id), '{}') into v_marker_ids
      from jsonb_to_recordset(p_markers) as k(id uuid);
  exception when data_exception then
    raise exception 'Denah tidak valid: %', sqlerrm using errcode = '22023';
  end;

  -- id null atau ganda: upsert tidak boleh menyentuh satu baris dua kali.
  if cardinality(v_court_ids) > 100 or cardinality(v_area_ids) > 20 or cardinality(v_marker_ids) > 50
     or array_position(v_court_ids, null) is not null
     or array_position(v_area_ids, null) is not null
     or array_position(v_marker_ids, null) is not null
     or (select count(distinct x) from unnest(v_court_ids) x) <> cardinality(v_court_ids)
     or (select count(distinct x) from unnest(v_area_ids) x) <> cardinality(v_area_ids)
     or (select count(distinct x) from unnest(v_marker_ids) x) <> cardinality(v_marker_ids) then
    raise exception 'Denah tidak valid' using errcode = '22023';
  end if;

  begin
    update public.courts c
       set pos_x = r.pos_x, pos_y = r.pos_y, rotation = coalesce(r.rotation, 0)
      from jsonb_to_recordset(p_courts) as r(id uuid, pos_x integer, pos_y integer, rotation smallint)
     where c.id = r.id and c.merchant_id = v_merchant_id;
    get diagnostics v_count = row_count;
  exception when check_violation or not_null_violation or data_exception then
    raise exception 'Denah tidak valid: %', sqlerrm using errcode = '22023';
  end;
  if v_count <> cardinality(v_court_ids) then
    raise exception 'Lapangan bukan milik Anda' using errcode = '42501';
  end if;

  -- Area dan penanda milik merchant lain: id bentrok dengan baris orang lain.
  if exists (select 1 from public.venue_areas a
             where a.id = any (v_area_ids) and a.merchant_id <> v_merchant_id)
     or exists (select 1 from public.venue_markers k
                where k.id = any (v_marker_ids) and k.merchant_id <> v_merchant_id) then
    raise exception 'Denah milik merchant lain' using errcode = '42501';
  end if;

  begin
    insert into public.venue_areas (id, merchant_id, label, pos_x, pos_y, width, height, sort_order)
    select a.id, v_merchant_id, btrim(a.label), a.pos_x, a.pos_y, a.width, a.height,
           coalesce(a.sort_order, 0)
      from jsonb_to_recordset(p_areas) as a(
        id uuid, label text, pos_x integer, pos_y integer, width integer, height integer,
        sort_order integer)
    on conflict (id) do update
      set label = excluded.label, pos_x = excluded.pos_x, pos_y = excluded.pos_y,
          width = excluded.width, height = excluded.height, sort_order = excluded.sort_order
      where venue_areas.merchant_id = v_merchant_id;

    insert into public.venue_markers (id, merchant_id, label, pos_x, pos_y, width, height, sort_order)
    select k.id, v_merchant_id, btrim(k.label), k.pos_x, k.pos_y, k.width, k.height,
           coalesce(k.sort_order, 0)
      from jsonb_to_recordset(p_markers) as k(
        id uuid, label text, pos_x integer, pos_y integer, width integer, height integer,
        sort_order integer)
    on conflict (id) do update
      set label = excluded.label, pos_x = excluded.pos_x, pos_y = excluded.pos_y,
          width = excluded.width, height = excluded.height, sort_order = excluded.sort_order
      where venue_markers.merchant_id = v_merchant_id;
  exception when check_violation or not_null_violation or data_exception then
    raise exception 'Denah tidak valid: %', sqlerrm using errcode = '22023';
  end;

  delete from public.venue_areas a
   where a.merchant_id = v_merchant_id and not (a.id = any (v_area_ids));
  delete from public.venue_markers k
   where k.merchant_id = v_merchant_id and not (k.id = any (v_marker_ids));
end;
$$;

-- create or replace mempertahankan hak; ditulis ulang supaya jelas.
revoke execute on function public.save_court_pricing(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.save_venue_layout(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_court_pricing(uuid, jsonb) to authenticated;
grant execute on function public.save_venue_layout(jsonb, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
