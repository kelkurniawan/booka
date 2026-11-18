-- Booking lapangan, bagian 2: RPC baca profil untuk anon dan RPC simpan
-- harga jam ramai serta denah venue.
--
-- Errcode: 42501 bukan pemilik, 22023 payload tidak valid. Pelanggaran
-- eksklusi aturan harga memakai 23P01 bawaan Postgres dengan pesan jelas.

-- Profil lapangan untuk halaman publik: satu baris, tiga jsonb. Hanya kolom
-- tampilan; tanpa data booking. Foto tanpa teks alternatif dan lapangan
-- nonaktif tidak pernah keluar.
create function public.get_court_profiles(p_merchant_id uuid)
returns table (courts jsonb, areas jsonb, markers jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'sort_order', c.sort_order,
        'sport', c.sport, 'environment', c.environment, 'surface', c.surface,
        'description', c.description, 'features', to_jsonb(c.features),
        'pos_x', c.pos_x, 'pos_y', c.pos_y, 'rotation', c.rotation,
        'service_ids', coalesce((
          select jsonb_agg(sc.service_id order by sc.service_id)
          from public.service_courts sc
          join public.services s on s.id = sc.service_id and s.is_active
          where sc.court_id = c.id), '[]'::jsonb),
        'photos', coalesce((
          select jsonb_agg(jsonb_build_object(
            'path', cm.path, 'alt_text', cm.alt_text, 'width', cm.width,
            'height', cm.height, 'sort_order', cm.sort_order)
            order by cm.sort_order, cm.created_at)
          from public.court_media cm
          where cm.court_id = c.id and btrim(coalesce(cm.alt_text, '')) <> ''), '[]'::jsonb)
      ) order by c.sort_order, c.name)
      from public.courts c
      where c.merchant_id = m.id and c.is_active), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'label', a.label, 'pos_x', a.pos_x, 'pos_y', a.pos_y,
        'width', a.width, 'height', a.height) order by a.sort_order, a.label)
      from public.venue_areas a where a.merchant_id = m.id), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id, 'label', k.label, 'pos_x', k.pos_x, 'pos_y', k.pos_y,
        'width', k.width, 'height', k.height) order by k.sort_order, k.label)
      from public.venue_markers k where k.merchant_id = m.id), '[]'::jsonb)
  from public.merchants m
  where m.id = p_merchant_id and m.username is not null;
$$;

-- Mengganti seluruh aturan harga satu layanan secara atomik. p_rules:
-- [{day_of_week, start_time, end_time, price_per_hour}, ...].
create function public.save_court_pricing(p_service_id uuid, p_rules jsonb)
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

  -- Kunci yang sama dengan create_booking: harga tidak berubah di tengah booking.
  perform pg_advisory_xact_lock(hashtext(v_merchant_id::text));

  if not exists (select 1 from public.services s
                 where s.id = p_service_id and s.merchant_id = v_merchant_id) then
    raise exception 'Layanan bukan milik Anda' using errcode = '42501';
  end if;

  delete from public.court_price_rules
   where service_id = p_service_id and merchant_id = v_merchant_id;

  begin
    insert into public.court_price_rules
      (merchant_id, service_id, day_of_week, start_time, end_time, price_per_hour)
    select v_merchant_id, p_service_id, r.day_of_week, r.start_time, r.end_time, r.price_per_hour
      from jsonb_to_recordset(p_rules) as r(
        day_of_week smallint, start_time time, end_time time, price_per_hour numeric);
  exception when exclusion_violation then
    raise exception 'Aturan jam ramai tumpang tindih di hari yang sama' using errcode = '23P01';
  end;
end;
$$;

-- Menulis denah venue: posisi lapangan yang sudah ada, serta seluruh area dan
-- penanda (yang tidak ada di payload dihapus). Tidak membuat atau menghapus
-- lapangan. Atomik: satu panggilan satu transaksi. p_courts:
-- [{id, pos_x, pos_y, rotation}]; p_areas/p_markers:
-- [{id, label, pos_x, pos_y, width, height, sort_order}].
create function public.save_venue_layout(p_courts jsonb, p_areas jsonb, p_markers jsonb)
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

  select coalesce(array_agg(c.id), '{}') into v_court_ids
    from jsonb_to_recordset(p_courts) as c(id uuid);
  select coalesce(array_agg(a.id), '{}') into v_area_ids
    from jsonb_to_recordset(p_areas) as a(id uuid);
  select coalesce(array_agg(k.id), '{}') into v_marker_ids
    from jsonb_to_recordset(p_markers) as k(id uuid);

  -- id null atau ganda: upsert tidak boleh menyentuh satu baris dua kali.
  if cardinality(v_court_ids) > 100 or cardinality(v_area_ids) > 20 or cardinality(v_marker_ids) > 50
     or null = any (v_court_ids) or null = any (v_area_ids) or null = any (v_marker_ids)
     or (select count(distinct x) from unnest(v_court_ids) x) <> cardinality(v_court_ids)
     or (select count(distinct x) from unnest(v_area_ids) x) <> cardinality(v_area_ids)
     or (select count(distinct x) from unnest(v_marker_ids) x) <> cardinality(v_marker_ids) then
    raise exception 'Denah tidak valid' using errcode = '22023';
  end if;

  update public.courts c
     set pos_x = r.pos_x, pos_y = r.pos_y, rotation = coalesce(r.rotation, 0)
    from jsonb_to_recordset(p_courts) as r(id uuid, pos_x integer, pos_y integer, rotation smallint)
   where c.id = r.id and c.merchant_id = v_merchant_id;
  get diagnostics v_count = row_count;
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
          width = excluded.width, height = excluded.height, sort_order = excluded.sort_order;

    insert into public.venue_markers (id, merchant_id, label, pos_x, pos_y, width, height, sort_order)
    select k.id, v_merchant_id, btrim(k.label), k.pos_x, k.pos_y, k.width, k.height,
           coalesce(k.sort_order, 0)
      from jsonb_to_recordset(p_markers) as k(
        id uuid, label text, pos_x integer, pos_y integer, width integer, height integer,
        sort_order integer)
    on conflict (id) do update
      set label = excluded.label, pos_x = excluded.pos_x, pos_y = excluded.pos_y,
          width = excluded.width, height = excluded.height, sort_order = excluded.sort_order;
  exception when check_violation or not_null_violation then
    raise exception 'Denah tidak valid: %', sqlerrm using errcode = '22023';
  end;

  delete from public.venue_areas a
   where a.merchant_id = v_merchant_id and not (a.id = any (v_area_ids));
  delete from public.venue_markers k
   where k.merchant_id = v_merchant_id and not (k.id = any (v_marker_ids));
end;
$$;

revoke execute on function public.get_court_profiles(uuid) from public, anon, authenticated;
revoke execute on function public.save_court_pricing(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.save_venue_layout(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.get_court_profiles(uuid) to anon, authenticated;
grant execute on function public.save_court_pricing(uuid, jsonb) to authenticated;
grant execute on function public.save_venue_layout(jsonb, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
