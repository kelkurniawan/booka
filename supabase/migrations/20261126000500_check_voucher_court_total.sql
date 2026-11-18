-- check_voucher (pratinjau voucher di /api/vouchers/check) untuk layanan sewa:
-- min_spend dan diskon persen harus memakai total sewa (court_price) seperti
-- create_booking, bukan harga per jam. Tanpa jam mulai dan lama main (atau
-- layanan bukan sewa) perilaku lama utuh: memakai services.price.
drop function public.check_voucher(uuid, text, uuid);

create function public.check_voucher(
  p_merchant_id uuid,
  p_code text,
  p_service_id uuid,
  p_start_datetime timestamptz default null,
  p_duration_minutes integer default null
)
returns table (
  code text,
  kind public.voucher_kind,
  value integer,
  max_discount integer,
  min_spend integer,
  service_ids uuid[],
  discount numeric,
  reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  v_price numeric := null;
begin
  if p_start_datetime is not null and p_duration_minutes is not null
     and exists (select 1 from public.services s
                 where s.id = p_service_id and s.merchant_id = p_merchant_id and s.court_unit_minutes is not null) then
    v_price := public.court_price(p_service_id, p_start_datetime, p_duration_minutes);
    if v_price is null then
      -- Lama main bukan kelipatan unit: kode yang sama dengan create_booking.
      reason := 'BK071';
      return next;
      return;
    end if;
  end if;

  select * into r from public.evaluate_voucher(p_merchant_id, p_code, p_service_id, null, v_price);
  if r.reason is not null then
    reason := r.reason;
    return next;
    return;
  end if;

  return query
  select v.code, v.kind, v.value, v.max_discount, v.min_spend, v.service_ids, r.discount, null::text
  from public.vouchers v
  where v.id = r.voucher_id;
end;
$$;
revoke execute on function public.check_voucher(uuid, text, uuid, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.check_voucher(uuid, text, uuid, timestamptz, integer) to service_role;

notify pgrst, 'reload schema';
