\set ON_ERROR_STOP off
\pset pager off

-- Helper: laporkan hasil yang diharapkan gagal.
create or replace function pg_temp.expect_fail(sql text, label text)
returns text language plpgsql as $$
begin
  execute sql;
  return 'FAIL (seharusnya ditolak): ' || label;
exception when others then
  return 'OK   ditolak -> ' || label || ' [' || sqlerrm || ']';
end $$;

create or replace function pg_temp.expect_ok(sql text, label text)
returns text language plpgsql as $$
begin
  execute sql;
  return 'OK   diterima -> ' || label;
exception when others then
  return 'FAIL (seharusnya diterima): ' || label || ' [' || sqlerrm || ']';
end $$;

-- 1. Trigger handle_new_user
insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111', 'a@example.com',
        '{"full_name":"Studio Mawar","avatar_url":"https://x/y.png"}'::jsonb);

select case when count(*) = 1 then 'OK   handle_new_user membuat baris merchants'
            else 'FAIL handle_new_user' end as t1,
       (select full_name from public.merchants) as nama
from public.merchants;

-- 2. Username
select pg_temp.expect_fail(
  $q$update public.merchants set username = 'dashboard' where id = '11111111-1111-1111-1111-111111111111'$q$,
  'username reserved "dashboard"');
-- Rute auth berbahasa Indonesia, ditambahkan di migration 20260730000100.
select pg_temp.expect_fail(
  $q$update public.merchants set username = 'masuk' where id = '11111111-1111-1111-1111-111111111111'$q$,
  'username reserved "masuk"');
select pg_temp.expect_fail(
  $q$update public.merchants set username = 'daftar' where id = '11111111-1111-1111-1111-111111111111'$q$,
  'username reserved "daftar"');
select pg_temp.expect_fail(
  $q$update public.merchants set username = 'reset-password' where id = '11111111-1111-1111-1111-111111111111'$q$,
  'username reserved "reset-password"');
select pg_temp.expect_fail(
  $q$update public.merchants set username = 'AB' where id = '11111111-1111-1111-1111-111111111111'$q$,
  'username terlalu pendek / huruf besar');
select pg_temp.expect_fail(
  $q$update public.merchants set username = '-mawar' where id = '11111111-1111-1111-1111-111111111111'$q$,
  'username diawali tanda hubung');
select pg_temp.expect_ok(
  $q$update public.merchants set username = 'studio-mawar', whatsapp_number = '+6281234567890', onboarded_at = now() where id = '11111111-1111-1111-1111-111111111111'$q$,
  'username valid "studio-mawar"');

-- 3. Batas layanan paket STARTER
select pg_temp.expect_ok(
  $q$insert into public.services (merchant_id, name, price, duration_minutes) values ('11111111-1111-1111-1111-111111111111', 'Makeup Wisuda', 350000, 90)$q$,
  'layanan pertama pada paket STARTER');
select pg_temp.expect_fail(
  $q$insert into public.services (merchant_id, name, price, duration_minutes) values ('11111111-1111-1111-1111-111111111111', 'Makeup Akad', 750000, 120)$q$,
  'layanan kedua pada paket STARTER');

update public.merchants set subscription_tier = 'PRO'
where id = '11111111-1111-1111-1111-111111111111';

select pg_temp.expect_ok(
  $q$insert into public.services (merchant_id, name, price, duration_minutes) values ('11111111-1111-1111-1111-111111111111', 'Makeup Akad', 750000, 120)$q$,
  'layanan kedua setelah upgrade ke PRO');

-- 4. Jam kerja tidak boleh tumpang tindih
select pg_temp.expect_ok(
  $q$insert into public.availability (merchant_id, day_of_week, start_time, end_time) values ('11111111-1111-1111-1111-111111111111', 1, '09:00', '12:00')$q$,
  'jam kerja Senin 09:00-12:00');
select pg_temp.expect_ok(
  $q$insert into public.availability (merchant_id, day_of_week, start_time, end_time) values ('11111111-1111-1111-1111-111111111111', 1, '13:00', '17:00')$q$,
  'jam kerja Senin 13:00-17:00 (tidak bersinggungan)');
