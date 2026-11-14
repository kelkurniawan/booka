-- ===========================================================================
-- F2: cara bayar per layanan, setelan merchant, dan kesepakatan pemegang slot.
-- Nilai enum booking_status/notification_kind baru ada di migration sebelumnya.
-- ===========================================================================

create type public.payment_mode as enum ('FULL', 'DEPOSIT', 'ON_SITE', 'REQUEST');
create type public.deposit_type as enum ('PERCENT', 'FIXED');
create type public.on_site_payment_method as enum ('CASH', 'QRIS', 'TRANSFER');

alter table public.services
  add column payment_mode public.payment_mode not null default 'FULL',
  add column deposit_type public.deposit_type,
  add column deposit_value integer,
  add constraint services_deposit_pair check ((deposit_type is null) = (deposit_value is null)),
  add constraint services_deposit_required check (payment_mode <> 'DEPOSIT' or deposit_type is not null),
  add constraint services_deposit_allowed check (deposit_type is null or payment_mode in ('DEPOSIT', 'REQUEST')),
  add constraint services_deposit_percent_range check (deposit_type is distinct from 'PERCENT' or deposit_value between 1 and 90),
  add constraint services_deposit_fixed_range check (deposit_type is distinct from 'FIXED' or (deposit_value >= 1 and deposit_value < price));

alter table public.bookings
  add column payment_mode public.payment_mode not null default 'FULL',
  add column amount_due_now numeric(12, 2),
  add column amount_due_on_site numeric(12, 2) not null default 0,
  add column paid_on_site_at timestamptz,
  add column paid_on_site_method public.on_site_payment_method,
  add column attended_at timestamptz,
  add column no_show_at timestamptz;
update public.bookings set amount_due_now = service_price;
alter table public.bookings alter column amount_due_now set not null;
alter table public.bookings
  -- F5 (voucher) wajib mengganti constraint ini: diskon mengubah jumlahnya.
  add constraint bookings_amount_split check (
    amount_due_now >= 0 and amount_due_on_site >= 0
    and amount_due_now + amount_due_on_site = service_price),
  add constraint bookings_paid_on_site_pair check ((paid_on_site_at is null) = (paid_on_site_method is null)),
  add constraint bookings_attendance_exclusive check (attended_at is null or no_show_at is null);

-- Insert lama yang tidak menyebut nominal tetap sah: seluruh harga dibayar di muka.
create or replace function public.fill_booking_amounts()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.amount_due_now := coalesce(new.amount_due_now, new.service_price - new.amount_due_on_site);
  return new;
end;
$$;
revoke execute on function public.fill_booking_amounts() from public, anon, authenticated;

create trigger bookings_fill_amounts
  before insert on public.bookings
  for each row execute function public.fill_booking_amounts();

create index bookings_requested_expiry_idx on public.bookings (expires_at) where status = 'REQUESTED';
create index bookings_merchant_phone_idx on public.bookings (merchant_id, customer_whatsapp);

