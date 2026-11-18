-- Simpan layanan sewa secara atomik: kolom sewa, tautan service_courts, dan
-- aturan jam ramai dalam satu transaksi. Sebelumnya tiga tulis terpisah dari
-- server action, sehingga kegagalan di tengah meninggalkan layanan sewa tanpa
-- lapangan atau dengan aturan lama. Sewa mati: kolom dikosongkan dan tautan
-- serta aturan layanan itu dihapus.
--
-- Errcode: 42501 bukan login / layanan atau lapangan merchant lain,
-- 22023 payload tidak valid atau melanggar CHECK, 23P01 aturan tumpang tindih
-- (dari save_court_pricing, yang dipanggil di sini dan memvalidasi aturannya).

create or replace function public.save_court_service(
  p_service_id uuid,
  p_rental boolean,
  p_unit smallint,
  p_max smallint,
  p_duration integer,
  p_court_ids uuid[],
  p_rules jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_merchant_id uuid := auth.uid();
  v_ids uuid[];
begin
  if v_merchant_id is null then
    raise exception 'Harus masuk' using errcode = '42501';
  end if;

  -- Kunci yang sama dengan create_booking dan save_court_pricing.
  perform pg_advisory_xact_lock(hashtext(v_merchant_id::text));

  if not exists (select 1 from public.services s
                 where s.id = p_service_id and s.merchant_id = v_merchant_id) then
    raise exception 'Layanan bukan milik Anda' using errcode = '42501';
  end if;

  if not coalesce(p_rental, false) then
    update public.services
       set court_unit_minutes = null, court_max_minutes = null
     where id = p_service_id and merchant_id = v_merchant_id;
    delete from public.service_courts where service_id = p_service_id and merchant_id = v_merchant_id;
    delete from public.court_price_rules where service_id = p_service_id and merchant_id = v_merchant_id;
    return;
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_court_ids, '{}')) x;
  if p_unit is null or p_max is null or p_duration is null or cardinality(v_ids) not between 1 and 100 then
    raise exception 'Data sewa tidak lengkap' using errcode = '22023';
  end if;
  if (select count(*) from public.courts c
       where c.id = any (v_ids) and c.merchant_id = v_merchant_id) <> cardinality(v_ids) then
    raise exception 'Lapangan bukan milik Anda' using errcode = '42501';
  end if;

  begin
    update public.services
       set court_unit_minutes = p_unit, court_max_minutes = p_max, duration_minutes = p_duration,
           seat_duration_minutes = null, party_min = null, party_max = null
     where id = p_service_id and merchant_id = v_merchant_id;
  exception when check_violation or not_null_violation or data_exception then
    raise exception 'Pengaturan sewa tidak valid: %', sqlerrm using errcode = '22023';
  end;

  delete from public.service_courts where service_id = p_service_id and merchant_id = v_merchant_id;
  insert into public.service_courts (service_id, court_id, merchant_id)
    select p_service_id, x, v_merchant_id from unnest(v_ids) x;

  -- Memakai validasi save_court_pricing (maks 50, 23P01, 22023); error-nya
  -- membatalkan seluruh fungsi ini.
  perform public.save_court_pricing(p_service_id, p_rules);
end;
$$;

revoke execute on function public.save_court_service(uuid, boolean, smallint, smallint, integer, uuid[], jsonb)
  from public, anon, authenticated;
grant execute on function public.save_court_service(uuid, boolean, smallint, smallint, integer, uuid[], jsonb)
  to authenticated;

notify pgrst, 'reload schema';
