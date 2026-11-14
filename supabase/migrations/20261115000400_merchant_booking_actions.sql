-- ===========================================================================
-- F2: aksi merchant atas booking. Semuanya security definer dan memfilter
-- merchant_id = auth.uid(), jadi merchant tidak bisa menyentuh booking orang
-- lain walau tahu id-nya. Hanya authenticated yang boleh EXECUTE.
--   BK030 booking REQUESTED tidak ditemukan (atau bukan milik merchant)
--   BK031 permintaan sudah lewat batas jawab
--   BK032 tidak bisa ditandai lunas di tempat
--   BK033 belum waktunya / status tidak cocok untuk kehadiran
-- ===========================================================================

create or replace function public.decide_booking_request(p_booking_id uuid, p_approve boolean)
returns table (id uuid, status public.booking_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
begin
  select * into b from public.bookings x
  where x.id = p_booking_id and x.merchant_id = (select auth.uid()) and x.status = 'REQUESTED'
  for update;
  if not found then
    raise exception 'Permintaan tidak ditemukan' using errcode = 'BK030';
  end if;
  if b.expires_at <= now() then
    raise exception 'Permintaan sudah kedaluwarsa' using errcode = 'BK031';
  end if;

  if p_approve then
    if b.amount_due_now > 0 then
      return query update public.bookings u
        set status = 'PENDING', expires_at = least(now() + interval '24 hours', u.start_datetime)
        where u.id = b.id returning u.id, u.status;
    else
      return query update public.bookings u
        set status = 'CONFIRMED'
        where u.id = b.id returning u.id, u.status;
    end if;
  else
    return query update public.bookings u
      set status = 'CANCELLED', cancelled_at = now(), cancel_reason = 'Permintaan ditolak merchant'
      where u.id = b.id returning u.id, u.status;
  end if;
end;
$$;

create or replace function public.mark_booking_paid_on_site(p_booking_id uuid, p_method public.on_site_payment_method)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.bookings b
  set paid_on_site_at = now(), paid_on_site_method = p_method
  where b.id = p_booking_id and b.merchant_id = (select auth.uid())
    and b.status in ('PAID', 'CONFIRMED')
    and b.amount_due_on_site > 0 and b.paid_on_site_at is null;
  if not found then
    raise exception 'Booking tidak bisa ditandai lunas di tempat' using errcode = 'BK032';
  end if;
end;
$$;

create or replace function public.mark_booking_attendance(p_booking_id uuid, p_attended boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.bookings b
  set attended_at = case when p_attended then now() end,
      no_show_at = case when p_attended then null else now() end
  where b.id = p_booking_id and b.merchant_id = (select auth.uid())
    and b.status in ('PAID', 'CONFIRMED')
    and now() >= b.start_datetime - case when p_attended then interval '1 hour' else interval '0' end;
  if not found then
    raise exception 'Kehadiran belum bisa dicatat' using errcode = 'BK033';
  end if;
end;
$$;

revoke execute on function public.decide_booking_request(uuid, boolean) from public, anon;
revoke execute on function public.mark_booking_paid_on_site(uuid, public.on_site_payment_method) from public, anon;
revoke execute on function public.mark_booking_attendance(uuid, boolean) from public, anon;
grant execute on function public.decide_booking_request(uuid, boolean) to authenticated;
grant execute on function public.mark_booking_paid_on_site(uuid, public.on_site_payment_method) to authenticated;
grant execute on function public.mark_booking_attendance(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
