-- ===========================================================================
-- Kuota transaksi bulanan per paket langganan (PRD bagian 1).
--
-- Sebelum ini, batas 10 transaksi/bulan paket STARTER hanya ditampilkan di
-- dashboard dan tidak ditegakkan di mana pun — merchant Starter bisa memakai
-- Booka tanpa batas selamanya.
--
-- Batas jumlah layanan sudah dijaga trigger `enforce_service_limit`; file ini
-- melakukan hal yang sama untuk jumlah transaksi.
-- ===========================================================================

/**
 * Kuota per paket. NULL berarti tanpa batas.
 */
create or replace function public.booking_quota_for_tier(p_tier public.subscription_tier)
returns integer
language sql
immutable
as $$
  select case p_tier when 'STARTER' then 10 else null end;
$$;

/**
 * Jumlah transaksi merchant pada bulan berjalan.
 *
 * Yang dihitung adalah booking berstatus PENDING atau PAID yang dibuat bulan
 * ini. Booking CANCELLED — termasuk yang dibatalkan otomatis karena DP tidak
 * dibayar dalam 15 menit — mengembalikan kuotanya, supaya pesanan yang
 * ditinggalkan pelanggan tidak menghanguskan jatah merchant.
 *
 * Batas bulan memakai waktu Jakarta, bukan UTC. Tanpa ini, merchant di WIB
 * akan melihat kuotanya ter-reset pada pukul 07.00 tanggal 1, bukan tengah
 * malam.
 */
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
    and b.status in ('PENDING', 'PAID')
    and b.created_at >= (
      date_trunc('month', (now() at time zone 'Asia/Jakarta')) at time zone 'Asia/Jakarta'
    );
$$;

/**
 * Menolak booking yang melewati kuota bulanan.
 *
 * Catatan tentang balapan: dua insert bersamaan bisa sama-sama membaca hitungan
 * yang sama dan lolos berdua, sehingga kuota terlampaui satu baris. Yang
 * ditutup trigger ini adalah kebocoran sistematisnya. Phase 5 menambahkan
 * advisory lock per merchant di dalam transaksi POST /api/bookings untuk
 * menutup sisa celah itu.
 */
create or replace function public.enforce_booking_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tier public.subscription_tier;
  quota integer;
  used integer;
begin
  -- Booking yang langsung dibuat sebagai CANCELLED tidak memakai kuota.
  if new.status = 'CANCELLED' then
    return new;
  end if;

  select m.subscription_tier into tier
  from public.merchants m
  where m.id = new.merchant_id;

  quota := public.booking_quota_for_tier(tier);

  if quota is null then
    return new;
  end if;

  used := public.count_bookings_this_month(new.merchant_id);

  if used >= quota then
    raise exception
      'Kuota % transaksi bulan ini sudah terpakai pada paket %. Upgrade untuk menerima pesanan lagi.',
      quota, tier
      using errcode = 'P0002';
  end if;

  return new;
end;
$$;

create trigger bookings_enforce_quota
  before insert on public.bookings
  for each row execute function public.enforce_booking_quota();

/**
 * Pemakaian kuota merchant yang sedang login, untuk ditampilkan di dashboard.
 *
 * Tanpa parameter dan memakai auth.uid(): fungsinya SECURITY DEFINER, jadi
 * menerima merchant_id dari pemanggil akan membuat siapa pun bisa mengintip
 * pemakaian merchant lain.
 */
create or replace function public.my_quota_usage()
returns table (used integer, quota integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.count_bookings_this_month(m.id),
    public.booking_quota_for_tier(m.subscription_tier)
  from public.merchants m
  where m.id = (select auth.uid());
$$;

-- ===========================================================================
-- Grants
--
-- Postgres memberi EXECUTE ke PUBLIC untuk setiap fungsi baru; hanya wrapper
-- `my_quota_usage()` yang boleh dipanggil dari klien.
-- ===========================================================================
revoke execute on function public.booking_quota_for_tier(public.subscription_tier) from public;
revoke execute on function public.count_bookings_this_month(uuid) from public;
revoke execute on function public.enforce_booking_quota() from public;
revoke execute on function public.my_quota_usage() from public;

grant execute on function public.my_quota_usage() to authenticated;