select pg_temp.expect_fail(
  $q$insert into public.availability (merchant_id, day_of_week, start_time, end_time) values ('11111111-1111-1111-1111-111111111111', 1, '11:00', '14:00')$q$,
  'jam kerja Senin 11:00-14:00 (tumpang tindih)');
select pg_temp.expect_ok(
  $q$insert into public.availability (merchant_id, day_of_week, start_time, end_time) values ('11111111-1111-1111-1111-111111111111', 2, '11:00', '14:00')$q$,
  'jam kerja Selasa 11:00-14:00 (hari berbeda)');
select pg_temp.expect_fail(
  $q$insert into public.availability (merchant_id, day_of_week, start_time, end_time) values ('11111111-1111-1111-1111-111111111111', 8, '09:00', '10:00')$q$,
  'day_of_week = 8');

-- 5. Anti double-booking
select pg_temp.expect_ok(
  $q$insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime, customer_name, customer_whatsapp, status) values ('11111111-1111-1111-1111-111111111111', 'Makeup Wisuda', 350000, 90, '2026-08-03 09:00+07', '2026-08-03 10:30+07', 'Rina', '+6281100001111', 'PAID')$q$,
  'booking 09:00-10:30 PAID');
select pg_temp.expect_fail(
  $q$insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime, customer_name, customer_whatsapp, status) values ('11111111-1111-1111-1111-111111111111', 'Makeup Akad', 750000, 120, '2026-08-03 10:00+07', '2026-08-03 12:00+07', 'Dewi', '+6281100002222', 'PENDING')$q$,
  'booking 10:00-12:00 bentrok dengan yang PAID');
select pg_temp.expect_ok(
  $q$insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime, customer_name, customer_whatsapp, status) values ('11111111-1111-1111-1111-111111111111', 'Makeup Akad', 750000, 120, '2026-08-03 10:30+07', '2026-08-03 12:30+07', 'Dewi', '+6281100002222', 'PENDING')$q$,
  'booking 10:30-12:30 menempel persis (batas atas eksklusif)');
select pg_temp.expect_ok(
  $q$insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime, customer_name, customer_whatsapp, status) values ('11111111-1111-1111-1111-111111111111', 'Makeup Wisuda', 350000, 90, '2026-08-03 09:30+07', '2026-08-03 11:00+07', 'Sari', '+6281100003333', 'CANCELLED')$q$,
  'booking bentrok tapi berstatus CANCELLED');
-- Nama pelanggan sengaja dibuat valid, supaya yang tertangkap benar-benar
-- constraint nomor WhatsApp, bukan constraint panjang nama.
select pg_temp.expect_fail(
  $q$insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime, customer_name, customer_whatsapp, status) values ('11111111-1111-1111-1111-111111111111', 'Makeup Wisuda', 350000, 90, '2026-08-03 14:00+07', '2026-08-03 15:30+07', 'Budi Santoso', '08123456789', 'PENDING')$q$,
  'nomor WhatsApp bukan format E.164');
select pg_temp.expect_fail(
  $q$insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime, customer_name, customer_whatsapp, status) values ('11111111-1111-1111-1111-111111111111', 'Makeup Wisuda', 350000, 90, '2026-08-03 16:00+07', '2026-08-03 15:00+07', 'Budi Santoso', '+6281234567890', 'PENDING')$q$,
  'end_datetime lebih awal dari start_datetime');
select pg_temp.expect_fail(
  $q$insert into public.services (merchant_id, name, price, duration_minutes) values ('11111111-1111-1111-1111-111111111111', 'Trial', -1, 30)$q$,
  'harga layanan negatif');
select pg_temp.expect_fail(
  $q$insert into public.services (merchant_id, name, price, duration_minutes) values ('11111111-1111-1111-1111-111111111111', 'Trial', 1000, 3)$q$,
  'durasi layanan 3 menit');

