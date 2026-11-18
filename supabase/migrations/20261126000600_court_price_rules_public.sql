-- Aturan jam ramai satu layanan sewa untuk halaman publik dan /api/slots
-- (anon tidak punya hak ke tabel court_price_rules). Hanya kolom harga dan
-- jam, tanpa data pelanggan; merchant harus punya username dan layanan aktif.
create function public.get_court_price_rules(p_merchant_id uuid, p_service_id uuid)
returns table (day_of_week smallint, start_time time, end_time time, price_per_hour numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select r.day_of_week, r.start_time, r.end_time, r.price_per_hour
  from public.court_price_rules r
  join public.services s on s.id = r.service_id and s.merchant_id = r.merchant_id and s.is_active
  join public.merchants m on m.id = s.merchant_id and m.username is not null
  where r.merchant_id = p_merchant_id and r.service_id = p_service_id
  order by r.day_of_week, r.start_time;
$$;
revoke execute on function public.get_court_price_rules(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_court_price_rules(uuid, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