alter table public.bookings drop constraint bookings_no_overlap;
alter table public.bookings add constraint bookings_no_overlap exclude using gist (
  merchant_id with =,
  (coalesce(staff_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
  tstzrange(start_datetime, end_datetime, '[)') with &&
) where (status in ('PENDING', 'PAID', 'CONFIRMED', 'REQUESTED'));

-- ---------------------------------------------------------------------------
-- merchant_settings: satu baris per merchant
-- ---------------------------------------------------------------------------
create table public.merchant_settings (
  merchant_id uuid primary key references public.merchants (id) on delete cascade,
  allow_pay_on_site boolean not null default true,
  auto_confirm_on_site boolean not null default true,
  max_active_per_phone integer default 2,
  deposit_after_no_show boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merchant_settings_max_active_range
    check (max_active_per_phone is null or max_active_per_phone between 1 and 10)
);

create trigger merchant_settings_set_updated_at
  before update on public.merchant_settings
  for each row execute function public.set_updated_at();

alter table public.merchant_settings enable row level security;
revoke all on public.merchant_settings from anon, authenticated;
grant select (merchant_id, allow_pay_on_site, auto_confirm_on_site) on public.merchant_settings to anon;
grant select on public.merchant_settings to authenticated;
grant update (allow_pay_on_site, auto_confirm_on_site, max_active_per_phone, deposit_after_no_show)
  on public.merchant_settings to authenticated;

create policy "merchant_settings_public_read"
  on public.merchant_settings for select
  to anon
  using (
    exists (
      select 1 from public.merchants m
      where m.id = merchant_settings.merchant_id and m.username is not null
    )
  );

create policy "merchant_settings_read_own"
  on public.merchant_settings for select to authenticated
  using ((select auth.uid()) = merchant_id);

create policy "merchant_settings_update_own"
  on public.merchant_settings for update to authenticated
  using ((select auth.uid()) = merchant_id)
  with check ((select auth.uid()) = merchant_id);

insert into public.merchant_settings (merchant_id)
select id from public.merchants
on conflict do nothing;

create or replace function public.create_merchant_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.merchant_settings (merchant_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
revoke execute on function public.create_merchant_settings() from public, anon, authenticated;

create trigger merchants_create_settings
  after insert on public.merchants
  for each row execute function public.create_merchant_settings();

-- ---------------------------------------------------------------------------
-- Satu sumber kebenaran: status mana yang memegang slot
-- ---------------------------------------------------------------------------
create or replace function public.booking_holds_slot(p_status public.booking_status, p_expires_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_status in ('PAID', 'CONFIRMED')
      or (p_status in ('PENDING', 'REQUESTED') and p_expires_at > now());
$$;
revoke execute on function public.booking_holds_slot(public.booking_status, timestamptz)
  from public, anon, authenticated;

create or replace function public.count_bookings_this_month(p_merchant_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.bookings b
  where b.merchant_id = p_merchant_id
    and public.booking_holds_slot(b.status, b.expires_at)
    and b.created_at >= (
      date_trunc('month', (now() at time zone 'Asia/Jakarta')) at time zone 'Asia/Jakarta'
    );
$$;

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
    and public.booking_holds_slot(b.status, b.expires_at)
    and b.start_datetime < p_to
    and b.end_datetime > p_from
  order by b.start_datetime;
$$;

create or replace function public.reap_expired_bookings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.bookings
  set status = 'CANCELLED',
      cancelled_at = now(),
      cancel_reason = case when status = 'REQUESTED'
        then 'Permintaan tidak dijawab dalam batas waktu'
        else 'DP tidak dibayar dalam batas waktu' end
  where status in ('PENDING', 'REQUESTED')
    and expires_at <= now();

  get diagnostics v_count = row_count;

  -- Sekalian buang jejak rate limit yang sudah tidak relevan, supaya tabelnya
  -- tidak tumbuh selamanya. Ambang 1 jam jauh di atas jendela 15 menit.
  delete from public.booking_attempts where created_at < now() - interval '1 hour';

  return v_count;
end;
$$;

-- Pendapatan = uang yang benar-benar masuk bulan ini (WIB): DP online (PAID)
-- ditambah sisa yang dilunasi di tempat.
create or replace function public.dashboard_booking_summary()
returns table (
  bookings_this_month integer,
  confirmed_revenue numeric,
  pending_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.count_bookings_this_month((select auth.uid())),
    (
      select coalesce(sum(
        case when b.status = 'PAID' and b.paid_at >= (
               date_trunc('month', (now() at time zone 'Asia/Jakarta')) at time zone 'Asia/Jakarta')
             then b.amount_due_now else 0 end
        + case when b.paid_on_site_at >= (
               date_trunc('month', (now() at time zone 'Asia/Jakarta')) at time zone 'Asia/Jakarta')
             then b.amount_due_on_site else 0 end
      ), 0)
      from public.bookings b
      where b.merchant_id = (select auth.uid())
        and b.status in ('PAID', 'CONFIRMED')
    ),
    (
      select count(*)::integer
      from public.bookings b
      where b.merchant_id = (select auth.uid())
        and b.status = 'PENDING'
        and b.expires_at > now()
    );
$$;

-- Grant fungsi lama tidak ikut berubah oleh create or replace; ditegaskan ulang.
revoke execute on function public.count_bookings_this_month(uuid) from public, anon, authenticated;
revoke execute on function public.get_booked_ranges(text, timestamptz, timestamptz) from public;
grant execute on function public.get_booked_ranges(text, timestamptz, timestamptz) to anon, authenticated;
revoke execute on function public.reap_expired_bookings() from public;
grant execute on function public.reap_expired_bookings() to service_role;
revoke execute on function public.dashboard_booking_summary() from public, anon;
grant execute on function public.dashboard_booking_summary() to authenticated;

drop policy "bookings_cancel_own" on public.bookings;
create policy "bookings_cancel_own"
  on public.bookings
  for update
  to authenticated
  using ((select auth.uid()) = merchant_id and status in ('PENDING', 'PAID', 'CONFIRMED', 'REQUESTED'))
  with check ((select auth.uid()) = merchant_id and status = 'CANCELLED');

notify pgrst, 'reload schema';