-- 5b. Kuota transaksi bulanan
-- Merchant sudah dinaikkan ke PRO di tes sebelumnya, jadi turunkan dulu ke
-- STARTER untuk menguji batasnya.
update public.merchants set subscription_tier = 'STARTER'
where id = '11111111-1111-1111-1111-111111111111';

-- Sudah ada 2 booking aktif (PAID + PENDING) dari blok sebelumnya; isi sampai
-- menyentuh batas 10, memakai jam yang tidak saling bentrok.
do $$
declare
  i integer;
begin
  for i in 1..8 loop
    begin
      insert into public.bookings (
        merchant_id, service_name, service_price, duration_minutes,
        start_datetime, end_datetime, customer_name, customer_whatsapp, status
      ) values (
        '11111111-1111-1111-1111-111111111111', 'Makeup Wisuda', 350000, 60,
        ('2026-08-10 08:00+07'::timestamptz + (i * interval '2 hours')),
        ('2026-08-10 09:00+07'::timestamptz + (i * interval '2 hours')),
        'Pelanggan ' || i, '+62811000' || lpad(i::text, 4, '0'), 'PAID'
      );
    exception when others then
      raise notice 'insert ke-% gagal: %', i, sqlerrm;
    end;
  end loop;
end $$;

select case when public.count_bookings_this_month('11111111-1111-1111-1111-111111111111') = 10
            then 'OK   kuota terpakai 10 dari 10'
            else 'FAIL hitungan kuota = ' ||
                 public.count_bookings_this_month('11111111-1111-1111-1111-111111111111') end as t5b;

select pg_temp.expect_fail(
  $q$insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime, customer_name, customer_whatsapp, status) values ('11111111-1111-1111-1111-111111111111', 'Makeup Wisuda', 350000, 60, '2026-08-20 08:00+07', '2026-08-20 09:00+07', 'Pelanggan Ke-11', '+6281199990000', 'PENDING')$q$,
  'booking ke-11 pada paket STARTER');

update public.merchants set subscription_tier = 'PRO'
where id = '11111111-1111-1111-1111-111111111111';

select pg_temp.expect_ok(
  $q$insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime, customer_name, customer_whatsapp, status) values ('11111111-1111-1111-1111-111111111111', 'Makeup Wisuda', 350000, 60, '2026-08-20 08:00+07', '2026-08-20 09:00+07', 'Pelanggan Ke-11', '+6281199990000', 'PENDING')$q$,
  'booking ke-11 setelah upgrade ke PRO');

-- 6. get_booked_ranges hanya mengembalikan waktu
select 'OK   get_booked_ranges -> ' || count(*) || ' slot terisi' as t6
from public.get_booked_ranges('studio-mawar', '2026-08-03 00:00+07', '2026-08-04 00:00+07');

-- 7. Hak akses kolom
select case when has_column_privilege('anon', 'public.merchants', 'whatsapp_number', 'SELECT')
            then 'FAIL anon bisa membaca whatsapp_number'
            else 'OK   anon TIDAK bisa membaca whatsapp_number' end as t7a,
       case when has_column_privilege('anon', 'public.merchants', 'username', 'SELECT')
            then 'OK   anon bisa membaca username'
            else 'FAIL anon tidak bisa membaca username' end as t7b,
       case when has_column_privilege('authenticated', 'public.merchants', 'subscription_tier', 'UPDATE')
            then 'FAIL merchant bisa mengubah subscription_tier sendiri'
            else 'OK   merchant TIDAK bisa mengubah subscription_tier' end as t7c,
       case when has_table_privilege('anon', 'public.bookings', 'SELECT')
            then 'FAIL anon bisa SELECT tabel bookings'
            else 'OK   anon TIDAK punya akses tabel bookings' end as t7d,
       case when has_schema_privilege('anon', 'private', 'USAGE')
            then 'FAIL anon bisa mengakses schema private'
            else 'OK   anon TIDAK bisa mengakses schema private' end as t7e;

