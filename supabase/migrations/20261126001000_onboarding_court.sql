-- Onboarding kategori Olahraga: layanan sewa + dua lapangan contoh dibuat di
-- transaksi complete_onboarding yang sama. Kegagalan di langkah mana pun
-- membatalkan seluruh onboarding, jadi tidak pernah ada layanan sewa tanpa
-- lapangan. Tetap SECURITY INVOKER (RLS dan grant per kolom berlaku); langkah
-- sewa memakai save_court_service yang sudah teruji (aktifkan, tautkan, validasi).
-- Parameter baru ber-default null: 9 argumen lama tetap bisa dipanggil.

drop function public.complete_onboarding(
  text, text, text, public.business_category, text, text, integer, numeric, jsonb
);

create or replace function public.complete_onboarding(
  p_full_name text,
  p_username text,
  p_whatsapp_number text,
  p_business_category public.business_category,
  p_business_type_slug text,
  p_service_name text,
  p_service_duration_minutes integer,
  p_service_price numeric,
  p_availability jsonb,
  -- Semua null = layanan biasa. Sport terisi = layanan sewa dengan dua lapangan contoh.
  p_court_sport public.court_sport default null,
  p_court_unit smallint default null,
  p_court_min integer default null,
  p_court_max smallint default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  updated integer;
  v_service_id uuid;
  v_court_ids uuid[];
begin
  if uid is null then
    raise exception 'Tidak ada sesi.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_availability) <> 'array' then
    raise exception 'Jam kerja harus berupa array.' using errcode = '22023';
  end if;

  if p_court_sport is not null
     and (p_court_unit is null or p_court_min is null or p_court_max is null) then
    raise exception 'Data sewa tidak lengkap.' using errcode = '22023';
  end if;

  -- 1. Identitas (lihat catatan UPDATE-lalu-INSERT di migration asal).
  update public.merchants
     set full_name = p_full_name,
         username = p_username,
         whatsapp_number = p_whatsapp_number,
         onboarded_at = now()
   where id = uid;

  get diagnostics updated = row_count;

  if updated = 0 then
    insert into public.merchants
      (id, full_name, username, whatsapp_number, onboarded_at)
    values
      (uid, p_full_name, p_username, p_whatsapp_number, now());
  end if;

  -- 2. Profil kuesioner.
  insert into public.merchant_profiles
    (merchant_id, business_category, business_type_slug)
  values
    (uid, p_business_category, p_business_type_slug)
  on conflict (merchant_id) do update
    set business_category = excluded.business_category,
        business_type_slug = excluded.business_type_slug;

  -- 3. Layanan pertama, hanya bila merchant belum punya layanan.
  if not exists (select 1 from public.services s where s.merchant_id = uid) then
    insert into public.services (merchant_id, name, price, duration_minutes)
    values (uid, p_service_name, p_service_price, p_service_duration_minutes)
    returning id into v_service_id;

    -- 3b. Layanan sewa: dua lapangan contoh, lalu jadikan sewa lewat save_court_service.
    if p_court_sport is not null then
      insert into public.courts (merchant_id, name, sort_order, sport, environment)
      values (uid, 'Lapangan 1', 1, p_court_sport, 'INDOOR'),
             (uid, 'Lapangan 2', 2, p_court_sport, 'INDOOR')
      on conflict (merchant_id, name) do nothing;

      select array_agg(c.id order by c.sort_order) into v_court_ids
        from public.courts c
       where c.merchant_id = uid and c.name in ('Lapangan 1', 'Lapangan 2');

      perform public.save_court_service(
        v_service_id, true, p_court_unit, p_court_max, p_court_min,
        v_court_ids, '[]'::jsonb, true);
    end if;
  end if;

  -- 4. Jam kerja, hanya bila belum ada.
  if not exists (select 1 from public.availability a where a.merchant_id = uid) then
    insert into public.availability (merchant_id, day_of_week, start_time, end_time)
    select uid,
           (item ->> 'day_of_week')::integer,
           (item ->> 'start_time')::time,
           (item ->> 'end_time')::time
    from jsonb_array_elements(p_availability) as t(item);
  end if;
end;
$$;

revoke execute on function public.complete_onboarding(
  text, text, text, public.business_category, text, text, integer, numeric, jsonb,
  public.court_sport, smallint, integer, smallint
) from public, anon, authenticated;

grant execute on function public.complete_onboarding(
  text, text, text, public.business_category, text, text, integer, numeric, jsonb,
  public.court_sport, smallint, integer, smallint
) to authenticated;

notify pgrst, 'reload schema';
