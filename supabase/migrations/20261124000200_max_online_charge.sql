-- Batas QRIS Midtrans: 1 sampai 10.000.000 per transaksi. Booking PENDING
-- di atas batas itu pasti gagal ditagih lalu dibatalkan, jadi ditolak sejak
-- insert/update dengan errcode BK037. Mencerminkan MAX_ONLINE_CHARGE di
-- src/lib/booking/payment-mode.ts. Booking CONFIRMED, REQUESTED, dan
-- bayar-di-tempat tidak terkena (tidak ditagih online); voucher sudah
-- mengurangi amount_due_now sebelum insert, jadi yang dicek nominal akhir.

create or replace function public.enforce_max_online_charge()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'PENDING' and new.amount_due_now > 10000000 then
    raise exception 'Pembayaran QRIS maksimal Rp10.000.000 per transaksi'
      using errcode = 'BK037';
  end if;
  return new;
end $$;

revoke execute on function public.enforce_max_online_charge() from public, anon, authenticated;

create trigger bookings_enforce_max_online_charge
  before insert or update of amount_due_now, status on public.bookings
  for each row execute function public.enforce_max_online_charge();