-- 7b. Hak EXECUTE fungsi
-- Supabase memberi EXECUTE ke anon/authenticated pada setiap fungsi baru di
-- schema public lewat ALTER DEFAULT PRIVILEGES. Hanya get_booked_ranges yang
-- boleh publik; my_quota_usage hanya untuk yang login; sisanya tertutup.
select
  case when has_function_privilege('anon', 'public.count_bookings_this_month(uuid)', 'EXECUTE')
       then 'FAIL anon bisa memanggil count_bookings_this_month (bocor data merchant lain)'
       else 'OK   anon TIDAK bisa memanggil count_bookings_this_month' end as t7f,
  case when has_function_privilege('authenticated', 'public.count_bookings_this_month(uuid)', 'EXECUTE')
       then 'FAIL merchant login bisa mengintip kuota merchant lain'
       else 'OK   count_bookings_this_month tertutup dari authenticated' end as t7g,
  case when has_function_privilege('anon', 'public.enforce_booking_quota()', 'EXECUTE')
       then 'FAIL fungsi trigger enforce_booking_quota terekspos ke anon'
       else 'OK   fungsi trigger TIDAK terekspos ke anon' end as t7h,
  case when has_function_privilege('anon', 'public.my_quota_usage()', 'EXECUTE')
       then 'FAIL anon bisa memanggil my_quota_usage'
       else 'OK   my_quota_usage tertutup dari anon' end as t7i,
  case when has_function_privilege('authenticated', 'public.my_quota_usage()', 'EXECUTE')
       then 'OK   merchant login bisa memanggil my_quota_usage'
       else 'FAIL merchant login TIDAK bisa memanggil my_quota_usage' end as t7j,
  case when has_function_privilege('anon', 'public.get_booked_ranges(text, timestamptz, timestamptz)', 'EXECUTE')
       then 'OK   anon bisa memanggil get_booked_ranges (memang publik)'
       else 'FAIL anon TIDAK bisa memanggil get_booked_ranges' end as t7k;

-- 8. RLS aktif di semua tabel
select relname, relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'private') and c.relkind = 'r'
order by relname;

-- 9. Kolom connection_mode / environment pada payment_connections
insert into public.payment_connections (merchant_id, provider)
values ('11111111-1111-1111-1111-111111111111', 'MIDTRANS');

select
  case when connection_mode = 'MANUAL_KEY' then 'OK   default connection_mode = MANUAL_KEY'
       else 'FAIL default connection_mode = ' || connection_mode end as t9a,
  case when environment = 'SANDBOX' then 'OK   default environment = SANDBOX'
       else 'FAIL default environment = ' || environment end as t9b
from public.payment_connections
where merchant_id = '11111111-1111-1111-1111-111111111111' and provider = 'MIDTRANS';

select pg_temp.expect_ok(
  $q$update public.payment_connections set connection_mode = 'OAUTH', environment = 'PRODUCTION' where merchant_id = '11111111-1111-1111-1111-111111111111' and provider = 'MIDTRANS'$q$,
  'connection_mode/environment menerima nilai enum valid lainnya');
select pg_temp.expect_fail(
  $q$update public.payment_connections set connection_mode = 'BOGUS' where merchant_id = '11111111-1111-1111-1111-111111111111' and provider = 'MIDTRANS'$q$,
  'connection_mode menolak nilai di luar enum');

select
  case when has_column_privilege('authenticated', 'public.payment_connections', 'connection_mode', 'SELECT')
       then 'OK   authenticated bisa membaca connection_mode'
       else 'FAIL authenticated tidak bisa membaca connection_mode' end as t9c,
  case when has_column_privilege('authenticated', 'public.payment_connections', 'environment', 'SELECT')
       then 'OK   authenticated bisa membaca environment'
       else 'FAIL authenticated tidak bisa membaca environment' end as t9d,
  case when has_table_privilege('anon', 'public.payment_connections', 'SELECT')
       then 'FAIL anon punya akses tabel payment_connections'
       else 'OK   anon TIDAK punya akses tabel payment_connections' end as t9e,
  case when has_column_privilege('anon', 'public.payment_connections', 'connection_mode', 'SELECT')
       then 'FAIL anon bisa membaca connection_mode'
       else 'OK   anon TIDAK bisa membaca connection_mode' end as t9f;
