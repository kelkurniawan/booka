-- Fungsi baca dashboard: definisi tab booking, daftar per tab, hitungan tab,
-- dan ringkasan 7 hari. Semua membaca merchant = auth.uid().
-- bookings_in_tab mengembalikan baris penuh: pemanggil WAJIB merantai
-- .select(BOOKING_LIST_COLUMNS) dan tidak boleh membaca access_token.

-- Satu-satunya definisi tab. Internal: hanya dipanggil fungsi definer di bawah.
create or replace function public.booking_tab(b public.bookings)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when b.status = 'CANCELLED' or not public.booking_holds_slot(b.status, b.expires_at) then 'CANCELLED'
    when b.status in ('PENDING', 'REQUESTED') then 'ACTION'
    when b.start_datetime >= now() then 'UPCOMING'
    when b.start_datetime >= now() - interval '7 days'
         and ((b.attended_at is null and b.no_show_at is null)
              or (b.amount_due_on_site > 0 and b.paid_on_site_at is null and b.no_show_at is null))
      then 'ACTION'
    else 'HISTORY'
  end;
$$;
revoke execute on function public.booking_tab(public.bookings) from public, anon, authenticated;

create or replace function public.bookings_in_tab(p_tab text)
returns setof public.bookings
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_tab is null or p_tab not in ('ACTION', 'UPCOMING', 'HISTORY', 'CANCELLED') then
    raise exception 'Tab tidak dikenal' using errcode = '22023';
  end if;
  return query
    select b.*
    from public.bookings b
    where b.merchant_id = auth.uid()
      and public.booking_tab(b) = p_tab;
end;
$$;
revoke execute on function public.bookings_in_tab(text) from public, anon;
grant execute on function public.bookings_in_tab(text) to authenticated;

create or replace function public.dashboard_tab_counts()
returns table (action_count integer, upcoming_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (count(*) filter (where public.booking_tab(b) = 'ACTION'))::integer,
    (count(*) filter (where public.booking_tab(b) = 'UPCOMING'))::integer
  from public.bookings b
  where b.merchant_id = auth.uid()
    -- Hanya baris ini yang bisa masuk ACTION atau UPCOMING.
    and (b.status in ('PENDING', 'REQUESTED') or b.start_datetime >= now() - interval '7 days');
$$;
revoke execute on function public.dashboard_tab_counts() from public, anon;
grant execute on function public.dashboard_tab_counts() to authenticated;

create or replace function public.dashboard_week_summary()
returns table (
  bookings integer,
  online_revenue numeric,
  on_site_revenue numeric,
  no_show integer,
  attendance_marked integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (count(*) filter (where b.status in ('PAID', 'CONFIRMED')
                        and b.start_datetime >= now() - interval '7 days' and b.start_datetime < now()))::integer,
    coalesce(sum(b.amount_due_now) filter (where b.status = 'PAID'
                        and b.paid_at >= now() - interval '7 days'), 0),
    coalesce(sum(b.amount_due_on_site) filter (where b.status in ('PAID', 'CONFIRMED')
                        and b.paid_on_site_at >= now() - interval '7 days'), 0),
    (count(*) filter (where b.status in ('PAID', 'CONFIRMED') and b.no_show_at is not null
                        and b.start_datetime >= now() - interval '7 days' and b.start_datetime < now()))::integer,
    (count(*) filter (where b.status in ('PAID', 'CONFIRMED')
                        and (b.attended_at is not null or b.no_show_at is not null)
                        and b.start_datetime >= now() - interval '7 days' and b.start_datetime < now()))::integer
  from public.bookings b
  where b.merchant_id = auth.uid()
    and (b.start_datetime >= now() - interval '7 days'
         or b.paid_at >= now() - interval '7 days'
         or b.paid_on_site_at >= now() - interval '7 days');
$$;
revoke execute on function public.dashboard_week_summary() from public, anon;
grant execute on function public.dashboard_week_summary() to authenticated;
