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

-- Fixture lama di bawah mengandalkan merchant baru bertier STARTER. Default
-- produksi kini STUDIO (masa awal gratis, migration 20261123000100), jadi
-- dipasang kembali ke STARTER selama bagian 1-70; bagian 71 memulihkannya.
alter table public.merchants alter column subscription_tier set default 'STARTER';

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
-- Berkas metadata Next.js, ditambahkan di migration 20261005175920.
select pg_temp.expect_fail(
  $q$update public.merchants set username = 'opengraph-image' where id = '11111111-1111-1111-1111-111111111111'$q$,
  'username reserved "opengraph-image"');
-- Nama merek, ditambahkan di migration 20261114000100.
select pg_temp.expect_fail(
  $q$update public.merchants set username = 'marky' where id = '11111111-1111-1111-1111-111111111111'$q$,
  'username reserved "marky"');
select pg_temp.expect_fail(
  $q$update public.merchants set username = 'booka' where id = '11111111-1111-1111-1111-111111111111'$q$,
  'username reserved "booka"');
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

-- 10. RPC private.payment_credentials (Task 4)
select
  case when has_function_privilege('anon', 'public.get_payment_credential(uuid, public.payment_provider)', 'EXECUTE')
       then 'FAIL anon bisa memanggil get_payment_credential'
       else 'OK   anon TIDAK bisa memanggil get_payment_credential' end as t10a,
  case when has_function_privilege('authenticated', 'public.get_payment_credential(uuid, public.payment_provider)', 'EXECUTE')
       then 'FAIL authenticated bisa memanggil get_payment_credential'
       else 'OK   authenticated TIDAK bisa memanggil get_payment_credential' end as t10b,
  case when has_function_privilege('service_role', 'public.get_payment_credential(uuid, public.payment_provider)', 'EXECUTE')
       then 'OK   service_role bisa memanggil get_payment_credential'
       else 'FAIL service_role TIDAK bisa memanggil get_payment_credential' end as t10c,
  case when has_function_privilege('anon', 'public.upsert_payment_credential(uuid, public.payment_provider, text, text, text)', 'EXECUTE')
       then 'FAIL anon bisa memanggil upsert_payment_credential'
       else 'OK   anon TIDAK bisa memanggil upsert_payment_credential' end as t10d,
  case when has_function_privilege('authenticated', 'public.upsert_payment_credential(uuid, public.payment_provider, text, text, text)', 'EXECUTE')
       then 'FAIL authenticated bisa memanggil upsert_payment_credential'
       else 'OK   authenticated TIDAK bisa memanggil upsert_payment_credential' end as t10e,
  case when has_function_privilege('service_role', 'public.upsert_payment_credential(uuid, public.payment_provider, text, text, text)', 'EXECUTE')
       then 'OK   service_role bisa memanggil upsert_payment_credential'
       else 'FAIL service_role TIDAK bisa memanggil upsert_payment_credential' end as t10f;

-- 10b. upsert lalu get harus mengembalikan payload yang sama persis (fungsi
-- dites lewat pemanggilan SQL langsung, bukan lewat PostgREST -- privilege
-- EXECUTE sudah dites terpisah di atas).
select public.upsert_payment_credential(
  '11111111-1111-1111-1111-111111111111', 'MIDTRANS', 'ciphertext-percobaan-1', null
);

select case when access_token_encrypted = 'ciphertext-percobaan-1' and refresh_token_encrypted is null
            then 'OK   get_payment_credential mengembalikan payload yang baru di-upsert'
            else 'FAIL get_payment_credential -> ' || coalesce(access_token_encrypted, '<null>') end as t10g
from public.get_payment_credential('11111111-1111-1111-1111-111111111111', 'MIDTRANS');

-- Panggilan kedua ke merchant+provider yang sama harus UPDATE (timpa),
-- bukan gagal karena connection_id sudah punya baris credentials (primary key).
select public.upsert_payment_credential(
  '11111111-1111-1111-1111-111111111111', 'MIDTRANS', 'ciphertext-percobaan-2', 'refresh-percobaan-2'
);

select case when access_token_encrypted = 'ciphertext-percobaan-2' and refresh_token_encrypted = 'refresh-percobaan-2'
            then 'OK   upsert kedua menimpa (bukan menduplikasi) baris credentials'
            else 'FAIL upsert kedua -> ' || coalesce(access_token_encrypted, '<null>') end as t10h
from public.get_payment_credential('11111111-1111-1111-1111-111111111111', 'MIDTRANS');

-- provider yang belum punya baris payment_connections harus ditolak, bukan
-- diam-diam membuat baris credentials yatim.
select pg_temp.expect_fail(
  $q$select public.upsert_payment_credential('11111111-1111-1111-1111-111111111111', 'XENDIT', 'ciphertext-yatim', null)$q$,
  'upsert_payment_credential untuk provider tanpa payment_connections');

-- merchant lain (tidak punya baris payment_connections sama sekali) tidak
-- boleh bisa "menebak" balik kredensial merchant di atas lewat merchant_id acak.
select case when count(*) = 0
            then 'OK   get_payment_credential kosong untuk merchant_id yang tidak terkait'
            else 'FAIL get_payment_credential membocorkan baris untuk merchant tak terkait' end as t10i
from public.get_payment_credential('99999999-9999-9999-9999-999999999999', 'MIDTRANS');

-- 11. Booking engine create_booking(...) (Task 8)
--
-- Merchant sedang PRO (di-set balik pada blok 5b), jadi kuota tidak
-- mengganggu tes bentrok/jam-kerja di bawah -- kuota diuji terpisah dengan
-- menurunkan tier sebentar. Availability yang dipakai: Selasa (day_of_week=2)
-- 11:00-14:00 WIB, sudah dibuat di blok 4. Tanggal 2026-08-04/11/18 semuanya
-- Selasa dan belum dipakai booking manapun di blok-blok sebelumnya.

-- Helper: seperti expect_fail, tapi juga memverifikasi SQLSTATE-nya persis
-- sama dengan yang diharapkan. Dipakai di sini karena pemetaan errcode ->
-- pesan Indonesia di src/lib/booking/errors.ts bergantung pada errcode yang
-- BENAR, bukan cuma "ada error" -- 23P01 (bentrok), P0002 (kuota), dan BK001
-- (di luar jam kerja) harus bisa dibedakan satu sama lain oleh route handler.
create or replace function pg_temp.expect_fail_code(sql text, expected_code text, label text)
returns text language plpgsql as $$
begin
  execute sql;
  return 'FAIL (seharusnya ditolak): ' || label;
exception when others then
  if sqlstate = expected_code then
    return 'OK   ditolak dengan errcode ' || expected_code || ' -> ' || label;
  else
    return 'FAIL errcode salah (dapat ' || sqlstate || ', harap ' || expected_code || ') -> '
      || label || ' [' || sqlerrm || ']';
  end if;
end $$;

-- Tanggal untuk tes create_booking WAJIB relatif terhadap now(), bukan
-- tanggal keras. Sejak create_booking menolak slot lampau (P0006, migration
-- 20260731000100), setiap tanggal keras pasti berubah jadi masa lalu suatu
-- saat dan membuat tes gagal dengan errcode yang salah -- persis yang terjadi
-- pada 11e ketika hari nyata melewati 2026-08-11.
--
-- p_weeks minimal 1 supaya hasilnya selalu di masa depan, termasuk ketika
-- hari ini kebetulan hari yang sama dengan p_dow.
create or replace function pg_temp.jakarta_future(p_dow integer, p_weeks integer, p_time text)
returns timestamptz language sql stable as $$
  select (
    date_trunc('day', (now() at time zone 'Asia/Jakarta'))
    + (((p_dow - extract(isodow from (now() at time zone 'Asia/Jakarta'))::int) + 7) % 7) * interval '1 day'
    + (p_weeks * interval '7 days')
    + p_time::interval
  ) at time zone 'Asia/Jakarta';
$$;

-- 11a. Booking pertama sukses: Selasa 11:00-12:30 (Makeup Wisuda, 90 menit),
-- di dalam jam kerja 11:00-14:00.
select pg_temp.expect_ok(
  $q$select * from public.create_booking(
    '11111111-1111-1111-1111-111111111111',
    (select id from public.services where merchant_id = '11111111-1111-1111-1111-111111111111' and name = 'Makeup Wisuda'),
    pg_temp.jakarta_future(2, 1, '11:00'), 'Pelanggan Booking A', '+6281199991111'
  )$q$,
  'create_booking sukses: Selasa 11:00-12:30 di dalam jam kerja');

-- Snapshot service_name/service_price/duration_minutes wajib berasal dari
-- tabel services yang dibaca ulang di dalam fungsi, dan end_datetime wajib
-- persis start_datetime + duration_minutes layanan tersebut (90 menit).
-- Yang diuji adalah INVARIAN-nya (end = start + durasi layanan), bukan dua
-- timestamp absolut. Selain tahan terhadap pergeseran tanggal, ini juga
-- menguji hal yang sebenarnya penting: durasi diambil dari tabel services,
-- bukan dari input pemanggil.
select case when service_name = 'Makeup Wisuda'
              and service_price = 350000
              and duration_minutes = 90
              and end_datetime = start_datetime + interval '90 minutes'
            then 'OK   create_booking menyimpan snapshot service + end_datetime = start + duration_minutes'
            else 'FAIL snapshot booking A -> ' || service_name || ' ' || service_price || ' '
              || duration_minutes || ' ' || start_datetime || ' - ' || end_datetime end as t11a
from public.bookings
where merchant_id = '11111111-1111-1111-1111-111111111111' and customer_whatsapp = '+6281199991111';

-- 11b. Dua booking bentrok: 12:00-14:00 (Makeup Akad, 120 menit) beririsan
-- dengan 11:00-12:30 di atas -> harus ditolak errcode 23P01
-- (bookings_no_overlap), bukan errcode lain.
select pg_temp.expect_fail_code(
  $q$select * from public.create_booking(
    '11111111-1111-1111-1111-111111111111',
    (select id from public.services where merchant_id = '11111111-1111-1111-1111-111111111111' and name = 'Makeup Akad'),
    pg_temp.jakarta_future(2, 1, '12:00'), 'Pelanggan Booking B', '+6281199992222'
  )$q$,
  '23P01',
  'create_booking ditolak (23P01): 12:00-14:00 bentrok dengan 11:00-12:30');

-- 11c. Slot di luar jam kerja: Selasa 08:00 (jam kerja mulai 11:00) -> harus
-- ditolak errcode BK001, bukan lolos begitu saja karena tidak ada booking
-- lain yang bentrok pada jam itu.
select pg_temp.expect_fail_code(
  $q$select * from public.create_booking(
    '11111111-1111-1111-1111-111111111111',
    (select id from public.services where merchant_id = '11111111-1111-1111-1111-111111111111' and name = 'Makeup Wisuda'),
    pg_temp.jakarta_future(2, 1, '08:00'), 'Pelanggan Booking C', '+6281199993333'
  )$q$,
  'BK001',
  'create_booking ditolak (BK001): 08:00 Selasa sebelum jam kerja mulai (11:00)');

-- 11d. Layanan tidak aktif -> harus ditolak errcode P0005, bukan diam-diam
-- membuat booking untuk layanan yang sudah merchant nonaktifkan.
select pg_temp.expect_ok(
  $q$insert into public.services (merchant_id, name, price, duration_minutes, is_active) values ('11111111-1111-1111-1111-111111111111', 'Layanan Nonaktif', 100000, 60, false)$q$,
  'buat layanan nonaktif untuk tes 11d');
select pg_temp.expect_fail_code(
  $q$select * from public.create_booking(
    '11111111-1111-1111-1111-111111111111',
    (select id from public.services where merchant_id = '11111111-1111-1111-1111-111111111111' and name = 'Layanan Nonaktif'),
    pg_temp.jakarta_future(2, 2, '11:00'), 'Pelanggan Booking D', '+6281199995555'
  )$q$,
  'P0005',
  'create_booking ditolak (P0005): layanan sudah tidak aktif');

-- 11e. Kuota bulanan habis -> P0002. Merchant sudah punya >= 10 booking
-- aktif bulan ini dari blok 5b; turunkan tier ke STARTER sebentar supaya
-- kuotanya berlaku, pakai slot yang jelas valid (Selasa 11:00-13:00, di
-- dalam jam kerja, tidak bentrok apa pun) supaya satu-satunya sebab gagal
-- adalah kuota, bukan sebab lain.
update public.merchants set subscription_tier = 'STARTER'
where id = '11111111-1111-1111-1111-111111111111';

select pg_temp.expect_fail_code(
  $q$select * from public.create_booking(
    '11111111-1111-1111-1111-111111111111',
    (select id from public.services where merchant_id = '11111111-1111-1111-1111-111111111111' and name = 'Makeup Akad'),
    pg_temp.jakarta_future(2, 3, '11:00'), 'Pelanggan Booking E', '+6281199994444'
  )$q$,
  'P0002',
  'create_booking ditolak (P0002): kuota bulanan STARTER sudah habis');

update public.merchants set subscription_tier = 'PRO'
where id = '11111111-1111-1111-1111-111111111111';

-- 11f. Hak EXECUTE: hanya service_role yang boleh memanggil create_booking.
-- anon/authenticated TIDAK PERNAH -- pembuatan booking cuma lewat
-- POST /api/bookings (service role), lihat docs/DECISIONS.md bagian 1.
select
  case when has_function_privilege('anon', 'public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source, text, integer, uuid, uuid, text, uuid, uuid, text, text, text, text, uuid, integer)', 'EXECUTE')
       then 'FAIL anon bisa memanggil create_booking'
       else 'OK   anon TIDAK bisa memanggil create_booking' end as t11f_anon,
  case when has_function_privilege('authenticated', 'public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source, text, integer, uuid, uuid, text, uuid, uuid, text, text, text, text, uuid, integer)', 'EXECUTE')
       then 'FAIL authenticated bisa memanggil create_booking'
       else 'OK   authenticated TIDAK bisa memanggil create_booking' end as t11f_auth,
  case when has_function_privilege('service_role', 'public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source, text, integer, uuid, uuid, text, uuid, uuid, text, text, text, text, uuid, integer)', 'EXECUTE')
       then 'OK   service_role bisa memanggil create_booking'
       else 'FAIL service_role TIDAK bisa memanggil create_booking' end as t11f_service;

-- 11g. Slot yang sudah lewat -> harus ditolak errcode P0006 (migration
-- 20260731000100_reject_past_slot_booking.sql), bukan lolos begitu saja
-- karena kebetulan berada di dalam jam kerja Selasa 11:00-14:00. Tanggal di
-- masa lalu jauh (2020) supaya tesnya tidak pernah kedaluwarsa mengejar
-- "now()" saat CI berjalan.
select pg_temp.expect_fail_code(
  $q$select * from public.create_booking(
    '11111111-1111-1111-1111-111111111111',
    (select id from public.services where merchant_id = '11111111-1111-1111-1111-111111111111' and name = 'Makeup Wisuda'),
    '2020-01-07 11:00+07', 'Pelanggan Booking F', '+6281199997777'
  )$q$,
  'P0006',
  'create_booking ditolak (P0006): slot 2020-01-07 11:00 WIB sudah lewat');

-- 11h. Hak UPDATE per kolom di merchants.
--
-- `id` TIDAK boleh bisa di-UPDATE oleh authenticated: sama seperti
-- subscription_tier dan active_payment_provider, kolom itu di luar daftar
-- "boleh diubah merchant dari browser" di 20260729000100_init_schema.sql.
--
-- Ini bukan detail sepele. Selama invariant ini berlaku, `upsert` PostgREST ke
-- tabel merchants dari sesi merchant SELALU gagal 42501, karena PostgREST
-- menyusun `ON CONFLICT ... DO UPDATE SET` untuk seluruh kolom di payload --
-- termasuk `id`. Itulah yang dulu membuat onboarding mustahil selesai untuk
-- setiap user baru. Perbaikannya ada di src/app/onboarding/actions.ts
-- (UPDATE dulu, INSERT hanya kalau tidak ada baris yang kena), bukan dengan
-- melonggarkan grant di sini. Kalau test ini suatu saat FAIL, artinya grant
-- sudah dilonggarkan dan keputusan itu perlu ditinjau ulang.
select
  case when has_column_privilege('authenticated', 'public.merchants', 'id', 'UPDATE')
       then 'FAIL authenticated bisa UPDATE merchants.id'
       else 'OK   authenticated TIDAK bisa UPDATE merchants.id' end as t11h_id,
  case when has_column_privilege('authenticated', 'public.merchants', 'subscription_tier', 'UPDATE')
       then 'FAIL authenticated bisa UPDATE merchants.subscription_tier'
       else 'OK   authenticated TIDAK bisa UPDATE merchants.subscription_tier' end as t11h_tier,
  case when has_column_privilege('authenticated', 'public.merchants', 'username', 'UPDATE')
       then 'OK   authenticated bisa UPDATE merchants.username'
       else 'FAIL authenticated TIDAK bisa UPDATE merchants.username' end as t11h_username,
  case when has_column_privilege('authenticated', 'public.merchants', 'onboarded_at', 'UPDATE')
       then 'OK   authenticated bisa UPDATE merchants.onboarded_at'
       else 'FAIL authenticated TIDAK bisa UPDATE merchants.onboarded_at' end as t11h_onboarded;

-- ===========================================================================
-- 12. Booking PENDING kedaluwarsa tidak boleh memakan kuota / mengunci slot
-- (migration 20260731000200). Sebelumnya baris basi baru dibersihkan cron;
-- sejak cron turun jadi harian, jendela itu sampai 24 jam.
-- ===========================================================================

-- Merchant terpisah supaya tidak mengganggu hitungan blok tes sebelumnya.
insert into auth.users (id, email) values
  ('22222222-2222-2222-2222-222222222222', 'expired@example.com');
update public.merchants
  set username = 'studio-expired', subscription_tier = 'STARTER', onboarded_at = now()
  where id = '22222222-2222-2222-2222-222222222222';
insert into public.services (id, merchant_id, name, price, duration_minutes)
  values ('33333333-3333-3333-3333-333333333333',
          '22222222-2222-2222-2222-222222222222', 'Makeup', 100000, 60);
insert into public.availability (merchant_id, day_of_week, start_time, end_time)
  select '22222222-2222-2222-2222-222222222222', d, '09:00', '17:00'
  from generate_series(1, 7) d;

-- Satu booking PENDING yang batas bayarnya SUDAH lewat.
insert into public.bookings (
  merchant_id, service_id, service_name, service_price, duration_minutes,
  start_datetime, end_datetime, customer_name, customer_whatsapp,
  status, expires_at
) values (
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333', 'Makeup', 100000, 60,
  now() + interval '3 days', now() + interval '3 days 1 hour',
  'Pelanggan Kabur', '+6281200000001',
  'PENDING', now() - interval '1 minute'
);

select case when public.count_bookings_this_month('22222222-2222-2222-2222-222222222222') = 0
            then 'OK   PENDING kedaluwarsa TIDAK memakan kuota'
            else 'FAIL PENDING kedaluwarsa masih dihitung kuota' end as t12a;

select case when count(*) = 0
            then 'OK   PENDING kedaluwarsa TIDAK menutup slot (get_booked_ranges)'
            else 'FAIL PENDING kedaluwarsa masih menutup slot' end as t12b
from public.get_booked_ranges('studio-expired', now(), now() + interval '7 days');

-- Slot yang sama harus bisa dipesan ulang: create_booking membatalkan baris
-- basi di dalam advisory lock, jadi bookings_no_overlap tidak lagi menolak.
select pg_temp.expect_ok(
  $q$select * from public.create_booking(
       '22222222-2222-2222-2222-222222222222',
       '33333333-3333-3333-3333-333333333333',
       (date_trunc('day', now() at time zone 'Asia/Jakarta') + interval '3 days 10 hours')
         at time zone 'Asia/Jakarta',
       'Pelanggan Baru', '+6281200000002')$q$,
  'slot bekas PENDING kedaluwarsa bisa dipesan ulang');

select case when count(*) = 1
            then 'OK   baris PENDING kedaluwarsa jadi CANCELLED oleh create_booking'
            else 'FAIL pembersihan inline tidak terjadi (' || count(*) || ' baris)' end as t12d
from public.bookings
where merchant_id = '22222222-2222-2222-2222-222222222222'
  and status = 'CANCELLED'
  and cancel_reason = 'DP tidak dibayar dalam batas waktu';

-- ===========================================================================
-- 13. Rate limit booking + token webhook terpisah
-- (migration 20260813120000 dan 20260813120100)
-- ===========================================================================

-- 13a. Tiga percobaan pertama lolos, yang keempat ditolak.
select case when public.check_booking_rate_limit('hash-uji-1', '22222222-2222-2222-2222-222222222222')
            then 'OK   rate limit: percobaan 1 diizinkan'
            else 'FAIL percobaan 1 seharusnya diizinkan' end as t13a1;
select case when public.check_booking_rate_limit('hash-uji-1', '22222222-2222-2222-2222-222222222222')
            then 'OK   rate limit: percobaan 2 diizinkan'
            else 'FAIL percobaan 2 seharusnya diizinkan' end as t13a2;
select case when public.check_booking_rate_limit('hash-uji-1', '22222222-2222-2222-2222-222222222222')
            then 'OK   rate limit: percobaan 3 diizinkan'
            else 'FAIL percobaan 3 seharusnya diizinkan' end as t13a3;
select case when public.check_booking_rate_limit('hash-uji-1', '22222222-2222-2222-2222-222222222222')
            then 'FAIL percobaan 4 seharusnya DITOLAK'
            else 'OK   rate limit: percobaan 4 ditolak' end as t13a4;

-- 13b. Batasnya per (ip, merchant): IP lain pada merchant sama tetap lolos.
select case when public.check_booking_rate_limit('hash-uji-2', '22222222-2222-2222-2222-222222222222')
            then 'OK   rate limit: IP berbeda tidak ikut terblokir'
            else 'FAIL IP berbeda seharusnya masih diizinkan' end as t13b;

-- 13c. anon/authenticated tidak boleh menyentuh tabel maupun fungsinya.
select
  case when has_table_privilege('anon', 'public.booking_attempts', 'SELECT')
       then 'FAIL anon bisa membaca booking_attempts'
       else 'OK   anon TIDAK punya akses booking_attempts' end as t13c_anon,
  case when has_function_privilege('anon', 'public.check_booking_rate_limit(text, uuid)', 'EXECUTE')
       then 'FAIL anon bisa memanggil check_booking_rate_limit'
       else 'OK   anon TIDAK bisa memanggil check_booking_rate_limit' end as t13c_fn,
  case when has_function_privilege('service_role', 'public.check_booking_rate_limit(text, uuid)', 'EXECUTE')
       then 'OK   service_role bisa memanggil check_booking_rate_limit'
       else 'FAIL service_role TIDAK bisa memanggil check_booking_rate_limit' end as t13c_svc;

-- 13d. reap_expired_bookings membatalkan PENDING kedaluwarsa lintas merchant.
insert into public.bookings (
  merchant_id, service_id, service_name, service_price, duration_minutes,
  start_datetime, end_datetime, customer_name, customer_whatsapp,
  status, expires_at
) values (
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333', 'Makeup', 100000, 60,
  now() + interval '5 days', now() + interval '5 days 1 hour',
  'Pelanggan Basi', '+6281200000009',
  'PENDING', now() - interval '1 minute'
);
select case when public.reap_expired_bookings() >= 1
            then 'OK   reap_expired_bookings membatalkan booking kedaluwarsa'
            else 'FAIL reap_expired_bookings tidak membatalkan apa pun' end as t13d;

-- 13e. Kolom webhook token ada, dan upsert versi lama (4 argumen) sudah hilang.
select
  case when exists (
         select 1 from information_schema.columns
         where table_schema = 'private' and table_name = 'payment_credentials'
           and column_name = 'webhook_token_encrypted')
       then 'OK   kolom webhook_token_encrypted ada'
       else 'FAIL kolom webhook_token_encrypted tidak ada' end as t13e_col,
  case when (select count(*) from pg_proc
             where pronamespace = 'public'::regnamespace
               and proname = 'upsert_payment_credential') = 1
       then 'OK   hanya ada satu versi upsert_payment_credential'
       else 'FAIL ada lebih dari satu versi upsert_payment_credential' end as t13e_fn;

-- ===========================================================================
-- 14. access_token booking (Task 1 fondasi Phase 5-6, migration
-- 20260819000100_booking_access_token.sql) -- kunci rahasia /pesanan/[token].
-- ===========================================================================

-- 14a. Booking baru mendapat access_token non-null sepanjang 48 karakter
-- (24 byte acak di-encode hex -> 192 bit entropi). Booking A dari 11a
-- dipakai lagi -- customer_whatsapp '+6281199991111' cuma dipakai baris itu.
select
  case when access_token is not null and length(access_token) = 48
       then 'OK   booking A mendapat access_token 48 karakter'
       else 'FAIL access_token booking A -> ' || coalesce(access_token, 'NULL')
         || ' (panjang ' || coalesce(length(access_token)::text, '0') || ')' end as t14a
from public.bookings
where merchant_id = '11111111-1111-1111-1111-111111111111'
  and customer_whatsapp = '+6281199991111';

-- 14b. Dua booking berbeda (merchant berbeda, keduanya dibuat lewat
-- create_booking di 11a dan 12) mendapat access_token yang berbeda -- unique
-- index bookings_access_token_key bekerja, bukan cuma dipasang tanpa efek.
select case when (
         select access_token from public.bookings
         where merchant_id = '11111111-1111-1111-1111-111111111111'
           and customer_whatsapp = '+6281199991111'
       ) is distinct from (
         select access_token from public.bookings
         where merchant_id = '22222222-2222-2222-2222-222222222222'
           and customer_whatsapp = '+6281200000002'
       )
       then 'OK   dua booking mendapat access_token berbeda'
       else 'FAIL dua booking punya access_token sama (atau salah satu NULL)' end as t14b;

-- 14c. Peran anon TIDAK BISA membaca kolom access_token. Tabelnya sendiri
-- sudah tanpa akses sama sekali untuk anon (t7d) -- ini menegaskan kolom
-- barunya secara spesifik, sesuai catatan TEMUAN di migration 1a soal grant
-- tingkat tabel `authenticated` yang tidak bisa dipreteli per kolom.
select case when has_column_privilege('anon', 'public.bookings', 'access_token', 'SELECT')
            then 'FAIL anon bisa membaca bookings.access_token'
            else 'OK   anon TIDAK bisa membaca bookings.access_token' end as t14c;

-- ===========================================================================
-- 15. Pembatalan booking oleh merchant (Task 2 Phase 5-6, migration
-- 20260819000200_bookings_merchant_cancel.sql) -- src/app/dashboard/bookings/actions.ts.
-- ===========================================================================

-- 15a. authenticated boleh UPDATE ketiga kolom yang benar-benar diubah
-- pembatalan: status, cancelled_at, cancel_reason.
select
  case when has_column_privilege('authenticated', 'public.bookings', 'status', 'UPDATE')
       then 'OK   authenticated boleh UPDATE bookings.status'
       else 'FAIL authenticated tidak boleh UPDATE bookings.status' end as t15a_status,
  case when has_column_privilege('authenticated', 'public.bookings', 'cancelled_at', 'UPDATE')
       then 'OK   authenticated boleh UPDATE bookings.cancelled_at'
       else 'FAIL authenticated tidak boleh UPDATE bookings.cancelled_at' end as t15a_cancelled_at,
  case when has_column_privilege('authenticated', 'public.bookings', 'cancel_reason', 'UPDATE')
       then 'OK   authenticated boleh UPDATE bookings.cancel_reason'
       else 'FAIL authenticated tidak boleh UPDATE bookings.cancel_reason' end as t15a_cancel_reason;

-- 15b. Kolom lain TIDAK ikut ter-grant UPDATE -- terutama customer_name/
-- customer_whatsapp (merchant tidak boleh menulis ulang PII pelanggan lewat
-- jalur ini) dan merchant_id (tidak boleh memindahkan kepemilikan baris).
select
  case when has_column_privilege('authenticated', 'public.bookings', 'customer_name', 'UPDATE')
       then 'FAIL authenticated bisa UPDATE bookings.customer_name'
       else 'OK   authenticated TIDAK bisa UPDATE bookings.customer_name' end as t15b_customer_name,
  case when has_column_privilege('authenticated', 'public.bookings', 'merchant_id', 'UPDATE')
       then 'FAIL authenticated bisa UPDATE bookings.merchant_id'
       else 'OK   authenticated TIDAK bisa UPDATE bookings.merchant_id' end as t15b_merchant_id;

-- 15c. anon tetap tidak dapat hak apa pun ke bookings (tidak berubah oleh
-- migration ini -- grant UPDATE di atas hanya menyebut "to authenticated").
select case when has_column_privilege('anon', 'public.bookings', 'status', 'UPDATE')
            then 'FAIL anon bisa UPDATE bookings.status'
            else 'OK   anon TIDAK bisa UPDATE bookings.status' end as t15c;

-- 15d. Policy bookings_cancel_own ada untuk UPDATE, dan with_check menyebut
-- 'CANCELLED'. CATATAN: ini cuma pengecekan BENTUK teks klausa lewat
-- pg_policies -- klausa yang salah tapi kebetulan mengandung substring yang
-- sama akan tetap lolos di sini. Bukti perilaku SUNGGUHAN (policy-nya benar-
-- benar menolak/mengizinkan UPDATE yang tepat saat dieksekusi sebagai
-- merchant) ada di blok 16 di bawah, bukan di sini.
select case when exists (
         select 1 from pg_policies
         where schemaname = 'public'
           and tablename = 'bookings'
           and policyname = 'bookings_cancel_own'
           and cmd = 'UPDATE'
           and with_check like '%CANCELLED%'
       )
       then 'OK   policy bookings_cancel_own ada dan with_check menyebut CANCELLED (bentuk teks, lihat blok 16 untuk perilaku)'
       else 'FAIL policy bookings_cancel_own tidak ditemukan / with_check tidak menyebut CANCELLED' end as t15d;

-- 15e. Klausa USING policy bookings_cancel_own menyebut kedua status lama
-- yang masih boleh diubah (PENDING, PAID) -- lagi-lagi cuma bentuk teks,
-- perilakunya diuji sungguhan di blok 16.
select case when exists (
         select 1 from pg_policies
         where schemaname = 'public'
           and tablename = 'bookings'
           and policyname = 'bookings_cancel_own'
           and cmd = 'UPDATE'
           and qual like '%PENDING%'
           and qual like '%PAID%'
       )
       then 'OK   policy bookings_cancel_own USING menyebut status PENDING dan PAID (bentuk teks, lihat blok 16 untuk perilaku)'
       else 'FAIL policy bookings_cancel_own USING tidak menyebut status PENDING/PAID' end as t15e;

-- ===========================================================================
-- 16. Perilaku SUNGGUHAN policy bookings_cancel_own -- dijalankan sebagai
-- peran authenticated dengan sesi merchant disimulasikan lewat GUC
-- request.jwt.claim.sub (dibaca auth.uid() di 00_supabase_stub.sql), bukan
-- cuma dicek bentuk teksnya seperti 15d/15e. Dibungkus BEGIN/ROLLBACK
-- supaya baik peran (SET LOCAL ROLE) maupun perubahan data yang mungkin
-- berhasil di dalamnya sama sekali tidak membekas untuk tes-tes lain di
-- file ini setelah blok ini selesai.
-- ===========================================================================

-- ID dua booking yang dipakai di bawah, diambil SEBAGAI SUPERUSER (koneksi
-- psql harness ini, RLS tidak berlaku untuknya) SEBELUM berganti peran --
-- supaya blok simulasi di bawah murni menguji UPDATE-nya sendiri, tidak
-- tercampur dengan RLS SELECT (bookings_read_own) yang sudah pasti
-- menyembunyikan baris merchant lain lebih dulu kalau di-query ulang di
-- dalam sesi authenticated.
select id as own_booking_id
from public.bookings
where merchant_id = '11111111-1111-1111-1111-111111111111'
  and customer_whatsapp = '+6281199991111' \gset

select id as other_booking_id
from public.bookings
where merchant_id = '22222222-2222-2222-2222-222222222222'
  and customer_whatsapp = '+6281200000002' \gset

-- Sentinel M6: ini file dijalankan TANPA ON_ERROR_STOP (lihat baris 1),
-- persis supaya expect_fail/expect_ok bisa memicu constraint violation
-- tanpa menghentikan skrip. Tapi t16a/t16b/t16c di bawah BUKAN semuanya
-- lewat expect_fail_code -- t16b dan t16c adalah UPDATE mentah, tidak
-- dibungkus exception handler apa pun. Kalau ADA yang tak terduga gagal di
-- dalam blok BEGIN/ROLLBACK di bawah (mis. \gset di atas ternyata tidak
-- menemukan baris karena data seed berubah, membuat :'own_booking_id' atau
-- :'other_booking_id' tersubstitusi jadi sesuatu yang tidak valid), sisa
-- statement di transaksi itu akan gagal dengan "current transaction is
-- aborted" -- pesan generik yang TIDAK diawali "FAIL", jadi lolos begitu
-- saja dari kontrak file ini ("baris diawali FAIL berarti ada masalah").
--
-- Sequence dipilih sebagai penanda karena nextval() SATU-SATUNYA efek
-- samping SQL yang didesain Postgres untuk TIDAK PERNAH ikut di-ROLLBACK
-- (supaya nomor urut tidak "mundur" akibat rollback) -- jadi dibuat di
-- SINI, di luar BEGIN/ROLLBACK di bawah, lalu di-tick sekali di setiap
-- t16a/t16b/t16c, dan diperiksa lagi setelah ROLLBACK (lihat sentinel
-- t16_sentinel di akhir blok ini). Kalau salah satu dari ketiganya gagal
-- dieksekusi sampai akhir, sentinel itu yang menangkapnya sebagai FAIL
-- sungguhan -- bukan diam-diam lolos.
create temporary sequence t16_seen;
-- WAJIB: blok di bawah ini "set local role authenticated" (peran rendah,
-- bukan superuser koneksi psql harness ini) -- tanpa GRANT eksplisit ini,
-- nextval() di t16a/t16b/t16c akan gagal "permission denied for sequence"
-- (default privilege sequence cuma untuk owner-nya), yang justru
-- meniadakan gunanya sentinel ini sendiri.
grant usage, select on sequence t16_seen to authenticated;

begin;

set local role authenticated;
-- Stub auth.uid() di 00_supabase_stub.sql membaca GUC datar
-- "request.jwt.claim.sub", BUKAN JSON request.jwt.claims seperti PostgREST
-- sungguhan -- lihat definisi fungsinya.
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- t16a. Merchant TIDAK BISA memalsukan status jadi 'PAID' pada booking
-- MILIKNYA SENDIRI -- WITH CHECK menolak nilai status baru selain
-- 'CANCELLED', meski kolom status sudah ter-grant UPDATE untuknya.
-- expect_fail_code (bukan expect_fail biasa) dipakai supaya lolosnya tes ini
-- BENAR-BENAR karena pelanggaran RLS (42501 -- insufficient_privilege,
-- kode yang dipakai Postgres untuk "new row violates row-level security
-- policy"), bukan kebetulan gagal karena sebab lain yang tidak terkait.
select pg_temp.expect_fail_code(
         format($q$update public.bookings set status = 'PAID' where id = %L$q$, :'own_booking_id'),
         '42501',
         'merchant memalsukan status jadi PAID pada booking miliknya sendiri (t16a)') as t16a,
       -- Tick sentinel M6 -- lihat catatan besar sebelum "begin;" di atas.
       -- expect_fail_code menangkap errornya sendiri (exception handler di
       -- dalam fungsinya), jadi statement SELECT ini sendiri tidak pernah
       -- gagal karena t16a -- nextval() di sini murni membuktikan baris
       -- select ini benar-benar selesai dieksekusi.
       nextval('t16_seen') as t16a_tick;

-- t16b. Merchant TIDAK BISA mengubah booking MILIK MERCHANT LAIN -- USING
-- memfilter baris berdasarkan merchant_id SEBELUM update dievaluasi, jadi
-- hasilnya 0 baris berubah (bukan error), walau id booking target diketahui
-- persis (id booking bukan rahasia -- dipakai sebagai orderId QRIS, lihat
-- komentar di 20260819000100_booking_access_token.sql) dan tidak ada filter
-- merchant_id di WHERE sama sekali -- membuktikan RLS-lah yang menahannya,
-- bukan cuma filter aplikasi di actions.ts.
with updated as (
  update public.bookings
  set status = 'CANCELLED', cancelled_at = now(), cancel_reason = 'percobaan tidak sah'
  where id = :'other_booking_id'
  returning id
)
select case when count(*) = 0
            then 'OK   t16b merchant TIDAK bisa mengubah booking milik merchant lain (0 baris terpengaruh)'
            else 'FAIL t16b merchant berhasil mengubah ' || count(*) || ' baris booking milik merchant lain' end as t16b,
       -- Tick sentinel M6 (lihat catatan sebelum "begin;") -- beda dari
       -- t16a, UPDATE di CTE "updated" di atas TIDAK dibungkus exception
       -- handler apa pun. Kalau UPDATE itu sendiri gagal tak terduga
       -- (bukan cuma "0 baris terpengaruh", tapi errcode sungguhan),
       -- seluruh statement ini (termasuk nextval di sini) tidak pernah
       -- selesai -- sentinel t16_sentinel di akhir blok yang menangkapnya.
       nextval('t16_seen') as t16b_tick
from updated;

-- t16c. Jalur legit: booking MILIK SENDIRI, status PENDING -> CANCELLED,
-- BERHASIL DAN benar-benar mengubah barisnya (bukan cuma "tidak error" --
-- expect_ok tidak menjamin ada baris yang berubah, karena UPDATE yang
-- match 0 baris juga bukan error) -- membuktikan policy-nya benar-benar
-- mengizinkan yang memang harus diizinkan, bukan cuma memblokir semuanya
-- (yang juga akan "lolos" t16a dan t16b tapi salah).
with updated as (
  update public.bookings
  set status = 'CANCELLED', cancelled_at = now(), cancel_reason = 'Dibatalkan oleh merchant'
  where id = :'own_booking_id'
  returning id, status
)
select case when count(*) = 1 and bool_and(status = 'CANCELLED')
            then 'OK   t16c merchant berhasil membatalkan booking miliknya sendiri (PENDING -> CANCELLED, 1 baris)'
            else 'FAIL t16c pembatalan booking sendiri tidak berhasil sebagaimana mestinya (' || count(*) || ' baris)' end as t16c,
       -- Tick sentinel M6 (lihat catatan sebelum "begin;" di atas).
       nextval('t16_seen') as t16c_tick
from updated;

rollback;

-- Sentinel M6 -- dijalankan SETELAH rollback, DI LUAR transaksi blok 16,
-- dengan sengaja. nextval() TIDAK PERNAH ikut di-ROLLBACK (lihat catatan
-- besar sebelum "begin;" di atas blok ini), jadi last_value sequence ini
-- adalah bukti independen berapa banyak dari t16a/t16b/t16c yang BENAR-
-- BENAR selesai dieksekusi sampai baris nextval()-nya masing-masing --
-- tidak peduli apakah hasil pemeriksaannya sendiri OK atau FAIL, ataupun
-- apakah "rollback;" di atas membatalkan SEMUA perubahan data blok ini.
-- Kalau salah satu dari ketiganya gagal di tengah jalan (transaksi
-- ter-abort sebelum sempat memanggil nextval()-nya), last_value akan
-- kurang dari 3 -- itulah yang ditangkap di sini sebagai FAIL sungguhan,
-- bukan diam-diam lolos sebagai pesan "current transaction is aborted"
-- generik yang tidak diawali "FAIL".
select case
         when not is_called
           then 'FAIL sentinel blok 16: tidak ada satu pun pemeriksaan t16 yang benar-benar tereksekusi (lihat pesan ERROR di atas)'
         when last_value = 3
           then 'OK   sentinel blok 16: ketiga pemeriksaan t16a/t16b/t16c benar-benar tereksekusi sampai akhir'
         else 'FAIL sentinel blok 16: hanya ' || last_value || ' dari 3 pemeriksaan t16 yang tereksekusi -- transaksi kemungkinan gagal di tengah jalan (lihat pesan ERROR di atas)'
       end as t16_sentinel
from t16_seen;

-- ===========================================================================
-- 17. Kolom kesehatan charge payment_connections (last_charge_error/
-- last_charge_error_at/last_charge_success_at, migration
-- 20260819000300_payment_connection_charge_health.sql) -- bukti PERILAKU
-- untuk kesimpulan grant yang ditulis di migration itu: authenticated boleh
-- SELECT, TIDAK boleh UPDATE; anon tidak boleh keduanya.
--
-- Blok 9 di atas sudah memakai has_column_privilege untuk claim identik
-- (connection_mode/environment) pada tabel yang sama -- itu memadai untuk
-- anon di t17c/t17d di bawah, karena "tidak ada grant sama sekali" adalah
-- pemeriksaan biner yang tidak butuh eksekusi sungguhan untuk dibuktikan.
-- Tapi untuk authenticated dipakai bukti SUNGGUHAN (SELECT dan UPDATE
-- benar-benar dieksekusi SEBAGAI peran authenticated, bukan cuma metadata
-- privilege) -- tabel ini juga punya RLS aktif (payment_connections_read_
-- own, migration 20260729000200), dan has_column_privilege sendiri tidak
-- membuktikan RLS itu tidak diam-diam menyembunyikan/menolak baris di
-- jalur baca sungguhan.
-- ===========================================================================

-- Baris baru untuk merchant 1, provider XENDIT -- provider ini SENGAJA
-- belum punya baris payment_connections untuk merchant 1 sampai titik ini
-- di file (lihat komentar t10h di atas, yang justru menguji provider XENDIT
-- BELUM punya baris), jadi tidak bentrok dengan constraint
-- payment_connections_unique_provider (merchant_id, provider).
insert into public.payment_connections (
  merchant_id, provider, last_charge_error, last_charge_error_at
) values (
  '11111111-1111-1111-1111-111111111111', 'XENDIT',
  'status_code 402: Payment channel is not activated', now() - interval '1 hour'
);

-- Sequence sentinel M6, pola sama seperti blok 16 -- lihat catatan besar
-- sebelum "begin;" di blok 16 untuk alasan lengkapnya. Ringkasnya: nextval()
-- tidak ikut ROLLBACK, jadi dipakai untuk membuktikan t17a/t17b
-- benar-benar tereksekusi sampai akhir, bukan cuma diam-diam gagal di
-- tengah jalan dengan pesan generik "current transaction is aborted" yang
-- tidak diawali "FAIL".
create temporary sequence t17_seen;
grant usage, select on sequence t17_seen to authenticated;

begin;

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- t17a. authenticated BENAR-BENAR bisa membaca ketiga kolom baru pada
-- baris miliknya sendiri -- bukan cuma "tidak error", tapi nilai yang
-- terbaca memang nilai yang barusan di-insert. Ini pernyataan SQL mentah
-- tanpa exception handler (seperti t16b/t16c) -- kalau baris ini gagal tak
-- terduga (mis. asumsi grant/RLS di atas ternyata salah), transaksi
-- ter-abort dan sentinel t17_sentinel di bawah yang menangkapnya.
with row_read as (
  select last_charge_error, last_charge_error_at, last_charge_success_at
  from public.payment_connections
  where merchant_id = '11111111-1111-1111-1111-111111111111' and provider = 'XENDIT'
)
select case
         when last_charge_error = 'status_code 402: Payment channel is not activated'
           and last_charge_error_at is not null
           and last_charge_success_at is null
           then 'OK   authenticated benar-benar membaca last_charge_error/last_charge_error_at/last_charge_success_at miliknya sendiri'
         else 'FAIL authenticated tidak membaca nilai yang benar dari ketiga kolom baru (baris tidak ditemukan atau nilainya salah)'
       end as t17a,
       -- Tick sentinel M6 -- hanya tereksekusi kalau SELECT di atas benar-
       -- benar menghasilkan baris (row_read tidak kosong) DAN tidak error.
       nextval('t17_seen') as t17a_tick
from row_read;

-- t17b. authenticated TIDAK BISA menulis last_charge_error -- dipakai
-- expect_fail_code (bukan expect_fail biasa) supaya lolosnya tes ini
-- BENAR-BENAR karena kekurangan privilege kolom (42501 --
-- insufficient_privilege), bukan kebetulan gagal karena sebab lain.
-- expect_fail_code sudah punya exception handler sendiri di dalam definisi
-- fungsinya (lihat sebelum blok 16), jadi statement ini sendiri aman dari
-- risiko meng-abort transaksi -- KECUALI transaksi sudah ter-abort lebih
-- dulu oleh t17a, dalam hal ini seluruh statement ini (termasuk
-- nextval-nya) tidak akan tereksekusi sama sekali dan langsung ditangkap
-- sentinel di bawah, bukan diam-diam lolos.
select pg_temp.expect_fail_code(
         $q$update public.payment_connections set last_charge_error = 'diubah paksa oleh authenticated'
             where merchant_id = '11111111-1111-1111-1111-111111111111' and provider = 'XENDIT'$q$,
         '42501',
         'authenticated menulis last_charge_error (t17b)') as t17b,
       nextval('t17_seen') as t17b_tick;

rollback;

-- Sentinel M6 -- dijalankan SETELAH rollback, DI LUAR transaksi blok 17,
-- dengan sengaja, persis seperti sentinel blok 16.
select case
         when not is_called
           then 'FAIL sentinel blok 17: tidak ada satu pun pemeriksaan t17 yang benar-benar tereksekusi (lihat pesan ERROR di atas)'
         when last_value = 2
           then 'OK   sentinel blok 17: kedua pemeriksaan t17a/t17b benar-benar tereksekusi sampai akhir'
         else 'FAIL sentinel blok 17: hanya ' || last_value || ' dari 2 pemeriksaan t17 yang tereksekusi -- transaksi kemungkinan gagal di tengah jalan (lihat pesan ERROR di atas)'
       end as t17_sentinel
from t17_seen;

-- t17c. anon tidak bisa membaca ketiga kolom baru -- metadata privilege
-- check memadai di sini (grant yang ada-atau-tidak, sama seperti t9e/t9f
-- pada connection_mode/environment di tabel yang sama), karena anon sudah
-- di-REVOKE ALL dari tabel ini sejak awal (20260729000100_init_schema.sql)
-- tanpa satu pun grant SELECT/UPDATE, dan migration 20260819000300 tidak
-- menambah grant apa pun ke anon.
select
  case when has_column_privilege('anon', 'public.payment_connections', 'last_charge_error', 'SELECT')
       then 'FAIL anon bisa membaca last_charge_error'
       else 'OK   anon TIDAK bisa membaca last_charge_error' end as t17c_select_error,
  case when has_column_privilege('anon', 'public.payment_connections', 'last_charge_error_at', 'SELECT')
       then 'FAIL anon bisa membaca last_charge_error_at'
       else 'OK   anon TIDAK bisa membaca last_charge_error_at' end as t17c_select_error_at,
  case when has_column_privilege('anon', 'public.payment_connections', 'last_charge_success_at', 'SELECT')
       then 'FAIL anon bisa membaca last_charge_success_at'
       else 'OK   anon TIDAK bisa membaca last_charge_success_at' end as t17c_select_success_at;

-- t17d. anon juga tidak bisa menulis ketiga kolom baru (tidak ada grant
-- UPDATE apa pun ke anon di tabel ini, sejak awal maupun dari migration
-- ini).
select
  case when has_column_privilege('anon', 'public.payment_connections', 'last_charge_error', 'UPDATE')
       then 'FAIL anon bisa menulis last_charge_error'
       else 'OK   anon TIDAK bisa menulis last_charge_error' end as t17d_error,
  case when has_column_privilege('anon', 'public.payment_connections', 'last_charge_error_at', 'UPDATE')
       then 'FAIL anon bisa menulis last_charge_error_at'
       else 'OK   anon TIDAK bisa menulis last_charge_error_at' end as t17d_error_at,
  case when has_column_privilege('anon', 'public.payment_connections', 'last_charge_success_at', 'UPDATE')
       then 'FAIL anon bisa menulis last_charge_success_at'
       else 'OK   anon TIDAK bisa menulis last_charge_success_at' end as t17d_success_at;

-- t17e. Metadata privilege check untuk authenticated + UPDATE, menegaskan
-- t17b dari sisi grant murni (bukan cuma perilaku RLS/eksekusi) -- kalau
-- suatu saat ada yang menambah grant UPDATE tabel penuh ke authenticated
-- tanpa sadar, ini gagal duluan sebelum sempat membutuhkan t17b untuk
-- membuktikannya lewat eksekusi sungguhan.
select
  case when has_column_privilege('authenticated', 'public.payment_connections', 'last_charge_error', 'UPDATE')
       then 'FAIL authenticated punya grant UPDATE last_charge_error'
       else 'OK   authenticated TIDAK punya grant UPDATE last_charge_error' end as t17e_error,
  case when has_column_privilege('authenticated', 'public.payment_connections', 'last_charge_error_at', 'UPDATE')
       then 'FAIL authenticated punya grant UPDATE last_charge_error_at'
       else 'OK   authenticated TIDAK punya grant UPDATE last_charge_error_at' end as t17e_error_at,
  case when has_column_privilege('authenticated', 'public.payment_connections', 'last_charge_success_at', 'UPDATE')
       then 'FAIL authenticated punya grant UPDATE last_charge_success_at'
       else 'OK   authenticated TIDAK punya grant UPDATE last_charge_success_at' end as t17e_success_at;

-- ===========================================================================
-- 18. dashboard_booking_summary() -- Task 1 rencana optimasi dashboard
-- (migration 20260819000400_dashboard_perf.sql). Merchant terpisah lagi
-- supaya fixture-nya tidak bercampur dengan hitungan kuota / ledger blok
-- sebelumnya.
-- ===========================================================================

insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'dashperf@example.com');

-- Lima baris booking, masing-masing di hari berbeda (rentang tidak
-- bertabrakan) supaya bookings_no_overlap tidak menangkap salah satu baris
-- uji lebih dulu dan membuat labelnya menyesatkan (catatan wajib di brief).
--
-- A. PAID, paid_at bulan ini -> IKUT confirmed_revenue.
insert into public.bookings (
  merchant_id, service_name, service_price, duration_minutes,
  start_datetime, end_datetime, customer_name, customer_whatsapp,
  status, paid_at
) values (
  '44444444-4444-4444-4444-444444444444', 'Paket A', 500000, 60,
  now() + interval '10 days', now() + interval '10 days 1 hour',
  'Pelanggan A', '+6281300000001', 'PAID', now()
);

-- B. PAID, tapi paid_at DUA BULAN LALU -> TIDAK ikut confirmed_revenue
-- walau statusnya PAID (menguji filter paid_at, bukan cuma status).
insert into public.bookings (
  merchant_id, service_name, service_price, duration_minutes,
  start_datetime, end_datetime, customer_name, customer_whatsapp,
  status, paid_at
) values (
  '44444444-4444-4444-4444-444444444444', 'Paket B', 300000, 60,
  now() + interval '11 days', now() + interval '11 days 1 hour',
  'Pelanggan B', '+6281300000002', 'PAID', now() - interval '2 months'
);

-- C. CANCELLED dengan paid_at bulan ini dan harga besar -> TIDAK ikut
-- confirmed_revenue (bukan PAID), walau kalau tertangkap keliru akan
-- langsung kelihatan di jumlahnya.
insert into public.bookings (
  merchant_id, service_name, service_price, duration_minutes,
  start_datetime, end_datetime, customer_name, customer_whatsapp,
  status, paid_at, cancelled_at
) values (
  '44444444-4444-4444-4444-444444444444', 'Paket C', 999999, 60,
  now() + interval '12 days', now() + interval '12 days 1 hour',
  'Pelanggan C', '+6281300000003', 'CANCELLED', now(), now()
);

-- D. PENDING, expires_at MASIH di masa depan -> IKUT pending_count.
insert into public.bookings (
  merchant_id, service_name, service_price, duration_minutes,
  start_datetime, end_datetime, customer_name, customer_whatsapp,
  status, expires_at
) values (
  '44444444-4444-4444-4444-444444444444', 'Paket D', 200000, 60,
  now() + interval '13 days', now() + interval '13 days 1 hour',
  'Pelanggan D', '+6281300000004', 'PENDING', now() + interval '10 minutes'
);

-- E. PENDING, expires_at SUDAH lewat -> TIDAK ikut pending_count (dan juga
-- tidak ikut bookings_this_month, lihat count_bookings_this_month versi
-- 20260813051417_reap_expired_pending_inline.sql).
insert into public.bookings (
  merchant_id, service_name, service_price, duration_minutes,
  start_datetime, end_datetime, customer_name, customer_whatsapp,
  status, expires_at
) values (
  '44444444-4444-4444-4444-444444444444', 'Paket E', 200000, 60,
  now() + interval '14 days', now() + interval '14 days 1 hour',
  'Pelanggan E', '+6281300000005', 'PENDING', now() - interval '1 minute'
);

-- 18a/18b. Hak EXECUTE: hanya authenticated yang boleh memanggil
-- dashboard_booking_summary() -- tanpa parameter merchant_id, fungsinya
-- SECURITY DEFINER dan mengambil merchant dari auth.uid(), jadi anon (tanpa
-- sesi) tidak boleh bisa memanggilnya sama sekali.
select
  case when has_function_privilege('anon', 'public.dashboard_booking_summary()', 'EXECUTE')
       then 'FAIL anon bisa memanggil dashboard_booking_summary'
       else 'OK   anon TIDAK bisa memanggil dashboard_booking_summary' end as t18a,
  case when has_function_privilege('authenticated', 'public.dashboard_booking_summary()', 'EXECUTE')
       then 'OK   authenticated bisa memanggil dashboard_booking_summary'
       else 'FAIL authenticated TIDAK bisa memanggil dashboard_booking_summary' end as t18b;

-- Panggil sungguhan sebagai merchant D (peran authenticated + GUC
-- request.jwt.claim.sub, sama seperti blok 16), dibungkus BEGIN/ROLLBACK
-- supaya SET LOCAL ROLE tidak membekas untuk sisa file setelah blok ini.
-- \gset menangkap hasilnya ke variabel psql SEBELUM rollback, jadi tetap
-- bisa dipakai di pemeriksaan sesudahnya.
--
-- Sentinel M6 (pola SAMA PERSIS dengan sequence t16_seen di blok 16 di
-- atas -- lihat catatan besar sebelum "begin;" pertama blok itu soal
-- kenapa nextval() dipakai): tanpa ini, kalau \gset t18_ di bawah gagal
-- (RPC error, grant regresi, auth.uid() null, dst.), variabel psql
-- t18_bookings_this_month/t18_confirmed_revenue/t18_pending_count tidak
-- pernah terisi, dan 18c/18c-bis/18d/18e di bawah meledak jadi ERROR
-- sintaks psql ("current transaction is aborted" / variabel tak dikenal)
-- -- bukan baris berawalan FAIL -- sehingga run-tests.sh (yang cuma
-- mencari baris berawalan FAIL, lihat 00_ di atas) tetap melaporkan hijau
-- padahal RPC-nya sendiri gagal total. Sequence dibuat DI LUAR transaksi
-- supaya nextval()-nya TIDAK ikut ROLLBACK, jadi last_value setelah
-- rollback adalah bukti independen bahwa SELECT \gset di bawah benar-benar
-- selesai sampai baris terakhirnya.
create temporary sequence t18_seen;
grant usage, select on sequence t18_seen to authenticated;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
-- nextval('t18_seen') dimasukkan ke SELECT list yang sama supaya cuma
-- ter-tick kalau seluruh statement (termasuk panggilan RPC-nya) benar-benar
-- selesai dieksekusi -- jadi variabel t18_tick TIDAK dipakai di bawah,
-- keberadaannya di sini murni supaya nextval() ikut ke \gset yang sama.
select *, nextval('t18_seen') as tick from public.dashboard_booking_summary() \gset t18_
rollback;

-- Sentinel M6 di atas, diperiksa SETELAH rollback, DI LUAR transaksinya --
-- lihat catatan besar sebelum "begin;" di atas dan pola yang identik di
-- sentinel blok 16 (t16_sentinel).
select case
         when not is_called
           then 'FAIL sentinel blok 18 (RPC merchant D): dashboard_booking_summary() tidak benar-benar tereksekusi sampai akhir (lihat pesan ERROR di atas) -- abaikan ERROR sintaks pada t18c/t18c-bis/t18d/t18e setelah ini, itu AKIBAT dari kegagalan ini, bukan kegagalan terpisah'
         when last_value = 1
           then 'OK   sentinel blok 18 (RPC merchant D): dashboard_booking_summary() benar-benar tereksekusi sampai akhir'
         else 'FAIL sentinel blok 18 (RPC merchant D): nextval terpanggil ' || last_value || ' kali, seharusnya 1'
       end as t18_sentinel
from t18_seen;

-- 18c. Pengaman anti-drift (Global Constraint 6): bookings_this_month dari
-- RPC WAJIB persis sama dengan count_bookings_this_month() untuk merchant
-- yang sama. count_bookings_this_month dipanggil di sini sebagai superuser
-- koneksi harness (bukan lewat role authenticated -- fungsi itu memang
-- tertutup dari authenticated, lihat t7g), jadi ini murni pembanding
-- independen, bukan RPC memanggil dirinya sendiri dua kali.
select case
         when :t18_bookings_this_month = public.count_bookings_this_month('44444444-4444-4444-4444-444444444444')
           then 'OK   t18c dashboard_booking_summary().bookings_this_month (' || :t18_bookings_this_month || ') == count_bookings_this_month() (' || public.count_bookings_this_month('44444444-4444-4444-4444-444444444444') || ')'
         else 'FAIL t18c dashboard_booking_summary().bookings_this_month (' || :t18_bookings_this_month || ') != count_bookings_this_month() (' || public.count_bookings_this_month('44444444-4444-4444-4444-444444444444') || ')'
       end as t18c;

-- 18c bis. Nilai konkretnya juga diperiksa (bukan cuma "sama-sama benar
-- dua kali dengan cara yang sama"): A + B (PAID) + D (PENDING belum
-- kedaluwarsa) = 3. C (CANCELLED) dan E (PENDING kedaluwarsa) tidak ikut.
select case when :t18_bookings_this_month = 3
            then 'OK   t18c-bis bookings_this_month = 3 (A, B, D -- C dan E tidak ikut)'
            else 'FAIL t18c-bis bookings_this_month = ' || :t18_bookings_this_month || ', seharusnya 3' end as t18c_bis;

-- 18d. confirmed_revenue = harga A saja (500000). B tidak ikut walau PAID
-- karena paid_at dua bulan lalu; C tidak ikut karena CANCELLED walau
-- paid_at-nya bulan ini dan harganya sengaja besar (999999) supaya
-- kebocoran langsung kelihatan di jumlahnya.
select case when :t18_confirmed_revenue = 500000
            then 'OK   t18d confirmed_revenue = 500000 (cuma A -- B bulan lalu & C CANCELLED tidak ikut)'
            else 'FAIL t18d confirmed_revenue = ' || :t18_confirmed_revenue || ', seharusnya 500000' end as t18d;

-- 18e. pending_count = 1 (D saja). E tidak ikut karena expires_at sudah
-- lewat.
select case when :t18_pending_count = 1
            then 'OK   t18e pending_count = 1 (cuma D -- E sudah kedaluwarsa)'
            else 'FAIL t18e pending_count = ' || :t18_pending_count || ', seharusnya 1' end as t18e;

-- 18f. Bentuk baris: RPC WAJIB selalu mengembalikan tepat satu baris, bukan
-- kosong, meski merchant tidak punya booking sama sekali. Diuji dengan
-- merchant baru yang belum pernah membuat booking apa pun.
insert into auth.users (id, email) values
  ('55555555-5555-5555-5555-555555555555', 'dashperf-kosong@example.com');

-- Sentinel M6 lagi (pola sama seperti t18_seen di atas dan t16_seen di
-- blok 16) -- \gset t18f_ di bawah bisa gagal dengan cara yang sama persis,
-- membuat t18f (yang mereferensikan :t18f_n dkk.) meledak jadi ERROR
-- sintaks alih-alih FAIL kalau tidak dijaga.
create temporary sequence t18f_seen;
grant usage, select on sequence t18f_seen to authenticated;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
select count(*) as n,
       coalesce(sum(bookings_this_month), -1) as btm,
       coalesce(sum(confirmed_revenue), -1) as rev,
       coalesce(sum(pending_count), -1) as pc,
       -- Lihat catatan nextval('t18_seen') di atas -- alasan yang sama,
       -- t18f_tick sengaja tidak dipakai di bawah.
       nextval('t18f_seen') as tick
from public.dashboard_booking_summary() \gset t18f_
rollback;

select case
         when not is_called
           then 'FAIL sentinel blok 18 (RPC merchant kosong): dashboard_booking_summary() tidak benar-benar tereksekusi sampai akhir (lihat pesan ERROR di atas) -- abaikan ERROR sintaks pada t18f setelah ini, itu AKIBAT dari kegagalan ini, bukan kegagalan terpisah'
         when last_value = 1
           then 'OK   sentinel blok 18 (RPC merchant kosong): dashboard_booking_summary() benar-benar tereksekusi sampai akhir'
         else 'FAIL sentinel blok 18 (RPC merchant kosong): nextval terpanggil ' || last_value || ' kali, seharusnya 1'
       end as t18f_sentinel
from t18f_seen;

select case when :t18f_n = 1 and :t18f_btm = 0 and :t18f_rev = 0 and :t18f_pc = 0
            then 'OK   t18f merchant tanpa booking tetap dapat 1 baris dengan semua nilai 0, bukan baris kosong'
            else 'FAIL t18f merchant tanpa booking: n=' || :t18f_n || ' bookings_this_month=' || :t18f_btm || ' confirmed_revenue=' || :t18f_rev || ' pending_count=' || :t18f_pc
       end as t18f;

-- 19. Tiruan storage.foldername (lihat 00_supabase_stub.sql)
select case
         when storage.foldername('abc/svc/def/x.webp') = array['abc','svc','def']
              and storage.foldername('abc/avatar.webp') = array['abc']
           then 'OK   t19 storage.foldername memisahkan folder dari nama berkas'
         else 'FAIL t19 storage.foldername: '
              || array_to_string(storage.foldername('abc/svc/def/x.webp'), ',')
       end as t19;

-- 20. merchant_themes
--
-- Merchant STARTER-nya dibuat baru, BUKAN memakai 1111... : baris itu sudah
-- dinaikkan ke PRO di blok 11 untuk menguji kuota booking dan tidak pernah
-- dikembalikan. Memakainya di sini membuat keempat uji penolakan paket lolos
-- diam-diam dengan label yang menyesatkan.
insert into auth.users (id, email) values
  ('66666666-6666-6666-6666-666666666666', 'tema-pro@example.com'),
  ('77777777-7777-7777-7777-777777777777', 'tema-starter@example.com');
update public.merchants set subscription_tier = 'PRO'
where id = '66666666-6666-6666-6666-666666666666';

select case
         when (select subscription_tier
               from public.merchants
               where id = '77777777-7777-7777-7777-777777777777') = 'STARTER'
           then 'OK   t20-pra merchant uji tema benar-benar bertier STARTER'
         else 'FAIL t20-pra merchant uji tema bukan STARTER -- seluruh t20b..t20e di bawah tidak bermakna'
       end as t20_pra;

-- STARTER: tiga preset gratis diterima, sisanya ditolak.
select pg_temp.expect_ok(
  $q$insert into public.merchant_themes (merchant_id, preset)
     values ('77777777-7777-7777-7777-777777777777', 'MALAM')$q$,
  't20a STARTER memakai preset gratis MALAM');
select pg_temp.expect_fail(
  $q$update public.merchant_themes set preset = 'ELEGAN'
     where merchant_id = '77777777-7777-7777-7777-777777777777'$q$,
  't20b STARTER memakai preset premium ELEGAN');
select pg_temp.expect_fail(
  $q$update public.merchant_themes set accent = '#ff8800'
     where merchant_id = '77777777-7777-7777-7777-777777777777'$q$,
  't20c STARTER menyetel warna aksen');
select pg_temp.expect_fail(
  $q$update public.merchant_themes set font_pair = 'KLASIK'
     where merchant_id = '77777777-7777-7777-7777-777777777777'$q$,
  't20d STARTER memilih font');
select pg_temp.expect_fail(
  $q$update public.merchant_themes set text_scale = 'BESAR'
     where merchant_id = '77777777-7777-7777-7777-777777777777'$q$,
  't20e STARTER mengatur ukuran teks');

-- Gaya sudut sengaja TIDAK dikunci paket: satu variabel CSS, tidak bisa
-- merusak keterbacaan, dan memberi merchant gratis knop kedua supaya editornya
-- tidak terasa mati.
select pg_temp.expect_ok(
  $q$update public.merchant_themes set corner_style = 'BULAT'
     where merchant_id = '77777777-7777-7777-7777-777777777777'$q$,
  't20e2 STARTER mengubah gaya sudut');

-- PRO: nilai yang sama diterima.
select pg_temp.expect_ok(
  $q$insert into public.merchant_themes
       (merchant_id, preset, accent, font_pair, text_scale)
     values ('66666666-6666-6666-6666-666666666666', 'ELEGAN', '#c9a961',
             'KLASIK', 'BESAR')$q$,
  't20f PRO memakai preset premium, aksen, font, dan ukuran teks');

-- Null pada font_pair berarti "ikut preset", dan harus tetap diterima untuk
-- paket STARTER.
select case
         when (select font_pair is null
               from public.merchant_themes
               where merchant_id = '77777777-7777-7777-7777-777777777777')
           then 'OK   t20f2 baris STARTER menyimpan font_pair sebagai null (ikut preset)'
         else 'FAIL t20f2 font_pair STARTER tidak null'
       end as t20f2;

-- Constraint yang tidak bergantung pada paket. Dipakai merchant PRO supaya
-- yang menangkap baris ini benar-benar constraint yang dimaksud, bukan trigger
-- paket yang kebetulan menyala lebih dulu.
select pg_temp.expect_fail(
  $q$update public.merchant_themes set background_overlay = 90
     where merchant_id = '66666666-6666-6666-6666-666666666666'$q$,
  't20g overlay di luar 0-80');
select pg_temp.expect_fail(
  $q$update public.merchant_themes set accent = 'merah'
     where merchant_id = '66666666-6666-6666-6666-666666666666'$q$,
  't20h accent bukan hex enam digit');
select pg_temp.expect_fail(
  $q$update public.merchant_themes set background_style = 'IMAGE'
     where merchant_id = '66666666-6666-6666-6666-666666666666'$q$,
  't20i background IMAGE tanpa background_image_path');

-- Hak akses peran anon.
begin;
set local role anon;
select pg_temp.expect_fail(
  $q$insert into public.merchant_themes (merchant_id, preset)
     values ('66666666-6666-6666-6666-666666666666', 'BERSIH')$q$,
  't20j anon menulis merchant_themes');
rollback;

-- 21. Policy storage.objects
select case when exists (
         select 1 from storage.buckets
         where id = 'merchant-media' and public and file_size_limit = 20971520
       ) then 'OK   t21a bucket merchant-media terpasang dengan batas 20MB'
         else 'FAIL t21a bucket merchant-media' end as t21a;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
select pg_temp.expect_ok(
  $q$insert into storage.objects (bucket_id, name)
     values ('merchant-media',
             '66666666-6666-6666-6666-666666666666/avatar-a1.webp')$q$,
  't21b merchant menulis ke foldernya sendiri');
select pg_temp.expect_fail(
  $q$insert into storage.objects (bucket_id, name)
     values ('merchant-media',
             '77777777-7777-7777-7777-777777777777/avatar-a2.webp')$q$,
  't21c merchant menulis ke folder merchant lain');
select pg_temp.expect_fail(
  $q$insert into storage.objects (bucket_id, name)
     values ('merchant-media', 'avatar-tanpa-folder.webp')$q$,
  't21d berkas di akar bucket tanpa folder merchant');
rollback;

begin;
set local role anon;
select pg_temp.expect_fail(
  $q$insert into storage.objects (bucket_id, name)
     values ('merchant-media', 'anon/x.webp')$q$,
  't21e anon mengunggah berkas');
rollback;

-- 22. service_media
-- Merchant STARTER-nya 7777... (lihat catatan di blok 20); 6666... bertier PRO.
insert into public.services (id, merchant_id, name, price, duration_minutes)
values
  ('aaaaaaaa-0000-0000-0000-000000000001',
   '77777777-7777-7777-7777-777777777777', 'Layanan Starter', 100000, 60),
  ('aaaaaaaa-0000-0000-0000-000000000002',
   '66666666-6666-6666-6666-666666666666', 'Layanan Pro', 250000, 90);

-- Foreign key gabungan: media tidak boleh menunjuk layanan merchant lain.
select pg_temp.expect_fail(
  $q$insert into public.service_media
       (service_id, merchant_id, kind, path, width, height)
     values ('aaaaaaaa-0000-0000-0000-000000000002',
             '77777777-7777-7777-7777-777777777777', 'IMAGE',
             '77777777-7777-7777-7777-777777777777/svc/x/a.webp', 800, 600)$q$,
  't22a media menunjuk layanan milik merchant lain');

-- Batas lima gambar per layanan.
insert into public.service_media (service_id, merchant_id, kind, path, width, height)
select 'aaaaaaaa-0000-0000-0000-000000000002',
       '66666666-6666-6666-6666-666666666666', 'IMAGE',
       '66666666-6666-6666-6666-666666666666/svc/x/' || i || '.webp', 800, 600
from generate_series(1, 5) as i;

select pg_temp.expect_fail(
  $q$insert into public.service_media
       (service_id, merchant_id, kind, path, width, height)
     values ('aaaaaaaa-0000-0000-0000-000000000002',
             '66666666-6666-6666-6666-666666666666', 'IMAGE',
             '66666666-6666-6666-6666-666666666666/svc/x/6.webp', 800, 600)$q$,
  't22b gambar keenam pada satu layanan');

-- Video: poster wajib, maksimal satu, dan tertutup untuk STARTER.
select pg_temp.expect_fail(
  $q$insert into public.service_media
       (service_id, merchant_id, kind, path, width, height)
     values ('aaaaaaaa-0000-0000-0000-000000000002',
             '66666666-6666-6666-6666-666666666666', 'VIDEO',
             '66666666-6666-6666-6666-666666666666/svc/x/v.mp4', 1280, 720)$q$,
  't22c video tanpa poster_path');

select pg_temp.expect_ok(
  $q$insert into public.service_media
       (service_id, merchant_id, kind, path, poster_path, width, height)
     values ('aaaaaaaa-0000-0000-0000-000000000002',
             '66666666-6666-6666-6666-666666666666', 'VIDEO',
             '66666666-6666-6666-6666-666666666666/svc/x/v.mp4',
             '66666666-6666-6666-6666-666666666666/svc/x/v-poster.webp',
             1280, 720)$q$,
  't22d video pertama milik merchant PRO');

select pg_temp.expect_fail(
  $q$insert into public.service_media
       (service_id, merchant_id, kind, path, poster_path, width, height)
     values ('aaaaaaaa-0000-0000-0000-000000000002',
             '66666666-6666-6666-6666-666666666666', 'VIDEO',
             '66666666-6666-6666-6666-666666666666/svc/x/v2.mp4',
             '66666666-6666-6666-6666-666666666666/svc/x/v2-poster.webp',
             1280, 720)$q$,
  't22e video kedua pada satu layanan');

select pg_temp.expect_fail(
  $q$insert into public.service_media
       (service_id, merchant_id, kind, path, poster_path, width, height)
     values ('aaaaaaaa-0000-0000-0000-000000000001',
             '77777777-7777-7777-7777-777777777777', 'VIDEO',
             '77777777-7777-7777-7777-777777777777/svc/y/v.mp4',
             '77777777-7777-7777-7777-777777777777/svc/y/v-poster.webp',
             1280, 720)$q$,
  't22f video milik merchant STARTER');

-- Dimensi nol akan merusak atribut width/height di halaman publik.
select pg_temp.expect_fail(
  $q$insert into public.service_media
       (service_id, merchant_id, kind, path, width, height)
     values ('aaaaaaaa-0000-0000-0000-000000000001',
             '77777777-7777-7777-7777-777777777777', 'IMAGE',
             '77777777-7777-7777-7777-777777777777/svc/y/a.webp', 0, 600)$q$,
  't22g dimensi gambar nol');

begin;
set local role anon;
select pg_temp.expect_fail(
  $q$insert into public.service_media
       (service_id, merchant_id, kind, path, width, height)
     values ('aaaaaaaa-0000-0000-0000-000000000002',
             '66666666-6666-6666-6666-666666666666', 'IMAGE',
             '66666666-6666-6666-6666-666666666666/svc/x/anon.webp', 800, 600)$q$,
  't22h anon menulis service_media');
rollback;

-- 23. merchant_faqs
insert into public.merchant_faqs (merchant_id, question, answer, sort_order)
select '66666666-6666-6666-6666-666666666666',
       'Pertanyaan nomor ' || i,
       'Jawaban nomor ' || i,
       i
from generate_series(1, 10) as i;

select pg_temp.expect_fail(
  $q$insert into public.merchant_faqs (merchant_id, question, answer)
     values ('66666666-6666-6666-6666-666666666666',
             'Pertanyaan kesebelas', 'Jawaban kesebelas')$q$,
  't23a FAQ kesebelas');

-- Panjang minimum diuji pada merchant lain supaya batas jumlah di atas tidak
-- menangkap baris ini lebih dulu dan membuat labelnya menyesatkan.
select pg_temp.expect_fail(
  $q$insert into public.merchant_faqs (merchant_id, question, answer)
     values ('77777777-7777-7777-7777-777777777777', 'ab', 'Jawaban')$q$,
  't23b pertanyaan lebih pendek dari 3 karakter');

select pg_temp.expect_fail(
  $q$insert into public.merchant_faqs (merchant_id, question, answer)
     values ('77777777-7777-7777-7777-777777777777', 'Pertanyaan valid', '   ')$q$,
  't23c jawaban hanya berisi spasi');

-- FAQ sengaja TIDAK dikunci paket -- kalau ini gagal, berarti ada yang
-- menambahkan pembatasan tier yang tidak diminta.
select pg_temp.expect_ok(
  $q$insert into public.merchant_faqs (merchant_id, question, answer)
     values ('77777777-7777-7777-7777-777777777777',
             'Apakah bisa reschedule?', 'Bisa, hubungi kami lewat WhatsApp.')$q$,
  't23d FAQ merchant STARTER diterima');

begin;
set local role anon;
select pg_temp.expect_fail(
  $q$insert into public.merchant_faqs (merchant_id, question, answer)
     values ('66666666-6666-6666-6666-666666666666', 'Anon', 'Anon')$q$,
  't23e anon menulis merchant_faqs');
rollback;

-- 24. Path media wajib berada di folder merchant sendiri
-- Layanan uji milik merchant PRO 6666... sudah dibuat di blok 22, tapi kuota
-- gambarnya sudah penuh di sana. Dipakai layanan milik STARTER 7777... untuk
-- gambar, supaya yang menangkap baris uji di bawah benar-benar constraint path,
-- bukan batas lima gambar.
select pg_temp.expect_fail(
  $q$insert into public.service_media
       (service_id, merchant_id, kind, path, width, height)
     values ('aaaaaaaa-0000-0000-0000-000000000001',
             '77777777-7777-7777-7777-777777777777', 'IMAGE',
             '66666666-6666-6666-6666-666666666666/svc/x/curi.webp', 800, 600)$q$,
  't24a path menunjuk folder merchant lain');

-- Inilah muatan yang memecah url("...") di CSS halaman publik.
select pg_temp.expect_fail(
  $q$insert into public.service_media
       (service_id, merchant_id, kind, path, width, height)
     values ('aaaaaaaa-0000-0000-0000-000000000001',
             '77777777-7777-7777-7777-777777777777', 'IMAGE',
             '77777777-7777-7777-7777-777777777777/a.webp"), url("https://jahat/x.png',
             800, 600)$q$,
  't24b path memuat kutip dan kurung (pemecah url() di CSS)');

select pg_temp.expect_fail(
  $q$insert into public.service_media
       (service_id, merchant_id, kind, path, width, height)
     values ('aaaaaaaa-0000-0000-0000-000000000001',
             '77777777-7777-7777-7777-777777777777', 'IMAGE',
             '77777777-7777-7777-7777-777777777777/../avatars/rahasia.png',
             800, 600)$q$,
  't24c path memanjat keluar folder dengan ..');

select pg_temp.expect_fail(
  $q$insert into public.service_media
       (service_id, merchant_id, kind, path, poster_path, width, height)
     values ('aaaaaaaa-0000-0000-0000-000000000001',
             '77777777-7777-7777-7777-777777777777', 'IMAGE',
             '77777777-7777-7777-7777-777777777777/a.webp',
             '66666666-6666-6666-6666-666666666666/poster.webp', 800, 600)$q$,
  't24d poster_path menunjuk folder merchant lain');

select pg_temp.expect_ok(
  $q$insert into public.service_media
       (service_id, merchant_id, kind, path, width, height)
     values ('aaaaaaaa-0000-0000-0000-000000000001',
             '77777777-7777-7777-7777-777777777777', 'IMAGE',
             '77777777-7777-7777-7777-777777777777/svc/y/img-a1b2c3d4.webp',
             800, 600)$q$,
  't24e path wajar di folder sendiri tetap diterima');

select pg_temp.expect_fail(
  $q$update public.merchant_themes
     set background_style = 'IMAGE',
         background_image_path = '77777777-7777-7777-7777-777777777777/bg.webp'
     where merchant_id = '66666666-6666-6666-6666-666666666666'$q$,
  't24f background_image_path menunjuk folder merchant lain');

select pg_temp.expect_ok(
  $q$update public.merchant_themes
     set background_style = 'IMAGE',
         background_image_path = '66666666-6666-6666-6666-666666666666/bg-a1b2c3d4.webp'
     where merchant_id = '66666666-6666-6666-6666-666666666666'$q$,
  't24g background_image_path di folder sendiri tetap diterima');

-- 25. replace_merchant_faqs atomik
-- Merchant 6666... sudah punya 10 FAQ dari blok 23. Mengganti dengan 11 baris
-- harus ditolak DAN meninggalkan kesepuluh baris lama utuh -- bukan menghapus
-- semuanya lalu gagal menyisipkan.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
select pg_temp.expect_fail(
  $q$select public.replace_merchant_faqs(
       (select jsonb_agg(jsonb_build_object('question', 'Tanya ' || i,
                                            'answer', 'Jawab ' || i))
        from generate_series(1, 11) as i))$q$,
  't25a mengganti FAQ dengan 11 baris');
rollback;

select case
         when (select count(*) from public.merchant_faqs
               where merchant_id = '66666666-6666-6666-6666-666666666666') = 10
           then 'OK   t25b FAQ lama utuh setelah penggantian gagal (tidak terhapus separuh jalan)'
         else 'FAIL t25b FAQ hilang setelah penggantian gagal: sisa '
              || (select count(*) from public.merchant_faqs
                  where merchant_id = '66666666-6666-6666-6666-666666666666')
       end as t25b;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
select pg_temp.expect_ok(
  $q$select public.replace_merchant_faqs(
       '[{"question":"Bisa reschedule?","answer":"Bisa, hubungi WhatsApp."},
         {"question":"Ada DP?","answer":"Ada, 30 persen."}]'::jsonb)$q$,
  't25c mengganti FAQ dengan dua baris');
select case
         when (select count(*) from public.merchant_faqs
               where merchant_id = '66666666-6666-6666-6666-666666666666') = 2
              and (select sort_order from public.merchant_faqs
                   where merchant_id = '66666666-6666-6666-6666-666666666666'
                     and question = 'Ada DP?') = 1
           then 'OK   t25d penggantian berhasil menyisakan 2 baris dengan urutan benar'
         else 'FAIL t25d hasil penggantian FAQ tidak sesuai'
       end as t25d;
rollback;

select case
         when has_function_privilege('anon', 'public.replace_merchant_faqs(jsonb)', 'EXECUTE')
           then 'FAIL t25e anon bisa memanggil replace_merchant_faqs'
         else 'OK   t25e anon TIDAK bisa memanggil replace_merchant_faqs'
       end as t25e;

-- 26. merchants.avatar_url dibatasi ke sumber yang dikenali
select pg_temp.expect_ok(
  $q$update public.merchants
     set avatar_url = 'https://abc.supabase.co/storage/v1/object/public/merchant-media/'
                      || '66666666-6666-6666-6666-666666666666/avatar-a1b2c3d4.webp'
     where id = '66666666-6666-6666-6666-666666666666'$q$,
  't26a avatar di bucket sendiri diterima');

select pg_temp.expect_ok(
  $q$update public.merchants
     set avatar_url = 'https://lh3.googleusercontent.com/a/ACg8ocKabc123=s96-c'
     where id = '66666666-6666-6666-6666-666666666666'$q$,
  't26b foto bawaan signup Google tetap diterima');

-- Inilah muatan yang lolos pemeriksaan indexOf() di Server Action: penanda
-- bucket disisipkan di query string, sedangkan hostnya milik penyerang.
select pg_temp.expect_fail(
  $q$update public.merchants
     set avatar_url = 'https://pelacak.contoh/beacon?x=/storage/v1/object/public/merchant-media/'
                      || '66666666-6666-6666-6666-666666666666/a.webp'
     where id = '66666666-6666-6666-6666-666666666666'$q$,
  't26c host pihak ketiga dengan penanda bucket di query string');

select pg_temp.expect_fail(
  $q$update public.merchants
     set avatar_url = 'https://pelacak.contoh/beacon.png'
     where id = '66666666-6666-6666-6666-666666666666'$q$,
  't26d URL pihak ketiga polos');

select pg_temp.expect_fail(
  $q$update public.merchants
     set avatar_url = 'https://abc.supabase.co/storage/v1/object/public/merchant-media/'
                      || '77777777-7777-7777-7777-777777777777/avatar.webp'
     where id = '66666666-6666-6666-6666-666666666666'$q$,
  't26e avatar menunjuk folder merchant lain');

select pg_temp.expect_ok(
  $q$update public.merchants set avatar_url = null
     where id = '66666666-6666-6666-6666-666666666666'$q$,
  't26f avatar dikosongkan');

-- 26b. Trigger signup menyaring avatar yang tidak dikenali, BUKAN menggagalkan
-- pendaftarannya. Tanpa ini, provider OAuth dengan host avatar di luar daftar
-- membuat seluruh signup gagal -- kegagalan yang jauh lebih parah daripada
-- celah yang ditutup constraint di atas.
insert into auth.users (id, email, raw_user_meta_data) values
  ('88888888-8888-8888-8888-888888888888', 'avatar-asing@example.com',
   '{"full_name":"Avatar Asing","avatar_url":"https://pelacak.contoh/beacon.png"}'::jsonb);

select case
         when (select count(*) from public.merchants
               where id = '88888888-8888-8888-8888-888888888888') = 1
              and (select avatar_url from public.merchants
                   where id = '88888888-8888-8888-8888-888888888888') is null
           then 'OK   t26g signup dengan avatar tak dikenali tetap berhasil, avatarnya jadi null'
         else 'FAIL t26g signup dengan avatar tak dikenali'
       end as t26g;

insert into auth.users (id, email, raw_user_meta_data) values
  ('99999999-9999-9999-9999-999999999999', 'avatar-google@example.com',
   '{"full_name":"Avatar Google","avatar_url":"https://lh3.googleusercontent.com/a/ACg8ocXyz=s96-c"}'::jsonb);

select case
         when (select avatar_url from public.merchants
               where id = '99999999-9999-9999-9999-999999999999')
              = 'https://lh3.googleusercontent.com/a/ACg8ocXyz=s96-c'
           then 'OK   t26h avatar Google dari signup tetap tersalin apa adanya'
         else 'FAIL t26h avatar Google dari signup tidak tersalin'
       end as t26h;

-- ===========================================================================
-- 27. Profil kuesioner onboarding (20260830171006)
-- ===========================================================================

-- 27a. anon tidak punya hak APA PUN atas merchant_profiles. Ini pengujian
-- terpenting di migration ini.
select
  case when has_table_privilege('anon', 'public.merchant_profiles', 'SELECT')
       then 'FAIL t27a anon bisa SELECT merchant_profiles'
       else 'OK   t27a anon tidak bisa SELECT merchant_profiles' end as t27a,
  case when has_table_privilege('anon', 'public.merchant_profiles', 'INSERT')
       then 'FAIL t27a anon bisa INSERT merchant_profiles'
       else 'OK   t27a anon tidak bisa INSERT merchant_profiles' end as t27a2,
  case when has_table_privilege('anon', 'public.merchant_profiles', 'UPDATE')
       then 'FAIL t27a anon bisa UPDATE merchant_profiles'
       else 'OK   t27a anon tidak bisa UPDATE merchant_profiles' end as t27a3,
  case when has_table_privilege('anon', 'public.merchant_profiles', 'DELETE')
       then 'FAIL t27a anon bisa DELETE merchant_profiles'
       else 'OK   t27a anon tidak bisa DELETE merchant_profiles' end as t27a4,
  case when has_table_privilege('authenticated', 'public.merchant_profiles', 'SELECT')
       then 'OK   t27a authenticated bisa SELECT merchant_profiles'
       else 'FAIL t27a authenticated tidak bisa SELECT merchant_profiles' end as t27a5;

-- 27b. Hak EXECUTE complete_onboarding
select
  case when has_function_privilege('anon',
         'public.complete_onboarding(text, text, text, public.business_category, text, text, integer, numeric, jsonb)',
         'EXECUTE')
       then 'FAIL t27b anon bisa EXECUTE complete_onboarding'
       else 'OK   t27b anon tidak bisa EXECUTE complete_onboarding' end as t27b,
  case when has_function_privilege('authenticated',
         'public.complete_onboarding(text, text, text, public.business_category, text, text, integer, numeric, jsonb)',
         'EXECUTE')
       then 'OK   t27b authenticated bisa EXECUTE complete_onboarding'
       else 'FAIL t27b authenticated tidak bisa EXECUTE complete_onboarding' end as t27b2;

-- 27c. Merchant uji baru khusus bagian ini.
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'kuesioner@example.com',
   '{"full_name":"Barbershop Uji"}'::jsonb);

select pg_temp.expect_ok(
  $q$insert into public.merchant_profiles (merchant_id, business_category, business_type_slug)
     values ('aaaaaaaa-0000-0000-0000-00000000000a', 'KECANTIKAN', 'barbershop')$q$,
  't27c profil valid');

-- 27d. Enum menolak nilai di luar daftar.
select pg_temp.expect_fail(
  $q$update public.merchant_profiles set business_category = 'KULINER'
     where merchant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$,
  't27d business_category di luar enum');

-- 27e. goals: maksimal 3, tolak elemen NULL, tolak array kosong.
select pg_temp.expect_ok(
  $q$update public.merchant_profiles
     set goals = array['NO_SHOW','DP_SULIT','JADWAL_BENTROK']::public.merchant_goal[]
     where merchant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$,
  't27e goals tepat 3 elemen');
select pg_temp.expect_fail(
  $q$update public.merchant_profiles
     set goals = array['NO_SHOW','DP_SULIT','JADWAL_BENTROK','CHAT_BERULANG']::public.merchant_goal[]
     where merchant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$,
  't27e goals 4 elemen ditolak');
select pg_temp.expect_fail(
  $q$update public.merchant_profiles
     set goals = array['NO_SHOW', null]::public.merchant_goal[]
     where merchant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$,
  't27e goals mengandung NULL ditolak');
select pg_temp.expect_fail(
  $q$update public.merchant_profiles
     set goals = array[]::public.merchant_goal[]
     where merchant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$,
  't27e goals array kosong ditolak');

-- 27f. current_channels: maksimal 6, tolak elemen NULL.
select pg_temp.expect_ok(
  $q$update public.merchant_profiles
     set current_channels = array['WHATSAPP','INSTAGRAM_DM']::public.booking_channel[]
     where merchant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$,
  't27f current_channels 2 elemen');
select pg_temp.expect_fail(
  $q$update public.merchant_profiles
     set current_channels = array['WHATSAPP', null]::public.booking_channel[]
     where merchant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$,
  't27f current_channels mengandung NULL ditolak');

-- 27g. Dijawab dan dilewati saling meniadakan.
select pg_temp.expect_fail(
  $q$update public.merchant_profiles
     set optional_answered_at = now(), optional_skipped_at = now()
     where merchant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$,
  't27g optional_answered_at dan optional_skipped_at bersamaan ditolak');

-- 27h. Hapus merchant ikut menghapus profilnya (cascade).
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
select case when (select count(*) from public.merchant_profiles
                  where merchant_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 0
            then 'OK   t27h profil ikut terhapus saat merchant dihapus'
            else 'FAIL t27h profil tertinggal setelah merchant dihapus' end as t27h;

-- ===========================================================================
-- 27i-27k. Atomicity complete_onboarding.
--
-- CATATAN IMPLEMENTASI: brief tugas ini awalnya menulis kasus ini dengan
-- set_config('request.jwt.claims', '{"sub":"...","role":"authenticated"}', true)
-- -- pola PostgREST asli. Tapi stub auth.uid() di 00_supabase_stub.sql (TIDAK
-- diubah, sesuai batasan tugas) membaca GUC datar "request.jwt.claim.sub",
-- BUKAN JSON request.jwt.claims:
--
--   create or replace function auth.uid() returns uuid
--   language sql stable as $$ select nullif(current_setting(
--     'request.jwt.claim.sub', true), '')::uuid $$;
--
-- Jadi kasus di bawah memakai mekanisme yang SUDAH dipakai berkas ini
-- (blok 16 dan 18): "set local role authenticated" + "set local
-- request.jwt.claim.sub = '<uuid>'" di dalam BEGIN/COMMIT eksplisit --
-- bukan ROLLBACK seperti blok 16/18, karena di sini efek complete_onboarding
-- justru harus TERSIMPAN supaya bisa diperiksa (jumlah services/availability)
-- di statement-statement SETELAH blok transaksinya, termasuk sebagai
-- prasyarat kasus 27k yang menguji pemanggilan ulang. "set local" otomatis
-- kembali ke keadaan semula begitu COMMIT selesai, jadi tidak perlu
-- "reset role" manual seperti pola set_config di akhir versi brief.
-- ===========================================================================

-- Merchant uji baru khusus atomicity. handle_new_user (trigger di
-- auth.users) otomatis membuat baris public.merchants untuknya, jadi jalur
-- yang dipakai complete_onboarding di bawah adalah UPDATE, bukan INSERT.
insert into auth.users (id, email) values
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'atomik@example.com');

-- 27i. username yang sudah dipakai merchant lain ditolak. CATATAN: ini gagal
-- di TAHAP PERTAMA complete_onboarding (UPDATE identitas) -- sebelum profil,
-- layanan, maupun jam kerja sempat disentuh sama sekali. Karena itu kasus ini
-- HANYA membuktikan penolakan usernamenya, BUKAN atomicity fungsi: assersi
-- "tidak ada baris tertinggal" di bawah akan bernilai OK untuk implementasi
-- apa pun -- atomik ataupun tidak -- karena step 2-4 memang tidak pernah
-- dieksekusi untuk diuji. Pembuktian atomicity SUNGGUHAN (kegagalan di TAHAP
-- AKHIR membatalkan tahap-tahap awal yang sudah sempat berjalan) ada di
-- 27i-bis tepat di bawah blok ini. 'studio-mawar' sudah dipakai 11111111-...
-- dari kasus 2.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-00000000000b';
select pg_temp.expect_fail(
  $q$select public.complete_onboarding(
       'Barber Atomik', 'studio-mawar', '+6281200000001',
       'KECANTIKAN', 'barbershop', 'Potong rambut', 45, 50000,
       '[{"day_of_week":1,"start_time":"09:00","end_time":"17:00"}]'::jsonb)$q$,
  't27i complete_onboarding dengan username terpakai ditolak');
commit;

select case
         when (select count(*) from public.services
               where merchant_id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 0
          and (select count(*) from public.availability
               where merchant_id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 0
          and (select count(*) from public.merchant_profiles
               where merchant_id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 0
         then 'OK   t27i tidak ada services/availability/profil untuk merchant yang gagal di tahap identitas (TIDAK membuktikan atomicity tahap akhir -- lihat t27i-bis)'
         else 'FAIL t27i ada baris tertinggal setelah complete_onboarding gagal'
       end as t27i;

-- ===========================================================================
-- 27i-bis. Atomicity SUNGGUHAN: kegagalan di TAHAP TERAKHIR (jam kerja)
-- membatalkan tahap-tahap SEBELUMNYA (identitas, profil, layanan) yang
-- sudah sempat berjalan lebih dulu di pemanggilan yang SAMA. Kasus 27i di
-- atas gagal di tahap PERTAMA sehingga tidak pernah menguji ini -- pola di
-- bawah meniru t25a/t25b (replace_merchant_faqs, ~250 baris di atas) yang
-- sama-sama memaksa kegagalan di ujung akhir lalu memeriksa sisa tahap awal.
--
-- day_of_week 9 ditolak oleh constraint availability_day_range (1-7) pada
-- INSERT jam kerja di step 4 complete_onboarding -- step TERAKHIR. Kalau
-- step 1-3 (UPDATE merchants, INSERT merchant_profiles, INSERT services)
-- benar-benar sudah berjalan sebelum step 4 gagal, tapi fungsi ini TIDAK
-- atomik (mis. seseorang menambah EXCEPTION WHEN OTHERS di sekitar salah
-- satu step lalu melanjutkan), baris-baris step 1-3 akan tertinggal --
-- persis yang diperiksa di bawah gagal menangkapnya kalau itu terjadi.
-- ===========================================================================

-- Merchant uji baru khusus 27i-bis, terpisah dari bbbbbbbb... di atas supaya
-- baris merchants-nya benar-benar tidak tersentuh sama sekali sebelum kasus
-- ini (bukan sekadar "kembali ke keadaan lama").
insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-00000000000c', 'atomik-akhir@example.com');

begin;
set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-0000-0000-0000-00000000000c';
select pg_temp.expect_fail(
  $q$select public.complete_onboarding(
       'Barber Akhir', 'atomik-tahap-akhir', '+6281200000002',
       'KECANTIKAN', 'barbershop', 'Potong rambut', 45, 50000,
       '[{"day_of_week":9,"start_time":"09:00","end_time":"17:00"}]'::jsonb)$q$,
  't27i-bis kegagalan step availability (day_of_week di luar 1-7) ditolak');
rollback;

select case
         when (select username from public.merchants
               where id = 'cccccccc-0000-0000-0000-00000000000c') is null
          and (select onboarded_at from public.merchants
               where id = 'cccccccc-0000-0000-0000-00000000000c') is null
          and (select count(*) from public.merchant_profiles
               where merchant_id = 'cccccccc-0000-0000-0000-00000000000c') = 0
          and (select count(*) from public.services
               where merchant_id = 'cccccccc-0000-0000-0000-00000000000c') = 0
         then 'OK   t27i-bis identitas/profil/layanan tahap awal ikut batal saat step availability gagal (atomicity sungguhan terbukti)'
         else 'FAIL t27i-bis tahap awal (identitas/profil/layanan) tertinggal walau step availability ditolak -- fungsi TIDAK atomik'
       end as t27i_bis;

-- 27j. Jalur sukses menghasilkan layanan dan jam kerja sekaligus.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-00000000000b';
select pg_temp.expect_ok(
  $q$select public.complete_onboarding(
       'Barber Atomik', 'barber-atomik', '+6281200000001',
       'KECANTIKAN', 'barbershop', 'Potong rambut', 45, 50000,
       '[{"day_of_week":1,"start_time":"09:00","end_time":"17:00"},
         {"day_of_week":2,"start_time":"09:00","end_time":"17:00"}]'::jsonb)$q$,
  't27j complete_onboarding jalur sukses');
commit;

select case
         when (select count(*) from public.services
               where merchant_id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 1
          and (select count(*) from public.availability
               where merchant_id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 2
          and (select username from public.merchants
               where id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 'barber-atomik'
         then 'OK   t27j 1 layanan + 2 hari jam kerja + username tersimpan'
         else 'FAIL t27j hasil complete_onboarding tidak sesuai'
       end as t27j;

-- 27k. Pemanggilan ulang tidak menggandakan layanan maupun jam kerja.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-00000000000b';
select pg_temp.expect_ok(
  $q$select public.complete_onboarding(
       'Barber Atomik', 'barber-atomik', '+6281200000001',
       'KECANTIKAN', 'nail-art', 'Layanan Lain', 60, 90000,
       '[{"day_of_week":3,"start_time":"10:00","end_time":"18:00"}]'::jsonb)$q$,
  't27k complete_onboarding dipanggil ulang');
commit;

select case
         when (select count(*) from public.services
               where merchant_id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 1
          and (select count(*) from public.availability
               where merchant_id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 2
          and (select business_type_slug from public.merchant_profiles
               where merchant_id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 'nail-art'
         then 'OK   t27k layanan & jam kerja tidak digandakan, profil ter-update'
         else 'FAIL t27k pemanggilan ulang menggandakan baris'
       end as t27k;

-- ===========================================================================
-- 28. business_category NULLABLE (20260830171027) -- constraint
-- merchant_profiles_category_required_with_answers.
--
-- Tujuan: NULL berarti "ditawari kuesioner, memilih tidak menjawab" (lewat
-- dismissal "Nanti saja"), dan itu harus tetap terbedakan dari kategori
-- LAINNYA yang sungguh dipilih. Constraint-nya menahan arah sebaliknya:
-- begitu ADA jawaban kuesioner apa pun tersimpan, business_category wajib
-- ikut terisi. optional_skipped_at SENGAJA tidak memicu constraint ini --
-- itulah kasus dismissal yang harus tetap lolos dengan kategori NULL.
-- Merchant uji di sini semuanya baru, uuid tidak dipakai di bagian lain
-- berkas ini.
-- ===========================================================================

insert into auth.users (id, email) values
  ('dddddddd-0000-0000-0000-00000000000d', 'kuesioner-dismiss@example.com'),
  ('eeeeeeee-0000-0000-0000-00000000000e', 'kuesioner-team-size@example.com'),
  ('ffffffff-0000-0000-0000-00000000000f', 'kuesioner-answered-at@example.com'),
  ('12341234-0000-0000-0000-000000000001', 'kuesioner-goals@example.com'),
  ('43214321-0000-0000-0000-000000000002', 'kuesioner-isi-belakangan@example.com');

-- 28a. Dismissal murni: hanya merchant_id + optional_skipped_at,
-- business_category NULL -- persis baris yang dihasilkan skipOptionalProfile
-- untuk merchant yang barisnya belum ada sama sekali. HARUS diterima.
select pg_temp.expect_ok(
  $q$insert into public.merchant_profiles (merchant_id, optional_skipped_at)
     values ('dddddddd-0000-0000-0000-00000000000d', now())$q$,
  't28a dismissal murni (business_category NULL, optional_skipped_at terisi) diterima');

select case
         when (select business_category from public.merchant_profiles
               where merchant_id = 'dddddddd-0000-0000-0000-00000000000d') is null
          and (select optional_skipped_at from public.merchant_profiles
               where merchant_id = 'dddddddd-0000-0000-0000-00000000000d') is not null
         then 'OK   t28a-verif baris dismissal tersimpan dengan kategori NULL'
         else 'FAIL t28a-verif baris dismissal tidak sesuai harapan'
       end as t28a_verif;

-- 28b. business_category NULL dengan team_size terisi -- ditolak.
select pg_temp.expect_fail(
  $q$insert into public.merchant_profiles (merchant_id, team_size)
     values ('eeeeeeee-0000-0000-0000-00000000000e', 'SENDIRI')$q$,
  't28b business_category NULL + team_size terisi ditolak');

-- 28c. business_category NULL dengan optional_answered_at terisi -- ditolak.
-- Ini kasus "baris mengaku sudah dijawab tapi kategorinya tidak diketahui"
-- yang harus mustahil terjadi.
select pg_temp.expect_fail(
  $q$insert into public.merchant_profiles (merchant_id, optional_answered_at)
     values ('ffffffff-0000-0000-0000-00000000000f', now())$q$,
  't28c business_category NULL + optional_answered_at terisi ditolak');

-- 28d. business_category NULL dengan goals terisi -- ditolak.
select pg_temp.expect_fail(
  $q$insert into public.merchant_profiles (merchant_id, goals)
     values ('12341234-0000-0000-0000-000000000001',
             array['NO_SHOW']::public.merchant_goal[])$q$,
  't28d business_category NULL + goals terisi ditolak');

-- 28e. Jalur "declined, lalu kembali mengisi": baris dismissal (kategori
-- NULL) diisi kategori sungguhan lewat saveProfileFromDashboard (UPDATE
-- business_category), lalu jawaban opsional lain menyusul lewat
-- saveOptionalProfile (UPDATE team_size dkk + optional_answered_at,
-- optional_skipped_at dikosongkan). Kedua langkah harus diterima begitu
-- kategorinya sudah terisi lebih dulu.
select pg_temp.expect_ok(
  $q$insert into public.merchant_profiles (merchant_id, optional_skipped_at)
     values ('43214321-0000-0000-0000-000000000002', now())$q$,
  't28e-1 baris dismissal awal untuk merchant "isi belakangan"');

select pg_temp.expect_ok(
  $q$update public.merchant_profiles
     set business_category = 'LAINNYA'
     where merchant_id = '43214321-0000-0000-0000-000000000002'$q$,
  't28e-2 mengisi business_category pada baris dismissal diterima');

select pg_temp.expect_ok(
  $q$update public.merchant_profiles
     set team_size = 'SENDIRI',
         optional_answered_at = now(),
         optional_skipped_at = null
     where merchant_id = '43214321-0000-0000-0000-000000000002'$q$,
  't28e-3 menambah jawaban opsional setelah kategori terisi diterima');

select case
         when (select business_category from public.merchant_profiles
               where merchant_id = '43214321-0000-0000-0000-000000000002') = 'LAINNYA'
          and (select team_size from public.merchant_profiles
               where merchant_id = '43214321-0000-0000-0000-000000000002') = 'SENDIRI'
         then 'OK   t28e-verif kategori & jawaban opsional tersimpan setelah "isi belakangan"'
         else 'FAIL t28e-verif hasil "isi belakangan" tidak sesuai'
       end as t28e_verif;

-- ===========================================================================
-- 29. notification_log (20261005175819) -- log + kunci idempotensi notifikasi
-- ===========================================================================

-- 29a. anon tidak punya hak apa pun; authenticated hanya SELECT (tulis lewat
-- service role saja).
select
  case when has_table_privilege('anon', 'public.notification_log', 'SELECT')
       then 'FAIL t29a anon bisa SELECT notification_log'
       else 'OK   t29a anon tidak bisa SELECT notification_log' end as t29a,
  case when has_table_privilege('authenticated', 'public.notification_log', 'INSERT')
       then 'FAIL t29a authenticated bisa INSERT notification_log'
       else 'OK   t29a authenticated tidak bisa INSERT notification_log' end as t29a2,
  case when has_table_privilege('authenticated', 'public.notification_log', 'UPDATE')
       then 'FAIL t29a authenticated bisa UPDATE notification_log'
       else 'OK   t29a authenticated tidak bisa UPDATE notification_log' end as t29a3,
  case when has_table_privilege('authenticated', 'public.notification_log', 'SELECT')
       then 'OK   t29a authenticated bisa SELECT notification_log'
       else 'FAIL t29a authenticated tidak bisa SELECT notification_log' end as t29a4;

-- 29b. Dua merchant, masing-masing satu booking dan satu baris log.
insert into auth.users (id, email, raw_user_meta_data) values
  ('29292929-0000-0000-0000-000000000001', 'notif-a@example.com', '{}'::jsonb),
  ('29292929-0000-0000-0000-000000000002', 'notif-b@example.com', '{}'::jsonb);

insert into public.bookings (id, merchant_id, service_name, service_price, duration_minutes,
                             start_datetime, end_datetime, customer_name, customer_whatsapp, status)
values
  ('29292929-aaaa-0000-0000-000000000001', '29292929-0000-0000-0000-000000000001', 'Potong',
   50000, 30, '2027-01-04 09:00+07', '2027-01-04 09:30+07', 'Ani', '+6281100009991', 'PAID'),
  ('29292929-aaaa-0000-0000-000000000002', '29292929-0000-0000-0000-000000000002', 'Potong',
   50000, 30, '2027-01-04 09:00+07', '2027-01-04 09:30+07', 'Budi', '+6281100009992', 'PAID');

select pg_temp.expect_ok(
  $q$insert into public.notification_log (booking_id, merchant_id, kind, channel)
     values ('29292929-aaaa-0000-0000-000000000001', '29292929-0000-0000-0000-000000000001',
             'BOOKING_PAID_CUSTOMER', 'WHATSAPP'),
            ('29292929-aaaa-0000-0000-000000000002', '29292929-0000-0000-0000-000000000002',
             'BOOKING_PAID_CUSTOMER', 'WHATSAPP')$q$,
  't29b log notifikasi pertama untuk tiap booking');

-- 29c. Klaim kedua untuk (booking, kind, channel) yang sama ditolak unique
-- constraint -- inilah yang mencegah WhatsApp terkirim dua kali saat
-- gateway me-retry webhook.
select pg_temp.expect_fail_code(
  $q$insert into public.notification_log (booking_id, merchant_id, kind, channel)
     values ('29292929-aaaa-0000-0000-000000000001', '29292929-0000-0000-0000-000000000001',
             'BOOKING_PAID_CUSTOMER', 'WHATSAPP')$q$,
  '23505',
  't29c klaim ganda notifikasi yang sama');

-- 29d. Kanal lain untuk booking yang sama tetap boleh.
select pg_temp.expect_ok(
  $q$insert into public.notification_log (booking_id, merchant_id, kind, channel)
     values ('29292929-aaaa-0000-0000-000000000001', '29292929-0000-0000-0000-000000000001',
             'BOOKING_PAID_MERCHANT', 'EMAIL')$q$,
  't29d kanal berbeda untuk booking yang sama diterima');

-- 29e. Merchant A hanya melihat log miliknya.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '29292929-0000-0000-0000-000000000001';
select case when count(*) = 2
              and bool_and(merchant_id = '29292929-0000-0000-0000-000000000001')
            then 'OK   t29e merchant hanya melihat log notifikasi miliknya'
            else 'FAIL t29e merchant melihat ' || count(*) || ' baris log (termasuk milik orang lain?)' end as t29e
from public.notification_log;
rollback;

-- 29f. Menghapus booking ikut menghapus lognya (dipakai hapus akun).
delete from public.bookings where id = '29292929-aaaa-0000-0000-000000000002';
select case when count(*) = 0
            then 'OK   t29f log ikut terhapus bersama booking'
            else 'FAIL t29f log tertinggal setelah booking dihapus' end as t29f
from public.notification_log
where booking_id = '29292929-aaaa-0000-0000-000000000002';

-- ===========================================================================
-- 30. Multi-staf (20261005180027)
-- ===========================================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('30303030-0000-0000-0000-000000000001', 'studio@example.com', '{}'::jsonb),
  ('30303030-0000-0000-0000-000000000002', 'pro@example.com', '{}'::jsonb);
update public.merchants set username = 'studio-tiga-puluh', subscription_tier = 'STUDIO'
  where id = '30303030-0000-0000-0000-000000000001';
update public.merchants set username = 'pro-tiga-puluh', subscription_tier = 'PRO'
  where id = '30303030-0000-0000-0000-000000000002';

-- Jam kerja usaha: setiap hari 09:00-17:00.
insert into public.availability (merchant_id, day_of_week, start_time, end_time)
select '30303030-0000-0000-0000-000000000001', d, '09:00', '17:00' from generate_series(1, 7) d;
insert into public.services (id, merchant_id, name, price, duration_minutes) values
  ('30303030-5e5e-0000-0000-000000000001', '30303030-0000-0000-0000-000000000001', 'Potong', 50000, 60);

-- 30a. Hanya merchant Studio yang bisa membuat staf.
select pg_temp.expect_fail_code(
  $q$insert into public.staff (merchant_id, name) values ('30303030-0000-0000-0000-000000000002', 'Andi')$q$,
  'BK010',
  't30a merchant PRO membuat staf');

select pg_temp.expect_ok(
  $q$insert into public.staff (id, merchant_id, name, sort_order) values
     ('30303030-57af-0000-0000-000000000001', '30303030-0000-0000-0000-000000000001', 'Dewi', 0),
     ('30303030-57af-0000-0000-000000000002', '30303030-0000-0000-0000-000000000001', 'Andi', 1)$q$,
  't30a merchant STUDIO membuat dua staf');

-- 30b. Hak akses: anon hanya kolom publik, tidak bisa menulis; fungsi
-- pembantu tertutup.
select
  case when has_column_privilege('anon', 'public.staff', 'name', 'SELECT')
       then 'OK   t30b anon bisa membaca nama staf'
       else 'FAIL t30b anon tidak bisa membaca nama staf' end as t30b,
  case when has_table_privilege('anon', 'public.staff', 'INSERT')
       then 'FAIL t30b anon bisa INSERT staff'
       else 'OK   t30b anon tidak bisa INSERT staff' end as t30b2,
  case when has_function_privilege('anon', 'public.slot_within_hours(uuid, uuid, integer, time, time)', 'EXECUTE')
       then 'FAIL t30b anon bisa EXECUTE slot_within_hours'
       else 'OK   t30b anon tidak bisa EXECUTE slot_within_hours' end as t30b3,
  case when has_function_privilege('authenticated', 'public.replace_staff_availability(uuid, jsonb)', 'EXECUTE')
       then 'OK   t30b authenticated bisa EXECUTE replace_staff_availability'
       else 'FAIL t30b authenticated tidak bisa EXECUTE replace_staff_availability' end as t30b4;

-- 30c. Merchant lain tidak bisa menulis jam kerja untuk staf milik Studio,
-- walau id stafnya diketahui (FK gabungan + RLS).
begin;
set local role authenticated;
set local request.jwt.claim.sub = '30303030-0000-0000-0000-000000000002';
select pg_temp.expect_fail(
  $q$select public.replace_staff_availability(
       '30303030-57af-0000-0000-000000000001',
       '[{"day_of_week":1,"start_time":"09:00","end_time":"12:00"}]'::jsonb)$q$,
  't30c merchant lain menulis jam kerja staf milik orang lain');
rollback;

-- 30d. Andi hanya bekerja Senin 13:00-17:00 (jam sendiri); Dewi ikut jam usaha.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '30303030-0000-0000-0000-000000000001';
select pg_temp.expect_ok(
  $q$select public.replace_staff_availability(
       '30303030-57af-0000-0000-000000000002',
       '[{"day_of_week":1,"start_time":"13:00","end_time":"17:00"}]'::jsonb)$q$,
  't30d pemilik mengatur jam kerja stafnya');
commit;

-- 30e. Dua staf boleh melayani di jam yang sama (Senin 14:00).
select pg_temp.expect_ok(
  $q$select * from public.create_booking(
       '30303030-0000-0000-0000-000000000001', '30303030-5e5e-0000-0000-000000000001',
       pg_temp.jakarta_future(1, 1, '14:00'), 'Pelanggan Satu', '+6281130300001',
       '30303030-57af-0000-0000-000000000001')$q$,
  't30e booking Senin 14:00 untuk Dewi');
select pg_temp.expect_ok(
  $q$select * from public.create_booking(
       '30303030-0000-0000-0000-000000000001', '30303030-5e5e-0000-0000-000000000001',
       pg_temp.jakarta_future(1, 1, '14:00'), 'Pelanggan Dua', '+6281130300002',
       '30303030-57af-0000-0000-000000000002')$q$,
  't30e booking Senin 14:00 untuk Andi di jam yang sama');

-- 30f. Staf yang sama di jam yang sama ditolak bookings_no_overlap.
select pg_temp.expect_fail_code(
  $q$select * from public.create_booking(
       '30303030-0000-0000-0000-000000000001', '30303030-5e5e-0000-0000-000000000001',
       pg_temp.jakarta_future(1, 1, '14:00'), 'Pelanggan Tiga', '+6281130300003',
       '30303030-57af-0000-0000-000000000001')$q$,
  '23P01',
  't30f staf yang sama dipesan dua kali di jam yang sama');

-- 30g. "Siapa saja" saat semua staf penuh -> BK002.
select pg_temp.expect_fail_code(
  $q$select * from public.create_booking(
       '30303030-0000-0000-0000-000000000001', '30303030-5e5e-0000-0000-000000000001',
       pg_temp.jakarta_future(1, 1, '14:00'), 'Pelanggan Empat', '+6281130300004')$q$,
  'BK002',
  't30g siapa saja saat semua staf penuh');

-- 30h. Jam kerja sendiri Andi menolak Senin pagi, walau jam usaha buka.
select pg_temp.expect_fail_code(
  $q$select * from public.create_booking(
       '30303030-0000-0000-0000-000000000001', '30303030-5e5e-0000-0000-000000000001',
       pg_temp.jakarta_future(1, 1, '09:00'), 'Pelanggan Lima', '+6281130300005',
       '30303030-57af-0000-0000-000000000002')$q$,
  'BK001',
  't30h Andi dipesan di luar jam kerjanya sendiri');

-- 30i. "Siapa saja" Senin 09:00 jatuh ke Dewi (Andi belum masuk), dan
-- snapshot staff_name terisi.
select pg_temp.expect_ok(
  $q$select * from public.create_booking(
       '30303030-0000-0000-0000-000000000001', '30303030-5e5e-0000-0000-000000000001',
       pg_temp.jakarta_future(1, 1, '09:00'), 'Pelanggan Enam', '+6281130300006')$q$,
  't30i siapa saja Senin 09:00');
select case when staff_name = 'Dewi'
            then 'OK   t30i siapa saja ditugaskan ke staf yang jamnya cocok (Dewi)'
            else 'FAIL t30i siapa saja ditugaskan ke ' || coalesce(staff_name, 'NULL') end as t30i_verif
from public.bookings where customer_name = 'Pelanggan Enam';

-- 30j. Staf nonaktif tidak bisa dipesan.
update public.staff set is_active = false where id = '30303030-57af-0000-0000-000000000002';
select pg_temp.expect_fail_code(
  $q$select * from public.create_booking(
       '30303030-0000-0000-0000-000000000001', '30303030-5e5e-0000-0000-000000000001',
       pg_temp.jakarta_future(1, 1, '15:00'), 'Pelanggan Tujuh', '+6281130300007',
       '30303030-57af-0000-0000-000000000002')$q$,
  'BK003',
  't30j staf nonaktif dipesan');

-- 30k. Staf yang pernah menangani booking tidak bisa dihapus (dinonaktifkan saja).
select pg_temp.expect_fail_code(
  $q$delete from public.staff where id = '30303030-57af-0000-0000-000000000002'$q$,
  '23503',
  't30k hapus staf yang punya booking');

-- 30l. Turun paket: staf diabaikan, kalender kembali satu.
update public.merchants set subscription_tier = 'PRO'
  where id = '30303030-0000-0000-0000-000000000001';
select pg_temp.expect_ok(
  $q$select * from public.create_booking(
       '30303030-0000-0000-0000-000000000001', '30303030-5e5e-0000-0000-000000000001',
       pg_temp.jakarta_future(2, 1, '10:00'), 'Pelanggan Delapan', '+6281130300008',
       '30303030-57af-0000-0000-000000000001')$q$,
  't30l merchant turun paket tetap bisa menerima booking');
select case when staff_id is null
            then 'OK   t30l staf diabaikan setelah turun paket'
            else 'FAIL t30l booking masih ditugaskan ke staf setelah turun paket' end as t30l_verif
from public.bookings where customer_name = 'Pelanggan Delapan';

-- 30m. get_booked_ranges mengembalikan staff_id untuk perhitungan slot.
select case when count(*) filter (where staff_id is not null) >= 2
            then 'OK   t30m get_booked_ranges menyertakan staff_id'
            else 'FAIL t30m get_booked_ranges tanpa staff_id' end as t30m
from public.get_booked_ranges('studio-tiga-puluh', now(), now() + interval '30 days');

-- 30n. Hapus akun (cascade dari auth.users) tetap jalan walau ada booking
-- yang merujuk staf -- NO ACTION baru diperiksa di akhir statement.
select pg_temp.expect_ok(
  $q$delete from auth.users where id = '30303030-0000-0000-0000-000000000001'$q$,
  't30n hapus akun merchant yang punya staf dan booking staf');

-- ===========================================================================
-- 31. Domain sendiri (20261005180048)
-- ===========================================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('31313131-0000-0000-0000-000000000001', 'domain-a@example.com', '{}'::jsonb),
  ('31313131-0000-0000-0000-000000000002', 'domain-b@example.com', '{}'::jsonb),
  ('31313131-0000-0000-0000-000000000003', 'domain-pro@example.com', '{}'::jsonb);
update public.merchants set username = 'domain-a', subscription_tier = 'STUDIO'
  where id = '31313131-0000-0000-0000-000000000001';
update public.merchants set username = 'domain-b', subscription_tier = 'STUDIO'
  where id = '31313131-0000-0000-0000-000000000002';
update public.merchants set username = 'domain-pro', subscription_tier = 'PRO'
  where id = '31313131-0000-0000-0000-000000000003';

-- 31a. Paket selain Studio ditolak; format domain dijaga.
select pg_temp.expect_fail_code(
  $q$insert into public.merchant_domains (merchant_id, domain)
     values ('31313131-0000-0000-0000-000000000003', 'salon-pro.id')$q$,
  'BK010',
  't31a merchant PRO mendaftarkan domain');
select pg_temp.expect_fail_code(
  $q$insert into public.merchant_domains (merchant_id, domain)
     values ('31313131-0000-0000-0000-000000000001', 'https://Salon.id')$q$,
  '23514',
  't31a format domain tidak valid');

-- 31b. Dua merchant boleh sama-sama punya klaim PENDING atas nama yang sama.
select pg_temp.expect_ok(
  $q$insert into public.merchant_domains (merchant_id, domain) values
     ('31313131-0000-0000-0000-000000000001', 'booking.salon.id'),
     ('31313131-0000-0000-0000-000000000002', 'booking.salon.id')$q$,
  't31b dua klaim PENDING untuk domain yang sama');

-- 31c. Merchant tidak bisa mengaktifkan domainnya sendiri.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '31313131-0000-0000-0000-000000000001';
select pg_temp.expect_fail_code(
  $q$update public.merchant_domains set status = 'ACTIVE'
     where merchant_id = '31313131-0000-0000-0000-000000000001'$q$,
  '42501',
  't31c merchant mengubah status domainnya sendiri');
rollback;

-- 31d. Domain PENDING belum me-resolve.
select case when public.resolve_custom_domain('booking.salon.id') is null
            then 'OK   t31d domain PENDING tidak me-resolve'
            else 'FAIL t31d domain PENDING sudah me-resolve' end as t31d;

-- 31e. Setelah diaktifkan (service role), host me-resolve ke username,
-- tidak peka huruf besar.
update public.merchant_domains set status = 'ACTIVE', verified_at = now()
  where merchant_id = '31313131-0000-0000-0000-000000000001';
select case when public.resolve_custom_domain('Booking.Salon.ID') = 'domain-a'
            then 'OK   t31e domain ACTIVE me-resolve ke username'
            else 'FAIL t31e resolve_custom_domain salah' end as t31e;

-- 31f. Klaim kedua tidak bisa ikut aktif untuk nama yang sama.
select pg_temp.expect_fail_code(
  $q$update public.merchant_domains set status = 'ACTIVE'
     where merchant_id = '31313131-0000-0000-0000-000000000002'$q$,
  '23505',
  't31f domain yang sama aktif untuk dua merchant');

-- 31g. Turun paket mematikan domain tanpa menghapus barisnya.
update public.merchants set subscription_tier = 'PRO'
  where id = '31313131-0000-0000-0000-000000000001';
select case when public.resolve_custom_domain('booking.salon.id') is null
            then 'OK   t31g domain berhenti me-resolve setelah turun paket'
            else 'FAIL t31g domain masih me-resolve setelah turun paket' end as t31g;

-- 31h. anon hanya bisa memanggil resolver, tidak membaca tabelnya (token
-- verifikasi tidak boleh bocor).
select
  case when has_table_privilege('anon', 'public.merchant_domains', 'SELECT')
       then 'FAIL t31h anon bisa SELECT merchant_domains'
       else 'OK   t31h anon tidak bisa SELECT merchant_domains' end as t31h,
  case when has_function_privilege('anon', 'public.resolve_custom_domain(text)', 'EXECUTE')
       then 'OK   t31h anon bisa EXECUTE resolve_custom_domain'
       else 'FAIL t31h anon tidak bisa EXECUTE resolve_custom_domain' end as t31h2,
  case when has_column_privilege('authenticated', 'public.merchant_domains', 'verification_token', 'UPDATE')
       then 'FAIL t31h authenticated bisa mengubah verification_token'
       else 'OK   t31h authenticated tidak bisa mengubah verification_token' end as t31h3;

-- ===========================================================================
-- 32. Cara bayar: skema (20261115000200)
-- ===========================================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('32323232-0000-0000-0000-000000000001', 'bayar-a@example.com', '{}'::jsonb),
  ('32323232-0000-0000-0000-000000000002', 'bayar-b@example.com', '{}'::jsonb),
  ('32323232-0000-0000-0000-000000000003', 'bayar-c@example.com', '{}'::jsonb);
update public.merchants set username = 'cara-bayar-32', subscription_tier = 'PRO'
  where id = '32323232-0000-0000-0000-000000000001';
update public.merchants set subscription_tier = 'PRO'
  where id in ('32323232-0000-0000-0000-000000000002', '32323232-0000-0000-0000-000000000003');
insert into public.availability (merchant_id, day_of_week, start_time, end_time)
select '32323232-0000-0000-0000-000000000001', d, '09:00', '17:00' from generate_series(1, 7) d;

-- 32a. Constraint layanan.
select pg_temp.expect_fail_code(
  $q$insert into public.services (merchant_id, name, price, duration_minutes, payment_mode)
     values ('32323232-0000-0000-0000-000000000001', 'uji layanan', 350000, 60, 'DEPOSIT')$q$,
  '23514', 't32a DEPOSIT tanpa DP');
select pg_temp.expect_fail_code(
  $q$insert into public.services (merchant_id, name, price, duration_minutes, payment_mode, deposit_type, deposit_value)
     values ('32323232-0000-0000-0000-000000000001', 'uji layanan', 350000, 60, 'DEPOSIT', 'PERCENT', 95)$q$,
  '23514', 't32a PERCENT 95');
select pg_temp.expect_fail_code(
  $q$insert into public.services (merchant_id, name, price, duration_minutes, payment_mode, deposit_type, deposit_value)
     values ('32323232-0000-0000-0000-000000000001', 'uji layanan', 350000, 60, 'DEPOSIT', 'PERCENT', 0)$q$,
  '23514', 't32a PERCENT 0');
select pg_temp.expect_fail_code(
  $q$insert into public.services (merchant_id, name, price, duration_minutes, payment_mode, deposit_type, deposit_value)
     values ('32323232-0000-0000-0000-000000000001', 'uji layanan', 350000, 60, 'DEPOSIT', 'FIXED', 350000)$q$,
  '23514', 't32a FIXED sama dengan harga');
select pg_temp.expect_fail_code(
  $q$insert into public.services (merchant_id, name, price, duration_minutes, payment_mode, deposit_type, deposit_value)
     values ('32323232-0000-0000-0000-000000000001', 'uji layanan', 350000, 60, 'FULL', 'PERCENT', 30)$q$,
  '23514', 't32a FULL dengan DP terisi');
select pg_temp.expect_fail_code(
  $q$insert into public.services (merchant_id, name, price, duration_minutes, payment_mode, deposit_type)
     values ('32323232-0000-0000-0000-000000000001', 'uji layanan', 350000, 60, 'DEPOSIT', 'PERCENT')$q$,
  '23514', 't32a deposit_type tanpa deposit_value');
select pg_temp.expect_ok(
  $q$insert into public.services (id, merchant_id, name, price, duration_minutes, payment_mode, deposit_type, deposit_value)
     values ('32323232-5e5e-0000-0000-000000000001', '32323232-0000-0000-0000-000000000001', 'dp', 350000, 60, 'DEPOSIT', 'PERCENT', 30)$q$,
  't32a DEPOSIT PERCENT 30');
select pg_temp.expect_ok(
  $q$insert into public.services (merchant_id, name, price, duration_minutes, payment_mode)
     values ('32323232-0000-0000-0000-000000000001', 'uji layanan', 350000, 60, 'REQUEST')$q$,
  't32a REQUEST tanpa DP');
select pg_temp.expect_ok(
  $q$insert into public.services (id, merchant_id, name, price, duration_minutes, payment_mode, deposit_type, deposit_value)
     values ('32323232-5e5e-0000-0000-000000000002', '32323232-0000-0000-0000-000000000001', 'req', 350000, 60, 'REQUEST', 'FIXED', 100000)$q$,
  't32a REQUEST FIXED 100000');
select pg_temp.expect_ok(
  $q$insert into public.services (merchant_id, name, price, duration_minutes, payment_mode)
     values ('32323232-0000-0000-0000-000000000001', 'uji layanan', 350000, 60, 'ON_SITE')$q$,
  't32a ON_SITE tanpa DP');
select pg_temp.expect_fail_code(
  $q$update public.services set price = 90000 where id = '32323232-5e5e-0000-0000-000000000002'$q$,
  '23514', 't32a harga turun di bawah DP FIXED');

-- 32b. Insert langsung tanpa kolom nominal: trigger mengisi nominal.
insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime, customer_name, customer_whatsapp, status)
values ('32323232-0000-0000-0000-000000000001', 'Potong', 350000, 60, '2030-03-04 09:00+07', '2030-03-04 10:00+07', 'Rina', '+6281300320001', 'PAID');
select case when amount_due_now = 350000 and amount_due_on_site = 0 and payment_mode = 'FULL'
            then 'OK   t32b nominal default = harga penuh, FULL'
            else 'FAIL t32b nominal default salah' end as t32b
from public.bookings
where merchant_id = '32323232-0000-0000-0000-000000000001' and customer_whatsapp = '+6281300320001';

-- 32c. Constraint booking.
select pg_temp.expect_fail_code(
  $q$insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime, customer_name, customer_whatsapp, status, amount_due_now, amount_due_on_site)
     values ('32323232-0000-0000-0000-000000000001', 'Potong', 350000, 60, '2030-03-05 09:00+07', '2030-03-05 10:00+07', 'Rina', '+6281300320002', 'PAID', 100, 0)$q$,
  '23514', 't32c nominal tidak berjumlah harga');
select pg_temp.expect_fail_code(
  $q$insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime, customer_name, customer_whatsapp, status, paid_on_site_method)
     values ('32323232-0000-0000-0000-000000000001', 'Potong', 350000, 60, '2030-03-05 09:00+07', '2030-03-05 10:00+07', 'Rina', '+6281300320002', 'PAID', 'CASH')$q$,
  '23514', 't32c metode lunas tanpa waktu lunas');
select pg_temp.expect_fail_code(
  $q$insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime, customer_name, customer_whatsapp, status, attended_at, no_show_at)
     values ('32323232-0000-0000-0000-000000000001', 'Potong', 350000, 60, '2030-03-05 09:00+07', '2030-03-05 10:00+07', 'Rina', '+6281300320002', 'PAID', now(), now())$q$,
  '23514', 't32c hadir dan tidak datang sekaligus');

-- 32d. CONFIRMED dan REQUESTED memegang slot.
insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime, customer_name, customer_whatsapp, status, amount_due_now, amount_due_on_site, payment_mode)
values ('32323232-0000-0000-0000-000000000001', 'Potong', 350000, 60, '2030-03-06 09:00+07', '2030-03-06 10:00+07', 'Rina', '+6281300320003', 'CONFIRMED', 0, 350000, 'ON_SITE');
insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime, customer_name, customer_whatsapp, status, expires_at)
values ('32323232-0000-0000-0000-000000000001', 'Potong', 350000, 60, '2030-03-06 11:00+07', '2030-03-06 12:00+07', 'Rina', '+6281300320004', 'REQUESTED', now() + interval '1 hour');
select pg_temp.expect_fail_code(
  $q$insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime, customer_name, customer_whatsapp, status)
     values ('32323232-0000-0000-0000-000000000001', 'Potong', 350000, 60, '2030-03-06 09:30+07', '2030-03-06 10:30+07', 'Dewi', '+6281300320005', 'PENDING')$q$,
  '23P01', 't32d PENDING bentrok dengan CONFIRMED');
select pg_temp.expect_fail_code(
  $q$insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime, customer_name, customer_whatsapp, status)
     values ('32323232-0000-0000-0000-000000000001', 'Potong', 350000, 60, '2030-03-06 11:30+07', '2030-03-06 12:30+07', 'Dewi', '+6281300320005', 'PENDING')$q$,
  '23P01', 't32d PENDING bentrok dengan REQUESTED');

-- 32e. Kesepakatan pemegang slot. Merchant 0002 untuk hitungan kuota (bersih).
insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime, customer_name, customer_whatsapp, status, expires_at, amount_due_now, amount_due_on_site)
values
 ('32323232-0000-0000-0000-000000000001', 'Potong', 350000, 60, '2031-03-04 09:00+07', '2031-03-04 10:00+07', 'Rina', '+6281300320006', 'REQUESTED', now() - interval '1 minute', 350000, 0),
 ('32323232-0000-0000-0000-000000000001', 'Potong', 350000, 60, '2031-03-04 11:00+07', '2031-03-04 12:00+07', 'Rina', '+6281300320007', 'CONFIRMED', now() - interval '1 minute', 0, 350000),
 ('32323232-0000-0000-0000-000000000002', 'Potong', 350000, 60, '2031-03-04 09:00+07', '2031-03-04 10:00+07', 'Rina', '+6281300320008', 'REQUESTED', now() - interval '1 minute', 350000, 0),
 ('32323232-0000-0000-0000-000000000002', 'Potong', 350000, 60, '2031-03-04 11:00+07', '2031-03-04 12:00+07', 'Rina', '+6281300320009', 'CONFIRMED', now() - interval '1 minute', 0, 350000),
 ('32323232-0000-0000-0000-000000000002', 'Potong', 350000, 60, '2031-03-04 13:00+07', '2031-03-04 14:00+07', 'Rina', '+6281300320010', 'REQUESTED', now() + interval '1 hour', 350000, 0);
select case when (select count(*) from public.get_booked_ranges('cara-bayar-32', '2031-03-04 00:00+07', '2031-03-05 00:00+07')) = 1
              and exists (select 1 from public.get_booked_ranges('cara-bayar-32', '2031-03-04 00:00+07', '2031-03-05 00:00+07')
                          where start_datetime = '2031-03-04 11:00+07')
            then 'OK   t32e get_booked_ranges memuat CONFIRMED, bukan REQUESTED kedaluwarsa'
            else 'FAIL t32e get_booked_ranges salah' end as t32e;
select case when public.count_bookings_this_month('32323232-0000-0000-0000-000000000002') = 2
            then 'OK   t32e kuota menghitung CONFIRMED + REQUESTED hidup, bukan yang kedaluwarsa'
            else 'FAIL t32e count_bookings_this_month salah: '
                 || public.count_bookings_this_month('32323232-0000-0000-0000-000000000002') end as t32e2;
select case when public.booking_holds_slot('REQUESTED', now() + interval '1 hour')
             and not public.booking_holds_slot('CANCELLED', now() + interval '1 hour')
             and not public.booking_holds_slot('REQUESTED', now() - interval '1 minute')
            then 'OK   t32e booking_holds_slot'
            else 'FAIL t32e booking_holds_slot' end as t32e3;

-- 32f. Pembersih: REQUESTED kedaluwarsa dibatalkan, CONFIRMED tidak disentuh.
select case when public.reap_expired_bookings() >= 2
            then 'OK   t32f reap_expired_bookings membatalkan minimal dua baris'
            else 'FAIL t32f reap_expired_bookings tidak membatalkan' end as t32f_ran;
select case when (select status = 'CANCELLED' and cancel_reason = 'Permintaan tidak dijawab dalam batas waktu'
                  from public.bookings where customer_whatsapp = '+6281300320006')
             and (select status = 'CONFIRMED' from public.bookings where customer_whatsapp = '+6281300320007')
            then 'OK   t32f reap membatalkan REQUESTED kedaluwarsa saja'
            else 'FAIL t32f reap_expired_bookings salah' end as t32f;

-- 32g. merchant_settings dibuat otomatis dengan default.
select case when (select allow_pay_on_site and auto_confirm_on_site and max_active_per_phone = 2 and not deposit_after_no_show
                  from public.merchant_settings where merchant_id = '32323232-0000-0000-0000-000000000001')
             and (select count(*) from public.merchant_settings) = (select count(*) from public.merchants)
            then 'OK   t32g merchant_settings terisi default untuk semua merchant'
            else 'FAIL t32g merchant_settings tidak sesuai default' end as t32g;
select pg_temp.expect_fail_code(
  $q$update public.merchant_settings set max_active_per_phone = 0 where merchant_id = '32323232-0000-0000-0000-000000000001'$q$,
  '23514', 't32g max_active_per_phone = 0');

-- 32h. Hak akses.
select
  case when has_column_privilege('anon', 'public.merchant_settings', 'allow_pay_on_site', 'SELECT')
        and has_column_privilege('anon', 'public.merchant_settings', 'auto_confirm_on_site', 'SELECT')
       then 'OK   t32h anon bisa SELECT kolom publik' else 'FAIL t32h anon tidak bisa SELECT kolom publik' end as t32h,
  case when has_column_privilege('anon', 'public.merchant_settings', 'max_active_per_phone', 'SELECT')
         or has_column_privilege('anon', 'public.merchant_settings', 'deposit_after_no_show', 'SELECT')
       then 'FAIL t32h anon bisa SELECT kolom privat' else 'OK   t32h anon tidak bisa SELECT kolom privat' end as t32h2,
  case when has_table_privilege('anon', 'public.merchant_settings', 'INSERT')
         or has_table_privilege('anon', 'public.merchant_settings', 'UPDATE')
       then 'FAIL t32h anon bisa menulis' else 'OK   t32h anon tidak bisa menulis' end as t32h3,
  case when has_column_privilege('authenticated', 'public.merchant_settings', 'allow_pay_on_site', 'UPDATE')
        and not has_column_privilege('authenticated', 'public.merchant_settings', 'merchant_id', 'UPDATE')
        and not has_table_privilege('authenticated', 'public.merchant_settings', 'INSERT')
       then 'OK   t32h authenticated: UPDATE kolom setelan saja, tanpa INSERT'
       else 'FAIL t32h hak authenticated salah' end as t32h4,
  case when has_function_privilege('anon', 'public.booking_holds_slot(public.booking_status, timestamptz)', 'EXECUTE')
         or has_function_privilege('authenticated', 'public.booking_holds_slot(public.booking_status, timestamptz)', 'EXECUTE')
       then 'FAIL t32h booking_holds_slot terbuka' else 'OK   t32h booking_holds_slot tertutup' end as t32h5,
  case when has_function_privilege('anon', 'public.get_booked_ranges(text, timestamptz, timestamptz)', 'EXECUTE')
        and has_function_privilege('authenticated', 'public.dashboard_booking_summary()', 'EXECUTE')
        and not has_function_privilege('anon', 'public.dashboard_booking_summary()', 'EXECUTE')
        and has_function_privilege('service_role', 'public.reap_expired_bookings()', 'EXECUTE')
        and not has_function_privilege('authenticated', 'public.reap_expired_bookings()', 'EXECUTE')
       then 'OK   t32h grant fungsi lama tetap' else 'FAIL t32h grant fungsi lama berubah' end as t32h6,
  case when has_function_privilege('anon', 'public.count_bookings_this_month(uuid)', 'EXECUTE')
         or has_function_privilege('authenticated', 'public.count_bookings_this_month(uuid)', 'EXECUTE')
       then 'FAIL t32h count_bookings_this_month terbuka' else 'OK   t32h count_bookings_this_month tertutup' end as t32h7;

-- 32i. RLS: merchant hanya mengubah setelannya sendiri; boleh membatalkan CONFIRMED.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '32323232-0000-0000-0000-000000000001';
with u as (update public.merchant_settings set allow_pay_on_site = false
           where merchant_id = '32323232-0000-0000-0000-000000000002' returning 1)
select case when (select count(*) from u) = 0
            then 'OK   t32i setelan merchant lain tidak berubah'
            else 'FAIL t32i setelan merchant lain berubah' end as t32i;
with u as (update public.bookings set status = 'CANCELLED', cancelled_at = now(), cancel_reason = 'uji'
           where customer_whatsapp = '+6281300320003' returning 1)
select case when (select count(*) from u) = 1
            then 'OK   t32i merchant membatalkan booking CONFIRMED miliknya'
            else 'FAIL t32i booking CONFIRMED tidak bisa dibatalkan' end as t32i2;
rollback;

-- 32j. Pendapatan = uang masuk: DP PAID + sisa lunas di tempat.
insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime, customer_name, customer_whatsapp, status, amount_due_now, amount_due_on_site, payment_mode, paid_at)
values ('32323232-0000-0000-0000-000000000003', 'Potong', 350000, 60, '2032-03-04 09:00+07', '2032-03-04 10:00+07', 'Rina', '+6281300320011', 'PAID', 105000, 245000, 'DEPOSIT', now());
insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime, customer_name, customer_whatsapp, status, amount_due_now, amount_due_on_site, payment_mode, paid_on_site_at, paid_on_site_method)
values ('32323232-0000-0000-0000-000000000003', 'Potong', 450000, 60, '2032-03-04 11:00+07', '2032-03-04 12:00+07', 'Rina', '+6281300320012', 'CONFIRMED', 0, 450000, 'ON_SITE', now(), 'CASH');
begin;
set local role authenticated;
set local request.jwt.claim.sub = '32323232-0000-0000-0000-000000000003';
select case when (select confirmed_revenue from public.dashboard_booking_summary()) = 555000
            then 'OK   t32j confirmed_revenue = DP + sisa lunas di tempat'
            else 'FAIL t32j confirmed_revenue = ' || (select confirmed_revenue from public.dashboard_booking_summary())::text end as t32j;
rollback;

-- ===========================================================================
-- 33. create_booking cara bayar (20261115000300)
-- ===========================================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('33333333-0000-0000-0000-000000000001', 'bayar33-a@example.com', '{}'::jsonb),
  ('33333333-0000-0000-0000-000000000002', 'bayar33-b@example.com', '{}'::jsonb),
  ('33333333-0000-0000-0000-000000000003', 'bayar33-c@example.com', '{}'::jsonb);
update public.merchants set username = 'cara-bayar-33', subscription_tier = 'PRO'
  where id = '33333333-0000-0000-0000-000000000001';
update public.merchants set subscription_tier = 'STUDIO'
  where id = '33333333-0000-0000-0000-000000000002';
update public.merchants set subscription_tier = 'PRO'
  where id = '33333333-0000-0000-0000-000000000003';
insert into public.availability (merchant_id, day_of_week, start_time, end_time)
select m, d, '09:00', '17:00'
from generate_series(1, 7) d,
     unnest(array['33333333-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000002']::uuid[]) m;
insert into public.availability (merchant_id, day_of_week, start_time, end_time)
select '33333333-0000-0000-0000-000000000003', d, '00:00', '23:59' from generate_series(1, 7) d;

insert into public.services (id, merchant_id, name, price, duration_minutes, payment_mode, deposit_type, deposit_value) values
  ('33333333-5e5e-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', 'Penuh', 350000, 60, 'FULL', null, null),
  ('33333333-5e5e-0000-0000-000000000002', '33333333-0000-0000-0000-000000000001', 'DP 30 persen', 350000, 60, 'DEPOSIT', 'PERCENT', 30),
  ('33333333-5e5e-0000-0000-000000000003', '33333333-0000-0000-0000-000000000001', 'Bayar di tempat', 450000, 60, 'ON_SITE', null, null),
  ('33333333-5e5e-0000-0000-000000000004', '33333333-0000-0000-0000-000000000001', 'Permintaan DP', 1000000, 60, 'REQUEST', 'FIXED', 100000),
  ('33333333-5e5e-0000-0000-000000000005', '33333333-0000-0000-0000-000000000001', 'Permintaan', 200000, 60, 'REQUEST', null, null),
  ('33333333-5e5e-0000-0000-000000000006', '33333333-0000-0000-0000-000000000003', 'Permintaan singkat', 100000, 5, 'REQUEST', null, null),
  ('33333333-5e5e-0000-0000-000000000007', '33333333-0000-0000-0000-000000000002', 'Potong', 100000, 60, 'FULL', null, null);

-- Booking merchant 0001 untuk layanan ke-p_service di slot ke-p_slot: Senin,
-- delapan slot satu jam (09:00 sampai 16:00) per minggu, supaya tiap kasus
-- punya slot sendiri dan tidak saling bentrok.
create or replace function pg_temp.cb33(p_service integer, p_slot integer, p_phone text, p_can_charge boolean default true)
returns setof public.bookings language plpgsql as $$
begin
  return query select * from public.create_booking(
    '33333333-0000-0000-0000-000000000001',
    ('33333333-5e5e-0000-0000-' || lpad(p_service::text, 12, '0'))::uuid,
    pg_temp.jakarta_future(1, 1 + p_slot / 8, (9 + p_slot % 8) || ':00'),
    'Pelanggan 33', p_phone, null, p_can_charge);
end $$;

create or replace function pg_temp.check33(
  p_label text, p_service integer, p_slot integer, p_phone text,
  p_status text, p_due_now numeric, p_due_on_site numeric, p_mode text,
  p_can_charge boolean default true)
returns text language plpgsql as $$
declare
  b public.bookings;
begin
  select * into b from pg_temp.cb33(p_service, p_slot, p_phone, p_can_charge);
  if b.status::text = p_status and b.amount_due_now = p_due_now
     and b.amount_due_on_site = p_due_on_site and b.payment_mode::text = p_mode then
    return 'OK   ' || p_label;
  end if;
  return 'FAIL ' || p_label || ' -> ' || b.status || ' ' || b.amount_due_now || '/'
    || b.amount_due_on_site || ' ' || b.payment_mode;
exception when others then
  return 'FAIL ' || p_label || ' [' || sqlstate || ' ' || sqlerrm || ']';
end $$;

-- 33a. FULL: PENDING, seluruh harga sekarang, kedaluwarsa 15 menit.
select pg_temp.check33('t33a FULL -> PENDING 350000/0', 1, 0, '+6281333000001', 'PENDING', 350000, 0, 'FULL');
select case when expires_at between now() + interval '14 minutes' and now() + interval '16 minutes'
            then 'OK   t33a PENDING kedaluwarsa sekitar 15 menit'
            else 'FAIL t33a expires_at = ' || expires_at end as t33a
from public.bookings where customer_whatsapp = '+6281333000001';

-- 33b. DEPOSIT 30 persen dari 350000.
select pg_temp.check33('t33b DEPOSIT -> PENDING 105000/245000', 2, 1, '+6281333000002', 'PENDING', 105000, 245000, 'DEPOSIT');

-- 33c. ON_SITE dengan setelan default: langsung CONFIRMED.
select pg_temp.check33('t33c ON_SITE -> CONFIRMED 0/450000', 3, 2, '+6281333000003', 'CONFIRMED', 0, 450000, 'ON_SITE');

-- 33d. auto_confirm_on_site mati: ON_SITE jadi REQUESTED, batas jawab <= 24 jam.
update public.merchant_settings set auto_confirm_on_site = false
  where merchant_id = '33333333-0000-0000-0000-000000000001';
select pg_temp.check33('t33d ON_SITE tanpa auto-confirm -> REQUESTED', 3, 3, '+6281333000004', 'REQUESTED', 0, 450000, 'ON_SITE');
select case when expires_at > now() and expires_at <= now() + interval '24 hours'
            then 'OK   t33d REQUESTED kedaluwarsa paling lama 24 jam'
            else 'FAIL t33d expires_at = ' || expires_at end as t33d
from public.bookings where customer_whatsapp = '+6281333000004';
update public.merchant_settings set auto_confirm_on_site = true
  where merchant_id = '33333333-0000-0000-0000-000000000001';

-- 33e. allow_pay_on_site mati: ON_SITE dibayar penuh online.
update public.merchant_settings set allow_pay_on_site = false
  where merchant_id = '33333333-0000-0000-0000-000000000001';
select pg_temp.check33('t33e ON_SITE tanpa izin bayar di tempat -> FULL', 3, 4, '+6281333000005', 'PENDING', 450000, 0, 'FULL');
update public.merchant_settings set allow_pay_on_site = true
  where merchant_id = '33333333-0000-0000-0000-000000000001';

-- 33f. REQUEST: DP FIXED bila terisi, selain itu harga penuh.
select pg_temp.check33('t33f REQUEST FIXED -> REQUESTED 100000/900000', 4, 5, '+6281333000006', 'REQUESTED', 100000, 900000, 'REQUEST');
select pg_temp.check33('t33f REQUEST tanpa DP -> REQUESTED 200000/0', 5, 6, '+6281333000007', 'REQUESTED', 200000, 0, 'REQUEST');

-- 33g. Tanpa koneksi payment: yang perlu bayar online ditolak BK021.
select pg_temp.expect_fail_code(
  $q$select * from pg_temp.cb33(1, 7, '+6281333000008', false)$q$,
  'BK021', 't33g FULL tanpa koneksi payment');
select pg_temp.expect_fail_code(
  $q$select * from pg_temp.cb33(4, 7, '+6281333000009', false)$q$,
  'BK021', 't33g REQUEST FIXED tanpa koneksi payment');
select pg_temp.check33('t33g ON_SITE tanpa koneksi payment diterima', 3, 7, '+6281333000010', 'CONFIRMED', 0, 450000, 'ON_SITE', false);

-- 33h. Batas booking aktif per nomor (ON_SITE dan REQUEST saja).
update public.merchant_settings set max_active_per_phone = 2
  where merchant_id = '33333333-0000-0000-0000-000000000001';
select pg_temp.expect_ok($q$select * from pg_temp.cb33(3, 8, '+6281333000020')$q$, 't33h ON_SITE pertama nomor X');
select pg_temp.expect_ok($q$select * from pg_temp.cb33(3, 9, '+6281333000020')$q$, 't33h ON_SITE kedua nomor X');
select pg_temp.expect_fail_code(
  $q$select * from pg_temp.cb33(3, 10, '+6281333000020')$q$,
  'BK020', 't33h ON_SITE ketiga nomor X');
select pg_temp.expect_ok($q$select * from pg_temp.cb33(1, 10, '+6281333000020')$q$, 't33h FULL nomor X tidak dibatasi');
select pg_temp.expect_ok($q$select * from pg_temp.cb33(3, 11, '+6281333000021')$q$, 't33h ON_SITE nomor Y');
-- Booking Z minggu lalu sudah selesai: tidak dihitung aktif.
insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime,
  customer_name, customer_whatsapp, status, amount_due_now, amount_due_on_site, payment_mode)
values ('33333333-0000-0000-0000-000000000001', 'Bayar di tempat', 450000, 60,
  now() - interval '7 days', now() - interval '7 days' + interval '1 hour',
  'Pelanggan 33', '+6281333000022', 'CONFIRMED', 0, 450000, 'ON_SITE');
select pg_temp.expect_ok($q$select * from pg_temp.cb33(3, 12, '+6281333000022')$q$, 't33h ON_SITE pertama nomor Z');
select pg_temp.expect_ok($q$select * from pg_temp.cb33(3, 13, '+6281333000022')$q$, 't33h ON_SITE kedua nomor Z (booking lampau tidak dihitung)');
update public.merchant_settings set max_active_per_phone = null
  where merchant_id = '33333333-0000-0000-0000-000000000001';
select pg_temp.expect_ok($q$select * from pg_temp.cb33(3, 14, '+6281333000020')$q$, 't33h ON_SITE ketiga nomor X tanpa batas');
update public.merchant_settings set max_active_per_phone = 2
  where merchant_id = '33333333-0000-0000-0000-000000000001';

-- 33i. Nomor yang pernah tidak datang wajib bayar online bila setelan menyala.
insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime,
  customer_name, customer_whatsapp, status, amount_due_now, amount_due_on_site, payment_mode, no_show_at)
values ('33333333-0000-0000-0000-000000000001', 'Bayar di tempat', 450000, 60,
  now() - interval '14 days', now() - interval '14 days' + interval '1 hour',
  'Pelanggan 33', '+6281333000030', 'CONFIRMED', 0, 450000, 'ON_SITE', now() - interval '14 days');
update public.merchant_settings set deposit_after_no_show = true
  where merchant_id = '33333333-0000-0000-0000-000000000001';
select pg_temp.check33('t33i nomor pernah tidak datang -> FULL', 3, 15, '+6281333000030', 'PENDING', 450000, 0, 'FULL');
select pg_temp.check33('t33i nomor lain tetap ON_SITE', 3, 16, '+6281333000031', 'CONFIRMED', 0, 450000, 'ON_SITE');
update public.merchant_settings set deposit_after_no_show = false
  where merchant_id = '33333333-0000-0000-0000-000000000001';
select pg_temp.check33('t33i setelan mati -> nomor itu kembali ON_SITE', 3, 17, '+6281333000030', 'CONFIRMED', 0, 450000, 'ON_SITE');

-- 33j. REQUESTED kedaluwarsa di slot yang sama dibersihkan dulu, bukan 23P01.
insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime,
  customer_name, customer_whatsapp, status, expires_at, amount_due_now, amount_due_on_site, payment_mode)
values ('33333333-0000-0000-0000-000000000001', 'Permintaan', 200000, 60,
  pg_temp.jakarta_future(1, 3, '11:00'), pg_temp.jakarta_future(1, 3, '12:00'),
  'Pelanggan 33', '+6281333000040', 'REQUESTED', now() - interval '1 minute', 200000, 0, 'REQUEST');
select pg_temp.expect_ok($q$select * from pg_temp.cb33(1, 18, '+6281333000041')$q$,
  't33j slot dengan REQUESTED kedaluwarsa bisa dipesan');
select case when status = 'CANCELLED' and cancel_reason = 'Permintaan tidak dijawab dalam batas waktu'
            then 'OK   t33j REQUESTED kedaluwarsa dibatalkan dengan alasan permintaan'
            else 'FAIL t33j status lama = ' || status || ' ' || coalesce(cancel_reason, 'NULL') end as t33j
from public.bookings where customer_whatsapp = '+6281333000040';

-- 33k. Permintaan untuk jadwal dekat: batas jawab = jam mulai.
create or replace function pg_temp.t33k()
returns text language plpgsql as $$
declare
  v_start timestamptz := date_trunc('minute', now()) + interval '2 hours';
  b public.bookings;
begin
  if (v_start at time zone 'Asia/Jakarta')::time > '23:50' then
    return 'OK   t33k dilewati (dekat tengah malam)';
  end if;
  select * into b from public.create_booking(
    '33333333-0000-0000-0000-000000000003', '33333333-5e5e-0000-0000-000000000006',
    v_start, 'Pelanggan 33', '+6281333000050');
  if b.status = 'REQUESTED' and b.expires_at = b.start_datetime then
    return 'OK   t33k REQUESTED untuk 2 jam lagi kedaluwarsa tepat di jam mulai';
  end if;
  return 'FAIL t33k -> ' || b.status || ' expires_at ' || b.expires_at || ' start ' || b.start_datetime;
exception when others then
  return 'FAIL t33k [' || sqlstate || ' ' || sqlerrm || ']';
end $$;
select pg_temp.t33k();

-- 33l. "Siapa saja" melewati staf yang sudah punya booking CONFIRMED.
insert into public.staff (id, merchant_id, name, sort_order) values
  ('33333333-57af-0000-0000-000000000001', '33333333-0000-0000-0000-000000000002', 'Ayu', 0),
  ('33333333-57af-0000-0000-000000000002', '33333333-0000-0000-0000-000000000002', 'Bima', 1);
insert into public.bookings (merchant_id, service_id, service_name, service_price, duration_minutes, start_datetime, end_datetime,
  customer_name, customer_whatsapp, status, amount_due_now, amount_due_on_site, payment_mode, staff_id, staff_name)
values ('33333333-0000-0000-0000-000000000002', '33333333-5e5e-0000-0000-000000000007', 'Potong', 100000, 60,
  pg_temp.jakarta_future(1, 1, '10:00'), pg_temp.jakarta_future(1, 1, '11:00'),
  'Pelanggan 33', '+6281333000060', 'CONFIRMED', 0, 100000, 'ON_SITE',
  '33333333-57af-0000-0000-000000000001', 'Ayu');
select pg_temp.expect_ok(
  $q$select * from public.create_booking(
       '33333333-0000-0000-0000-000000000002', '33333333-5e5e-0000-0000-000000000007',
       pg_temp.jakarta_future(1, 1, '10:00'), 'Pelanggan 33', '+6281333000061')$q$,
  't33l siapa saja di jam yang sudah dipegang CONFIRMED milik Ayu');
select case when staff_name = 'Bima'
            then 'OK   t33l siapa saja jatuh ke staf yang kosong (Bima)'
            else 'FAIL t33l siapa saja ditugaskan ke ' || coalesce(staff_name, 'NULL') end as t33l
from public.bookings where customer_whatsapp = '+6281333000061';

-- 33m. Hak EXECUTE signature baru; signature enam argumen sudah hilang.
-- Sejak 20261125000300 signature terbarunya sembilan belas argumen (atribusi funnel).
select
  case when to_regprocedure('public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source, text, integer, uuid, uuid, text, uuid, uuid, text, text, text, text, uuid, integer)') is null
       then 'FAIL t33m signature sembilan belas argumen (20261125000300) tidak ada'
       when has_function_privilege('anon', to_regprocedure('public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source, text, integer, uuid, uuid, text, uuid, uuid, text, text, text, text, uuid, integer)'), 'EXECUTE')
         or has_function_privilege('authenticated', to_regprocedure('public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source, text, integer, uuid, uuid, text, uuid, uuid, text, text, text, text, uuid, integer)'), 'EXECUTE')
       then 'FAIL t33m anon/authenticated bisa EXECUTE create_booking'
       when not has_function_privilege('service_role', to_regprocedure('public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source, text, integer, uuid, uuid, text, uuid, uuid, text, text, text, text, uuid, integer)'), 'EXECUTE')
       then 'FAIL t33m service_role tidak bisa EXECUTE create_booking'
       else 'OK   t33m create_booking hanya untuk service_role' end as t33m,
  case when to_regprocedure('public.create_booking(uuid, uuid, timestamptz, text, text, uuid)') is null
       then 'OK   t33m signature enam argumen sudah dihapus'
       else 'FAIL t33m signature enam argumen masih ada' end as t33m2;

-- ===========================================================================
-- 34. Aksi merchant atas booking (20261115000400)
-- ===========================================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('34343434-0000-0000-0000-000000000001', 'aksi34-a@example.com', '{}'::jsonb),
  ('34343434-0000-0000-0000-000000000002', 'aksi34-b@example.com', '{}'::jsonb);
update public.merchants set subscription_tier = 'PRO'
  where id in ('34343434-0000-0000-0000-000000000001', '34343434-0000-0000-0000-000000000002');
insert into public.availability (merchant_id, day_of_week, start_time, end_time)
select '34343434-0000-0000-0000-000000000001', d, '09:00', '17:00' from generate_series(1, 7) d;
insert into public.services (id, merchant_id, name, price, duration_minutes, payment_mode, deposit_type, deposit_value) values
  ('34343434-5e5e-0000-0000-000000000001', '34343434-0000-0000-0000-000000000001', 'Permintaan DP', 1000000, 60, 'REQUEST', 'FIXED', 100000),
  ('34343434-5e5e-0000-0000-000000000002', '34343434-0000-0000-0000-000000000001', 'Bayar di tempat', 450000, 60, 'ON_SITE', null, null);

-- Booking langsung (untuk jadwal lampau / status tertentu), dicari lewat nomor.
create or replace function pg_temp.ins34(p_phone text, p_status public.booking_status, p_start timestamptz,
  p_due_now numeric, p_due_on_site numeric, p_expires timestamptz default null)
returns uuid language sql as $$
  insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime,
    customer_name, customer_whatsapp, status, expires_at, amount_due_now, amount_due_on_site, payment_mode)
  values ('34343434-0000-0000-0000-000000000001', 'Layanan 34', p_due_now + p_due_on_site, 30, p_start, p_start + interval '30 minutes',
    'Pelanggan 34', p_phone, p_status, coalesce(p_expires, p_start), p_due_now, p_due_on_site, 'ON_SITE')
  returning id;
$$;

-- Jalankan sql sebagai merchant (authenticated + sub); p_code null = harus berhasil.
create or replace function pg_temp.act34(p_label text, p_sub uuid, p_sql text, p_code text default null)
returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_sub::text, true);
  execute 'set local role authenticated';
  execute p_sql;
  execute 'reset role';
  if p_code is null then return 'OK   ' || p_label; end if;
  return 'FAIL (seharusnya ditolak) ' || p_label;
exception when others then
  execute 'reset role';
  if p_code is not null and sqlstate = p_code then return 'OK   ' || p_label; end if;
  return 'FAIL ' || p_label || ' [' || sqlstate || ' ' || sqlerrm || ']';
end $$;

create or replace function pg_temp.id34(p_phone text) returns uuid language sql as $$
  select id from public.bookings where customer_whatsapp = p_phone;
$$;

-- 34a. Setujui REQUESTED yang perlu bayar sekarang -> PENDING, batas bayar <= jam mulai.
select * from public.create_booking('34343434-0000-0000-0000-000000000001', '34343434-5e5e-0000-0000-000000000001',
  pg_temp.jakarta_future(1, 41, '10:00'), 'Pelanggan 34', '+6281343000001', null, true);
select pg_temp.act34('t34a setujui', '34343434-0000-0000-0000-000000000001',
  format('select * from public.decide_booking_request(%L, true)', pg_temp.id34('+6281343000001')));
select case when status = 'PENDING' and expires_at > now() and expires_at <= start_datetime
            then 'OK   t34a REQUESTED disetujui -> PENDING dengan batas bayar'
            else 'FAIL t34a ' || status || ' ' || coalesce(expires_at::text, 'NULL') end as t34a
from public.bookings where customer_whatsapp = '+6281343000001';

-- 34b. Setujui REQUESTED bayar di tempat -> CONFIRMED.
update public.merchant_settings set auto_confirm_on_site = false
  where merchant_id = '34343434-0000-0000-0000-000000000001';
select * from public.create_booking('34343434-0000-0000-0000-000000000001', '34343434-5e5e-0000-0000-000000000002',
  pg_temp.jakarta_future(1, 42, '10:00'), 'Pelanggan 34', '+6281343000002', null, true);
select pg_temp.act34('t34b setujui bayar di tempat', '34343434-0000-0000-0000-000000000001',
  format('select * from public.decide_booking_request(%L, true)', pg_temp.id34('+6281343000002')));
select case when status = 'CONFIRMED' then 'OK   t34b -> CONFIRMED' else 'FAIL t34b ' || status end as t34b
from public.bookings where customer_whatsapp = '+6281343000002';

-- 34c. Tolak -> CANCELLED dengan alasan.
select * from public.create_booking('34343434-0000-0000-0000-000000000001', '34343434-5e5e-0000-0000-000000000001',
  pg_temp.jakarta_future(1, 43, '10:00'), 'Pelanggan 34', '+6281343000003', null, true);
select pg_temp.act34('t34c tolak', '34343434-0000-0000-0000-000000000001',
  format('select * from public.decide_booking_request(%L, false)', pg_temp.id34('+6281343000003')));
select case when status = 'CANCELLED' and cancel_reason = 'Permintaan ditolak merchant' and cancelled_at is not null
            then 'OK   t34c -> CANCELLED dengan alasan'
            else 'FAIL t34c ' || status || ' ' || coalesce(cancel_reason, 'NULL') end as t34c
from public.bookings where customer_whatsapp = '+6281343000003';

-- 34d. BK030 merchant lain dan keputusan kedua; BK031 permintaan kedaluwarsa.
select pg_temp.act34('t34d merchant lain BK030', '34343434-0000-0000-0000-000000000002',
  format('select * from public.decide_booking_request(%L, true)', pg_temp.id34('+6281343000003')), 'BK030');
select pg_temp.act34('t34d keputusan kedua BK030', '34343434-0000-0000-0000-000000000001',
  format('select * from public.decide_booking_request(%L, true)', pg_temp.id34('+6281343000003')), 'BK030');
select pg_temp.ins34('+6281343000004', 'REQUESTED', now() + interval '3 days', 0, 100000, now() - interval '1 minute');
select pg_temp.act34('t34d kedaluwarsa BK031', '34343434-0000-0000-0000-000000000001',
  format('select * from public.decide_booking_request(%L, true)', pg_temp.id34('+6281343000004')), 'BK031');

-- 34e. Lunas di tempat.
select pg_temp.act34('t34e lunas di tempat', '34343434-0000-0000-0000-000000000001',
  format('select public.mark_booking_paid_on_site(%L, ''CASH'')', pg_temp.id34('+6281343000002')));
select case when paid_on_site_at is not null and paid_on_site_method = 'CASH'
            then 'OK   t34e kolom lunas di tempat terisi'
            else 'FAIL t34e lunas di tempat tidak terisi' end as t34e
from public.bookings where customer_whatsapp = '+6281343000002';
select pg_temp.act34('t34e panggilan kedua BK032', '34343434-0000-0000-0000-000000000001',
  format('select public.mark_booking_paid_on_site(%L, ''CASH'')', pg_temp.id34('+6281343000002')), 'BK032');
select pg_temp.ins34('+6281343000005', 'PAID', now() + interval '4 days', 100000, 0);
select pg_temp.act34('t34e PAID tanpa sisa di tempat BK032', '34343434-0000-0000-0000-000000000001',
  format('select public.mark_booking_paid_on_site(%L, ''CASH'')', pg_temp.id34('+6281343000005')), 'BK032');

-- 34f. Kehadiran.
select pg_temp.ins34('+6281343000006', 'CONFIRMED', now() + interval '7 days', 0, 100000);
select pg_temp.act34('t34f hadir terlalu dini BK033', '34343434-0000-0000-0000-000000000001',
  format('select public.mark_booking_attendance(%L, true)', pg_temp.id34('+6281343000006')), 'BK033');
select pg_temp.ins34('+6281343000007', 'CONFIRMED', now() - interval '30 minutes', 0, 100000);
select pg_temp.act34('t34f hadir', '34343434-0000-0000-0000-000000000001',
  format('select public.mark_booking_attendance(%L, true)', pg_temp.id34('+6281343000007')));
select case when attended_at is not null and no_show_at is null then 'OK   t34f hadir tercatat'
            else 'FAIL t34f hadir' end as t34f1
from public.bookings where customer_whatsapp = '+6281343000007';
select pg_temp.act34('t34f lalu tidak datang', '34343434-0000-0000-0000-000000000001',
  format('select public.mark_booking_attendance(%L, false)', pg_temp.id34('+6281343000007')));
select case when no_show_at is not null and attended_at is null then 'OK   t34f tidak datang menggantikan hadir'
            else 'FAIL t34f tidak datang' end as t34f2
from public.bookings where customer_whatsapp = '+6281343000007';

-- 34g. Hak EXECUTE.
select
  case when has_function_privilege('anon', 'public.decide_booking_request(uuid, boolean)', 'EXECUTE')
         or has_function_privilege('anon', 'public.mark_booking_paid_on_site(uuid, public.on_site_payment_method)', 'EXECUTE')
         or has_function_privilege('anon', 'public.mark_booking_attendance(uuid, boolean)', 'EXECUTE')
       then 'FAIL t34g anon bisa EXECUTE aksi merchant'
       when not (has_function_privilege('authenticated', 'public.decide_booking_request(uuid, boolean)', 'EXECUTE')
         and has_function_privilege('authenticated', 'public.mark_booking_paid_on_site(uuid, public.on_site_payment_method)', 'EXECUTE')
         and has_function_privilege('authenticated', 'public.mark_booking_attendance(uuid, boolean)', 'EXECUTE'))
       then 'FAIL t34g authenticated tidak bisa EXECUTE'
       else 'OK   t34g aksi merchant hanya untuk authenticated' end as t34g;

-- ===========================================================================
-- 35. Nominal minimum QRIS dan booking gratis (20261115000500)
-- ===========================================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('35353535-0000-0000-0000-000000000001', 'minimum35@example.com', '{}'::jsonb);
update public.merchants set subscription_tier = 'PRO'
  where id = '35353535-0000-0000-0000-000000000001';
insert into public.availability (merchant_id, day_of_week, start_time, end_time)
select '35353535-0000-0000-0000-000000000001', d, '09:00', '17:00' from generate_series(1, 7) d;

-- Layanan 0003 dan 0007 meniru layanan lama yang dibuat sebelum Zod menolak harga < 1500.
insert into public.services (id, merchant_id, name, price, duration_minutes, payment_mode, deposit_type, deposit_value) values
  ('35353535-5e5e-0000-0000-000000000001', '35353535-0000-0000-0000-000000000001', 'Gratis', 0, 60, 'FULL', null, null),
  ('35353535-5e5e-0000-0000-000000000002', '35353535-0000-0000-0000-000000000001', 'DP 1 persen', 100000, 60, 'DEPOSIT', 'PERCENT', 1),
  ('35353535-5e5e-0000-0000-000000000003', '35353535-0000-0000-0000-000000000001', 'Harga lama', 1000, 60, 'FULL', null, null),
  ('35353535-5e5e-0000-0000-000000000004', '35353535-0000-0000-0000-000000000001', 'DP 30 persen', 99999, 60, 'DEPOSIT', 'PERCENT', 30),
  ('35353535-5e5e-0000-0000-000000000005', '35353535-0000-0000-0000-000000000001', 'Permintaan', 200000, 60, 'REQUEST', null, null),
  ('35353535-5e5e-0000-0000-000000000006', '35353535-0000-0000-0000-000000000001', 'Bayar di tempat', 450000, 60, 'ON_SITE', null, null),
  ('35353535-5e5e-0000-0000-000000000007', '35353535-0000-0000-0000-000000000001', 'Permintaan lama', 1000, 60, 'REQUEST', null, null);

-- Sama dengan cb33/check33, untuk merchant 35.
create or replace function pg_temp.cb35(p_service integer, p_slot integer, p_phone text, p_can_charge boolean default true)
returns setof public.bookings language plpgsql as $$
begin
  return query select * from public.create_booking(
    '35353535-0000-0000-0000-000000000001',
    ('35353535-5e5e-0000-0000-' || lpad(p_service::text, 12, '0'))::uuid,
    pg_temp.jakarta_future(1, 1 + p_slot / 8, (9 + p_slot % 8) || ':00'),
    'Pelanggan 35', p_phone, null, p_can_charge);
end $$;

create or replace function pg_temp.check35(
  p_label text, p_service integer, p_slot integer, p_phone text,
  p_status text, p_due_now numeric, p_due_on_site numeric, p_mode text,
  p_can_charge boolean default true)
returns text language plpgsql as $$
declare
  b public.bookings;
begin
  select * into b from pg_temp.cb35(p_service, p_slot, p_phone, p_can_charge);
  if b.status::text = p_status and b.amount_due_now = p_due_now
     and b.amount_due_on_site = p_due_on_site and b.payment_mode::text = p_mode then
    return 'OK   ' || p_label;
  end if;
  return 'FAIL ' || p_label || ' -> ' || b.status || ' ' || b.amount_due_now || '/'
    || b.amount_due_on_site || ' ' || b.payment_mode;
exception when others then
  return 'FAIL ' || p_label || ' [' || sqlstate || ' ' || sqlerrm || ']';
end $$;

-- 35a. FULL gratis langsung CONFIRMED tanpa koneksi payment.
select pg_temp.check35('t35a FULL gratis -> CONFIRMED 0/0 tanpa koneksi', 1, 0, '+6281335000001', 'CONFIRMED', 0, 0, 'FULL', false);

-- 35b. DP 1 persen dari 100000 = 1000, dinaikkan ke minimum 1500.
select pg_temp.check35('t35b DEPOSIT 1% -> PENDING 1500/98500', 2, 1, '+6281335000002', 'PENDING', 1500, 98500, 'DEPOSIT');

-- 35c. Layanan lama FULL 1000 di bawah minimum QRIS.
select pg_temp.expect_fail_code(
  $q$select * from pg_temp.cb35(3, 2, '+6281335000003')$q$,
  'BK022', 't35c FULL 1000 di bawah minimum QRIS');
-- REQUEST tanpa DP ditagih seluruh harga setelah disetujui, jadi ikut ditolak.
select pg_temp.expect_fail_code(
  $q$select * from pg_temp.cb35(7, 10, '+6281335000010')$q$,
  'BK022', 't35c REQUEST tanpa DP 1000 di bawah minimum QRIS');

-- 35d. DP di atas minimum tidak berubah: 99999 x 30% = 30000.
select pg_temp.check35('t35d DEPOSIT 30% dari 99999 -> 30000/69999', 4, 3, '+6281335000004', 'PENDING', 30000, 69999, 'DEPOSIT');

-- 35e. BK020 tetap berlaku untuk REQUEST.
update public.merchant_settings set max_active_per_phone = 1
  where merchant_id = '35353535-0000-0000-0000-000000000001';
select pg_temp.expect_ok($q$select * from pg_temp.cb35(5, 4, '+6281335000005')$q$, 't35e REQUEST pertama');
select pg_temp.expect_fail_code(
  $q$select * from pg_temp.cb35(5, 5, '+6281335000005')$q$,
  'BK020', 't35e REQUEST kedua nomor sama');
-- Booking gratis juga memegang slot tanpa uang masuk, jadi ikut dibatasi.
select pg_temp.expect_ok($q$select * from pg_temp.cb35(1, 8, '+6281335000008')$q$, 't35e FULL gratis pertama');
select pg_temp.expect_fail_code(
  $q$select * from pg_temp.cb35(1, 9, '+6281335000008')$q$,
  'BK020', 't35e FULL gratis kedua nomor sama');
update public.merchant_settings set max_active_per_phone = 2
  where merchant_id = '35353535-0000-0000-0000-000000000001';

-- 35f. REQUEST tanpa DP tetap butuh koneksi payment.
select pg_temp.expect_fail_code(
  $q$select * from pg_temp.cb35(5, 6, '+6281335000006', false)$q$,
  'BK021', 't35f REQUEST tanpa DP tanpa koneksi payment');

-- 35g. ON_SITE tanpa auto-confirm dan tanpa koneksi payment diterima sebagai REQUESTED.
update public.merchant_settings set auto_confirm_on_site = false
  where merchant_id = '35353535-0000-0000-0000-000000000001';
select pg_temp.check35('t35g ON_SITE manual tanpa koneksi -> REQUESTED 0/450000', 6, 7, '+6281335000007', 'REQUESTED', 0, 450000, 'ON_SITE', false);
update public.merchant_settings set auto_confirm_on_site = true
  where merchant_id = '35353535-0000-0000-0000-000000000001';

-- 35h. NULL pada keputusan/kehadiran ditolak, bukan diam-diam dianggap tolak/tidak datang.
select pg_temp.ins34('+6281343000035', 'REQUESTED', now() + interval '5 days', 100000, 0, now() + interval '1 day');
select pg_temp.act34('t35h decide_booking_request NULL ditolak', '34343434-0000-0000-0000-000000000001',
  format('select * from public.decide_booking_request(%L, null)', pg_temp.id34('+6281343000035')), '22004');
select case when status = 'REQUESTED' then 'OK   t35h permintaan tetap REQUESTED'
            else 'FAIL t35h permintaan jadi ' || status end as t35h1
from public.bookings where customer_whatsapp = '+6281343000035';
select pg_temp.ins34('+6281343000036', 'CONFIRMED', now() - interval '3 hours', 0, 100000);
select pg_temp.act34('t35h mark_booking_attendance NULL ditolak', '34343434-0000-0000-0000-000000000001',
  format('select public.mark_booking_attendance(%L, null)', pg_temp.id34('+6281343000036')), '22004');
select case when no_show_at is null and attended_at is null then 'OK   t35h kehadiran tidak tercatat'
            else 'FAIL t35h kehadiran tercatat' end as t35h2
from public.bookings where customer_whatsapp = '+6281343000036';

-- ===========================================================================
-- 36. Booking manual dan jadwal ulang merchant (20261115000600)
-- ===========================================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('36363636-0000-0000-0000-000000000001', 'manual36-a@example.com', '{}'::jsonb),
  ('36363636-0000-0000-0000-000000000002', 'manual36-b@example.com', '{}'::jsonb),
  ('36363636-0000-0000-0000-000000000003', 'manual36-c@example.com', '{}'::jsonb),
  ('36363636-0000-0000-0000-000000000004', 'manual36-d@example.com', '{}'::jsonb);
update public.merchants set username = 'manual-36', subscription_tier = 'PRO'
  where id = '36363636-0000-0000-0000-000000000001';
update public.merchants set subscription_tier = 'PRO'
  where id = '36363636-0000-0000-0000-000000000004';
update public.merchants set subscription_tier = 'STUDIO'
  where id = '36363636-0000-0000-0000-000000000002';
update public.merchants set subscription_tier = 'STARTER'
  where id = '36363636-0000-0000-0000-000000000003';

-- Ketiga merchant buka setiap hari 09:00-17:00. Merchant 0001 tanpa baris payment_connections.
insert into public.availability (merchant_id, day_of_week, start_time, end_time)
select m, d, '09:00', '17:00'
from unnest(array['36363636-0000-0000-0000-000000000001', '36363636-0000-0000-0000-000000000002',
                  '36363636-0000-0000-0000-000000000003', '36363636-0000-0000-0000-000000000004']::uuid[]) m,
     generate_series(1, 7) d;

insert into public.services (id, merchant_id, name, price, duration_minutes, payment_mode, deposit_type, deposit_value, is_active) values
  ('36363636-5e5e-0000-0000-000000000001', '36363636-0000-0000-0000-000000000001', 'Lunas', 350000, 30, 'FULL', null, null, true),
  ('36363636-5e5e-0000-0000-000000000002', '36363636-0000-0000-0000-000000000001', 'Permintaan', 1000000, 30, 'REQUEST', 'FIXED', 100000, true),
  ('36363636-5e5e-0000-0000-000000000003', '36363636-0000-0000-0000-000000000001', 'Nonaktif', 100000, 30, 'FULL', null, null, false),
  ('36363636-5e5e-0000-0000-000000000004', '36363636-0000-0000-0000-000000000002', 'Potong studio', 100000, 30, 'FULL', null, null, true),
  ('36363636-5e5e-0000-0000-000000000005', '36363636-0000-0000-0000-000000000003', 'Potong starter', 100000, 30, 'FULL', null, null, true),
  ('36363636-5e5e-0000-0000-000000000006', '36363636-0000-0000-0000-000000000004', 'Potong batas', 100000, 30, 'FULL', null, null, true);

-- Studio: Ayu (staf A) 09:00-12:00, Bima (staf B) 09:00-17:00.
insert into public.staff (id, merchant_id, name, sort_order) values
  ('36363636-57af-0000-0000-000000000001', '36363636-0000-0000-0000-000000000002', 'Ayu', 0),
  ('36363636-57af-0000-0000-000000000002', '36363636-0000-0000-0000-000000000002', 'Bima', 1);
insert into public.staff_availability (staff_id, merchant_id, day_of_week, start_time, end_time)
select '36363636-57af-0000-0000-000000000001'::uuid, '36363636-0000-0000-0000-000000000002'::uuid, d, '09:00'::time, '12:00'::time
from generate_series(1, 7) d
union all
select '36363636-57af-0000-0000-000000000002', '36363636-0000-0000-0000-000000000002', d, '09:00', '17:00'
from generate_series(1, 7) d;

-- Booking manual lewat RPC; dipanggil di dalam blok set local role authenticated.
create or replace function pg_temp.mb36(p_service integer, p_start timestamptz, p_phone text, p_staff integer default null)
returns setof uuid language plpgsql as $$
begin
  return query select r.id from public.create_manual_booking(
    ('36363636-5e5e-0000-0000-' || lpad(p_service::text, 12, '0'))::uuid,
    p_start, 'Pelanggan 36', p_phone,
    case when p_staff is not null then ('36363636-57af-0000-0000-' || lpad(p_staff::text, 12, '0'))::uuid end) r;
end $$;

-- Booking langsung (status tertentu), dicari lewat nomor.
create or replace function pg_temp.ins36(p_merchant integer, p_phone text, p_status public.booking_status,
  p_start timestamptz, p_expires timestamptz default null, p_staff integer default null)
returns uuid language sql as $$
  insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime,
    customer_name, customer_whatsapp, status, expires_at, amount_due_now, amount_due_on_site, payment_mode, staff_id, staff_name)
  values (('36363636-0000-0000-0000-' || lpad(p_merchant::text, 12, '0'))::uuid, 'Layanan 36', 100000, 30,
    p_start, p_start + interval '30 minutes', 'Pelanggan 36', p_phone, p_status,
    coalesce(p_expires, now() + interval '15 minutes'), 0, 100000, 'ON_SITE',
    case when p_staff is not null then ('36363636-57af-0000-0000-' || lpad(p_staff::text, 12, '0'))::uuid end,
    case p_staff when 1 then 'Ayu' when 2 then 'Bima' end)
  returning id;
$$;

create or replace function pg_temp.id36(p_phone text) returns uuid language sql as $$
  select id from public.bookings where customer_whatsapp = p_phone;
$$;

-- 36a. Manual selalu bayar di tempat dan langsung CONFIRMED, apa pun cara bayar layanannya.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '36363636-0000-0000-0000-000000000001';
select pg_temp.expect_ok($q$select * from pg_temp.mb36(1, pg_temp.jakarta_future(3, 1, '09:00'), '+6281336000001')$q$,
  't36a manual layanan FULL');
select pg_temp.expect_ok($q$select * from pg_temp.mb36(2, pg_temp.jakarta_future(3, 1, '10:00'), '+6281336000002')$q$,
  't36a manual layanan REQUEST');
commit;
select case when status = 'CONFIRMED' and payment_mode = 'ON_SITE' and amount_due_now = 0
             and amount_due_on_site = 350000 and source::text = 'MANUAL'
            then 'OK   t36a FULL manual -> CONFIRMED ON_SITE 0/350000 MANUAL'
            else 'FAIL t36a FULL manual -> ' || status || ' ' || payment_mode || ' ' || amount_due_now
              || '/' || amount_due_on_site end as t36a1
from public.bookings where customer_whatsapp = '+6281336000001';
select case when status = 'CONFIRMED' and payment_mode = 'ON_SITE' and amount_due_now = 0
             and amount_due_on_site = 1000000 and source::text = 'MANUAL'
            then 'OK   t36a REQUEST manual -> CONFIRMED ON_SITE 0/1000000 MANUAL'
            else 'FAIL t36a REQUEST manual -> ' || status || ' ' || payment_mode || ' ' || amount_due_now
              || '/' || amount_due_on_site end as t36a2
from public.bookings where customer_whatsapp = '+6281336000002';

-- 36b. Tanpa koneksi payment (t36a), dan aturan bayar di tempat / batas per nomor tidak berlaku.
select case when not exists (select 1 from public.payment_connections
                              where merchant_id = '36363636-0000-0000-0000-000000000001')
             and (select count(*) from public.bookings
                  where merchant_id = '36363636-0000-0000-0000-000000000001') = 2
            then 'OK   t36b merchant tanpa koneksi payment bisa membuat booking manual'
            else 'FAIL t36b merchant tanpa koneksi payment' end as t36b1;
update public.merchant_settings set allow_pay_on_site = false, max_active_per_phone = 1
  where merchant_id = '36363636-0000-0000-0000-000000000001';
begin;
set local role authenticated;
set local request.jwt.claim.sub = '36363636-0000-0000-0000-000000000001';
select pg_temp.expect_ok($q$select * from pg_temp.mb36(1, pg_temp.jakarta_future(3, 1, '11:00'), '+6281336000003')$q$,
  't36b manual pertama nomor sama');
select pg_temp.expect_ok($q$select * from pg_temp.mb36(1, pg_temp.jakarta_future(3, 1, '12:00'), '+6281336000003')$q$,
  't36b manual kedua nomor sama (bukan BK020)');
commit;
select case when count(*) = 2 and bool_and(payment_mode = 'ON_SITE' and status = 'CONFIRMED')
            then 'OK   t36b allow_pay_on_site=false tidak mengubah manual jadi FULL'
            else 'FAIL t36b ' || count(*) || ' booking manual nomor sama' end as t36b2
from public.bookings where customer_whatsapp = '+6281336000003';
update public.merchant_settings set allow_pay_on_site = true, max_active_per_phone = 2
  where merchant_id = '36363636-0000-0000-0000-000000000001';

-- 36c. RPC tidak menulis notification_log (notifikasi dikirim dari TS).
select case when count(*) = 0 then 'OK   t36c RPC tidak membuat baris notification_log'
            else 'FAIL t36c ' || count(*) || ' baris notification_log' end as t36c
from public.notification_log where merchant_id = '36363636-0000-0000-0000-000000000001';

-- 36d. Bentrok, jam kerja, masa lalu, dan layanan.
select pg_temp.ins36(1, '+6281336000010', 'CONFIRMED', pg_temp.jakarta_future(3, 2, '09:00'));
select pg_temp.ins36(1, '+6281336000011', 'PENDING', pg_temp.jakarta_future(3, 2, '10:00'), now() + interval '10 minutes');
begin;
set local role authenticated;
set local request.jwt.claim.sub = '36363636-0000-0000-0000-000000000001';
select pg_temp.expect_fail_code($q$select * from pg_temp.mb36(1, pg_temp.jakarta_future(3, 2, '09:00'), '+6281336000015')$q$,
  '23P01', 't36d manual di slot CONFIRMED');
select pg_temp.expect_fail_code($q$select * from pg_temp.mb36(1, pg_temp.jakarta_future(3, 2, '10:00'), '+6281336000015')$q$,
  '23P01', 't36d manual di slot PENDING yang belum kedaluwarsa');
select pg_temp.expect_fail_code($q$select * from pg_temp.mb36(1, pg_temp.jakarta_future(3, 2, '20:00'), '+6281336000015')$q$,
  'BK001', 't36d manual jam 20:00 WIB');
select pg_temp.expect_fail_code($q$select * from pg_temp.mb36(1, now() - interval '1 hour', '+6281336000015')$q$,
  'P0006', 't36d manual di masa lalu');
select pg_temp.expect_fail_code($q$select * from pg_temp.mb36(3, pg_temp.jakarta_future(3, 2, '13:00'), '+6281336000015')$q$,
  'P0005', 't36d manual layanan nonaktif');
select pg_temp.expect_fail_code($q$select * from pg_temp.mb36(4, pg_temp.jakarta_future(3, 2, '13:00'), '+6281336000015')$q$,
  'P0005', 't36d manual layanan milik merchant lain');
commit;

-- 36e. REQUESTED kedaluwarsa tidak menghalangi manual, lalu dibatalkan.
select pg_temp.ins36(1, '+6281336000012', 'REQUESTED', pg_temp.jakarta_future(3, 2, '11:00'), now() - interval '1 minute');
begin;
set local role authenticated;
set local request.jwt.claim.sub = '36363636-0000-0000-0000-000000000001';
select pg_temp.expect_ok($q$select * from pg_temp.mb36(1, pg_temp.jakarta_future(3, 2, '11:00'), '+6281336000013')$q$,
  't36e manual di slot REQUESTED kedaluwarsa');
commit;
select case when status = 'CANCELLED' and cancel_reason = 'Permintaan tidak dijawab dalam batas waktu'
            then 'OK   t36e REQUESTED kedaluwarsa dibatalkan dengan alasan permintaan'
            else 'FAIL t36e status lama = ' || status || ' ' || coalesce(cancel_reason, 'NULL') end as t36e
from public.bookings where customer_whatsapp = '+6281336000012';

-- 36f. Studio: Ayu sudah dipesan jam 10:00; "siapa saja" jatuh ke Bima, Ayu langsung bentrok.
select pg_temp.ins36(2, '+6281336000040', 'CONFIRMED', pg_temp.jakarta_future(3, 1, '10:00'), null, 1);
begin;
set local role authenticated;
set local request.jwt.claim.sub = '36363636-0000-0000-0000-000000000002';
select pg_temp.expect_ok($q$select * from pg_temp.mb36(4, pg_temp.jakarta_future(3, 1, '10:00'), '+6281336000041')$q$,
  't36f manual siapa saja jam 10:00');
select pg_temp.expect_fail_code($q$select * from pg_temp.mb36(4, pg_temp.jakarta_future(3, 1, '10:00'), '+6281336000042', 1)$q$,
  '23P01', 't36f manual untuk Ayu yang sudah dipesan');
commit;
select case when staff_name = 'Bima' then 'OK   t36f siapa saja ditugaskan ke Bima'
            else 'FAIL t36f siapa saja ditugaskan ke ' || coalesce(staff_name, 'NULL') end as t36f
from public.bookings where customer_whatsapp = '+6281336000041';

-- 36g. Kuota STARTER tetap berlaku untuk booking manual.
select pg_temp.ins36(3, '+62813360001' || lpad(i::text, 2, '0'), 'CONFIRMED',
  pg_temp.jakarta_future(3, 1, '09:00') + i * interval '30 minutes')
from generate_series(0, 9) i;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '36363636-0000-0000-0000-000000000003';
select pg_temp.expect_fail_code($q$select * from pg_temp.mb36(5, pg_temp.jakarta_future(3, 2, '09:00'), '+6281336000050')$q$,
  'P0002', 't36g manual STARTER melewati kuota');
commit;

-- 36h. create_booking lama (tanpa p_source) tetap ONLINE.
begin;
set local role service_role;
select pg_temp.expect_ok(
  $q$select * from public.create_booking(
       '36363636-0000-0000-0000-000000000001', '36363636-5e5e-0000-0000-000000000001',
       pg_temp.jakarta_future(3, 2, '12:00'), 'Pelanggan 36', '+6281336000014')$q$,
  't36h create_booking lewat service_role tanpa p_source');
commit;
select case when source::text = 'ONLINE' and status = 'PENDING'
            then 'OK   t36h booking online tersimpan source ONLINE'
            else 'FAIL t36h source = ' || coalesce(source::text, 'NULL') || ' status = ' || status end as t36h
from public.bookings where customer_whatsapp = '+6281336000014';

-- 36i. Jadwal ulang: pindah slot, durasi tetap, pengingat H-1 dihapus.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '36363636-0000-0000-0000-000000000001';
select pg_temp.expect_ok($q$select * from pg_temp.mb36(1, pg_temp.jakarta_future(3, 3, '10:00'), '+6281336000020')$q$,
  't36i siapkan booking manual jam 10:00');
commit;
insert into public.notification_log (booking_id, merchant_id, kind, channel, status) values
  (pg_temp.id36('+6281336000020'), '36363636-0000-0000-0000-000000000001', 'REMINDER_CUSTOMER', 'WHATSAPP', 'SENT'),
  (pg_temp.id36('+6281336000020'), '36363636-0000-0000-0000-000000000001', 'BOOKING_CONFIRMED_CUSTOMER', 'WHATSAPP', 'SENT');
select pg_temp.ins36(1, '+6281336000021', 'CONFIRMED', pg_temp.jakarta_future(3, 3, '15:00'));
select pg_temp.ins36(1, '+6281336000022', 'CONFIRMED', pg_temp.jakarta_future(3, 4, '09:00'));
update public.bookings set attended_at = now() where customer_whatsapp = '+6281336000022';
select pg_temp.ins36(1, '+6281336000023', 'CANCELLED', pg_temp.jakarta_future(3, 4, '10:00'));
select pg_temp.ins36(1, '+6281336000024', 'PENDING', pg_temp.jakarta_future(3, 4, '11:00'), now() + interval '10 minutes');
begin;
set local role authenticated;
set local request.jwt.claim.sub = '36363636-0000-0000-0000-000000000001';
select pg_temp.expect_ok(
  format('select public.reschedule_booking_by_merchant(%L, %L)',
    pg_temp.id36('+6281336000020'), pg_temp.jakarta_future(3, 3, '13:00')),
  't36i jadwal ulang 10:00 ke 13:00');
select pg_temp.expect_fail_code(
  format('select public.reschedule_booking_by_merchant(%L, %L)',
    pg_temp.id36('+6281336000020'), pg_temp.jakarta_future(3, 3, '15:00')),
  '23P01', 't36i jadwal ulang ke slot booking lain');
select pg_temp.expect_fail_code(
  format('select public.reschedule_booking_by_merchant(%L, %L)',
    pg_temp.id36('+6281336000020'), pg_temp.jakarta_future(3, 3, '20:00')),
  'BK001', 't36i jadwal ulang ke 20:00 WIB');
select pg_temp.expect_fail_code(
  format('select public.reschedule_booking_by_merchant(%L, %L)',
    pg_temp.id36('+6281336000020'), now() - interval '1 hour'),
  'P0006', 't36i jadwal ulang ke masa lalu');
select pg_temp.expect_fail_code(
  format('select public.reschedule_booking_by_merchant(%L, %L)',
    pg_temp.id36('+6281336000022'), pg_temp.jakarta_future(3, 4, '14:00')),
  'BK034', 't36i jadwal ulang booking yang kehadirannya sudah dicatat');
select pg_temp.expect_fail_code(
  format('select public.reschedule_booking_by_merchant(%L, %L)',
    pg_temp.id36('+6281336000023'), pg_temp.jakarta_future(3, 4, '14:00')),
  'BK034', 't36i jadwal ulang booking CANCELLED');
select pg_temp.expect_fail_code(
  format('select public.reschedule_booking_by_merchant(%L, %L)',
    pg_temp.id36('+6281336000024'), pg_temp.jakarta_future(3, 4, '14:00')),
  'BK034', 't36i jadwal ulang booking PENDING');
select pg_temp.expect_fail_code(
  format('select public.reschedule_booking_by_merchant(%L, %L)',
    pg_temp.id36('+6281336000040'), pg_temp.jakarta_future(3, 4, '14:00')),
  'BK034', 't36i jadwal ulang booking merchant lain');
commit;
select case when start_datetime = pg_temp.jakarta_future(3, 3, '13:00')
             and end_datetime - start_datetime = interval '30 minutes'
            then 'OK   t36i jam mulai pindah ke 13:00, durasi tetap 30 menit'
            else 'FAIL t36i ' || start_datetime || ' - ' || end_datetime end as t36i1
from public.bookings where customer_whatsapp = '+6281336000020';
select case when count(*) filter (where kind = 'REMINDER_CUSTOMER') = 0
             and count(*) filter (where kind = 'BOOKING_CONFIRMED_CUSTOMER') = 1
            then 'OK   t36i pengingat H-1 dihapus, notifikasi konfirmasi tetap'
            else 'FAIL t36i notification_log ' || count(*) || ' baris' end as t36i2
from public.notification_log where booking_id = pg_temp.id36('+6281336000020');
-- Satu jadwal ulang berhasil, tiga gagal (23P01, BK001, P0006): penghitung hanya naik sekali.
select case when merchant_reschedule_count = 1
            then 'OK   t36i jadwal ulang gagal tidak menaikkan merchant_reschedule_count'
            else 'FAIL t36i merchant_reschedule_count = ' || merchant_reschedule_count end as t36i3
from public.bookings where customer_whatsapp = '+6281336000020';

-- 36j. Geser 15 menit di hari yang sama: tidak bentrok dengan dirinya sendiri.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '36363636-0000-0000-0000-000000000001';
select pg_temp.expect_ok($q$select * from pg_temp.mb36(1, pg_temp.jakarta_future(3, 5, '10:00'), '+6281336000030')$q$,
  't36j siapkan booking manual jam 10:00');
select pg_temp.expect_ok(
  format('select public.reschedule_booking_by_merchant(%L, %L)',
    pg_temp.id36('+6281336000030'), pg_temp.jakarta_future(3, 5, '10:15')),
  't36j jadwal ulang 10:00 ke 10:15');
commit;
select case when start_datetime = pg_temp.jakarta_future(3, 5, '10:15')
            then 'OK   t36j jam mulai pindah ke 10:15'
            else 'FAIL t36j jam mulai ' || start_datetime end as t36j
from public.bookings where customer_whatsapp = '+6281336000030';

-- 36k. Studio: jadwal ulang mengikuti jam kerja staf booking itu.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '36363636-0000-0000-0000-000000000002';
select pg_temp.expect_fail_code(
  format('select public.reschedule_booking_by_merchant(%L, %L)',
    pg_temp.id36('+6281336000040'), pg_temp.jakarta_future(3, 1, '14:00')),
  'BK001', 't36k Ayu dijadwal ulang ke 14:00 (di luar jamnya)');
select pg_temp.expect_ok(
  format('select public.reschedule_booking_by_merchant(%L, %L)',
    pg_temp.id36('+6281336000040'), pg_temp.jakarta_future(3, 1, '11:00')),
  't36k Ayu dijadwal ulang ke 11:00');
commit;
select case when staff_id = '36363636-57af-0000-0000-000000000001'
            then 'OK   t36k staf booking tetap Ayu setelah jadwal ulang'
            else 'FAIL t36k staf berubah jadi ' || coalesce(staff_id::text, 'NULL') end as t36k
from public.bookings where customer_whatsapp = '+6281336000040';

-- 36k2. Staf booking sudah nonaktif: BK003 (Ayu masih aktif, jadi kalender per staf tetap dipakai).
select pg_temp.ins36(2, '+6281336000043', 'CONFIRMED', pg_temp.jakarta_future(3, 2, '10:00'), null, 2);
update public.staff set is_active = false where id = '36363636-57af-0000-0000-000000000002';
begin;
set local role authenticated;
set local request.jwt.claim.sub = '36363636-0000-0000-0000-000000000002';
select pg_temp.expect_fail_code(
  format('select public.reschedule_booking_by_merchant(%L, %L)',
    pg_temp.id36('+6281336000043'), pg_temp.jakarta_future(3, 2, '11:00')),
  'BK003', 't36k jadwal ulang booking milik staf nonaktif');
commit;
update public.staff set is_active = true where id = '36363636-57af-0000-0000-000000000002';

-- 36l. Hak akses.
select
  case when has_function_privilege('anon', 'public.create_manual_booking(uuid, timestamptz, text, text, uuid, integer, uuid, text, uuid, integer)', 'EXECUTE')
         or has_function_privilege('anon', 'public.reschedule_booking_by_merchant(uuid, timestamptz)', 'EXECUTE')
       then 'FAIL t36l anon bisa EXECUTE RPC merchant'
       when not (has_function_privilege('authenticated', 'public.create_manual_booking(uuid, timestamptz, text, text, uuid, integer, uuid, text, uuid, integer)', 'EXECUTE')
         and has_function_privilege('authenticated', 'public.reschedule_booking_by_merchant(uuid, timestamptz)', 'EXECUTE'))
       then 'FAIL t36l authenticated tidak bisa EXECUTE RPC merchant'
       else 'OK   t36l RPC merchant hanya untuk authenticated' end as t36l1,
  case when has_function_privilege('anon', 'public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source, text, integer, uuid, uuid, text, uuid, uuid, text, text, text, text, uuid, integer)', 'EXECUTE')
         or has_function_privilege('authenticated', 'public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source, text, integer, uuid, uuid, text, uuid, uuid, text, text, text, text, uuid, integer)', 'EXECUTE')
         or has_function_privilege('anon', 'public.reap_expired_bookings_for(uuid)', 'EXECUTE')
         or has_function_privilege('authenticated', 'public.reap_expired_bookings_for(uuid)', 'EXECUTE')
       then 'FAIL t36l anon/authenticated bisa EXECUTE create_booking/reap_expired_bookings_for'
       else 'OK   t36l create_booking dan reap_expired_bookings_for tertutup' end as t36l2,
  case when to_regprocedure('public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean)') is null
       then 'OK   t36l signature tujuh argumen sudah dihapus'
       else 'FAIL t36l signature tujuh argumen masih ada' end as t36l3,
  case when has_column_privilege('authenticated', 'public.bookings', 'source', 'UPDATE')
         or has_column_privilege('anon', 'public.bookings', 'source', 'SELECT')
       then 'FAIL t36l kolom source bisa diubah authenticated / dibaca anon'
       else 'OK   t36l kolom source tidak bisa diubah authenticated / dibaca anon' end as t36l4,
  case when has_column_privilege('authenticated', 'public.bookings', 'merchant_reschedule_count', 'UPDATE')
       then 'FAIL t36l authenticated bisa UPDATE merchant_reschedule_count'
       else 'OK   t36l authenticated tidak bisa UPDATE merchant_reschedule_count' end as t36l5;

-- 36m. Tanpa klaim sub ditolak 42501.
begin;
set local role authenticated;
select pg_temp.expect_fail_code($q$select * from pg_temp.mb36(1, pg_temp.jakarta_future(3, 6, '09:00'), '+6281336000060')$q$,
  '42501', 't36m create_manual_booking tanpa login');
commit;

-- 36n. Maksimal 50 booking manual per 24 jam, termasuk yang sudah CANCELLED.
-- 49 disisipkan langsung (satu CANCELLED), ke-50 lewat RPC lolos, ke-51 BK035.
insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime,
  customer_name, customer_whatsapp, status, amount_due_now, amount_due_on_site, payment_mode, source)
select '36363636-0000-0000-0000-000000000004', 'Layanan 36', 100000, 30,
  pg_temp.jakarta_future(3, 1, '09:00') + i * interval '1 day',
  pg_temp.jakarta_future(3, 1, '09:30') + i * interval '1 day',
  'Pelanggan 36', '+62813360002' || lpad(i::text, 2, '0'),
  case when i = 0 then 'CANCELLED' else 'CONFIRMED' end::public.booking_status,
  0, 100000, 'ON_SITE', 'MANUAL'
from generate_series(0, 48) i;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '36363636-0000-0000-0000-000000000004';
select pg_temp.expect_ok($q$select * from pg_temp.mb36(6, pg_temp.jakarta_future(3, 1, '10:00'), '+6281336000300')$q$,
  't36n booking manual ke-50 dalam 24 jam');
select pg_temp.expect_fail_code($q$select * from pg_temp.mb36(6, pg_temp.jakarta_future(3, 1, '11:00'), '+6281336000301')$q$,
  'BK035', 't36n booking manual ke-51 (yang CANCELLED ikut terhitung)');
commit;

-- 36o. Booking PAID bisa dijadwal ulang; maksimal 3 kali (BK036).
select pg_temp.ins36(1, '+6281336000025', 'PAID', pg_temp.jakarta_future(3, 6, '09:00'));
begin;
set local role authenticated;
set local request.jwt.claim.sub = '36363636-0000-0000-0000-000000000001';
select pg_temp.expect_ok(
  format('select public.reschedule_booking_by_merchant(%L, %L)',
    pg_temp.id36('+6281336000025'), pg_temp.jakarta_future(3, 6, '10:00')),
  't36o jadwal ulang booking PAID ke-1');
select pg_temp.expect_ok(
  format('select public.reschedule_booking_by_merchant(%L, %L)',
    pg_temp.id36('+6281336000025'), pg_temp.jakarta_future(3, 6, '11:00')),
  't36o jadwal ulang ke-2');
select pg_temp.expect_ok(
  format('select public.reschedule_booking_by_merchant(%L, %L)',
    pg_temp.id36('+6281336000025'), pg_temp.jakarta_future(3, 6, '12:00')),
  't36o jadwal ulang ke-3');
select pg_temp.expect_fail_code(
  format('select public.reschedule_booking_by_merchant(%L, %L)',
    pg_temp.id36('+6281336000025'), pg_temp.jakarta_future(3, 6, '13:00')),
  'BK036', 't36o jadwal ulang ke-4');
commit;
select case when merchant_reschedule_count = 3 and status = 'PAID'
             and start_datetime = pg_temp.jakarta_future(3, 6, '12:00')
            then 'OK   t36o PAID tetap PAID di 12:00, merchant_reschedule_count = 3'
            else 'FAIL t36o ' || status || ' ' || start_datetime || ' count ' || merchant_reschedule_count end as t36o
from public.bookings where customer_whatsapp = '+6281336000025';

-- ===========================================================================
-- 37. Fungsi baca dashboard (20261115000700)
-- ===========================================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('37373737-0000-0000-0000-000000000001', 'dash37-a@example.com', '{}'::jsonb),
  ('37373737-0000-0000-0000-000000000002', 'dash37-b@example.com', '{}'::jsonb);
update public.merchants set username = 'dash-37', subscription_tier = 'PRO'
  where id = '37373737-0000-0000-0000-000000000001';
update public.merchants set subscription_tier = 'PRO'
  where id = '37373737-0000-0000-0000-000000000002';

-- Merchant 0001: satu baris per tab yang diharapkan (kunci = customer_name).
insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime,
  customer_name, customer_whatsapp, status, expires_at, payment_mode, amount_due_now, amount_due_on_site,
  attended_at, no_show_at, paid_on_site_at, paid_on_site_method)
select '37373737-0000-0000-0000-000000000001', 'Layanan 37', v.price, 30,
  now() + v.off, now() + v.off + interval '30 minutes', v.name,
  '+62813370000' || lpad(v.n::text, 2, '0'), v.status::public.booking_status,
  now() + v.exp, 'ON_SITE', v.price - v.onsite, v.onsite,
  v.att, v.noshow, v.paidsite, case when v.paidsite is not null then 'CASH'::public.on_site_payment_method end
from (values
  (1,  'ACTION_requested', 'REQUESTED', interval '3 days',            interval '1 hour',   100000, 0,      null::timestamptz, null::timestamptz, null::timestamptz),
  (2,  'ACTION_pending',   'PENDING',   interval '4 days',            interval '10 minutes', 100000, 0,    null, null, null),
  (3,  'ACTION_unmarked',  'CONFIRMED', interval '-2 days',           interval '15 minutes', 100000, 0,    null, null, null),
  (4,  'ACTION_unpaid',    'PAID',      interval '-1 day',            interval '15 minutes', 350000, 245000, now() - interval '1 day', null, null),
  (5,  'UPCOMING_tomorrow','CONFIRMED', interval '1 day',             interval '15 minutes', 100000, 0,    null, null, null),
  (6,  'UPCOMING_soon',    'PAID',      interval '2 hours',           interval '15 minutes', 100000, 0,    null, null, null),
  (7,  'HISTORY_done',     'CONFIRMED', interval '-2 days -5 hours',  interval '15 minutes', 100000, 100000, now() - interval '2 days', null, now() - interval '2 days'),
  (8,  'HISTORY_old',      'CONFIRMED', interval '-10 days',          interval '15 minutes', 100000, 0,    null, null, null),
  (9,  'HISTORY_noshow',   'CONFIRMED', interval '-1 day -5 hours',   interval '15 minutes', 100000, 100000, null, now() - interval '1 day', null),
  (10, 'CANCELLED_status', 'CANCELLED', interval '5 days',            interval '15 minutes', 100000, 0,    null, null, null),
  (11, 'CANCELLED_stale',  'PENDING',   interval '6 days',            interval '-1 hour',    100000, 0,    null, null, null)
) as v(n, name, status, off, exp, price, onsite, att, noshow, paidsite);

-- 37a. booking_tab: tab tiap baris sama dengan awalan namanya.
select case when count(*) = 11 and count(*) filter (where public.booking_tab(b) = split_part(b.customer_name, '_', 1)) = 11
            then 'OK   t37a booking_tab: 11 baris masuk tab yang diharapkan'
            else 'FAIL t37a booking_tab salah: ' || coalesce(string_agg(b.customer_name || '=' || public.booking_tab(b), ', ')
                   filter (where public.booking_tab(b) <> split_part(b.customer_name, '_', 1)), '') end as t37a
from public.bookings b where b.merchant_id = '37373737-0000-0000-0000-000000000001';

-- Merchant 0002: ringkasan minggu dan bukti isolasi merchant.
insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime,
  customer_name, customer_whatsapp, status, paid_at, expires_at, payment_mode, amount_due_now, amount_due_on_site,
  attended_at, no_show_at, paid_on_site_at, paid_on_site_method)
select '37373737-0000-0000-0000-000000000002', 'Layanan 37', v.price, 30,
  now() + v.off, now() + v.off + interval '30 minutes', v.name,
  '+62813370001' || lpad(v.n::text, 2, '0'), v.status::public.booking_status,
  v.paid, now() + interval '15 minutes', 'ON_SITE', v.price - v.onsite, v.onsite,
  v.att, v.noshow, v.paidsite, case when v.paidsite is not null then 'CASH'::public.on_site_payment_method end
from (values
  (1, 'B1', 'PAID',      interval '-1 day',   350000, 245000, now() - interval '1 day',   now() - interval '1 day', null::timestamptz, now() - interval '1 day'),
  (2, 'B2', 'CONFIRMED', interval '-2 days',  450000, 450000, null::timestamptz,          now() - interval '2 days', null, now() - interval '2 days'),
  (3, 'B3', 'CONFIRMED', interval '-1 day -3 hours', 200000, 200000, null,                 null, now() - interval '1 day', null),
  (4, 'B4', 'PAID',      interval '-10 days', 350000, 0,      now() - interval '10 days', null, null, null),
  (5, 'B5', 'CANCELLED', interval '-1 day -6 hours', 100000, 0, null,                      null, null, null)
) as v(n, name, status, off, price, onsite, paid, att, noshow, paidsite);

-- 37b. Tab ACTION: tepat empat id merchant 0001, tak satu pun milik 0002.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '37373737-0000-0000-0000-000000000001';
select case when count(*) = 4 and bool_and(customer_name like 'ACTION\_%') and bool_and(merchant_id = '37373737-0000-0000-0000-000000000001')
            then 'OK   t37b bookings_in_tab(ACTION): empat baris milik sendiri'
            else 'FAIL t37b ' || count(*) || ' baris' end as t37b
from public.bookings_in_tab('ACTION');
commit;

-- 37c. Tab di luar empat nilai ditolak 22023.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '37373737-0000-0000-0000-000000000001';
select pg_temp.expect_fail_code($q$select * from public.bookings_in_tab('SEMUA')$q$, '22023', 't37c tab tidak dikenal');
select pg_temp.expect_fail_code($q$select * from public.bookings_in_tab(null)$q$, '22023', 't37c tab null');
commit;

-- 37d. dashboard_tab_counts() = (4, 2).
begin;
set local role authenticated;
set local request.jwt.claim.sub = '37373737-0000-0000-0000-000000000001';
select case when action_count = 4 and upcoming_count = 2 then 'OK   t37d dashboard_tab_counts = (4, 2)'
            else 'FAIL t37d (' || action_count || ', ' || upcoming_count || ')' end as t37d
from public.dashboard_tab_counts();
commit;

-- 37e. dashboard_week_summary untuk merchant 0002.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '37373737-0000-0000-0000-000000000002';
select case when bookings = 3 and online_revenue = 105000 and on_site_revenue = 695000
             and no_show = 1 and attendance_marked = 3
            then 'OK   t37e dashboard_week_summary = (3, 105000, 695000, 1, 3)'
            else 'FAIL t37e (' || bookings || ', ' || online_revenue || ', ' || on_site_revenue || ', '
                 || no_show || ', ' || attendance_marked || ')' end as t37e
from public.dashboard_week_summary();
commit;

-- 37f. Tanpa klaim sub: kosong, bukan error.
begin;
set local role authenticated;
select case when (select count(*) from public.bookings_in_tab('ACTION')) = 0
             and (select action_count + upcoming_count from public.dashboard_tab_counts()) = 0
            then 'OK   t37f tanpa sub: 0 baris dan hitungan (0, 0)'
            else 'FAIL t37f tanpa sub bocor' end as t37f;
commit;

-- 37g. Hak akses.
select
  case when has_function_privilege('anon', 'public.booking_tab(public.bookings)', 'EXECUTE')
         or has_function_privilege('authenticated', 'public.booking_tab(public.bookings)', 'EXECUTE')
       then 'FAIL t37g booking_tab bisa di-EXECUTE anon/authenticated'
       else 'OK   t37g booking_tab tertutup' end as t37g1,
  case when has_function_privilege('authenticated', 'public.bookings_in_tab(text)', 'EXECUTE')
        and has_function_privilege('authenticated', 'public.dashboard_tab_counts()', 'EXECUTE')
        and has_function_privilege('authenticated', 'public.dashboard_week_summary()', 'EXECUTE')
       then 'OK   t37g authenticated bisa memanggil ketiga RPC'
       else 'FAIL t37g authenticated tidak bisa memanggil RPC' end as t37g2,
  case when has_function_privilege('anon', 'public.bookings_in_tab(text)', 'EXECUTE')
         or has_function_privilege('anon', 'public.dashboard_tab_counts()', 'EXECUTE')
         or has_function_privilege('anon', 'public.dashboard_week_summary()', 'EXECUTE')
       then 'FAIL t37g anon bisa memanggil RPC'
       else 'OK   t37g anon tidak bisa memanggil RPC' end as t37g3;

-- ===========================================================================
-- 40. Kebijakan dan kontak merchant (20261116000200)
-- ===========================================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('40404040-0000-0000-0000-000000000001', 'kelola40-a@example.com', '{}'::jsonb),
  ('40404040-0000-0000-0000-000000000002', 'kelola40-b@example.com', '{}'::jsonb);
update public.merchants set username = 'kelola-40', subscription_tier = 'PRO'
  where id = '40404040-0000-0000-0000-000000000001';
update public.merchants set subscription_tier = 'PRO'
  where id = '40404040-0000-0000-0000-000000000002';

-- Merchant 0001 buka setiap hari 09:00-17:00.
insert into public.availability (merchant_id, day_of_week, start_time, end_time)
select '40404040-0000-0000-0000-000000000001', d, '09:00', '17:00' from generate_series(1, 7) d;

insert into public.services (id, merchant_id, name, price, duration_minutes, payment_mode, is_active) values
  ('40404040-5e5e-0000-0000-000000000001', '40404040-0000-0000-0000-000000000001', 'Layanan 40', 100000, 60, 'ON_SITE', true);

-- Token akses tetap: repeat(huruf, 48).
create or replace function pg_temp.tok40(p_char text) returns text language sql immutable as $$
  select repeat(p_char, 48);
$$;

-- Booking 60 menit milik merchant 0001, disisipkan langsung.
create or replace function pg_temp.ins40(p_char text, p_status public.booking_status, p_start timestamptz,
  p_expires timestamptz default null)
returns uuid language sql as $$
  insert into public.bookings (merchant_id, service_id, service_name, service_price, duration_minutes,
    start_datetime, end_datetime, customer_name, customer_whatsapp, status, expires_at,
    amount_due_now, amount_due_on_site, payment_mode, access_token)
  values ('40404040-0000-0000-0000-000000000001', '40404040-5e5e-0000-0000-000000000001', 'Layanan 40', 100000, 60,
    p_start, p_start + interval '60 minutes', 'Pelanggan 40', '+62814040000' || ascii(p_char), p_status,
    coalesce(p_expires, now() + interval '15 minutes'), 0, 100000, 'ON_SITE', pg_temp.tok40(p_char))
  returning id;
$$;

create or replace function pg_temp.id40(p_char text) returns uuid language sql as $$
  select id from public.bookings where access_token = pg_temp.tok40(p_char);
$$;

-- 40a. Default kebijakan (Keputusan 2) dan pengingat.
select case when not allow_customer_reschedule and reschedule_min_hours = 24 and max_reschedules = 1
             and not allow_customer_cancel and cancel_min_hours = 24
             and policy_text is null and contact_phone is null and contact_email is null
             and contact_instagram is null and contact_threads is null and contact_x is null and contact_tiktok is null
             and contact_hidden = '{}' and reply_from is null and reply_until is null
             and reminder_whatsapp and reminder_email and reminder_push and reminder_day_before
             and not reminder_same_day
            then 'OK   t40a default kebijakan, kontak, dan pengingat'
            else 'FAIL t40a default kebijakan/kontak/pengingat salah' end as t40a
from public.merchant_settings where merchant_id = '40404040-0000-0000-0000-000000000001';

-- 40b. Check constraint.
select pg_temp.expect_fail_code($q$update public.merchant_settings set max_reschedules = 0
  where merchant_id = '40404040-0000-0000-0000-000000000001'$q$, '23514', 't40b max_reschedules = 0');
select pg_temp.expect_fail_code($q$update public.merchant_settings set reschedule_min_hours = 169
  where merchant_id = '40404040-0000-0000-0000-000000000001'$q$, '23514', 't40b reschedule_min_hours = 169');
select pg_temp.expect_fail_code($q$update public.merchant_settings set contact_instagram = 'a b'
  where merchant_id = '40404040-0000-0000-0000-000000000001'$q$, '23514', 't40b contact_instagram berspasi');
select pg_temp.expect_fail_code($q$update public.merchant_settings set contact_phone = '0812'
  where merchant_id = '40404040-0000-0000-0000-000000000001'$q$, '23514', 't40b contact_phone bukan E.164');
select pg_temp.expect_fail_code($q$update public.merchant_settings set contact_email = 'bukan'
  where merchant_id = '40404040-0000-0000-0000-000000000001'$q$, '23514', 't40b contact_email tanpa @');
select pg_temp.expect_fail_code($q$update public.merchant_settings set reply_from = '09:00'
  where merchant_id = '40404040-0000-0000-0000-000000000001'$q$, '23514', 't40b reply_from tanpa reply_until');
select pg_temp.expect_fail_code($q$update public.merchant_settings set reply_from = '20:00', reply_until = '09:00'
  where merchant_id = '40404040-0000-0000-0000-000000000001'$q$, '23514', 't40b reply_from setelah reply_until');
select pg_temp.expect_fail_code($q$update public.merchant_settings set policy_text = repeat('x', 501)
  where merchant_id = '40404040-0000-0000-0000-000000000001'$q$, '23514', 't40b policy_text 501 karakter');

-- 40c. authenticated hanya bisa mengubah baris miliknya.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '40404040-0000-0000-0000-000000000001';
with u as (
  update public.merchant_settings
    set allow_customer_cancel = true, contact_instagram = 'kelola.40', reminder_same_day = true
    where merchant_id = '40404040-0000-0000-0000-000000000001'
    returning 1)
select case when count(*) = 1 then 'OK   t40c merchant mengubah kebijakan miliknya'
            else 'FAIL t40c ' || count(*) || ' baris milik sendiri berubah' end as t40c1
from u;
with u as (
  update public.merchant_settings set allow_customer_cancel = true
    where merchant_id = '40404040-0000-0000-0000-000000000002'
    returning 1)
select case when count(*) = 0 then 'OK   t40c baris merchant lain tidak berubah'
            else 'FAIL t40c ' || count(*) || ' baris merchant lain berubah' end as t40c2
from u;
commit;
select case when allow_customer_cancel and contact_instagram = 'kelola.40' and reminder_same_day
            then 'OK   t40c perubahan tersimpan'
            else 'FAIL t40c perubahan tidak tersimpan' end as t40c3
from public.merchant_settings where merchant_id = '40404040-0000-0000-0000-000000000001';
update public.merchant_settings set allow_customer_cancel = false, contact_instagram = null, reminder_same_day = false
  where merchant_id = '40404040-0000-0000-0000-000000000001';

-- 40d. Hak akses kolom.
select
  case when has_column_privilege('anon', 'public.merchant_settings', 'policy_text', 'SELECT')
         or has_column_privilege('anon', 'public.merchant_settings', 'contact_email', 'SELECT')
         or has_column_privilege('anon', 'public.merchant_settings', 'contact_phone', 'SELECT')
       then 'FAIL t40d anon bisa membaca kebijakan/kontak'
       else 'OK   t40d anon tidak bisa membaca kebijakan/kontak' end as t40d1,
  case when has_column_privilege('anon', 'public.bookings', 'reschedule_count', 'SELECT')
       then 'FAIL t40d anon bisa membaca reschedule_count'
       else 'OK   t40d anon tidak bisa membaca reschedule_count' end as t40d2,
  case when has_column_privilege('authenticated', 'public.bookings', 'reschedule_count', 'UPDATE')
       then 'FAIL t40d authenticated bisa UPDATE reschedule_count'
       else 'OK   t40d authenticated tidak bisa UPDATE reschedule_count' end as t40d3;

-- 40e. Segmen /sw dicadangkan.
select case when exists (select 1 from public.reserved_usernames where name = 'sw')
            then 'OK   t40e sw ada di reserved_usernames'
            else 'FAIL t40e sw belum dicadangkan' end as t40e;

-- ===========================================================================
-- 41. Ubah jadwal oleh pelanggan (20261116000200)
-- ===========================================================================

update public.merchant_settings
  set allow_customer_reschedule = true, reschedule_min_hours = 24, max_reschedules = 1
  where merchant_id = '40404040-0000-0000-0000-000000000001';

select pg_temp.ins40('a', 'CONFIRMED', pg_temp.jakarta_future(3, 1, '10:00'));
select pg_temp.ins40('b', 'CONFIRMED', pg_temp.jakarta_future(1, 2, '10:00'));
select pg_temp.ins40('c', 'CONFIRMED', pg_temp.jakarta_future(1, 3, '10:00'));
select pg_temp.ins40('d', 'CONFIRMED', now() + interval '5 hours');
select pg_temp.ins40('e', 'PENDING', pg_temp.jakarta_future(1, 4, '10:00'));
select pg_temp.ins40('g', 'REQUESTED', pg_temp.jakarta_future(1, 5, '10:00'), now() + interval '1 hour');
select pg_temp.ins40('h', 'CANCELLED', pg_temp.jakarta_future(1, 6, '10:00'));
select pg_temp.ins40('i', 'CONFIRMED', pg_temp.jakarta_future(1, 7, '10:00'));
update public.bookings set attended_at = now() where access_token = pg_temp.tok40('i');
select pg_temp.ins40('j', 'PAID', pg_temp.jakarta_future(1, 8, '10:00'));
select pg_temp.ins40('k', 'CONFIRMED', pg_temp.jakarta_future(1, 9, '10:00'));
select pg_temp.ins40('l', 'CONFIRMED', pg_temp.jakarta_future(1, 10, '10:00'));

insert into public.notification_log (booking_id, merchant_id, kind, channel, status)
select pg_temp.id40('a'), '40404040-0000-0000-0000-000000000001', k::public.notification_kind, 'WHATSAPP', 'SENT'
from unnest(array['REMINDER_CUSTOMER', 'REMINDER_CUSTOMER_SAME_DAY', 'BOOKING_RESCHEDULED_MERCHANT',
                  'BOOKING_CONFIRMED_CUSTOMER']) k;
insert into public.notification_log (booking_id, merchant_id, kind, channel, status)
select pg_temp.id40('k'), '40404040-0000-0000-0000-000000000001', k::public.notification_kind, 'WHATSAPP', 'SENT'
from unnest(array['REMINDER_CUSTOMER_SAME_DAY', 'BOOKING_CONFIRMED_CUSTOMER']) k;

-- Panggil reschedule_booking; kembalikan "id|old_start" atau "ERR <sqlstate>".
create or replace function pg_temp.rs40(p_char text, p_new timestamptz) returns text language plpgsql as $$
declare r record;
begin
  select * into r from public.reschedule_booking(pg_temp.tok40(p_char), p_new);
  return r.booking_id || '|' || r.old_start;
exception when others then
  return 'ERR ' || sqlstate || ' ' || sqlerrm;
end $$;

create or replace function pg_temp.rs40sql(p_char text, p_new timestamptz) returns text language sql as $$
  select format('select * from public.reschedule_booking(%L, %L)', pg_temp.tok40(p_char), p_new);
$$;

-- 41a. CONFIRMED X ke Y: kembalian (id, X), durasi tetap, penghitung naik, pengingat dihapus.
begin;
set local role service_role;
select case when pg_temp.rs40('a', pg_temp.jakarta_future(4, 1, '11:00'))
                 = pg_temp.id40('a') || '|' || pg_temp.jakarta_future(3, 1, '10:00')
            then 'OK   t41a reschedule_booking mengembalikan (id, jam lama)'
            else 'FAIL t41a kembalian reschedule_booking salah' end as t41a1;
commit;
select case when start_datetime = pg_temp.jakarta_future(4, 1, '11:00')
             and end_datetime - start_datetime = interval '60 minutes' and reschedule_count = 1
            then 'OK   t41a jam pindah, durasi tetap 60 menit, reschedule_count = 1'
            else 'FAIL t41a ' || start_datetime || ' - ' || end_datetime || ' count ' || reschedule_count end as t41a2
from public.bookings where access_token = pg_temp.tok40('a');
select case when count(*) = 1 and bool_and(kind = 'BOOKING_CONFIRMED_CUSTOMER')
            then 'OK   t41a log pengingat dan pemberitahuan ubah jadwal dihapus, konfirmasi tetap'
            else 'FAIL t41a notification_log ' || count(*) || ' baris' end as t41a3
from public.notification_log where booking_id = pg_temp.id40('a');

-- 41b-41g. Penolakan.
begin;
set local role service_role;
select pg_temp.expect_fail_code(pg_temp.rs40sql('a', pg_temp.jakarta_future(4, 1, '13:00')),
  'BK043', 't41b ubah jadwal kedua melewati max_reschedules');
select pg_temp.expect_fail_code(pg_temp.rs40sql('b', now() + interval '2 hours'),
  'BK046', 't41e jadwal baru 2 jam lagi (min 24)');
select pg_temp.expect_fail_code(pg_temp.rs40sql('b', pg_temp.jakarta_future(1, 3, '10:00')),
  '23P01', 't41f ke slot booking CONFIRMED lain');
select pg_temp.expect_fail_code(pg_temp.rs40sql('b', pg_temp.jakarta_future(1, 2, '20:00')),
  'BK001', 't41f ke 20:00 WIB');
select pg_temp.expect_fail_code(pg_temp.rs40sql('d', pg_temp.jakarta_future(1, 2, '14:00')),
  'BK042', 't41d booking mulai 5 jam lagi (min 24)');
select pg_temp.expect_fail_code(pg_temp.rs40sql('e', pg_temp.jakarta_future(1, 4, '14:00')),
  'BK040', 't41g booking PENDING');
select pg_temp.expect_fail_code(pg_temp.rs40sql('g', pg_temp.jakarta_future(1, 5, '14:00')),
  'BK040', 't41g booking REQUESTED');
select pg_temp.expect_fail_code(pg_temp.rs40sql('h', pg_temp.jakarta_future(1, 6, '14:00')),
  'BK040', 't41g booking CANCELLED');
select pg_temp.expect_fail_code(pg_temp.rs40sql('i', pg_temp.jakarta_future(1, 7, '14:00')),
  'BK040', 't41g booking yang kehadirannya sudah dicatat');
select pg_temp.expect_fail_code(pg_temp.rs40sql('f', pg_temp.jakarta_future(1, 2, '14:00')),
  'BK040', 't41g token tidak dikenal');
commit;

update public.merchant_settings set reschedule_min_hours = 0
  where merchant_id = '40404040-0000-0000-0000-000000000001';
begin;
set local role service_role;
select pg_temp.expect_fail_code(pg_temp.rs40sql('b', now() - interval '1 hour'),
  'P0006', 't41e min 0, jadwal baru di masa lalu');
commit;
update public.merchant_settings set allow_customer_reschedule = false, reschedule_min_hours = 24
  where merchant_id = '40404040-0000-0000-0000-000000000001';
begin;
set local role service_role;
select pg_temp.expect_fail_code(pg_temp.rs40sql('b', pg_temp.jakarta_future(1, 2, '14:00')),
  'BK041', 't41c merchant tidak mengizinkan ubah jadwal');
commit;
update public.merchant_settings set allow_customer_reschedule = true
  where merchant_id = '40404040-0000-0000-0000-000000000001';
select case when start_datetime = pg_temp.jakarta_future(1, 2, '10:00') and reschedule_count = 0
            then 'OK   t41b-g percobaan gagal tidak mengubah jam dan penghitung'
            else 'FAIL t41b-g booking b berubah: ' || start_datetime || ' count ' || reschedule_count end as t41g
from public.bookings where access_token = pg_temp.tok40('b');

-- 41h. PAID sama seperti CONFIRMED.
begin;
set local role service_role;
select pg_temp.expect_ok(pg_temp.rs40sql('j', pg_temp.jakarta_future(1, 8, '14:00')), 't41h ubah jadwal booking PAID');
commit;
select case when start_datetime = pg_temp.jakarta_future(1, 8, '14:00') and status = 'PAID' and reschedule_count = 1
            then 'OK   t41h PAID pindah ke 14:00, tetap PAID, reschedule_count = 1'
            else 'FAIL t41h ' || status || ' ' || start_datetime || ' count ' || reschedule_count end as t41h
from public.bookings where access_token = pg_temp.tok40('j');

-- 41i. Jadwal ulang merchant lewat helper yang sama.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '40404040-0000-0000-0000-000000000001';
select pg_temp.expect_ok(
  format('select public.reschedule_booking_by_merchant(%L, %L)',
    pg_temp.id40('k'), pg_temp.jakarta_future(1, 9, '12:00')),
  't41i jadwal ulang oleh merchant');
commit;
select case when start_datetime = pg_temp.jakarta_future(1, 9, '12:00') and reschedule_count = 0
             and merchant_reschedule_count = 1
            then 'OK   t41i merchant: reschedule_count tetap 0, merchant_reschedule_count = 1'
            else 'FAIL t41i ' || start_datetime || ' count ' || reschedule_count
              || ' merchant ' || merchant_reschedule_count end as t41i1
from public.bookings where access_token = pg_temp.tok40('k');
select case when count(*) = 1 and bool_and(kind = 'BOOKING_CONFIRMED_CUSTOMER')
            then 'OK   t41i pengingat hari H dihapus oleh jadwal ulang merchant'
            else 'FAIL t41i notification_log ' || count(*) || ' baris' end as t41i2
from public.notification_log where booking_id = pg_temp.id40('k');

-- 41j. Hak akses.
select
  case when has_function_privilege('anon', 'public.reschedule_booking(text, timestamptz)', 'EXECUTE')
         or has_function_privilege('authenticated', 'public.reschedule_booking(text, timestamptz)', 'EXECUTE')
         or has_function_privilege('anon', 'public.cancel_booking_by_customer(text)', 'EXECUTE')
         or has_function_privilege('authenticated', 'public.cancel_booking_by_customer(text)', 'EXECUTE')
         or has_function_privilege('anon', 'public.move_booking_slot(uuid, uuid, timestamptz)', 'EXECUTE')
         or has_function_privilege('authenticated', 'public.move_booking_slot(uuid, uuid, timestamptz)', 'EXECUTE')
       then 'FAIL t41j anon/authenticated bisa EXECUTE RPC pelanggan atau move_booking_slot'
       else 'OK   t41j RPC pelanggan dan move_booking_slot tertutup untuk anon/authenticated' end as t41j1,
  case when has_function_privilege('service_role', 'public.reschedule_booking(text, timestamptz)', 'EXECUTE')
        and has_function_privilege('service_role', 'public.cancel_booking_by_customer(text)', 'EXECUTE')
       then 'OK   t41j service_role bisa EXECUTE RPC pelanggan'
       else 'FAIL t41j service_role tidak bisa EXECUTE RPC pelanggan' end as t41j2;

-- 41l. Geser 30 menit di hari yang sama: tidak bentrok dengan dirinya sendiri.
begin;
set local role service_role;
select pg_temp.expect_ok(pg_temp.rs40sql('l', pg_temp.jakarta_future(1, 10, '10:30')), 't41l geser 10:00 ke 10:30');
commit;
select case when start_datetime = pg_temp.jakarta_future(1, 10, '10:30')
            then 'OK   t41l jam mulai pindah ke 10:30'
            else 'FAIL t41l jam mulai ' || start_datetime end as t41l
from public.bookings where access_token = pg_temp.tok40('l');

-- ===========================================================================
-- 42. Batal oleh pelanggan (20261116000200)
-- ===========================================================================

update public.merchant_settings set allow_customer_cancel = true, cancel_min_hours = 24
  where merchant_id = '40404040-0000-0000-0000-000000000001';

select pg_temp.ins40('m', 'CONFIRMED', pg_temp.jakarta_future(2, 2, '10:00'));
select pg_temp.ins40('o', 'CONFIRMED', pg_temp.jakarta_future(2, 3, '10:00'));
select pg_temp.ins40('p', 'CONFIRMED', now() + interval '7 hours');
select pg_temp.ins40('q', 'REQUESTED', pg_temp.jakarta_future(2, 4, '10:00'), now() + interval '1 hour');
select pg_temp.ins40('r', 'REQUESTED', now() - interval '1 hour', now() + interval '1 hour');
select pg_temp.ins40('s', 'PENDING', pg_temp.jakarta_future(2, 5, '10:00'));
select pg_temp.ins40('t', 'CANCELLED', pg_temp.jakarta_future(2, 6, '10:00'));
select pg_temp.ins40('u', 'CONFIRMED', pg_temp.jakarta_future(2, 7, '10:00'));
update public.bookings set no_show_at = now() where access_token = pg_temp.tok40('u');
select pg_temp.ins40('v', 'PAID', pg_temp.jakarta_future(2, 8, '10:00'));

create or replace function pg_temp.cc40sql(p_char text) returns text language sql as $$
  select format('select * from public.cancel_booking_by_customer(%L)', pg_temp.tok40(p_char));
$$;

-- 42a. CONFIRMED dibatalkan, slot langsung lepas.
begin;
set local role service_role;
select case when (select booking_id from public.cancel_booking_by_customer(pg_temp.tok40('m'))) = pg_temp.id40('m')
            then 'OK   t42a cancel_booking_by_customer mengembalikan id booking'
            else 'FAIL t42a kembalian cancel_booking_by_customer salah' end as t42a1;
commit;
select case when status = 'CANCELLED' and cancelled_at is not null and cancel_reason = 'Dibatalkan pelanggan'
            then 'OK   t42a CONFIRMED -> CANCELLED dengan alasan pelanggan'
            else 'FAIL t42a ' || status || ' ' || coalesce(cancel_reason, 'NULL') end as t42a2
from public.bookings where access_token = pg_temp.tok40('m');
select pg_temp.expect_ok($q$select pg_temp.ins40('n', 'CONFIRMED', pg_temp.jakarta_future(2, 2, '10:00'))$q$,
  't42a booking baru di slot yang dibatalkan');

-- 42b-42d. Penolakan.
update public.merchant_settings set allow_customer_cancel = false
  where merchant_id = '40404040-0000-0000-0000-000000000001';
begin;
set local role service_role;
select pg_temp.expect_fail_code(pg_temp.cc40sql('o'), 'BK044', 't42b merchant tidak mengizinkan batal');
select pg_temp.expect_ok(pg_temp.cc40sql('q'), 't42c REQUESTED masa depan tetap bisa batal');
commit;
update public.merchant_settings set allow_customer_cancel = true
  where merchant_id = '40404040-0000-0000-0000-000000000001';
begin;
set local role service_role;
select pg_temp.expect_fail_code(pg_temp.cc40sql('p'), 'BK045', 't42b booking mulai 7 jam lagi (min 24)');
select pg_temp.expect_fail_code(pg_temp.cc40sql('r'), 'BK040', 't42c REQUESTED yang sudah mulai');
select pg_temp.expect_fail_code(pg_temp.cc40sql('s'), 'BK040', 't42d booking PENDING');
select pg_temp.expect_fail_code(pg_temp.cc40sql('t'), 'BK040', 't42d booking CANCELLED');
select pg_temp.expect_fail_code(pg_temp.cc40sql('u'), 'BK040', 't42d booking no-show');
select pg_temp.expect_fail_code(pg_temp.cc40sql('f'), 'BK040', 't42d token tidak dikenal');
select pg_temp.expect_ok(pg_temp.cc40sql('v'), 't42e batal booking PAID');
commit;
select case when status = 'CANCELLED' then 'OK   t42c REQUESTED masa depan jadi CANCELLED'
            else 'FAIL t42c REQUESTED jadi ' || status end as t42c
from public.bookings where access_token = pg_temp.tok40('q');
select case when status = 'CANCELLED' and cancel_reason = 'Dibatalkan pelanggan'
            then 'OK   t42e PAID jadi CANCELLED'
            else 'FAIL t42e PAID jadi ' || status end as t42e
from public.bookings where access_token = pg_temp.tok40('v');
select case when count(*) filter (where status = 'CANCELLED') = 0
            then 'OK   t42b-d booking yang ditolak tidak berubah'
            else 'FAIL t42b-d ' || count(*) filter (where status = 'CANCELLED') || ' booking ikut batal' end as t42d
from public.bookings where access_token in (pg_temp.tok40('o'), pg_temp.tok40('p'), pg_temp.tok40('u'));

-- ===========================================================================
-- 43. Preferensi pengingat dan langganan push (20261116000300)
-- ===========================================================================

-- Memakai merchant, layanan, dan helper ins40 dari bagian 40.
select pg_temp.ins40('A', 'CONFIRMED', pg_temp.jakarta_future(3, 2, '10:00'));
select pg_temp.ins40('B', 'CANCELLED', pg_temp.jakarta_future(3, 3, '10:00'));
select pg_temp.ins40('C', 'CONFIRMED', pg_temp.jakarta_future(3, 4, '10:00'));
select pg_temp.ins40('D', 'CONFIRMED', now() - interval '3 days');
select pg_temp.ins40('E', 'CONFIRMED', now() + interval '7 days');

-- 43a. Prefs minimal dan check email.
insert into public.booking_reminder_prefs (booking_id, merchant_id)
values (pg_temp.id40('A'), '40404040-0000-0000-0000-000000000001');
select case when whatsapp and email is null and day_before is null and same_day is null
            then 'OK   t43a default prefs pengingat'
            else 'FAIL t43a default prefs salah' end as t43a
from public.booking_reminder_prefs where booking_id = pg_temp.id40('A');
select pg_temp.expect_fail_code($q$update public.booking_reminder_prefs set email = 'bukan-email'
  where email is null$q$, '23514', 't43a email tidak valid');

-- 43b. Unik per (booking, endpoint) dan format hash.
insert into public.push_subscriptions (booking_id, merchant_id, endpoint_hash, subscription_enc)
select pg_temp.id40(c), '40404040-0000-0000-0000-000000000001', repeat('a', 64), 'v1.x.y.z'
from unnest(array['A', 'B', 'D', 'E']) c;
select pg_temp.expect_fail_code(format($q$insert into public.push_subscriptions
  (booking_id, merchant_id, endpoint_hash, subscription_enc)
  values (%L, '40404040-0000-0000-0000-000000000001', repeat('a', 64), 'v1.x.y.z')$q$, pg_temp.id40('A')),
  '23505', 't43b langganan ganda');
select pg_temp.expect_fail_code(format($q$insert into public.push_subscriptions
  (booking_id, merchant_id, endpoint_hash, subscription_enc)
  values (%L, '40404040-0000-0000-0000-000000000001', 'xyz', 'v1.x.y.z')$q$, pg_temp.id40('C')),
  '23514', 't43b endpoint_hash bukan hex 64');

-- 43e. Prune: CANCELLED dan selesai > 1 hari lalu hilang, sisanya tetap.
begin;
set local role service_role;
select case when public.prune_push_subscriptions() = 2
            then 'OK   t43e prune menghapus 2 langganan'
            else 'FAIL t43e prune tidak menghapus 2' end as t43e1;
commit;
select case when count(*) = 2 and bool_and(booking_id in (pg_temp.id40('A'), pg_temp.id40('E')))
            then 'OK   t43e langganan booking aktif tetap'
            else 'FAIL t43e sisa langganan salah' end as t43e2
from public.push_subscriptions;

-- 43c. Hapus booking menghapus prefs dan langganannya.
delete from public.bookings where id = pg_temp.id40('A');
select case when not exists (select 1 from public.booking_reminder_prefs where booking_id = pg_temp.id40('A'))
             and not exists (select 1 from public.push_subscriptions where booking_id = pg_temp.id40('A'))
            then 'OK   t43c hapus booking ikut menghapus prefs dan langganan'
            else 'FAIL t43c anak tidak terhapus' end as t43c;

-- 43d. Tanpa hak untuk anon/authenticated.
select case when not exists (
  select 1 from unnest(array['anon', 'authenticated']) r,
    unnest(array['booking_reminder_prefs', 'push_subscriptions']) t,
    unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
  where has_table_privilege(r, 'public.' || t, p))
  then 'OK   t43d anon dan authenticated tanpa hak di tabel pengingat/push'
  else 'FAIL t43d ada hak tabel bocor' end as t43d;

-- 43f. Prune tertutup.
select case when not has_function_privilege('anon', 'public.prune_push_subscriptions()', 'EXECUTE')
             and not has_function_privilege('authenticated', 'public.prune_push_subscriptions()', 'EXECUTE')
             and has_function_privilege('service_role', 'public.prune_push_subscriptions()', 'EXECUTE')
            then 'OK   t43f prune_push_subscriptions hanya service_role'
            else 'FAIL t43f hak EXECUTE prune salah' end as t43f;

-- ===========================================================================
-- 45. Voucher: skema dan hak akses (20261117000100)
-- ===========================================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('45454545-0000-0000-0000-000000000001', 'promo45-a@example.com', '{}'::jsonb),
  ('45454545-0000-0000-0000-000000000002', 'promo45-b@example.com', '{}'::jsonb),
  ('45454545-0000-0000-0000-000000000003', 'promo45-c@example.com', '{}'::jsonb),
  ('45454545-0000-0000-0000-000000000004', 'promo45-d@example.com', '{}'::jsonb);
update public.merchants set username = 'promo-45', subscription_tier = 'PRO'
  where id = '45454545-0000-0000-0000-000000000001';
update public.merchants set subscription_tier = 'PRO'
  where id in ('45454545-0000-0000-0000-000000000002', '45454545-0000-0000-0000-000000000004');
insert into public.availability (merchant_id, day_of_week, start_time, end_time)
select '45454545-0000-0000-0000-000000000001', d, '09:00', '17:00' from generate_series(1, 7) d;
insert into public.services (id, merchant_id, name, price, duration_minutes, payment_mode, is_active) values
  ('45454545-5e5e-0000-0000-000000000001', '45454545-0000-0000-0000-000000000001', 'Layanan A', 350000, 60, 'FULL', true),
  ('45454545-5e5e-0000-0000-000000000002', '45454545-0000-0000-0000-000000000001', 'Layanan B', 450000, 60, 'ON_SITE', true),
  ('45454545-5e5e-0000-0000-000000000003', '45454545-0000-0000-0000-000000000001', 'Layanan nonaktif', 350000, 60, 'FULL', false);

-- Sisip voucher merchant 0001 dengan kolom opsional lewat jsonb (superuser).
create or replace function pg_temp.v45(p_code text, p_kind text, p_value integer, p_extra jsonb default '{}'::jsonb,
  p_merchant uuid default '45454545-0000-0000-0000-000000000001')
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.vouchers (merchant_id, code, kind, value, max_discount, min_spend, service_ids, quota,
    per_phone_limit, new_customer_only, visibility, starts_at, ends_at)
  select p_merchant, p_code, p_kind::public.voucher_kind, p_value,
    (p_extra->>'max_discount')::integer, (p_extra->>'min_spend')::integer,
    case when p_extra ? 'service_ids' then coalesce(
      (select array_agg(x::uuid) from jsonb_array_elements_text(p_extra->'service_ids') x), '{}') end,
    (p_extra->>'quota')::integer, (p_extra->>'per_phone_limit')::integer,
    coalesce((p_extra->>'new_customer_only')::boolean, false),
    coalesce(p_extra->>'visibility', 'PUBLIC')::public.voucher_visibility,
    (p_extra->>'starts_at')::timestamptz, (p_extra->>'ends_at')::timestamptz
  returning id into v_id;
  return v_id;
end $$;

-- Sisip booking merchant 0001 (Layanan A, 350000). Kode voucher null = tanpa voucher.
create or replace function pg_temp.b45(p_code text, p_phone text, p_status text, p_discount numeric default 0,
  p_start timestamptz default null, p_expires timestamptz default now() + interval '15 minutes',
  p_created timestamptz default now())
returns uuid language plpgsql as $$
declare v_id uuid; v_start timestamptz;
begin
  v_start := coalesce(p_start, now() + interval '30 days'
    + (select count(*) from public.bookings where merchant_id = '45454545-0000-0000-0000-000000000001') * interval '2 hours');
  insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime,
    customer_name, customer_whatsapp, status, expires_at, amount_due_now, amount_due_on_site,
    voucher_id, voucher_code, discount_amount, created_at)
  values ('45454545-0000-0000-0000-000000000001', 'Layanan A', 350000, 60, v_start, v_start + interval '1 hour',
    'Uji 45', p_phone, p_status::public.booking_status, p_expires, 350000 - p_discount, 0,
    (select id from public.vouchers where merchant_id = '45454545-0000-0000-0000-000000000001' and code = p_code),
    p_code, p_discount, p_created)
  returning id into v_id;
  return v_id;
end $$;

-- 45a. Constraint voucher.
select pg_temp.expect_fail_code($q$select pg_temp.v45('ab12', 'PERCENT', 10)$q$, '23514', 't45a kode huruf kecil');
select pg_temp.expect_fail_code($q$select pg_temp.v45('ABC', 'PERCENT', 10)$q$, '23514', 't45a kode 3 karakter');
select pg_temp.expect_fail_code($q$select pg_temp.v45('ABCDEFGHIJ1234567', 'PERCENT', 10)$q$, '23514', 't45a kode 17 karakter');
select pg_temp.expect_fail_code($q$select pg_temp.v45('PERSEN101', 'PERCENT', 101)$q$, '23514', 't45a PERCENT 101');
select pg_temp.expect_fail_code($q$select pg_temp.v45('PERSEN0', 'PERCENT', 0)$q$, '23514', 't45a PERCENT 0');
select pg_temp.expect_fail_code($q$select pg_temp.v45('TETAP0', 'FIXED', 0)$q$, '23514', 't45a FIXED 0');
select pg_temp.expect_fail_code($q$select pg_temp.v45('TETAPMAX', 'FIXED', 10000, '{"max_discount": 5000}')$q$,
  '23514', 't45a max_discount pada FIXED');
select pg_temp.expect_fail_code($q$select pg_temp.v45('KUOTA0', 'PERCENT', 10, '{"quota": 0}')$q$, '23514', 't45a quota 0');
select pg_temp.expect_fail_code($q$select pg_temp.v45('NOMOR0', 'PERCENT', 10, '{"per_phone_limit": 0}')$q$,
  '23514', 't45a per_phone_limit 0');
select pg_temp.expect_fail_code($q$select pg_temp.v45('KOSONG', 'PERCENT', 10, '{"service_ids": []}')$q$,
  '23514', 't45a service_ids kosong');
select pg_temp.expect_fail_code($q$select pg_temp.v45('JADWAL', 'PERCENT', 10,
  '{"starts_at": "2031-01-01 00:00+07", "ends_at": "2031-01-01 00:00+07"}')$q$, '23514', 't45a ends_at <= starts_at');
select pg_temp.expect_fail_code($q$select pg_temp.v45('RHS12', 'PERCENT', 10, '{"visibility": "PRIVATE"}')$q$,
  '23514', 't45a voucher privat 5 karakter');
select pg_temp.expect_ok($q$select pg_temp.v45('RHS123', 'PERCENT', 10, '{"visibility": "PRIVATE"}')$q$,
  't45a voucher privat 6 karakter');
select pg_temp.expect_ok($q$select pg_temp.v45('AB12', 'PERCENT', 10)$q$, 't45a voucher publik 4 karakter');
select pg_temp.expect_ok($q$select pg_temp.v45('PROMO45', 'FIXED', 70000)$q$, 't45a voucher PROMO45');
select pg_temp.expect_fail_code($q$select pg_temp.v45('PROMO45', 'PERCENT', 10)$q$, '23505', 't45a kode ganda di merchant sama');
select pg_temp.expect_ok($q$select pg_temp.v45('PROMO45', 'PERCENT', 10, '{}', '45454545-0000-0000-0000-000000000002')$q$,
  't45a kode sama di merchant lain');

-- 45b. Merchant STARTER tidak bisa membuat voucher.
select pg_temp.expect_fail_code($q$select pg_temp.v45('STARTER1', 'PERCENT', 10, '{}', '45454545-0000-0000-0000-000000000003')$q$,
  'P0001', 't45b voucher untuk STARTER');

-- 45c. Constraint nominal booking dengan diskon.
select pg_temp.expect_ok($q$select pg_temp.b45('PROMO45', '+6281445450100', 'CONFIRMED', 70000)$q$,
  't45c booking diskon 70000 + 280000 = 350000');
select pg_temp.expect_fail_code($q$insert into public.bookings (merchant_id, service_name, service_price, duration_minutes,
     start_datetime, end_datetime, customer_name, customer_whatsapp, status, amount_due_now, amount_due_on_site,
     voucher_code, discount_amount)
   values ('45454545-0000-0000-0000-000000000001', 'Layanan A', 350000, 60, '2033-01-04 09:00+07', '2033-01-04 10:00+07',
     'Uji 45', '+6281445450101', 'CONFIRMED', 350000, 0, 'PROMO45', 70000)$q$, '23514', 't45c jumlah nominal tidak cocok');
select pg_temp.expect_fail_code($q$insert into public.bookings (merchant_id, service_name, service_price, duration_minutes,
     start_datetime, end_datetime, customer_name, customer_whatsapp, status, amount_due_now, amount_due_on_site, discount_amount)
   values ('45454545-0000-0000-0000-000000000001', 'Layanan A', 350000, 60, '2033-01-04 09:00+07', '2033-01-04 10:00+07',
     'Uji 45', '+6281445450102', 'CONFIRMED', 349990, 0, 10)$q$, '23514', 't45c diskon tanpa voucher_code');
insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime,
  customer_name, customer_whatsapp, status)
values ('45454545-0000-0000-0000-000000000004', 'Potong', 350000, 60, '2033-01-05 09:00+07', '2033-01-05 10:00+07',
  'Uji 45', '+6281445450103', 'PAID');
select case when amount_due_now = 350000 and amount_due_on_site = 0 and discount_amount = 0
              and voucher_id is null and voucher_code is null
            then 'OK   t45c insert lama tanpa nominal tetap harga penuh, diskon 0'
            else 'FAIL t45c insert lama tanpa nominal salah' end as t45c
from public.bookings where customer_whatsapp = '+6281445450103';

-- 45d. Hapus voucher: booking kehilangan voucher_id, salinan kode dan diskon tetap.
delete from public.vouchers where merchant_id = '45454545-0000-0000-0000-000000000001' and code = 'PROMO45';
select case when voucher_id is null and voucher_code = 'PROMO45' and discount_amount = 70000
            then 'OK   t45d hapus voucher: voucher_id null, kode dan diskon tetap'
            else 'FAIL t45d snapshot booking berubah' end as t45d
from public.bookings where customer_whatsapp = '+6281445450100';

-- 45e. Hapus merchant yang punya voucher dan booking bervoucher.
select pg_temp.v45('HAPUS45', 'FIXED', 10000, '{}', '45454545-0000-0000-0000-000000000004');
insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime,
  customer_name, customer_whatsapp, status, amount_due_now, amount_due_on_site, voucher_id, voucher_code, discount_amount)
select '45454545-0000-0000-0000-000000000004', 'Potong', 350000, 60, '2033-01-06 09:00+07', '2033-01-06 10:00+07',
  'Uji 45', '+6281445450104', 'CONFIRMED', 340000, 0, v.id, v.code, 10000
from public.vouchers v where v.merchant_id = '45454545-0000-0000-0000-000000000004';
select pg_temp.expect_ok($q$delete from auth.users where id = '45454545-0000-0000-0000-000000000004'$q$,
  't45e hapus merchant dengan voucher dan booking bervoucher');
select case when not exists (select 1 from public.vouchers where merchant_id = '45454545-0000-0000-0000-000000000004')
             and not exists (select 1 from public.bookings where merchant_id = '45454545-0000-0000-0000-000000000004')
            then 'OK   t45e voucher dan booking ikut terhapus'
            else 'FAIL t45e sisa voucher/booking merchant terhapus' end as t45e;

-- 45f. Hak akses.
select
  case when not exists (select 1 from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
                        where has_table_privilege('anon', 'public.vouchers', p))
       then 'OK   t45f anon tanpa hak di vouchers' else 'FAIL t45f anon punya hak di vouchers' end as t45f1,
  case when has_column_privilege('authenticated', 'public.vouchers', 'merchant_id', 'UPDATE')
       then 'FAIL t45f authenticated bisa UPDATE merchant_id'
       else 'OK   t45f authenticated tidak bisa UPDATE merchant_id' end as t45f2,
  case when has_table_privilege('anon', 'public.voucher_attempts', 'SELECT')
         or has_table_privilege('authenticated', 'public.voucher_attempts', 'SELECT')
       then 'FAIL t45f voucher_attempts terbaca' else 'OK   t45f voucher_attempts tertutup' end as t45f3,
  case when exists (select 1 from unnest(array['anon', 'authenticated']) r,
                      unnest(array['public.evaluate_voucher(uuid, text, uuid, text)', 'public.check_voucher(uuid, text, uuid, timestamptz, integer)',
                                   'public.check_voucher_rate_limit(text, uuid)']) f
                    where has_function_privilege(r, f, 'EXECUTE'))
       then 'FAIL t45f fungsi internal voucher terbuka'
       else 'OK   t45f evaluate/check/rate limit tertutup untuk anon dan authenticated' end as t45f4,
  case when has_function_privilege('service_role', 'public.check_voucher(uuid, text, uuid, timestamptz, integer)', 'EXECUTE')
        and has_function_privilege('service_role', 'public.check_voucher_rate_limit(text, uuid)', 'EXECUTE')
       then 'OK   t45f service_role bisa check_voucher dan rate limit'
       else 'FAIL t45f service_role tidak bisa check_voucher/rate limit' end as t45f5,
  case when has_function_privilege('anon', 'public.public_vouchers(uuid)', 'EXECUTE')
       then 'OK   t45f anon bisa public_vouchers' else 'FAIL t45f anon tidak bisa public_vouchers' end as t45f6,
  case when has_function_privilege('authenticated', 'public.voucher_stats()', 'EXECUTE')
        and not has_function_privilege('anon', 'public.voucher_stats()', 'EXECUTE')
       then 'OK   t45f voucher_stats hanya authenticated' else 'FAIL t45f hak voucher_stats salah' end as t45f7;

-- 45g. RLS sebagai merchant 0001.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '45454545-0000-0000-0000-000000000001';
select case when (select count(*) from public.vouchers where merchant_id = '45454545-0000-0000-0000-000000000002') = 0
             and (select count(*) from public.vouchers) > 0
            then 'OK   t45g hanya melihat voucher sendiri' else 'FAIL t45g voucher merchant lain terlihat' end as t45g1;
with u as (update public.vouchers set value = 5 where merchant_id = '45454545-0000-0000-0000-000000000002' returning 1)
select case when (select count(*) from u) = 0
            then 'OK   t45g update voucher merchant lain 0 baris' else 'FAIL t45g voucher merchant lain berubah' end as t45g2;
select pg_temp.expect_fail_code($q$insert into public.vouchers (merchant_id, code, kind, value)
  values ('45454545-0000-0000-0000-000000000002', 'SUSUP45', 'PERCENT', 10)$q$, '42501', 't45g insert untuk merchant lain');
select pg_temp.expect_ok($q$insert into public.vouchers (merchant_id, code, kind, value)
  values ('45454545-0000-0000-0000-000000000001', 'SENDIRI45', 'PERCENT', 10)$q$, 't45g insert voucher sendiri');
rollback;

-- ===========================================================================
-- 46. Voucher: kelayakan, daftar publik, cek kode (20261117000100)
-- ===========================================================================

create or replace function pg_temp.ev46(p_code text, p_phone text default null,
  p_service uuid default '45454545-5e5e-0000-0000-000000000001',
  p_merchant uuid default '45454545-0000-0000-0000-000000000001')
returns text language plpgsql as $$
declare r record;
begin
  select * into r from public.evaluate_voucher(p_merchant, p_code, p_service, p_phone);
  return coalesce(r.reason, 'OK:' || trim_scale(r.discount)::text || ':' || r.code
    || case when r.voucher_id is null then ':tanpa-id' else '' end);
end $$;

select pg_temp.v45('WISUDA20', 'PERCENT', 20, '{"max_discount": 100000}');
select pg_temp.v45('HEMAT50', 'PERCENT', 50, '{"max_discount": 100000}');
select pg_temp.v45('POTONG400', 'FIXED', 400000);
select pg_temp.v45('POTONG349', 'FIXED', 349000);
select pg_temp.v45('GRATIS100', 'PERCENT', 100);
select pg_temp.v45('PUNYAB2', 'PERCENT', 10, '{}', '45454545-0000-0000-0000-000000000002');
select pg_temp.v45('BELUMMULAI', 'PERCENT', 10, jsonb_build_object('starts_at', now() + interval '1 day'));
select pg_temp.v45('SUDAHHABIS', 'PERCENT', 10, jsonb_build_object('ends_at', now() - interval '1 minute'));
select pg_temp.v45('KHUSUSB', 'PERCENT', 10, '{"service_ids": ["45454545-5e5e-0000-0000-000000000002"]}');
select pg_temp.v45('MIN500', 'PERCENT', 10, '{"min_spend": 500000}');
select pg_temp.v45('KUOTA2', 'PERCENT', 10, '{"quota": 2}');
select pg_temp.v45('SEKALI', 'PERCENT', 10, '{"per_phone_limit": 1}');
select pg_temp.v45('BARU46', 'PERCENT', 10, '{"new_customer_only": true}');
select pg_temp.v45('RAHASIA45', 'PERCENT', 10, '{"visibility": "PRIVATE"}');

-- 46a. Rumus diskon.
select case when pg_temp.ev46('WISUDA20') = 'OK:70000:WISUDA20' then 'OK   t46a PERCENT 20 = 70000'
            else 'FAIL t46a PERCENT 20: ' || pg_temp.ev46('WISUDA20') end as t46a1;
select case when pg_temp.ev46('HEMAT50') = 'OK:100000:HEMAT50' then 'OK   t46a PERCENT 50 dibatasi max 100000'
            else 'FAIL t46a PERCENT 50: ' || pg_temp.ev46('HEMAT50') end as t46a2;
select case when pg_temp.ev46('POTONG400') = 'OK:350000:POTONG400' then 'OK   t46a FIXED 400000 dibatasi harga'
            else 'FAIL t46a FIXED 400000: ' || pg_temp.ev46('POTONG400') end as t46a3;
select case when pg_temp.ev46('POTONG349') = 'OK:348500:POTONG349' then 'OK   t46a FIXED 349000 jadi 348500 (harga akhir 1500)'
            else 'FAIL t46a FIXED 349000: ' || pg_temp.ev46('POTONG349') end as t46a4;
select case when pg_temp.ev46('GRATIS100') = 'OK:350000:GRATIS100' then 'OK   t46a PERCENT 100 = harga penuh'
            else 'FAIL t46a PERCENT 100: ' || pg_temp.ev46('GRATIS100') end as t46a5;
select case when pg_temp.ev46('  wisuda20 ') = 'OK:70000:WISUDA20' then 'OK   t46a kode dinormalisasi upper(btrim())'
            else 'FAIL t46a normalisasi kode: ' || pg_temp.ev46('  wisuda20 ') end as t46a6;

-- 46b. Kode tidak ditemukan.
select case when pg_temp.ev46('TIDAKADA') = 'BK050' then 'OK   t46b kode tak dikenal BK050'
            else 'FAIL t46b kode tak dikenal: ' || pg_temp.ev46('TIDAKADA') end as t46b1;
select case when pg_temp.ev46('PUNYAB2') = 'BK050' then 'OK   t46b voucher merchant lain BK050'
            else 'FAIL t46b voucher merchant lain: ' || pg_temp.ev46('PUNYAB2') end as t46b2;
update public.merchants set subscription_tier = 'STARTER' where id = '45454545-0000-0000-0000-000000000001';
select case when pg_temp.ev46('WISUDA20') = 'BK050' and pg_temp.ev46('RAHASIA45') = 'BK050'
            then 'OK   t46b merchant STARTER: semua kode BK050'
            else 'FAIL t46b merchant STARTER: ' || pg_temp.ev46('WISUDA20') end as t46b3;
update public.merchants set subscription_tier = 'PRO' where id = '45454545-0000-0000-0000-000000000001';

-- 46c. Jendela berlaku.
select case when pg_temp.ev46('BELUMMULAI') = 'BK051' and pg_temp.ev46('SUDAHHABIS') = 'BK051'
            then 'OK   t46c belum mulai / sudah berakhir BK051'
            else 'FAIL t46c ' || pg_temp.ev46('BELUMMULAI') || ', ' || pg_temp.ev46('SUDAHHABIS') end as t46c;

-- 46d. Layanan.
select case when pg_temp.ev46('KHUSUSB') = 'BK055' then 'OK   t46d voucher khusus B untuk A BK055'
            else 'FAIL t46d cakupan layanan: ' || pg_temp.ev46('KHUSUSB') end as t46d1;
select case when pg_temp.ev46('KHUSUSB', null, '45454545-5e5e-0000-0000-000000000002') like 'OK:%'
            then 'OK   t46d voucher khusus B berlaku untuk B'
            else 'FAIL t46d voucher khusus B untuk B: ' || pg_temp.ev46('KHUSUSB', null, '45454545-5e5e-0000-0000-000000000002') end as t46d2;
select case when pg_temp.ev46('WISUDA20', null, '45454545-5e5e-0000-0000-000000000003') = 'P0005'
            then 'OK   t46d layanan nonaktif P0005'
            else 'FAIL t46d layanan nonaktif: ' || pg_temp.ev46('WISUDA20', null, '45454545-5e5e-0000-0000-000000000003') end as t46d3;

-- 46e. Minimal transaksi.
select case when pg_temp.ev46('MIN500') = 'BK054' then 'OK   t46e di bawah min_spend BK054'
            else 'FAIL t46e min_spend: ' || pg_temp.ev46('MIN500') end as t46e;

-- 46f. Kuota: hanya booking yang memegang slot dihitung.
select pg_temp.b45('KUOTA2', '+6281445450201', 'CONFIRMED', 10000);
select pg_temp.b45('KUOTA2', '+6281445450202', 'CONFIRMED', 10000);
select case when pg_temp.ev46('KUOTA2') = 'BK052' then 'OK   t46f dua CONFIRMED: kuota 2 habis BK052'
            else 'FAIL t46f kuota habis: ' || pg_temp.ev46('KUOTA2') end as t46f1;
update public.bookings set status = 'CANCELLED', cancelled_at = now(), cancel_reason = 'uji'
  where customer_whatsapp = '+6281445450201';
select case when pg_temp.ev46('KUOTA2') like 'OK:%' then 'OK   t46f CANCELLED membebaskan kuota'
            else 'FAIL t46f setelah batal: ' || pg_temp.ev46('KUOTA2') end as t46f2;
select pg_temp.b45('KUOTA2', '+6281445450203', 'PENDING', 10000, null, now() - interval '1 minute');
select case when pg_temp.ev46('KUOTA2') like 'OK:%' then 'OK   t46f PENDING kedaluwarsa tidak dihitung'
            else 'FAIL t46f PENDING kedaluwarsa dihitung: ' || pg_temp.ev46('KUOTA2') end as t46f3;
select pg_temp.b45('KUOTA2', '+6281445450204', 'PAID', 10000, now() - interval '7 days', now() - interval '7 days',
  now() - interval '40 days');
select case when pg_temp.ev46('KUOTA2') = 'BK052' then 'OK   t46f PAID minggu lalu tetap dihitung'
            else 'FAIL t46f PAID lama tidak dihitung: ' || pg_temp.ev46('KUOTA2') end as t46f4;

-- 46g. Batas per nomor.
select pg_temp.b45('SEKALI', '+6281445450301', 'CONFIRMED', 20000);
select case when pg_temp.ev46('SEKALI', '+6281445450301') = 'BK053'
             and pg_temp.ev46('SEKALI', '+6281445450302') like 'OK:%'
             and pg_temp.ev46('SEKALI', null) like 'OK:%'
            then 'OK   t46g per_phone_limit: X BK053, Y dan tanpa nomor layak'
            else 'FAIL t46g ' || pg_temp.ev46('SEKALI', '+6281445450301') || ', '
                 || pg_temp.ev46('SEKALI', '+6281445450302') || ', ' || pg_temp.ev46('SEKALI', null) end as t46g;

-- 46h. Khusus pelanggan baru.
select pg_temp.b45(null, '+6281445450401', 'CONFIRMED', 0, now() - interval '35 days', now() - interval '35 days',
  now() - interval '35 days');
select pg_temp.b45(null, '+6281445450402', 'CANCELLED');
select case when pg_temp.ev46('BARU46', '+6281445450401') = 'BK056'
             and pg_temp.ev46('BARU46', '+6281445450402') like 'OK:%'
            then 'OK   t46h pelanggan lama BK056, yang hanya batal layak'
            else 'FAIL t46h ' || pg_temp.ev46('BARU46', '+6281445450401') || ', '
                 || pg_temp.ev46('BARU46', '+6281445450402') end as t46h;

-- 46i. public_vouchers sebagai anon.
begin;
set local role anon;
select case when 'WISUDA20' = any (codes)
             and not ('RAHASIA45' = any (codes)) and not ('RHS123' = any (codes))
             and not ('BELUMMULAI' = any (codes)) and not ('SUDAHHABIS' = any (codes))
             and not ('KUOTA2' = any (codes)) and not ('PUNYAB2' = any (codes))
            then 'OK   t46i public_vouchers: hanya publik yang hidup dan kuota tersisa'
            else 'FAIL t46i public_vouchers: ' || array_to_string(codes, ',') end as t46i1
from (select coalesce(array_agg(code), '{}') as codes
      from public.public_vouchers('45454545-0000-0000-0000-000000000001')) s;
commit;
update public.merchants set subscription_tier = 'STARTER' where id = '45454545-0000-0000-0000-000000000001';
begin;
set local role anon;
select case when (select count(*) from public.public_vouchers('45454545-0000-0000-0000-000000000001')) = 0
            then 'OK   t46i public_vouchers kosong untuk merchant STARTER'
            else 'FAIL t46i public_vouchers merchant STARTER tidak kosong' end as t46i2;
commit;
update public.merchants set subscription_tier = 'PRO' where id = '45454545-0000-0000-0000-000000000001';

-- 46j. check_voucher sebagai service_role.
begin;
set local role service_role;
select case when code = 'RAHASIA45' and kind = 'PERCENT' and value = 10 and discount = 35000 and reason is null
            then 'OK   t46j check_voucher kode rahasia: syarat dan diskon'
            else 'FAIL t46j check_voucher kode rahasia salah' end as t46j1
from public.check_voucher('45454545-0000-0000-0000-000000000001', 'rahasia45', '45454545-5e5e-0000-0000-000000000001');
select case when reason = 'BK054' and code is null and kind is null and value is null and min_spend is null
              and discount is null
            then 'OK   t46j check_voucher BK054: hanya reason'
            else 'FAIL t46j check_voucher BK054 membocorkan syarat' end as t46j2
from public.check_voucher('45454545-0000-0000-0000-000000000001', 'MIN500', '45454545-5e5e-0000-0000-000000000001');
commit;

-- 46k. Rate limit cek kode: 10 per (hash, merchant) per 15 menit.
create or replace function pg_temp.rl46()
returns text language plpgsql as $$
declare v_res boolean[] := '{}';
begin
  for i in 1..11 loop
    v_res := v_res || public.check_voucher_rate_limit('hash46', '45454545-0000-0000-0000-000000000001');
  end loop;
  if v_res[1:10] = array_fill(true, array[10]) and not v_res[11]
     and public.check_voucher_rate_limit('hash46-lain', '45454545-0000-0000-0000-000000000001') then
    return 'OK   t46k rate limit: 10 lolos, ke-11 ditolak, hash lain lolos';
  end if;
  return 'FAIL t46k rate limit: ' || array_to_string(v_res, ',');
end $$;
begin;
set local role service_role;
select pg_temp.rl46();
commit;

-- 46l. voucher_stats sebagai merchant.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '45454545-0000-0000-0000-000000000001';
select case when
    (select used = 2 and month_discount = 10000 and month_bookings = 1 from public.voucher_stats() s
     join public.vouchers v on v.id = s.voucher_id where v.code = 'KUOTA2')
    and (select used = 1 and month_discount = 20000 and month_bookings = 1 from public.voucher_stats() s
         join public.vouchers v on v.id = s.voucher_id where v.code = 'SEKALI')
    and (select used = 0 and month_discount = 0 and month_bookings = 0 from public.voucher_stats() s
         join public.vouchers v on v.id = s.voucher_id where v.code = 'WISUDA20')
    and (select count(*) from public.voucher_stats()) = (select count(*) from public.vouchers)
  then 'OK   t46l voucher_stats: used, month_discount, month_bookings sesuai'
  else 'FAIL t46l voucher_stats salah' end as t46l1;
commit;
-- Hitungan baris di atas memakai RLS: authenticated hanya melihat voucher sendiri.
begin;
set local role authenticated;
select pg_temp.expect_fail_code($q$select * from public.voucher_stats()$q$, '42501', 't46l voucher_stats tanpa login');
commit;

-- ===========================================================================
-- 47. create_booking dengan voucher (20261117000200)
-- ===========================================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('47474747-0000-0000-0000-000000000001', 'voucher47@example.com', '{}'::jsonb);
update public.merchants set username = 'voucher-47', subscription_tier = 'PRO'
  where id = '47474747-0000-0000-0000-000000000001';
insert into public.availability (merchant_id, day_of_week, start_time, end_time)
select '47474747-0000-0000-0000-000000000001', d, '09:00', '17:00' from generate_series(1, 7) d;

insert into public.services (id, merchant_id, name, price, duration_minutes, payment_mode, deposit_type, deposit_value) values
  ('47474747-5e5e-0000-0000-000000000001', '47474747-0000-0000-0000-000000000001', 'Bayar penuh', 350000, 60, 'FULL', null, null),
  ('47474747-5e5e-0000-0000-000000000002', '47474747-0000-0000-0000-000000000001', 'DP 30 persen', 350000, 60, 'DEPOSIT', 'PERCENT', 30),
  ('47474747-5e5e-0000-0000-000000000003', '47474747-0000-0000-0000-000000000001', 'DP tetap', 350000, 60, 'DEPOSIT', 'FIXED', 100000),
  ('47474747-5e5e-0000-0000-000000000004', '47474747-0000-0000-0000-000000000001', 'Bayar di tempat', 450000, 60, 'ON_SITE', null, null),
  ('47474747-5e5e-0000-0000-000000000005', '47474747-0000-0000-0000-000000000001', 'Murah', 10000, 60, 'FULL', null, null),
  ('47474747-5e5e-0000-0000-000000000006', '47474747-0000-0000-0000-000000000001', 'Permintaan', 200000, 60, 'REQUEST', null, null);

select pg_temp.v45('WISUDA20', 'PERCENT', 20, '{"max_discount": 100000}', '47474747-0000-0000-0000-000000000001');
select pg_temp.v45('HEMAT50', 'FIXED', 50000, '{"min_spend": 300000}', '47474747-0000-0000-0000-000000000001');
select pg_temp.v45('GRATIS', 'PERCENT', 100, '{}', '47474747-0000-0000-0000-000000000001');
select pg_temp.v45('TIPIS', 'FIXED', 9000, '{}', '47474747-0000-0000-0000-000000000001');
select pg_temp.v45('SATU', 'FIXED', 10000, '{"per_phone_limit": 1}', '47474747-0000-0000-0000-000000000001');
select pg_temp.v45('KUOTA1', 'FIXED', 10000, '{"quota": 1}', '47474747-0000-0000-0000-000000000001');
select pg_temp.v45('BARU', 'FIXED', 10000, '{"new_customer_only": true}', '47474747-0000-0000-0000-000000000001');
select pg_temp.v45('SVC1', 'FIXED', 10000, '{"service_ids": ["47474747-5e5e-0000-0000-000000000001"]}',
  '47474747-0000-0000-0000-000000000001');

-- Sama dengan cb35/check35, untuk merchant 47 dan dengan kode voucher.
create or replace function pg_temp.cb47(p_service integer, p_slot integer, p_phone text, p_code text,
  p_can_charge boolean default true)
returns setof public.bookings language plpgsql as $$
begin
  return query select * from public.create_booking(
    '47474747-0000-0000-0000-000000000001',
    ('47474747-5e5e-0000-0000-' || lpad(p_service::text, 12, '0'))::uuid,
    pg_temp.jakarta_future(1, 1 + p_slot / 8, (9 + p_slot % 8) || ':00'),
    'Pelanggan 47', p_phone, null, p_can_charge, 'ONLINE', p_code);
end $$;

-- voucher_code yang diharapkan = kode masukan yang dinormalisasi, null bila kosong.
create or replace function pg_temp.check47(
  p_label text, p_service integer, p_slot integer, p_phone text, p_code text,
  p_status text, p_due_now numeric, p_due_on_site numeric, p_discount numeric,
  p_can_charge boolean default true)
returns text language plpgsql as $$
declare
  b public.bookings;
  v_code text := nullif(upper(btrim(p_code)), '');
begin
  select * into b from pg_temp.cb47(p_service, p_slot, p_phone, p_code, p_can_charge);
  if b.status::text = p_status and b.amount_due_now = p_due_now
     and b.amount_due_on_site = p_due_on_site and b.discount_amount = p_discount
     and b.voucher_code is not distinct from v_code
     and (b.voucher_id is not null) = (v_code is not null) then
    return 'OK   ' || p_label;
  end if;
  return 'FAIL ' || p_label || ' -> ' || b.status || ' ' || b.amount_due_now || '/'
    || b.amount_due_on_site || ' diskon ' || b.discount_amount || ' kode ' || coalesce(b.voucher_code, 'null');
exception when others then
  return 'FAIL ' || p_label || ' [' || sqlstate || ' ' || sqlerrm || ']';
end $$;

-- 47i dijalankan pertama: kuota Starter 10 booking per bulan, jadi harus
-- sebelum blok lain mengisi bulan ini.
update public.merchants set subscription_tier = 'STARTER'
  where id = '47474747-0000-0000-0000-000000000001';
select pg_temp.expect_fail_code(
  $q$select * from pg_temp.cb47(1, 0, '+6281347000090', 'WISUDA20')$q$,
  'BK050', 't47i Starter: kode voucher dianggap tidak ada');
select pg_temp.check47('t47i Starter tanpa kode tetap diterima', 1, 1, '+6281347000091', null,
  'PENDING', 350000, 0, 0);
update public.merchants set subscription_tier = 'PRO'
  where id = '47474747-0000-0000-0000-000000000001';

-- 47a. FULL + WISUDA20 (20% dari 350000 = 70000, di bawah max 100000).
select pg_temp.check47('t47a FULL + WISUDA20 -> PENDING 280000/0 diskon 70000', 1, 2, '+6281347000001', 'WISUDA20',
  'PENDING', 280000, 0, 70000);
select pg_temp.check47('t47a kode huruf kecil sama hasilnya', 1, 3, '+6281347000002', 'wisuda20',
  'PENDING', 280000, 0, 70000);
select pg_temp.check47('t47a tanpa kode -> PENDING 350000/0', 1, 4, '+6281347000003', null,
  'PENDING', 350000, 0, 0);
select pg_temp.check47('t47a kode spasi = tanpa kode', 1, 5, '+6281347000004', '  ',
  'PENDING', 350000, 0, 0);

-- 47b. Voucher ditolak: tidak ada baris booking baru.
create temp table t47b_before as
  select count(*) as n from public.bookings where merchant_id = '47474747-0000-0000-0000-000000000001';
select pg_temp.expect_fail_code(
  $q$select * from pg_temp.cb47(2, 6, '+6281347000005', 'SVC1')$q$,
  'BK055', 't47b SVC1 untuk layanan lain');
select pg_temp.expect_fail_code(
  $q$select * from pg_temp.cb47(1, 6, '+6281347000005', 'NGAWUR')$q$,
  'BK050', 't47b kode tak dikenal');
select pg_temp.expect_fail_code(
  $q$select * from pg_temp.cb47(5, 6, '+6281347000005', 'HEMAT50')$q$,
  'BK054', 't47b HEMAT50 di bawah minimal transaksi');
select case when (select count(*) from public.bookings where merchant_id = '47474747-0000-0000-0000-000000000001')
                 = (select n from t47b_before)
            then 'OK   t47b tidak ada booking baru setelah voucher ditolak'
            else 'FAIL t47b ada booking baru setelah voucher ditolak' end as t47b;

-- 47c. Kuota 1: pembatalan membebaskan pemakaian.
select pg_temp.expect_ok($q$select * from pg_temp.cb47(1, 7, '+6281347000011', 'KUOTA1')$q$, 't47c KUOTA1 pertama');
select pg_temp.expect_fail_code(
  $q$select * from pg_temp.cb47(1, 8, '+6281347000012', 'KUOTA1')$q$,
  'BK052', 't47c KUOTA1 kedua nomor lain');
update public.bookings set status = 'CANCELLED', cancelled_at = now()
  where merchant_id = '47474747-0000-0000-0000-000000000001' and customer_whatsapp = '+6281347000011';
select pg_temp.expect_ok($q$select * from pg_temp.cb47(1, 8, '+6281347000013', 'KUOTA1')$q$,
  't47c KUOTA1 diterima lagi setelah booking pertama batal');

-- 47d. Satu kali per nomor.
select pg_temp.expect_ok($q$select * from pg_temp.cb47(1, 9, '+6281347000021', 'SATU')$q$, 't47d SATU nomor X');
select pg_temp.expect_fail_code(
  $q$select * from pg_temp.cb47(1, 10, '+6281347000021', 'SATU')$q$,
  'BK053', 't47d SATU nomor X lagi');
select pg_temp.expect_ok($q$select * from pg_temp.cb47(1, 10, '+6281347000022', 'SATU')$q$, 't47d SATU nomor Y');

-- 47e. DP dihitung dari harga setelah diskon.
select pg_temp.check47('t47e DEPOSIT 30% dari 280000 -> PENDING 84000/196000', 2, 11, '+6281347000031', 'WISUDA20',
  'PENDING', 84000, 196000, 70000);
select pg_temp.check47('t47e DEPOSIT tetap 100000 dari 280000 -> PENDING 100000/180000', 3, 12, '+6281347000032', 'WISUDA20',
  'PENDING', 100000, 180000, 70000);
select pg_temp.check47('t47e ON_SITE 450000 -> CONFIRMED 0/360000 diskon 90000', 4, 13, '+6281347000033', 'WISUDA20',
  'CONFIRMED', 0, 360000, 90000);
select pg_temp.check47('t47e REQUEST tanpa DP -> REQUESTED 160000/0', 6, 14, '+6281347000034', 'WISUDA20',
  'REQUESTED', 160000, 0, 40000);

-- 47f. Harga akhir 1000 dinaikkan ke 1500 supaya QRIS tetap bisa dibuat.
select pg_temp.check47('t47f TIPIS untuk 10000 -> PENDING 1500/0 diskon 8500', 5, 15, '+6281347000041', 'TIPIS',
  'PENDING', 1500, 0, 8500);

-- 47g. Voucher 100%: gratis, tanpa koneksi payment, tetap kena batas per nomor.
select pg_temp.check47('t47g GRATIS tanpa koneksi -> CONFIRMED 0/0', 1, 16, '+6281347000051', 'GRATIS',
  'CONFIRMED', 0, 0, 350000, false);
update public.merchant_settings set max_active_per_phone = 1
  where merchant_id = '47474747-0000-0000-0000-000000000001';
select pg_temp.expect_fail_code(
  $q$select * from pg_temp.cb47(1, 17, '+6281347000051', 'GRATIS', false)$q$,
  'BK020', 't47g GRATIS kedua nomor sama');
update public.merchant_settings set max_active_per_phone = 2
  where merchant_id = '47474747-0000-0000-0000-000000000001';
select pg_temp.check47('t47g GRATIS untuk DEPOSIT -> CONFIRMED 0/0', 2, 17, '+6281347000052', 'GRATIS',
  'CONFIRMED', 0, 0, 350000, false);

-- 47h. Khusus pelanggan baru.
select pg_temp.expect_fail_code(
  $q$select * from pg_temp.cb47(1, 18, '+6281347000001', 'BARU')$q$,
  'BK056', 't47h BARU nomor dengan booking PENDING hidup');
insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime,
  customer_name, customer_whatsapp, status, amount_due_now, amount_due_on_site, created_at)
values ('47474747-0000-0000-0000-000000000001', 'Bayar penuh', 350000, 60,
  now() - interval '30 days', now() - interval '30 days' + interval '1 hour',
  'Pelanggan lama 47', '+6281347000061', 'CONFIRMED', 0, 350000, now() - interval '31 days');
select pg_temp.expect_fail_code(
  $q$select * from pg_temp.cb47(1, 18, '+6281347000061', 'BARU')$q$,
  'BK056', 't47h BARU nomor dengan booking CONFIRMED bulan lalu');
select pg_temp.expect_ok($q$select * from pg_temp.cb47(1, 18, '+6281347000062', 'BARU')$q$, 't47h BARU nomor baru');

-- 47j. Booking manual tidak pernah memakai voucher.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '47474747-0000-0000-0000-000000000001';
select pg_temp.expect_ok(
  format('select * from public.create_manual_booking(%L, %L, %L, %L)',
    '47474747-5e5e-0000-0000-000000000001', pg_temp.jakarta_future(1, 3, '12:00'), 'Manual 47', '+6281347000071'),
  't47j create_manual_booking');
commit;
select case when status = 'CONFIRMED' and amount_due_on_site = service_price and discount_amount = 0
              and voucher_id is null and voucher_code is null
            then 'OK   t47j manual: CONFIRMED, bayar di tempat penuh, tanpa diskon'
            else 'FAIL t47j manual -> ' || status || ' ' || amount_due_on_site || ' diskon ' || discount_amount end as t47j
from public.bookings where customer_whatsapp = '+6281347000071';

-- 47k. Hak akses: signature terbaru (sejak 20261125000300 sembilan belas argumen) hanya untuk service_role.
select
  case when to_regprocedure('public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source, text, integer, uuid, uuid, text, uuid, uuid, text, text, text, text, uuid, integer)') is null
       then 'FAIL t47k signature terbaru tidak ada'
       when has_function_privilege('anon', to_regprocedure('public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source, text, integer, uuid, uuid, text, uuid, uuid, text, text, text, text, uuid, integer)'), 'EXECUTE')
         or has_function_privilege('authenticated', to_regprocedure('public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source, text, integer, uuid, uuid, text, uuid, uuid, text, text, text, text, uuid, integer)'), 'EXECUTE')
       then 'FAIL t47k anon/authenticated bisa EXECUTE create_booking'
       when not has_function_privilege('service_role', to_regprocedure('public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source, text, integer, uuid, uuid, text, uuid, uuid, text, text, text, text, uuid, integer)'), 'EXECUTE')
       then 'FAIL t47k service_role tidak bisa EXECUTE create_booking'
       else 'OK   t47k create_booking terbaru hanya untuk service_role' end as t47k1,
  case when to_regprocedure('public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source)') is null
       then 'OK   t47k signature delapan argumen sudah dihapus'
       else 'FAIL t47k signature delapan argumen masih ada' end as t47k2;

-- 47l. reap_expired_bookings ikut membuang jejak cek voucher yang lebih tua dari 1 jam.
insert into public.voucher_attempts (ip_hash, merchant_id, created_at) values
  ('hash47-lama', '47474747-0000-0000-0000-000000000001', now() - interval '2 hours'),
  ('hash47-baru', '47474747-0000-0000-0000-000000000001', now());
select public.reap_expired_bookings();
select case when not exists (select 1 from public.voucher_attempts where ip_hash = 'hash47-lama')
              and exists (select 1 from public.voucher_attempts where ip_hash = 'hash47-baru')
            then 'OK   t47l reap_expired_bookings membuang voucher_attempts lama saja'
            else 'FAIL t47l voucher_attempts lama tidak dibuang atau yang baru ikut terbuang' end as t47l;

-- ===========================================================================
-- 48. Banner promosi (20261117000300)
-- ===========================================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('48484848-0000-0000-0000-000000000001', 'banner48-a@example.com', '{}'::jsonb),
  ('48484848-0000-0000-0000-000000000002', 'banner48-b@example.com', '{}'::jsonb);
update public.merchants set username = 'banner-48', subscription_tier = 'PRO'
  where id = '48484848-0000-0000-0000-000000000001';
insert into public.services (id, merchant_id, name, price, duration_minutes, payment_mode, is_active) values
  ('48484848-5e5e-0000-0000-000000000001', '48484848-0000-0000-0000-000000000001', 'Layanan 48', 350000, 60, 'FULL', true);
-- Merchant PRO 0003 sebagai pemilik target lintas merchant.
insert into auth.users (id, email, raw_user_meta_data) values
  ('48484848-0000-0000-0000-000000000003', 'banner48-c@example.com', '{}'::jsonb);
update public.merchants set subscription_tier = 'PRO' where id = '48484848-0000-0000-0000-000000000003';
insert into public.services (id, merchant_id, name, price, duration_minutes, payment_mode, is_active) values
  ('48484848-5e5e-0000-0000-000000000003', '48484848-0000-0000-0000-000000000003', 'Layanan lain 48', 350000, 60, 'FULL', true);
insert into public.vouchers (id, merchant_id, code, kind, value, visibility) values
  ('48484848-7070-0000-0000-000000000001', '48484848-0000-0000-0000-000000000001', 'BANNER48', 'PERCENT', 10, 'PUBLIC'),
  ('48484848-7070-0000-0000-000000000002', '48484848-0000-0000-0000-000000000001', 'RAHASIA48', 'PERCENT', 10, 'PRIVATE'),
  ('48484848-7070-0000-0000-000000000003', '48484848-0000-0000-0000-000000000003', 'LAIN48', 'PERCENT', 10, 'PUBLIC');

-- Sisip banner (superuser). Kolom opsional lewat jsonb; TEMPLATE tanpa kunci title diberi judul bawaan.
create or replace function pg_temp.bn48(p jsonb default '{}'::jsonb,
  p_merchant uuid default '48484848-0000-0000-0000-000000000001')
returns uuid language plpgsql as $$
declare v_id uuid; v_source text := coalesce(p->>'source', 'TEMPLATE');
begin
  insert into public.merchant_banners (merchant_id, source, tag_text, title, body, color, image_path, alt_text,
    cta_text, target_kind, target_voucher_id, target_service_id, target_url, starts_at, ends_at, published)
  values (p_merchant, v_source::public.banner_source, p->>'tag_text',
    case when p ? 'title' or v_source <> 'TEMPLATE' then p->>'title' else 'Promo 48' end,
    p->>'body', coalesce(p->>'color', 'ACCENT')::public.banner_color, p->>'image_path', p->>'alt_text',
    p->>'cta_text', (p->>'target_kind')::public.banner_target, (p->>'target_voucher_id')::uuid,
    (p->>'target_service_id')::uuid, p->>'target_url', (p->>'starts_at')::timestamptz,
    (p->>'ends_at')::timestamptz, coalesce((p->>'published')::boolean, false))
  returning id into v_id;
  return v_id;
end $$;

-- 48a. Constraint.
select pg_temp.expect_fail_code($q$select pg_temp.bn48('{"title": null}')$q$, '23514', 't48a TEMPLATE tanpa title');
select pg_temp.expect_fail_code($q$select pg_temp.bn48('{"source": "IMAGE",
  "image_path": "48484848-0000-0000-0000-000000000001/banner/a.webp"}')$q$, '23514', 't48a IMAGE tanpa alt_text');
select pg_temp.expect_fail_code($q$select pg_temp.bn48('{"source": "IMAGE", "title": "Judul", "alt_text": "Promo",
  "image_path": "48484848-0000-0000-0000-000000000001/banner/a.webp"}')$q$, '23514', 't48a IMAGE dengan title');
select pg_temp.expect_fail_code($q$select pg_temp.bn48('{"source": "IMAGE", "alt_text": "Promo",
  "image_path": "48484848-0000-0000-0000-000000000002/banner/a.webp"}')$q$, '23514', 't48a image_path merchant lain');
select pg_temp.expect_fail_code($q$select pg_temp.bn48('{"source": "IMAGE", "alt_text": "Promo",
  "image_path": "48484848-0000-0000-0000-000000000001/banner/../x.webp"}')$q$, '23514', 't48a image_path dengan ..');
select pg_temp.expect_fail_code($q$select pg_temp.bn48('{"target_kind": "URL", "cta_text": "Lihat",
  "target_url": "http://contoh.test"}')$q$, '23514', 't48a target_url http');
select pg_temp.expect_fail_code($q$select pg_temp.bn48('{"target_kind": "URL", "cta_text": "Lihat",
  "target_url": "javascript:alert(1)"}')$q$, '23514', 't48a target_url javascript:');
select pg_temp.expect_fail_code($q$select pg_temp.bn48('{"target_kind": "URL", "cta_text": "Lihat",
  "target_url": "https://a.test/x y"}')$q$, '23514', 't48a target_url berspasi');
select pg_temp.expect_fail_code($q$select pg_temp.bn48('{"target_url": "https://a.test"}')$q$,
  '23514', 't48a target_url tanpa target_kind');
select pg_temp.expect_fail_code($q$select pg_temp.bn48('{"target_kind": "URL", "target_url": "https://a.test"}')$q$,
  '23514', 't48a target_kind tanpa cta_text');
select pg_temp.expect_fail_code($q$select pg_temp.bn48('{"target_kind": "VOUCHER", "cta_text": "Pakai",
  "target_voucher_id": "48484848-7070-0000-0000-000000000001",
  "target_service_id": "48484848-5e5e-0000-0000-000000000001"}')$q$, '23514', 't48a target_service_id pada VOUCHER');
select pg_temp.expect_fail_code($q$select pg_temp.bn48('{"starts_at": "2031-01-01 00:00+07",
  "ends_at": "2031-01-01 00:00+07"}')$q$, '23514', 't48a ends_at <= starts_at');
select pg_temp.expect_fail_code($q$select pg_temp.bn48(jsonb_build_object('title', repeat('a', 61)))$q$,
  '23514', 't48a title 61 karakter');
select pg_temp.expect_fail_code($q$select pg_temp.bn48('{"title": "   "}')$q$, '23514', 't48a title hanya spasi');
select pg_temp.expect_fail_code($q$select pg_temp.bn48('{"target_kind": "VOUCHER", "cta_text": "Pakai",
  "target_voucher_id": "48484848-7070-0000-0000-000000000003"}')$q$, 'BK057', 't48a target voucher merchant lain');
select pg_temp.expect_fail_code($q$select pg_temp.bn48('{"target_kind": "SERVICE", "cta_text": "Pesan",
  "target_service_id": "48484848-5e5e-0000-0000-000000000003"}')$q$, 'BK057', 't48a target layanan merchant lain');
select pg_temp.expect_fail_code($q$select pg_temp.bn48('{"target_kind": "VOUCHER", "cta_text": "Pakai",
  "target_voucher_id": "48484848-7070-0000-0000-000000000002"}')$q$, 'BK057', 't48a target voucher PRIVATE');
select pg_temp.expect_ok($q$select pg_temp.bn48('{"title": "Ke voucher 48a", "target_kind": "VOUCHER", "cta_text": "Pakai",
  "target_voucher_id": "48484848-7070-0000-0000-000000000001"}')$q$, 't48a target voucher publik sendiri');
select pg_temp.expect_fail_code($q$update public.vouchers set visibility = 'PRIVATE'
  where id = '48484848-7070-0000-0000-000000000001'$q$, 'BK058', 't48a voucher yang dituju banner dijadikan PRIVATE');
select pg_temp.expect_ok($q$update public.vouchers set visibility = 'PRIVATE'
  where id = '48484848-7070-0000-0000-000000000003'$q$, 't48a voucher tanpa banner dijadikan PRIVATE');
select pg_temp.expect_ok($q$select pg_temp.bn48()$q$, 't48a template minimal');
select pg_temp.expect_ok($q$select pg_temp.bn48('{"source": "IMAGE", "alt_text": "Promo wisuda",
  "image_path": "48484848-0000-0000-0000-000000000001/banner/a.webp"}')$q$, 't48a image dengan path dan alt');
select pg_temp.expect_ok($q$select pg_temp.bn48('{"target_kind": "URL", "cta_text": "Lihat",
  "target_url": "https://instagram.com/riasbysekar"}')$q$, 't48a URL instagram');

-- 48b. Maksimal 3 banner tayang bersamaan.
select pg_temp.expect_ok($q$select pg_temp.bn48('{"title": "Tayang 48b-1", "published": true}')$q$, 't48b tayang ke-1');
select pg_temp.expect_ok($q$select pg_temp.bn48('{"title": "Tayang 48b-2", "published": true}')$q$, 't48b tayang ke-2');
select pg_temp.expect_ok($q$select pg_temp.bn48('{"title": "Tayang 48b-3", "published": true}')$q$, 't48b tayang ke-3');
select pg_temp.expect_fail_code($q$select pg_temp.bn48('{"title": "Tayang 48b-4", "published": true}')$q$,
  'PR001', 't48b tayang ke-4');
select pg_temp.expect_ok($q$select pg_temp.bn48('{"title": "Draf 48b"}')$q$, 't48b ke-4 sebagai draf');
select pg_temp.expect_fail_code($q$update public.merchant_banners set published = true
  where merchant_id = '48484848-0000-0000-0000-000000000001' and title = 'Draf 48b'$q$, 'PR001', 't48b draf dijadikan tayang');

-- 48c. Jendela tayang: banner terjadwal hanya bertabrakan dengan yang masih tayang saat itu.
delete from public.merchant_banners
  where merchant_id = '48484848-0000-0000-0000-000000000001' and title = 'Tayang 48b-3';
select pg_temp.expect_ok($q$select pg_temp.bn48(jsonb_build_object('title', 'Tujuh hari 48c', 'published', true,
  'ends_at', now() + interval '7 days'))$q$, 't48c pengganti berakhir +7 hari');
select pg_temp.expect_ok($q$select pg_temp.bn48(jsonb_build_object('title', 'Terjadwal 48c', 'published', true,
  'starts_at', now() + interval '8 days'))$q$, 't48c terjadwal +8 hari');
select pg_temp.expect_fail_code($q$update public.merchant_banners set starts_at = now() + interval '6 days'
  where merchant_id = '48484848-0000-0000-0000-000000000001' and title = 'Terjadwal 48c'$q$,
  'PR001', 't48c terjadwal dimajukan ke +6 hari');

-- 48d. Banner yang sudah berakhir tidak dihitung; puncak dihitung per titik waktu.
select pg_temp.expect_ok($q$select pg_temp.bn48(jsonb_build_object('title', 'Selesai 48d', 'published', true,
  'starts_at', now() - interval '10 days', 'ends_at', now() - interval '1 day'))$q$, 't48d banner berakhir diterima');
select pg_temp.expect_fail_code($q$select pg_temp.bn48('{"title": "Baru 48d", "published": true}')$q$,
  'PR001', 't48d banner baru tetap ditolak');
delete from public.merchant_banners where merchant_id = '48484848-0000-0000-0000-000000000001' and published;
select pg_temp.bn48('{"title": "Tanpa batas 48d", "published": true}');
select pg_temp.bn48(jsonb_build_object('title', 'A 48d', 'published', true,
  'starts_at', now() + interval '1 day', 'ends_at', now() + interval '10 days'));
select pg_temp.bn48(jsonb_build_object('title', 'B 48d', 'published', true,
  'starts_at', now() + interval '1 day', 'ends_at', now() + interval '3 days'));
select pg_temp.bn48(jsonb_build_object('title', 'C 48d', 'published', true,
  'starts_at', now() + interval '5 days', 'ends_at', now() + interval '8 days'));
select pg_temp.expect_fail_code($q$select pg_temp.bn48(jsonb_build_object('title', 'D 48d', 'published', true,
  'starts_at', now() + interval '1 day', 'ends_at', now() + interval '10 days'))$q$, 'PR001', 't48d D puncak 4 di hari +1');
delete from public.merchant_banners
  where merchant_id = '48484848-0000-0000-0000-000000000001' and title = 'Tanpa batas 48d';
select pg_temp.expect_ok($q$select pg_temp.bn48(jsonb_build_object('title', 'D 48d', 'published', true,
  'starts_at', now() + interval '1 day', 'ends_at', now() + interval '10 days'))$q$, 't48d D tanpa banner tanpa batas');

-- 48e. Merchant STARTER tidak bisa membuat banner.
select pg_temp.expect_fail_code($q$select pg_temp.bn48('{}', '48484848-0000-0000-0000-000000000002')$q$,
  'P0001', 't48e banner untuk STARTER');

-- 48f. Hak akses dan RLS.
delete from public.merchant_banners where merchant_id = '48484848-0000-0000-0000-000000000001' and published;
select pg_temp.bn48('{"title": "Tayang 48f", "published": true}');
select pg_temp.bn48('{"title": "Draf 48f"}');
select pg_temp.bn48(jsonb_build_object('title', 'Terjadwal 48f', 'published', true, 'starts_at', now() + interval '2 days'));
select pg_temp.bn48(jsonb_build_object('title', 'Selesai 48f', 'published', true,
  'starts_at', now() - interval '5 days', 'ends_at', now() - interval '1 day'));

begin;
set local role anon;
select case when (select string_agg(title, ',') from public.merchant_banners) = 'Tayang 48f'
            then 'OK   t48f anon hanya melihat banner tayang merchant PRO'
            else 'FAIL t48f anon melihat -> ' || coalesce((select string_agg(title, ',') from public.merchant_banners), '(kosong)')
       end as t48f1;
rollback;

update public.merchants set subscription_tier = 'STARTER' where id = '48484848-0000-0000-0000-000000000001';
begin;
set local role anon;
select case when (select count(*) from public.merchant_banners where title is not null) = 0
            then 'OK   t48f anon tidak melihat banner merchant yang turun ke STARTER'
            else 'FAIL t48f banner merchant STARTER terlihat anon' end as t48f2;
rollback;
update public.merchants set subscription_tier = 'PRO' where id = '48484848-0000-0000-0000-000000000001';

select
  case when has_column_privilege('anon', 'public.merchant_banners', 'published', 'SELECT')
       then 'FAIL t48f anon bisa SELECT published' else 'OK   t48f anon tidak bisa SELECT published' end as t48f3,
  case when has_column_privilege('authenticated', 'public.merchant_banners', 'merchant_id', 'UPDATE')
       then 'FAIL t48f authenticated bisa UPDATE merchant_id'
       else 'OK   t48f authenticated tidak bisa UPDATE merchant_id' end as t48f4,
  case when has_function_privilege('anon', 'public.enforce_banner_live_limit()', 'EXECUTE')
         or has_function_privilege('authenticated', 'public.enforce_banner_live_limit()', 'EXECUTE')
       then 'FAIL t48f enforce_banner_live_limit terbuka'
       else 'OK   t48f enforce_banner_live_limit tertutup' end as t48f5;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '48484848-0000-0000-0000-000000000002';
with u as (update public.merchant_banners set sort_order = 9
           where merchant_id = '48484848-0000-0000-0000-000000000001' returning 1)
select case when (select count(*) from u) = 0
            then 'OK   t48f update banner merchant lain 0 baris' else 'FAIL t48f banner merchant lain berubah' end as t48f6;
rollback;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '48484848-0000-0000-0000-000000000001';
select pg_temp.expect_ok($q$insert into public.merchant_banners (merchant_id, source, title, published)
  values ('48484848-0000-0000-0000-000000000001', 'TEMPLATE', 'Sendiri 48f', false)$q$, 't48f pemilik insert banner sendiri');
select case when (select count(*) from public.merchant_banners where title = 'Draf 48f') = 1
            then 'OK   t48f pemilik melihat drafnya' else 'FAIL t48f pemilik tidak melihat drafnya' end as t48f7;
rollback;

-- 48g. Hapus voucher dan layanan target: kolom target jadi null, banner tetap.
select pg_temp.bn48('{"title": "Ke voucher 48g", "target_kind": "VOUCHER", "cta_text": "Pakai",
  "target_voucher_id": "48484848-7070-0000-0000-000000000001"}');
select pg_temp.bn48('{"title": "Ke layanan 48g", "target_kind": "SERVICE", "cta_text": "Pesan",
  "target_service_id": "48484848-5e5e-0000-0000-000000000001"}');
delete from public.vouchers where id = '48484848-7070-0000-0000-000000000001';
delete from public.services where id = '48484848-5e5e-0000-0000-000000000001';
select case when (select count(*) from public.merchant_banners
                  where title in ('Ke voucher 48g', 'Ke layanan 48g')
                    and target_voucher_id is null and target_service_id is null) = 2
            then 'OK   t48g target dihapus: id target null, banner tetap'
            else 'FAIL t48g banner hilang atau target tidak null' end as t48g;

-- ===========================================================================
-- 50. Tema: kolom merek, susunan, gerak (20261118000200)
-- ===========================================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('50505050-0000-0000-0000-000000000001', 'tema50-a@example.com', '{}'::jsonb),
  ('50505050-0000-0000-0000-000000000002', 'tema50-b@example.com', '{}'::jsonb);
update public.merchants set subscription_tier = 'PRO'
  where id = '50505050-0000-0000-0000-000000000001';
select case when (select subscription_tier from public.merchants where id = '50505050-0000-0000-0000-000000000001') = 'PRO'
             and (select subscription_tier from public.merchants where id = '50505050-0000-0000-0000-000000000002') = 'STARTER'
            then 'OK   t50-pra tier merchant uji benar'
            else 'FAIL t50-pra tier merchant uji salah -- t50 sampai t52 tidak bermakna' end as t50_pra;

-- t50a: nilai bawaan.
insert into public.merchant_themes (merchant_id, preset)
  values ('50505050-0000-0000-0000-000000000001', 'BERSIH');
select case when (select button_style = 'FILLED' and section_order = '{PROMO,SERVICES,FAQ}'
                         and hidden_sections = '{}' and background_motion = 'BENTUK'
                         and background_motion_speed = 'SLOW' and logo_path is null and cover_path is null
                  from public.merchant_themes where merchant_id = '50505050-0000-0000-0000-000000000001')
            then 'OK   t50a nilai bawaan kolom baru'
            else 'FAIL t50a nilai bawaan kolom baru salah' end as t50a;

-- t50b: constraint.
select pg_temp.expect_fail_code(format($q$update public.merchant_themes set %s
  where merchant_id = '50505050-0000-0000-0000-000000000001'$q$, c), '23514', 't50b ' || c)
from unnest(array[
  $c$section_order = '{PROMO,SERVICES}'$c$,
  $c$section_order = '{PROMO,PROMO,FAQ}'$c$,
  $c$section_order = '{PROMO,SERVICES,KONTAK}'$c$,
  $c$section_order = '{PROMO,SERVICES,FAQ,FAQ}'$c$,
  $c$section_order = array['PROMO',null,'FAQ']$c$,
  $c$section_order = '{{PROMO,SERVICES,FAQ}}'$c$,
  $c$hidden_sections = '{SERVICES}'$c$,
  $c$hidden_sections = '{GALERI}'$c$,
  $c$logo_path = '50505050-0000-0000-0000-000000000002/logo-a.webp'$c$,
  $c$cover_path = '50505050-0000-0000-0000-000000000001/../x.webp'$c$,
  $c$logo_path = '50505050-0000-0000-0000-000000000001/a".webp'$c$
]) as c;

-- t50c: nilai sah diterima.
select pg_temp.expect_ok($q$update public.merchant_themes set
  section_order = '{FAQ,LINKS,PROMO,SERVICES}', hidden_sections = '{PROMO,FAQ}',
  logo_path = '50505050-0000-0000-0000-000000000001/logo-ab12cd34.webp',
  cover_path = '50505050-0000-0000-0000-000000000001/cover-ab12cd34.webp',
  background_style = 'MOTION', background_motion = 'GELOMBANG', background_motion_speed = 'NORMAL'
  where merchant_id = '50505050-0000-0000-0000-000000000001'$q$, 't50c nilai sah kolom baru');

-- ===========================================================================
-- 51. Tema: paket untuk kolom baru (20261118000200)
-- ===========================================================================

-- t51a: STARTER boleh logo, susunan, sembunyikan bagian.
select pg_temp.expect_ok($q$insert into public.merchant_themes
  (merchant_id, preset, logo_path, section_order, hidden_sections)
  values ('50505050-0000-0000-0000-000000000002', 'BERSIH',
          '50505050-0000-0000-0000-000000000002/logo-ab12cd34.webp', '{FAQ,SERVICES,PROMO,LINKS}', '{PROMO}')$q$,
  't51a STARTER logo, susunan, sembunyikan bagian');
-- t51b: STARTER ditolak untuk fitur Pro.
select pg_temp.expect_fail_code(format($q$update public.merchant_themes set %s
  where merchant_id = '50505050-0000-0000-0000-000000000002'$q$, c), 'P0001', 't51b ' || c)
from unnest(array[
  $c$cover_path = '50505050-0000-0000-0000-000000000002/cover-ab12cd34.webp'$c$,
  $c$button_style = 'OUTLINE'$c$,
  $c$background_style = 'MOTION'$c$
]) as c;
-- t51c: nilai netral diterima.
select pg_temp.expect_ok($q$update public.merchant_themes set cover_path = null, button_style = 'FILLED'
  where merchant_id = '50505050-0000-0000-0000-000000000002'$q$, 't51c STARTER sampul kosong dan tombol FILLED');

-- t51d: turun paket, simpan bagian lain tetap boleh, sampul tetap.
update public.merchant_themes set cover_path = '50505050-0000-0000-0000-000000000001/cover-ab12cd34.webp',
  button_style = 'SOFT', background_style = 'SOLID'
  where merchant_id = '50505050-0000-0000-0000-000000000001';
update public.merchants set subscription_tier = 'STARTER' where id = '50505050-0000-0000-0000-000000000001';
select pg_temp.expect_ok($q$update public.merchant_themes set corner_style = 'BULAT'
  where merchant_id = '50505050-0000-0000-0000-000000000001'$q$, 't51d turun paket simpan bagian lain');
select case when (select cover_path is not null from public.merchant_themes
                  where merchant_id = '50505050-0000-0000-0000-000000000001')
            then 'OK   t51d sampul tetap setelah turun paket'
            else 'FAIL t51d sampul hilang setelah turun paket' end as t51d;
-- t51e: masih STARTER: ganti sampul atau gaya ditolak, kosongkan boleh.
select pg_temp.expect_fail_code($q$update public.merchant_themes
  set cover_path = '50505050-0000-0000-0000-000000000001/cover-zz99.webp'
  where merchant_id = '50505050-0000-0000-0000-000000000001'$q$, 'P0001', 't51e ganti sampul');
select pg_temp.expect_fail_code($q$update public.merchant_themes set button_style = 'OUTLINE'
  where merchant_id = '50505050-0000-0000-0000-000000000001'$q$, 'P0001', 't51e ganti gaya tombol');
select pg_temp.expect_ok($q$update public.merchant_themes set cover_path = null
  where merchant_id = '50505050-0000-0000-0000-000000000001'$q$, 't51e kosongkan sampul');
update public.merchants set subscription_tier = 'PRO' where id = '50505050-0000-0000-0000-000000000001';

-- ===========================================================================
-- 52. Tema: hak akses kolom baru (20261118000200)
-- ===========================================================================

select case when bool_and(has_column_privilege('anon', 'public.merchant_themes', c, 'SELECT'))
            then 'OK   t52a anon bisa SELECT kolom baru' else 'FAIL t52a anon tidak bisa SELECT kolom baru' end as t52a
from unnest(array['logo_path', 'cover_path', 'button_style', 'section_order', 'hidden_sections',
                  'background_motion', 'background_motion_speed']) as c;
select case when not has_column_privilege('anon', 'public.merchant_themes', 'cover_path', 'UPDATE')
            then 'OK   t52a anon tidak bisa UPDATE cover_path' else 'FAIL t52a anon bisa UPDATE cover_path' end as t52a2;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '50505050-0000-0000-0000-000000000001';
with u as (update public.merchant_themes set button_style = 'OUTLINE'
           where merchant_id = '50505050-0000-0000-0000-000000000001' returning 1)
select case when (select count(*) from u) = 1
            then 'OK   t52b pemilik ubah button_style 1 baris' else 'FAIL t52b pemilik gagal ubah button_style' end as t52b1;
with u as (update public.merchant_themes set button_style = 'OUTLINE'
           where merchant_id = '50505050-0000-0000-0000-000000000002' returning 1)
select case when (select count(*) from u) = 0
            then 'OK   t52b merchant lain 0 baris' else 'FAIL t52b merchant lain berubah' end as t52b2;
rollback;

-- ===========================================================================
-- 55. Profil staf: kolom dan constraint (20261119000100)
-- ===========================================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('55505550-0000-0000-0000-000000000001', 'staf55-a@example.com', '{}'::jsonb),
  ('55505550-0000-0000-0000-000000000002', 'staf55-b@example.com', '{}'::jsonb);
update public.merchants set subscription_tier = 'STUDIO'
  where id in ('55505550-0000-0000-0000-000000000001', '55505550-0000-0000-0000-000000000002');
insert into public.staff (id, merchant_id, name, sort_order)
  values ('55505550-57af-0000-0000-000000000001', '55505550-0000-0000-0000-000000000001', 'Rani', 0);

select case when (select tags = '{}' and show_motion and role is null and bio is null
                         and photo_path is null and motion_path is null
                  from public.staff where id = '55505550-57af-0000-0000-000000000001')
            then 'OK   t55a nilai bawaan profil staf' else 'FAIL t55a nilai bawaan profil staf' end as t55a;

select pg_temp.expect_fail_code(format($q$update public.staff set %s
  where id = '55505550-57af-0000-0000-000000000001'$q$, c), '23514', 't55b ' || c)
from unnest(array[
  $c$role = repeat('a', 41)$c$,
  $c$role = '   '$c$,
  $c$bio = repeat('a', 141)$c$,
  $c$tags = '{a,b,c,d,e,f}'$c$,
  $c$tags = array[repeat('a', 25)]$c$,
  $c$tags = '{""}'$c$,
  $c$tags = array['a', null]$c$,
  $c$tags = '{{a,b},{c,d}}'$c$,
  $c$photo_path = '55505550-0000-0000-0000-000000000002/staff/x/photo-a.webp'$c$,
  $c$photo_path = '55505550-0000-0000-0000-000000000001/avatar-a.webp'$c$,
  $c$photo_path = '55505550-0000-0000-0000-000000000001/staff/x/photo-a.png'$c$,
  $c$photo_path = '55505550-0000-0000-0000-000000000001/staff/../photo-a.webp'$c$,
  $c$motion_path = '55505550-0000-0000-0000-000000000001/staff/x/clip-a.gif'$c$
]) as c;

select pg_temp.expect_ok($q$update public.staff set role = 'Pemilik, MUA', bio = repeat('a', 140),
  tags = '{Wisuda,Pengantin}',
  photo_path = '55505550-0000-0000-0000-000000000001/staff/55505550-57af-0000-0000-000000000001/photo-ab12cd34.webp'
  where id = '55505550-57af-0000-0000-000000000001'$q$, 't55c profil sah diterima');
select pg_temp.expect_ok($q$update public.staff set
  motion_path = '55505550-0000-0000-0000-000000000001/staff/55505550-57af-0000-0000-000000000001/clip-ab12cd34.mp4'
  where id = '55505550-57af-0000-0000-000000000001'$q$, 't55c motion_path sah (superuser)');

-- ===========================================================================
-- 56. Profil staf: hak akses kolom (20261119000100)
-- ===========================================================================

select case when bool_and(has_column_privilege('anon', 'public.staff', c, 'SELECT'))
            then 'OK   t56a anon bisa SELECT kolom profil' else 'FAIL t56a anon tidak bisa SELECT kolom profil' end as t56a
from unnest(array['role', 'bio', 'tags', 'photo_path', 'motion_path', 'show_motion']) as c;
select case when not has_table_privilege('anon', 'public.staff', 'UPDATE')
             and not has_column_privilege('authenticated', 'public.staff', 'motion_path', 'UPDATE')
             and not has_column_privilege('authenticated', 'public.staff', 'motion_path', 'INSERT')
             and has_column_privilege('authenticated', 'public.staff', 'role', 'UPDATE')
             and has_column_privilege('authenticated', 'public.staff', 'name', 'INSERT')
            then 'OK   t56a hak kolom authenticated dan anon' else 'FAIL t56a hak kolom authenticated atau anon' end as t56a2;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '55505550-0000-0000-0000-000000000001';
select pg_temp.expect_ok($q$update public.staff set role = 'Penata rias'
  where id = '55505550-57af-0000-0000-000000000001'$q$, 't56b pemilik ubah role');
select pg_temp.expect_fail_code($q$update public.staff set motion_path =
  '55505550-0000-0000-0000-000000000001/staff/x/clip-zz.mp4'
  where id = '55505550-57af-0000-0000-000000000001'$q$, '42501', 't56b UPDATE motion_path');
select pg_temp.expect_fail_code($q$insert into public.staff (merchant_id, name, motion_path) values
  ('55505550-0000-0000-0000-000000000001', 'Gita', '55505550-0000-0000-0000-000000000001/staff/x/clip-zz.mp4')$q$,
  '42501', 't56b INSERT motion_path');
select pg_temp.expect_ok($q$insert into public.staff (merchant_id, name, sort_order) values
  ('55505550-0000-0000-0000-000000000001', 'Nadia', 1)$q$, 't56b createStaff tetap jalan');
rollback;

-- ===========================================================================
-- 57. Bucket staff-clip-uploads (20261119000100)
-- ===========================================================================

select case when exists (select 1 from storage.buckets where id = 'staff-clip-uploads'
                         and not public and file_size_limit = 8388608
                         and 'image/gif' = any(allowed_mime_types))
            then 'OK   t57a bucket staff-clip-uploads privat, 8MB, menerima GIF'
            else 'FAIL t57a bucket staff-clip-uploads' end as t57a;
select case when not exists (select 1 from storage.buckets where id = 'merchant-media'
                             and 'image/gif' = any(coalesce(allowed_mime_types, '{}')))
            then 'OK   t57a merchant-media tidak menerima GIF' else 'FAIL t57a merchant-media menerima GIF' end as t57a2;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '55505550-0000-0000-0000-000000000001';
select pg_temp.expect_ok($q$insert into storage.objects (bucket_id, name) values
  ('staff-clip-uploads', '55505550-0000-0000-0000-000000000001/55505550-57af-0000-0000-000000000001/a1.gif')$q$,
  't57b unggah ke folder sendiri');
select pg_temp.expect_fail($q$insert into storage.objects (bucket_id, name) values
  ('staff-clip-uploads', '55505550-0000-0000-0000-000000000002/x/a2.gif')$q$, 't57b unggah ke folder merchant lain');
select case when (select count(*) from storage.objects where bucket_id = 'staff-clip-uploads') = 0
            then 'OK   t57b tidak ada policy baca bagi pemilik' else 'FAIL t57b pemilik bisa membaca berkas mentah' end as t57b;
rollback;

begin;
set local role anon;
select pg_temp.expect_fail($q$insert into storage.objects (bucket_id, name) values
  ('staff-clip-uploads', 'anon/a3.gif')$q$, 't57c anon mengunggah berkas mentah');
select case when (select count(*) from storage.objects where bucket_id = 'staff-clip-uploads') = 0
            then 'OK   t57c anon tidak bisa membaca' else 'FAIL t57c anon bisa membaca' end as t57c;
rollback;

-- 57d. Unggahan klip mentah hanya untuk Studio, ke folder staf sendiri (20261119000200)
begin;
set local role authenticated;
set local request.jwt.claim.sub = '55505550-0000-0000-0000-000000000001';
select pg_temp.expect_fail($q$insert into storage.objects (bucket_id, name) values
  ('staff-clip-uploads', '55505550-0000-0000-0000-000000000001/55505550-57af-0000-0000-000000000001/a1.exe')$q$,
  't57d ekstensi selain gif/mp4/webm/mov');
select pg_temp.expect_fail($q$insert into storage.objects (bucket_id, name) values
  ('staff-clip-uploads', '55505550-0000-0000-0000-000000000001/55505550-57af-0000-0000-0000000000ff/a1.gif')$q$,
  't57d folder staf yang tidak ada');
select pg_temp.expect_fail($q$insert into storage.objects (bucket_id, name) values
  ('staff-clip-uploads', '55505550-0000-0000-0000-000000000001/sembarang/a1.gif')$q$,
  't57d folder kedua bukan id staf');
rollback;

begin;
update public.merchants set subscription_tier = 'PRO' where id = '55505550-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '55505550-0000-0000-0000-000000000001';
select pg_temp.expect_fail($q$insert into storage.objects (bucket_id, name) values
  ('staff-clip-uploads', '55505550-0000-0000-0000-000000000001/55505550-57af-0000-0000-000000000001/a1.gif')$q$,
  't57d merchant Pro tidak bisa mengunggah klip');
rollback;

-- ===========================================================================
-- 60. Restoran: skema (20261120000100)
-- ===========================================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('60606060-0000-0000-0000-000000000001', 'resto60-a@example.com', '{}'::jsonb),
  ('60606060-0000-0000-0000-000000000002', 'resto60-b@example.com', '{}'::jsonb);
update public.merchants set subscription_tier = 'PRO', username = 'resto-60'
  where id = '60606060-0000-0000-0000-000000000001';
update public.merchants set subscription_tier = 'PRO', username = 'resto-60b'
  where id = '60606060-0000-0000-0000-000000000002';
insert into public.services (id, merchant_id, name, price, duration_minutes) values
  ('60606060-5e00-0000-0000-000000000001', '60606060-0000-0000-0000-000000000001', 'Makan malam', 0, 90);
insert into public.dining_areas (id, merchant_id, name) values
  ('60606060-a000-0000-0000-000000000001', '60606060-0000-0000-0000-000000000001', 'Indoor'),
  ('60606060-a000-0000-0000-000000000002', '60606060-0000-0000-0000-000000000002', 'Teras');
insert into public.dining_tables (id, merchant_id, area_id, name, max_seats, grid_x, grid_y, bookable_online) values
  ('60606060-7a00-0000-0000-000000000001', '60606060-0000-0000-0000-000000000001',
   '60606060-a000-0000-0000-000000000001', 'D1', 4, 0, 0, true),
  ('60606060-7a00-0000-0000-000000000002', '60606060-0000-0000-0000-000000000001',
   '60606060-a000-0000-0000-000000000001', 'D2', 2, 4, 0, false);

-- t60a services
select pg_temp.expect_fail_code(format($q$update public.services set %s
  where id = '60606060-5e00-0000-0000-000000000001'$q$, c), '23514', 't60a ' || c)
from unnest(array[
  $c$party_min = 2$c$,
  $c$party_min = 5, party_max = 4$c$,
  $c$party_min = 1, party_max = 201$c$,
  $c$party_min = 1, party_max = 4, seat_duration_minutes = 10$c$,
  $c$seat_duration_minutes = 90$c$
]) as c;
select pg_temp.expect_ok($q$update public.services set party_min = 1, party_max = 12, seat_duration_minutes = 90
  where id = '60606060-5e00-0000-0000-000000000001'$q$, 't60a rentang tamu + durasi duduk');

-- t60b merchant_settings
select case when (select table_mode = 'NONE' and table_hold_minutes = 15 and auto_join_tables
                         and seats_per_slot is null
                  from public.merchant_settings where merchant_id = '60606060-0000-0000-0000-000000000001')
            then 'OK   t60b nilai bawaan merchant_settings' else 'FAIL t60b nilai bawaan merchant_settings' end as t60b;
select pg_temp.expect_fail_code(format($q$update public.merchant_settings set %s
  where merchant_id = '60606060-0000-0000-0000-000000000001'$q$, c), '23514', 't60b ' || c)
from unnest(array[
  $c$table_mode = 'AREA'$c$,
  $c$seats_per_slot = 0$c$,
  $c$table_hold_minutes = 121$c$
]) as c;

-- t60c dining_tables
select pg_temp.expect_fail_code(format($q$insert into public.dining_tables
  (merchant_id, area_id, name, min_seats, max_seats, grid_x, grid_y, grid_w, grid_h)
  values ('60606060-0000-0000-0000-000000000001', '60606060-a000-0000-0000-000000000001', 'X', %s)$q$, c),
  '23514', 't60c ' || c)
from unnest(array[
  $c$5, 4, 0, 0, 3, 3$c$,
  $c$1, 51, 0, 0, 3, 3$c$,
  $c$1, 4, 22, 0, 3, 3$c$,
  $c$1, 4, 0, 0, 2, 3$c$
]) as c;
select pg_temp.expect_fail_code($q$update public.dining_tables
  set joinable_with = array['60606060-7a00-0000-0000-000000000001'::uuid]
  where id = '60606060-7a00-0000-0000-000000000001'$q$, '23514', 't60c gabung dengan diri sendiri');
select pg_temp.expect_fail_code($q$insert into public.dining_tables
  (merchant_id, area_id, name, max_seats, grid_x, grid_y)
  values ('60606060-0000-0000-0000-000000000001', '60606060-a000-0000-0000-000000000002', 'Z', 2, 0, 0)$q$,
  '23503', 't60c area milik merchant lain');

-- t60d bookings
select pg_temp.expect_fail_code(format($q$insert into public.bookings
  (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime,
   customer_name, customer_whatsapp, %s)
  values ('60606060-0000-0000-0000-000000000001', 'Makan', 0, 90,
   now() + interval '2 days', now() + interval '2 days 90 minutes', 'Tamu 60', '+6281360000001', %s)$q$, c, v),
  '23514', 't60d ' || c || ' = ' || v)
from (values
  ('capacity_mode', $v$'AREA'$v$),
  ('table_id', $v$'60606060-7a00-0000-0000-000000000001'$v$),
  ('party_size', '0'),
  ('customer_note', $v$''$v$)
) as t(c, v);
select pg_temp.expect_fail_code($q$insert into public.bookings
  (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime,
   customer_name, customer_whatsapp, capacity_mode, party_size, table_id, joined_table_id)
  values ('60606060-0000-0000-0000-000000000001', 'Makan', 0, 90,
   now() + interval '2 days', now() + interval '2 days 90 minutes', 'Tamu 60', '+6281360000001',
   'TABLE', 2, '60606060-7a00-0000-0000-000000000001', '60606060-7a00-0000-0000-000000000001')$q$,
  '23514', 't60d joined_table_id = table_id');
insert into public.bookings (id, merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime,
  customer_name, customer_whatsapp)
values ('60606060-b000-0000-0000-000000000001', '60606060-0000-0000-0000-000000000001', 'Biasa', 0, 60,
  now() + interval '3 days', now() + interval '3 days 1 hour', 'Tamu 60', '+6281360000002');
select case when (select capacity_mode = 'NONE' and party_size is null and area_id is null and table_id is null
                         and joined_table_id is null and table_label is null and customer_note is null
                  from public.bookings where id = '60606060-b000-0000-0000-000000000001')
            then 'OK   t60d booking lama: capacity_mode NONE, kolom baru null'
            else 'FAIL t60d nilai bawaan booking' end as t60d;

-- t60e hak akses
select case when has_column_privilege('anon', 'public.dining_tables', 'name', 'SELECT')
             and has_column_privilege('anon', 'public.dining_tables', 'grid_x', 'SELECT')
             and has_column_privilege('anon', 'public.dining_tables', 'note', 'SELECT')
             and not has_column_privilege('anon', 'public.dining_tables', 'bookable_online', 'SELECT')
             and not has_column_privilege('anon', 'public.dining_tables', 'joinable_with', 'SELECT')
            then 'OK   t60e anon: kolom tata letak saja' else 'FAIL t60e kolom dining_tables untuk anon' end as t60e,
       case when not (has_table_privilege('anon', 'public.dining_tables', 'INSERT')
                      or has_table_privilege('anon', 'public.dining_tables', 'UPDATE')
                      or has_table_privilege('anon', 'public.dining_tables', 'DELETE')
                      or has_table_privilege('anon', 'public.dining_areas', 'INSERT')
                      or has_table_privilege('anon', 'public.dining_areas', 'UPDATE')
                      or has_table_privilege('anon', 'public.dining_areas', 'DELETE')
                      or has_table_privilege('authenticated', 'public.dining_tables', 'INSERT')
                      or has_table_privilege('authenticated', 'public.dining_tables', 'UPDATE')
                      or has_table_privilege('authenticated', 'public.dining_tables', 'DELETE')
                      or has_table_privilege('authenticated', 'public.dining_areas', 'INSERT')
                      or has_table_privilege('authenticated', 'public.dining_areas', 'UPDATE')
                      or has_table_privilege('authenticated', 'public.dining_areas', 'DELETE')
                      or has_column_privilege('authenticated', 'public.dining_tables', 'name', 'INSERT')
                      or has_column_privilege('authenticated', 'public.dining_tables', 'name', 'UPDATE'))
            then 'OK   t60e tidak ada hak tulis langsung' else 'FAIL t60e ada hak tulis langsung' end as t60e2,
       case when has_column_privilege('anon', 'public.merchant_settings', 'table_mode', 'SELECT')
             and has_column_privilege('anon', 'public.merchant_settings', 'table_hold_minutes', 'SELECT')
             and not has_column_privilege('anon', 'public.merchant_settings', 'seats_per_slot', 'SELECT')
             and not has_column_privilege('anon', 'public.merchant_settings', 'auto_join_tables', 'SELECT')
             and has_column_privilege('authenticated', 'public.merchant_settings', 'table_mode', 'UPDATE')
             and not has_column_privilege('anon', 'public.bookings', 'party_size', 'SELECT')
             and not has_column_privilege('anon', 'public.bookings', 'customer_note', 'SELECT')
            then 'OK   t60e merchant_settings dan bookings' else 'FAIL t60e hak merchant_settings atau bookings' end as t60e3;

-- t60f RLS
begin;
set local role anon;
select case when (select count(*) from public.dining_areas where merchant_id = '60606060-0000-0000-0000-000000000001') = 0
             and (select count(*) from public.dining_tables where merchant_id = '60606060-0000-0000-0000-000000000001') = 0
            then 'OK   t60f anon: mode NONE tidak melihat denah' else 'FAIL t60f anon melihat denah mode NONE' end as t60f;
rollback;
update public.merchant_settings set table_mode = 'TABLE' where merchant_id = '60606060-0000-0000-0000-000000000001';
begin;
set local role anon;
select case when (select count(*) from public.dining_areas where merchant_id = '60606060-0000-0000-0000-000000000001') = 1
             and (select count(*) from public.dining_tables where merchant_id = '60606060-0000-0000-0000-000000000001') = 1
            then 'OK   t60f anon: mode TABLE melihat 1 area dan 1 meja online'
            else 'FAIL t60f anon mode TABLE salah' end as t60f2;
rollback;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '60606060-0000-0000-0000-000000000002';
select case when (select count(*) from public.dining_tables where merchant_id = '60606060-0000-0000-0000-000000000001') = 0
             and (select count(*) from public.dining_areas where merchant_id = '60606060-0000-0000-0000-000000000001') = 0
            then 'OK   t60f merchant lain tidak melihat denah' else 'FAIL t60f merchant lain melihat denah' end as t60f3;
rollback;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '60606060-0000-0000-0000-000000000001';
select case when (select count(*) from public.dining_tables) = 2
            then 'OK   t60f pemilik melihat semua mejanya' else 'FAIL t60f pemilik tidak melihat mejanya' end as t60f4;
rollback;

-- ===========================================================================
-- 61. Restoran: create_booking kapasitas (20261120000200)
-- ===========================================================================
-- Merchant ...0001 restoran (PRO), ...0002 salon STUDIO dengan staf untuk
-- regresi mode NONE. Tiap sub-bagian memakai minggu berbeda supaya beban
-- kursi dan meja tidak saling bocor.

insert into auth.users (id, email, raw_user_meta_data) values
  ('61616161-0000-0000-0000-000000000001', 'resto61-a@example.com', '{}'::jsonb),
  ('61616161-0000-0000-0000-000000000002', 'resto61-b@example.com', '{}'::jsonb);
update public.merchants set subscription_tier = 'PRO', username = 'resto-61'
  where id = '61616161-0000-0000-0000-000000000001';
update public.merchants set subscription_tier = 'STUDIO', username = 'resto-61b'
  where id = '61616161-0000-0000-0000-000000000002';
insert into public.availability (merchant_id, day_of_week, start_time, end_time)
select m, d, '10:00', '23:00'
from generate_series(1, 7) d,
     unnest(array['61616161-0000-0000-0000-000000000001', '61616161-0000-0000-0000-000000000002']::uuid[]) m;
insert into public.services (id, merchant_id, name, price, duration_minutes, payment_mode,
                             party_min, party_max, seat_duration_minutes) values
  ('61616161-5e00-0000-0000-000000000001', '61616161-0000-0000-0000-000000000001', 'Reservasi meja', 0, 60, 'ON_SITE', 1, 12, 90),
  ('61616161-5e00-0000-0000-000000000002', '61616161-0000-0000-0000-000000000001', 'Paket', 0, 120, 'ON_SITE', 15, 25, null),
  ('61616161-5e00-0000-0000-000000000003', '61616161-0000-0000-0000-000000000001', 'Biasa', 0, 60, 'ON_SITE', null, null, null),
  ('61616161-5e00-0000-0000-000000000004', '61616161-0000-0000-0000-000000000002', 'Potong', 0, 60, 'ON_SITE', null, null, null);
insert into public.staff (id, merchant_id, name, sort_order) values
  ('61616161-57af-0000-0000-000000000001', '61616161-0000-0000-0000-000000000002', 'A', 0),
  ('61616161-57af-0000-0000-000000000002', '61616161-0000-0000-0000-000000000002', 'B', 1);
insert into public.dining_areas (id, merchant_id, name) values
  ('61616161-a000-0000-0000-000000000001', '61616161-0000-0000-0000-000000000001', 'Dalam');
insert into public.dining_tables (id, merchant_id, area_id, name, min_seats, max_seats, grid_x, grid_y,
                                  bookable_online, joinable_with, sort_order) values
  ('61616161-7a00-0000-0000-000000000001', '61616161-0000-0000-0000-000000000001',
   '61616161-a000-0000-0000-000000000001', 'T1', 2, 4, 0, 0, true, '{}', 0),
  ('61616161-7a00-0000-0000-000000000002', '61616161-0000-0000-0000-000000000001',
   '61616161-a000-0000-0000-000000000001', 'T2', 2, 4, 4, 0, true, '{61616161-7a00-0000-0000-000000000001}', 1),
  ('61616161-7a00-0000-0000-000000000003', '61616161-0000-0000-0000-000000000001',
   '61616161-a000-0000-0000-000000000001', 'T3', 4, 6, 8, 0, false, '{}', 2);

-- Nomor unik per panggilan: batas booking aktif per nomor tidak ikut campur.
create sequence pg_temp.phone61;

-- Layanan: 1 reservasi, 2 paket, 3 biasa (merchant ...0001), 4 potong (...0002).
create or replace function pg_temp.cb61(p_service integer, p_weeks integer, p_time text,
  p_party integer default null, p_table uuid default null, p_staff uuid default null,
  p_area uuid default null)
returns setof public.bookings language plpgsql as $$
begin
  return query select * from public.create_booking(
    case when p_service = 4 then '61616161-0000-0000-0000-000000000002'::uuid
         else '61616161-0000-0000-0000-000000000001'::uuid end,
    ('61616161-5e00-0000-0000-' || lpad(p_service::text, 12, '0'))::uuid,
    pg_temp.jakarta_future(3, p_weeks, p_time),
    'Tamu 61', '+62813610' || lpad(nextval('pg_temp.phone61')::text, 5, '0'),
    p_staff, true, 'ONLINE', null, p_party, p_area, p_table, null);
end $$;

create or replace function pg_temp.cb61sql(p_service integer, p_weeks integer, p_time text,
  p_party integer default null, p_table text default null, p_staff text default null)
returns text language sql as $$
  select format('select * from pg_temp.cb61(%s, %s, %L, %s, %s, %s)', p_service, p_weeks, p_time,
    coalesce(p_party::text, 'null'), coalesce(quote_literal(p_table), 'null'), coalesce(quote_literal(p_staff), 'null'));
$$;

-- t61a regresi salon (mode NONE, staf).
select pg_temp.expect_ok(pg_temp.cb61sql(4, 1, '19:00', null, null, '61616161-57af-0000-0000-000000000001'),
  't61a booking staf A 19:00');
select pg_temp.expect_fail_code(pg_temp.cb61sql(4, 1, '19:30', null, null, '61616161-57af-0000-0000-000000000001'),
  '23P01', 't61a booking beririsan untuk staf A');
select pg_temp.expect_ok(pg_temp.cb61sql(4, 1, '19:00'), 't61a siapa saja 19:00');
select case when (select array_agg(staff_name order by staff_name) from public.bookings
                  where merchant_id = '61616161-0000-0000-0000-000000000002') = array['A', 'B']
             and (select bool_and(capacity_mode = 'NONE') from public.bookings
                  where merchant_id = '61616161-0000-0000-0000-000000000002')
            then 'OK   t61a siapa saja jatuh ke B, capacity_mode NONE'
            else 'FAIL t61a staf atau capacity_mode salah' end as t61a,
       case when (select array_agg(r.staff_id order by r.start_datetime, r.staff_id)
                  from public.get_booked_ranges('resto-61b', pg_temp.jakarta_future(3, 1, '00:00'),
                                                pg_temp.jakarta_future(3, 1, '23:59')) r)
                 = array['61616161-57af-0000-0000-000000000001', '61616161-57af-0000-0000-000000000002']::uuid[]
            then 'OK   t61a get_booked_ranges salon tidak berubah'
            else 'FAIL t61a get_booked_ranges salon berubah' end as t61a2;

-- t61b mode NONE di merchant restoran: layanan reservasi tetap slot eksklusif.
select pg_temp.expect_ok(pg_temp.cb61sql(1, 1, '19:00', 4), 't61b NONE reservasi 4 orang');
select pg_temp.expect_fail_code(pg_temp.cb61sql(1, 1, '19:00', 2), '23P01', 't61b NONE reservasi kedua di jam sama');
select case when party_size = 4 and capacity_mode = 'NONE' and end_datetime - start_datetime = interval '60 minutes'
                 and table_id is null
            then 'OK   t61b NONE: party_size tersimpan, durasi layanan 60 menit'
            else 'FAIL t61b NONE -> ' || capacity_mode || ' ' || (end_datetime - start_datetime) end as t61b
from public.bookings
where merchant_id = '61616161-0000-0000-0000-000000000001'
  and start_datetime = pg_temp.jakarta_future(3, 1, '19:00');
select pg_temp.expect_fail_code(pg_temp.cb61sql(1, 1, '12:00'), 'BK063', 't61b tanpa jumlah tamu');
select pg_temp.expect_fail_code(pg_temp.cb61sql(1, 1, '12:00', 13), 'BK063', 't61b 13 orang di atas rentang');

-- t61c mode AREA, 10 kursi per slot.
update public.merchant_settings set table_mode = 'AREA', seats_per_slot = 10
  where merchant_id = '61616161-0000-0000-0000-000000000001';
select pg_temp.expect_ok(pg_temp.cb61sql(1, 2, '19:00', 4), 't61c AREA reservasi 4 orang pertama');
select pg_temp.expect_ok(pg_temp.cb61sql(1, 2, '19:00', 4), 't61c AREA reservasi 4 orang kedua');
select pg_temp.expect_fail_code(pg_temp.cb61sql(1, 2, '19:00', 4), 'BK060', 't61c AREA 4 orang ketiga melebihi 10 kursi');
select pg_temp.expect_ok(pg_temp.cb61sql(1, 2, '19:00', 2), 't61c AREA 2 orang mengisi sisa kursi');
select pg_temp.expect_ok(pg_temp.cb61sql(2, 2, '20:00', 20), 't61c Paket (slot eksklusif) beririsan dengan reservasi');
select pg_temp.expect_ok(pg_temp.cb61sql(3, 2, '19:00'), 't61c layanan biasa beririsan dengan reservasi');
select case when count(*) = 3 and bool_and(capacity_mode = 'AREA' and staff_id is null and table_id is null
                                           and end_datetime - start_datetime = interval '90 minutes')
            then 'OK   t61c AREA: tiga reservasi, 90 menit, tanpa staf'
            else 'FAIL t61c AREA -> ' || count(*) end as t61c
from public.bookings
where merchant_id = '61616161-0000-0000-0000-000000000001'
  and service_id = '61616161-5e00-0000-0000-000000000001'
  and start_datetime = pg_temp.jakarta_future(3, 2, '19:00');

-- t61d beban puncak, bukan jumlah irisan (Review Focus 5).
select pg_temp.expect_ok(pg_temp.cb61sql(1, 3, '18:00', 6), 't61d 6 orang 18:00');
select pg_temp.expect_ok(pg_temp.cb61sql(1, 3, '19:30', 6), 't61d 6 orang 19:30');
select pg_temp.expect_ok(pg_temp.cb61sql(1, 3, '19:00', 4), 't61d 4 orang 19:00 (puncak 10)');
select pg_temp.expect_fail_code(pg_temp.cb61sql(1, 3, '19:00', 5), 'BK060', 't61d 5 orang 19:00 melebihi puncak');

-- t61e mode TABLE.
update public.merchant_settings set table_mode = 'TABLE', auto_join_tables = true
  where merchant_id = '61616161-0000-0000-0000-000000000001';
select pg_temp.expect_ok(pg_temp.cb61sql(1, 4, '19:00', 4), 't61e TABLE 4 orang pertama');
select case when table_id = '61616161-7a00-0000-0000-000000000001' and table_label = 'T1'
                 and area_id = '61616161-a000-0000-0000-000000000001' and capacity_mode = 'TABLE'
                 and joined_table_id is null
            then 'OK   t61e pertama dapat T1' else 'FAIL t61e pertama -> ' || coalesce(table_label, 'NULL') end as t61e
from public.bookings
where merchant_id = '61616161-0000-0000-0000-000000000001' and start_datetime = pg_temp.jakarta_future(3, 4, '19:00');
select pg_temp.expect_ok(pg_temp.cb61sql(1, 4, '19:00', 4), 't61e TABLE 4 orang kedua');
select case when (select array_agg(table_label order by table_label) from public.bookings
                  where merchant_id = '61616161-0000-0000-0000-000000000001'
                    and start_datetime = pg_temp.jakarta_future(3, 4, '19:00')) = array['T1', 'T2']
            then 'OK   t61e kedua dapat T2' else 'FAIL t61e kedua tidak dapat T2' end as t61e2;
select pg_temp.expect_fail_code(pg_temp.cb61sql(1, 4, '19:00', 4), 'BK060', 't61e ketiga online (T3 offline)');
begin;
set local role authenticated;
set local request.jwt.claim.sub = '61616161-0000-0000-0000-000000000001';
select pg_temp.expect_ok(format($q$select * from public.create_manual_booking(
    '61616161-5e00-0000-0000-000000000001', %L, 'Tamu manual', '+6281361099001', null, 4, null, 'Dekat jendela')$q$,
    pg_temp.jakarta_future(3, 4, '19:00')), 't61e manual memakai meja offline');
commit;
select case when table_label = 'T3' and source = 'MANUAL' and customer_note = 'Dekat jendela'
            then 'OK   t61e manual dapat T3' else 'FAIL t61e manual -> ' || coalesce(table_label, 'NULL') end as t61e3
from public.bookings where customer_whatsapp = '+6281361099001';
select pg_temp.expect_ok(pg_temp.cb61sql(1, 4, '21:00', 4, '61616161-7a00-0000-0000-000000000001'),
  't61e pilih T1 di 21:00');
select pg_temp.expect_fail_code(pg_temp.cb61sql(1, 4, '21:00', 4, '61616161-7a00-0000-0000-000000000001'),
  'BK061', 't61e pilih T1 lagi di 21:00');
select pg_temp.expect_fail_code(pg_temp.cb61sql(1, 4, '21:00', 1, '61616161-7a00-0000-0000-000000000003'),
  'BK061', 't61e 1 orang pilih T3 (minimal 4)');
select pg_temp.expect_ok(pg_temp.cb61sql(1, 4, '12:00', 7), 't61e 7 orang digabung');
select case when table_id = '61616161-7a00-0000-0000-000000000001'
                 and joined_table_id = '61616161-7a00-0000-0000-000000000002' and table_label = 'T1 + T2'
            then 'OK   t61e gabungan T1 + T2' else 'FAIL t61e gabungan -> ' || coalesce(table_label, 'NULL') end as t61e4
from public.bookings
where merchant_id = '61616161-0000-0000-0000-000000000001' and start_datetime = pg_temp.jakarta_future(3, 4, '12:00');
update public.merchant_settings set auto_join_tables = false
  where merchant_id = '61616161-0000-0000-0000-000000000001';
select pg_temp.expect_fail_code(pg_temp.cb61sql(1, 4, '14:00', 7), 'BK060', 't61e 7 orang tanpa gabung meja');
update public.merchant_settings set auto_join_tables = true
  where merchant_id = '61616161-0000-0000-0000-000000000001';

-- t61f cadangan constraint untuk penulis yang lupa mengambil kunci.
create or replace function pg_temp.ins61(p_time text, p_mode text, p_table text, p_joined text)
returns text language sql as $$
  select format($q$insert into public.bookings (merchant_id, service_name, service_price, duration_minutes,
      start_datetime, end_datetime, customer_name, customer_whatsapp, capacity_mode, party_size, table_id, joined_table_id)
    values ('61616161-0000-0000-0000-000000000001', 'Reservasi meja', 0, 90, %L, %L, 'Tamu 61f', '+6281361000999',
      %L, 2, %s, %s)$q$,
    pg_temp.jakarta_future(3, 5, p_time), pg_temp.jakarta_future(3, 5, p_time) + interval '90 minutes', p_mode,
    coalesce(quote_literal(p_table), 'null'), coalesce(quote_literal(p_joined), 'null'));
$$;
select pg_temp.expect_ok(pg_temp.ins61('12:00', 'TABLE', '61616161-7a00-0000-0000-000000000001', null), 't61f T1 langsung');
select pg_temp.expect_fail_code(pg_temp.ins61('12:30', 'TABLE', '61616161-7a00-0000-0000-000000000001', null),
  '23P01', 't61f T1 beririsan langsung');
select pg_temp.expect_ok(pg_temp.ins61('15:00', 'TABLE', '61616161-7a00-0000-0000-000000000001',
  '61616161-7a00-0000-0000-000000000002'), 't61f T1 + T2 langsung');
select pg_temp.expect_fail_code(pg_temp.ins61('15:30', 'TABLE', '61616161-7a00-0000-0000-000000000003',
  '61616161-7a00-0000-0000-000000000002'), '23P01', 't61f gabungan T2 beririsan langsung');
select pg_temp.expect_ok(pg_temp.ins61('18:00', 'AREA', null, null), 't61f AREA langsung pertama');
select pg_temp.expect_ok(pg_temp.ins61('18:30', 'AREA', null, null), 't61f AREA langsung beririsan');

-- t61g get_booked_ranges hanya rentang slot eksklusif.
select case when (select count(*) from public.get_booked_ranges('resto-61', pg_temp.jakarta_future(3, 2, '00:00'),
                                                                 pg_temp.jakarta_future(3, 2, '23:59'))) = 2
             and (select count(*) from public.bookings where merchant_id = '61616161-0000-0000-0000-000000000001'
                    and capacity_mode = 'AREA' and start_datetime = pg_temp.jakarta_future(3, 2, '19:00')) = 3
            then 'OK   t61g get_booked_ranges: Paket dan Biasa saja'
            else 'FAIL t61g get_booked_ranges memuat reservasi' end as t61g,
       case when (select count(*) from public.get_booked_ranges('resto-61', pg_temp.jakarta_future(3, 4, '00:00'),
                                                                 pg_temp.jakarta_future(3, 4, '23:59'))) = 0
            then 'OK   t61g get_booked_ranges: reservasi TABLE tidak terlihat'
            else 'FAIL t61g get_booked_ranges memuat reservasi TABLE' end as t61g2;

-- t61h hak akses.
select
  case when to_regprocedure('public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source, text, integer, uuid, uuid, text, uuid, uuid, text, text, text, text, uuid, integer)') is null
       then 'FAIL t61h signature sembilan belas argumen tidak ada'
       when has_function_privilege('anon', to_regprocedure('public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source, text, integer, uuid, uuid, text, uuid, uuid, text, text, text, text, uuid, integer)'), 'EXECUTE')
         or has_function_privilege('authenticated', to_regprocedure('public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source, text, integer, uuid, uuid, text, uuid, uuid, text, text, text, text, uuid, integer)'), 'EXECUTE')
       then 'FAIL t61h anon/authenticated bisa EXECUTE create_booking'
       when to_regprocedure('public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source, text)') is not null
       then 'FAIL t61h signature sembilan argumen masih ada'
       else 'OK   t61h create_booking sembilan belas argumen tertutup, sembilan argumen hilang' end as t61h1,
  case when to_regprocedure('public.create_manual_booking(uuid, timestamptz, text, text, uuid, integer, uuid, text, uuid, integer)') is null
       then 'FAIL t61h create_manual_booking baru tidak ada'
       when not has_function_privilege('authenticated', to_regprocedure('public.create_manual_booking(uuid, timestamptz, text, text, uuid, integer, uuid, text, uuid, integer)'), 'EXECUTE')
         or has_function_privilege('anon', to_regprocedure('public.create_manual_booking(uuid, timestamptz, text, text, uuid, integer, uuid, text, uuid, integer)'), 'EXECUTE')
       then 'FAIL t61h hak create_manual_booking salah'
       when to_regprocedure('public.create_manual_booking(uuid, timestamptz, text, text, uuid)') is not null
       then 'FAIL t61h create_manual_booking lima argumen masih ada'
       else 'OK   t61h create_manual_booking baru hanya authenticated' end as t61h2,
  case when to_regprocedure('public.seats_in_use(uuid, timestamptz, timestamptz, uuid)') is null
         or to_regprocedure('public.dining_table_busy(uuid, timestamptz, timestamptz, uuid)') is null
         or to_regprocedure('public.pick_dining_tables(uuid, timestamptz, timestamptz, integer, uuid, uuid, boolean, uuid)') is null
       then 'FAIL t61h helper kapasitas tidak ada'
       when exists (select 1 from unnest(array['anon', 'authenticated']) r, unnest(array[
                      'public.seats_in_use(uuid, timestamptz, timestamptz, uuid)',
                      'public.dining_table_busy(uuid, timestamptz, timestamptz, uuid)',
                      'public.pick_dining_tables(uuid, timestamptz, timestamptz, integer, uuid, uuid, boolean, uuid)']) f
                    where has_function_privilege(r, to_regprocedure(f), 'EXECUTE'))
       then 'FAIL t61h helper kapasitas bisa dipanggil anon/authenticated'
       else 'OK   t61h helper kapasitas tertutup' end as t61h3;

-- ===========================================================================
-- 62. Restoran: pindah jadwal reservasi (20261120000200)
-- ===========================================================================

create or replace function pg_temp.id61(p_weeks integer, p_time text, p_table text)
returns uuid language sql as $$
  select id from public.bookings
  where merchant_id = '61616161-0000-0000-0000-000000000001'
    and start_datetime = pg_temp.jakarta_future(3, p_weeks, p_time)
    and table_id = p_table::uuid;
$$;

create or replace function pg_temp.rs62(p_id uuid, p_weeks integer, p_time text)
returns text language sql as $$
  select format('select public.reschedule_booking_by_merchant(%L, %L)', p_id, pg_temp.jakarta_future(3, p_weeks, p_time));
$$;

-- Booking X (4 orang, T1 19:00) yang dipindah-pindah.
select pg_temp.expect_ok(pg_temp.cb61sql(1, 6, '19:00', 4), 't62 X di T1 19:00');
create temp table x62 as select pg_temp.id61(6, '19:00', '61616161-7a00-0000-0000-000000000001') as id;
grant select on x62 to authenticated;

-- t62a pindah ke 20:00, T1 kosong: meja tetap.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '61616161-0000-0000-0000-000000000001';
select pg_temp.expect_ok(pg_temp.rs62((select id from x62), 6, '20:00'), 't62a pindah ke 20:00');
commit;
select case when table_label = 'T1' and start_datetime = pg_temp.jakarta_future(3, 6, '20:00')
                 and end_datetime - start_datetime = interval '90 minutes'
            then 'OK   t62a tetap T1' else 'FAIL t62a -> ' || coalesce(table_label, 'NULL') end as t62a
from public.bookings where id = (select id from x62);

-- t62b pindah ke jam yang T1 dipegang booking lain: dapat T2.
select pg_temp.expect_ok(pg_temp.cb61sql(1, 6, '12:00', 4, '61616161-7a00-0000-0000-000000000001'), 't62b Y di T1 12:00');
begin;
set local role authenticated;
set local request.jwt.claim.sub = '61616161-0000-0000-0000-000000000001';
select pg_temp.expect_ok(pg_temp.rs62((select id from x62), 6, '12:00'), 't62b pindah ke 12:00');
commit;
select case when table_id = '61616161-7a00-0000-0000-000000000002' and table_label = 'T2'
                 and start_datetime = pg_temp.jakarta_future(3, 6, '12:00')
            then 'OK   t62b pindah ke T2' else 'FAIL t62b -> ' || coalesce(table_label, 'NULL') end as t62b
from public.bookings where id = (select id from x62);

-- t62c semua meja online cocok terisi: BK060, tidak ada yang berubah.
select pg_temp.expect_ok(pg_temp.cb61sql(1, 6, '15:00', 4), 't62c Z 15:00');
select pg_temp.expect_ok(pg_temp.cb61sql(1, 6, '15:00', 4), 't62c W 15:00');
begin;
set local role authenticated;
set local request.jwt.claim.sub = '61616161-0000-0000-0000-000000000001';
select pg_temp.expect_fail_code(pg_temp.rs62((select id from x62), 6, '15:00'), 'BK060', 't62c pindah ke jam penuh');
commit;
select case when table_label = 'T2' and start_datetime = pg_temp.jakarta_future(3, 6, '12:00')
            then 'OK   t62c jam dan meja tidak berubah' else 'FAIL t62c booking berubah' end as t62c
from public.bookings where id = (select id from x62);

-- t62d geser 30 menit (beririsan dengan dirinya sendiri): meja tetap.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '61616161-0000-0000-0000-000000000001';
select pg_temp.expect_ok(pg_temp.rs62((select id from x62), 6, '12:30'), 't62d geser 30 menit');
commit;
select case when table_label = 'T2' and start_datetime = pg_temp.jakarta_future(3, 6, '12:30')
            then 'OK   t62d tetap T2' else 'FAIL t62d -> ' || coalesce(table_label, 'NULL') end as t62d
from public.bookings where id = (select id from x62);

-- t62e mode AREA, 8 kursi.
update public.merchant_settings set table_mode = 'AREA', seats_per_slot = 8
  where merchant_id = '61616161-0000-0000-0000-000000000001';
select pg_temp.expect_ok(pg_temp.cb61sql(1, 7, '19:00', 6), 't62e 6 orang 19:00');
select pg_temp.expect_ok(pg_temp.cb61sql(1, 7, '12:00', 4), 't62e E 4 orang 12:00');
create temp table e62 as select id from public.bookings
  where merchant_id = '61616161-0000-0000-0000-000000000001' and start_datetime = pg_temp.jakarta_future(3, 7, '12:00');
grant select on e62 to authenticated;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '61616161-0000-0000-0000-000000000001';
select pg_temp.expect_fail_code(pg_temp.rs62((select id from e62), 7, '19:00'), 'BK060', 't62e pindah ke jam berisi 6 kursi');
select pg_temp.expect_ok(pg_temp.rs62((select id from e62), 7, '15:00'), 't62e pindah ke jam kosong');
commit;

-- ===========================================================================
-- 63. Restoran: ketersediaan publik (20261120000300)
-- ===========================================================================
-- Merchant ...0001 restoran (PRO, username resto-63). Meja T1 dan T2 (2 sampai
-- 4, online), T3 (4 sampai 6, offline), K1 (1 sampai 2, online), B1 (6 sampai
-- 8, online). Tiap sub-bagian memakai minggu berbeda.

insert into auth.users (id, email, raw_user_meta_data) values
  ('63636363-0000-0000-0000-000000000001', 'resto63@example.com', '{}'::jsonb);
update public.merchants set subscription_tier = 'PRO', username = 'resto-63'
  where id = '63636363-0000-0000-0000-000000000001';
insert into public.availability (merchant_id, day_of_week, start_time, end_time)
select '63636363-0000-0000-0000-000000000001', d, '10:00', '23:00' from generate_series(1, 7) d;
insert into public.services (id, merchant_id, name, price, duration_minutes, payment_mode,
                             party_min, party_max, seat_duration_minutes) values
  ('63636363-5e00-0000-0000-000000000001', '63636363-0000-0000-0000-000000000001', 'Reservasi meja', 0, 60, 'ON_SITE', 1, 12, 90),
  ('63636363-5e00-0000-0000-000000000002', '63636363-0000-0000-0000-000000000001', 'Biasa', 0, 60, 'ON_SITE', null, null, null);
insert into public.dining_areas (id, merchant_id, name) values
  ('63636363-a000-0000-0000-000000000001', '63636363-0000-0000-0000-000000000001', 'Dalam');
insert into public.dining_tables (id, merchant_id, area_id, name, min_seats, max_seats, grid_x, grid_y,
                                  bookable_online, sort_order) values
  ('63636363-7a00-0000-0000-000000000001', '63636363-0000-0000-0000-000000000001',
   '63636363-a000-0000-0000-000000000001', 'T1', 2, 4, 0, 0, true, 0),
  ('63636363-7a00-0000-0000-000000000002', '63636363-0000-0000-0000-000000000001',
   '63636363-a000-0000-0000-000000000001', 'T2', 2, 4, 4, 0, true, 1),
  ('63636363-7a00-0000-0000-000000000003', '63636363-0000-0000-0000-000000000001',
   '63636363-a000-0000-0000-000000000001', 'T3', 4, 6, 8, 0, false, 2),
  ('63636363-7a00-0000-0000-000000000004', '63636363-0000-0000-0000-000000000001',
   '63636363-a000-0000-0000-000000000001', 'K1', 1, 2, 12, 0, true, 3),
  ('63636363-7a00-0000-0000-000000000005', '63636363-0000-0000-0000-000000000001',
   '63636363-a000-0000-0000-000000000001', 'B1', 6, 8, 16, 0, true, 4);

create sequence pg_temp.phone63;
create or replace function pg_temp.cb63(p_weeks integer, p_time text, p_party integer)
returns text language sql as $$
  select format($q$select * from public.create_booking('63636363-0000-0000-0000-000000000001',
      '63636363-5e00-0000-0000-000000000001', %L, 'Tamu 63', %L, null, true, 'ONLINE', null, %s)$q$,
    pg_temp.jakarta_future(3, p_weeks, p_time),
    '+62813630' || lpad(nextval('pg_temp.phone63')::text, 5, '0'), p_party);
$$;
-- Hasil get_seat_availability sebagai teks "jam:available:tables_left".
create or replace function pg_temp.sa63(p_weeks integer, p_party integer, p_service integer default 1)
returns text language sql as $$
  select string_agg(to_char(r.start_datetime at time zone 'Asia/Jakarta', 'HH24:MI') || ':' || r.available
                    || ':' || coalesce(r.tables_left::text, '-'), ' ' order by r.start_datetime)
  from public.get_seat_availability('resto-63', ('63636363-5e00-0000-0000-' || lpad(p_service::text, 12, '0'))::uuid,
    p_party, null, array[pg_temp.jakarta_future(3, p_weeks, '19:00'), pg_temp.jakarta_future(3, p_weeks, '21:00')]) r;
$$;

-- t63a AREA, 10 kursi, 8 terpakai di 19:00. Dipanggil sebagai anon.
update public.merchant_settings set table_mode = 'AREA', seats_per_slot = 10
  where merchant_id = '63636363-0000-0000-0000-000000000001';
select pg_temp.expect_ok(pg_temp.cb63(1, '19:00', 4), 't63a 4 orang pertama');
select pg_temp.expect_ok(pg_temp.cb63(1, '19:00', 4), 't63a 4 orang kedua');
begin;
set local role anon;
select case when pg_temp.sa63(1, 2) = '19:00:true:- 21:00:true:-'
            then 'OK   t63a AREA 2 orang: 19:00 dan 21:00 tersedia'
            else 'FAIL t63a AREA 2 orang -> ' || coalesce(pg_temp.sa63(1, 2), 'NULL') end as t63a1,
       case when pg_temp.sa63(1, 3) = '19:00:false:- 21:00:true:-'
            then 'OK   t63a AREA 3 orang: 19:00 penuh, 21:00 tersedia'
            else 'FAIL t63a AREA 3 orang -> ' || coalesce(pg_temp.sa63(1, 3), 'NULL') end as t63a2,
       case when pg_temp.sa63(1, 13) = '19:00:false:- 21:00:false:-'
            then 'OK   t63a 13 orang di luar rentang layanan: semua tidak tersedia'
            else 'FAIL t63a 13 orang -> ' || coalesce(pg_temp.sa63(1, 13), 'NULL') end as t63a3;
commit;

-- t63b TABLE: T1 dan T2 terisi di 19:00.
update public.merchant_settings set table_mode = 'TABLE'
  where merchant_id = '63636363-0000-0000-0000-000000000001';
select pg_temp.expect_ok(pg_temp.cb63(2, '19:00', 4), 't63b 4 orang pertama');
select pg_temp.expect_ok(pg_temp.cb63(2, '19:00', 4), 't63b 4 orang kedua');
begin;
set local role anon;
select case when pg_temp.sa63(2, 4) = '19:00:false:0 21:00:true:2'
            then 'OK   t63b TABLE 4 orang: 19:00 penuh (T3 offline), 21:00 sisa 2 meja'
            else 'FAIL t63b TABLE 4 orang -> ' || coalesce(pg_temp.sa63(2, 4), 'NULL') end as t63b;
commit;

-- t63c status meja di 19:00 untuk 4 orang.
begin;
set local role anon;
select case when (select string_agg(t.name || '=' || s.status, ' ' order by t.name)
                  from public.get_table_status('resto-63', '63636363-5e00-0000-0000-000000000001',
                                               pg_temp.jakarta_future(3, 2, '19:00'), 4) s
                  join (values ('63636363-7a00-0000-0000-000000000001'::uuid, 'T1'),
                               ('63636363-7a00-0000-0000-000000000002'::uuid, 'T2'),
                               ('63636363-7a00-0000-0000-000000000003'::uuid, 'T3'),
                               ('63636363-7a00-0000-0000-000000000004'::uuid, 'K1'),
                               ('63636363-7a00-0000-0000-000000000005'::uuid, 'B1')) t(id, name)
                    on t.id = s.table_id)
                 = 'B1=TOO_LARGE K1=TOO_SMALL T1=TAKEN T2=TAKEN'
            then 'OK   t63c status meja: T1 T2 TAKEN, K1 TOO_SMALL, B1 TOO_LARGE, T3 tidak muncul'
            else 'FAIL t63c status meja salah' end as t63c;
commit;

-- t63d argumen tidak valid dan kembalian kosong.
select pg_temp.expect_fail_code($q$select * from public.get_seat_availability('resto-63',
    '63636363-5e00-0000-0000-000000000001', 2, null,
    array(select pg_temp.jakarta_future(3, 3, '10:00') + g * interval '5 minutes' from generate_series(1, 97) g))$q$,
  '22023', 't63d 97 jam kandidat');
select pg_temp.expect_fail_code($q$select * from public.get_seat_availability('resto-63',
    '63636363-5e00-0000-0000-000000000001', 0, null, array[now()])$q$, '22023', 't63d jumlah tamu 0');
select case when (select count(*) from public.get_seat_availability('tidak-ada-63',
                    '63636363-5e00-0000-0000-000000000001', 2, null, array[pg_temp.jakarta_future(3, 3, '19:00')])) = 0
            then 'OK   t63d username tidak dikenal: kosong' else 'FAIL t63d username tidak dikenal' end as t63d1,
       case when pg_temp.sa63(3, 2, 2) is null
             and (select count(*) from public.get_table_status('resto-63', '63636363-5e00-0000-0000-000000000002',
                    pg_temp.jakarta_future(3, 3, '19:00'), 2)) = 0
            then 'OK   t63d layanan bukan reservasi: kosong' else 'FAIL t63d layanan bukan reservasi' end as t63d2;
update public.merchant_settings set table_mode = 'NONE'
  where merchant_id = '63636363-0000-0000-0000-000000000001';
select case when pg_temp.sa63(3, 2) is null
             and (select count(*) from public.get_table_status('resto-63', '63636363-5e00-0000-0000-000000000001',
                    pg_temp.jakarta_future(3, 3, '19:00'), 2)) = 0
            then 'OK   t63d table_mode NONE: kosong' else 'FAIL t63d table_mode NONE' end as t63d3;
update public.merchant_settings set table_mode = 'AREA'
  where merchant_id = '63636363-0000-0000-0000-000000000001';
select case when (select count(*) from public.get_table_status('resto-63', '63636363-5e00-0000-0000-000000000001',
                    pg_temp.jakarta_future(3, 3, '19:00'), 2)) = 0
            then 'OK   t63d status meja di mode AREA: kosong' else 'FAIL t63d status meja di mode AREA' end as t63d4;

-- t63e hak akses dan bentuk kembalian.
select
  case when to_regprocedure('public.get_seat_availability(text, uuid, integer, uuid, timestamptz[])') is null
         or to_regprocedure('public.get_table_status(text, uuid, timestamptz, integer)') is null
       then 'FAIL t63e RPC baca tidak ada'
       when exists (select 1 from unnest(array['anon', 'authenticated']) r, unnest(array[
                      'public.get_seat_availability(text, uuid, integer, uuid, timestamptz[])',
                      'public.get_table_status(text, uuid, timestamptz, integer)']) f
                    where not has_function_privilege(r, to_regprocedure(f), 'EXECUTE'))
       then 'FAIL t63e anon/authenticated tidak bisa EXECUTE RPC baca'
       when pg_get_function_result(to_regprocedure('public.get_seat_availability(text, uuid, integer, uuid, timestamptz[])'))
              <> 'TABLE(start_datetime timestamp with time zone, available boolean, tables_left integer)'
         or pg_get_function_result(to_regprocedure('public.get_table_status(text, uuid, timestamptz, integer)'))
              <> 'TABLE(table_id uuid, status text)'
       then 'FAIL t63e kolom kembalian RPC baca berubah'
       else 'OK   t63e RPC baca terbuka untuk anon/authenticated, kembalian tanpa data pelanggan' end as t63e;

-- ===========================================================================
-- 64. Restoran: simpan denah (20261120000300)
-- ===========================================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('64646464-0000-0000-0000-000000000001', 'resto64@example.com', '{}'::jsonb);

create or replace function pg_temp.a64(n integer) returns uuid language sql immutable as $$
  select ('64646464-a000-0000-0000-' || lpad(n::text, 12, '0'))::uuid;
$$;
create or replace function pg_temp.t64(n integer) returns uuid language sql immutable as $$
  select ('64646464-7a00-0000-0000-' || lpad(n::text, 12, '0'))::uuid;
$$;
create or replace function pg_temp.area64(n integer, p_name text) returns jsonb language sql immutable as $$
  select jsonb_build_object('id', pg_temp.a64(n), 'name', p_name, 'sort_order', n);
$$;
create or replace function pg_temp.table64(n integer, p_area integer, p_name text, p_join uuid[] default '{}')
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', pg_temp.t64(n), 'area_id', pg_temp.a64(p_area), 'name', p_name,
    'min_seats', 2, 'max_seats', 4, 'shape', 'RECT', 'grid_x', n, 'grid_y', 0, 'grid_w', 3, 'grid_h', 3,
    'note', null, 'bookable_online', true, 'joinable_with', to_jsonb(p_join), 'sort_order', n);
$$;
create or replace function pg_temp.save64(p_areas jsonb[], p_tables jsonb[]) returns text language sql as $$
  select format('select public.save_dining_layout(%L::jsonb, %L::jsonb)',
    to_jsonb(p_areas), to_jsonb(p_tables));
$$;
create or replace function pg_temp.names64() returns text language sql as $$
  select string_agg(name, ' ' order by name) from public.dining_tables
  where merchant_id = '64646464-0000-0000-0000-000000000001';
$$;

-- t64a simpan, ganti nama, hapus, tambah, tukar nama.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '64646464-0000-0000-0000-000000000001';
select pg_temp.expect_ok(pg_temp.save64(
    array[pg_temp.area64(1, 'Dalam'), pg_temp.area64(2, 'Luar')],
    array[pg_temp.table64(1, 1, 'M1'), pg_temp.table64(2, 1, 'M2', array[pg_temp.t64(1)]), pg_temp.table64(3, 2, 'M3')]),
  't64a simpan pertama');
select case when pg_temp.names64() = 'M1 M2 M3'
             and (select count(*) from public.dining_areas where merchant_id = '64646464-0000-0000-0000-000000000001') = 2
             and (select joinable_with from public.dining_tables where id = pg_temp.t64(2)) = array[pg_temp.t64(1)]
            then 'OK   t64a simpan pertama: 2 area, 3 meja' else 'FAIL t64a simpan pertama -> ' || coalesce(pg_temp.names64(), 'NULL') end as t64a1;
select pg_temp.expect_ok(pg_temp.save64(
    array[pg_temp.area64(1, 'Dalam'), pg_temp.area64(2, 'Luar')],
    array[pg_temp.table64(1, 1, 'M1b'), pg_temp.table64(3, 2, 'M3'), pg_temp.table64(4, 2, 'M4')]),
  't64a simpan kedua');
select case when pg_temp.names64() = 'M1b M3 M4'
             and not exists (select 1 from public.dining_tables where id = pg_temp.t64(2))
             and (select area_id from public.dining_tables where id = pg_temp.t64(4)) = pg_temp.a64(2)
            then 'OK   t64a isi tabel persis payload kedua' else 'FAIL t64a simpan kedua -> ' || coalesce(pg_temp.names64(), 'NULL') end as t64a2;
select pg_temp.expect_ok(pg_temp.save64(
    array[pg_temp.area64(1, 'Dalam'), pg_temp.area64(2, 'Luar')],
    array[pg_temp.table64(1, 1, 'M3'), pg_temp.table64(3, 2, 'M1b'), pg_temp.table64(4, 2, 'M4')]),
  't64a tukar nama dua meja');
select case when (select name from public.dining_tables where id = pg_temp.t64(1)) = 'M3'
             and (select name from public.dining_tables where id = pg_temp.t64(3)) = 'M1b'
            then 'OK   t64a nama tertukar' else 'FAIL t64a nama tidak tertukar' end as t64a3;
-- Meja pindah ke area baru, area lamanya dihapus: meja tetap ada (bukan ikut terhapus kaskade).
select pg_temp.expect_ok(pg_temp.save64(
    array[pg_temp.area64(2, 'Luar'), pg_temp.area64(3, 'Teras')],
    array[pg_temp.table64(1, 3, 'M3'), pg_temp.table64(3, 2, 'M1b'), pg_temp.table64(4, 2, 'M4')]),
  't64a pindah meja ke area baru dan hapus area lama');
select case when (select area_id from public.dining_tables where id = pg_temp.t64(1)) = pg_temp.a64(3)
             and not exists (select 1 from public.dining_areas where id = pg_temp.a64(1))
            then 'OK   t64a meja pindah area, area lama terhapus' else 'FAIL t64a pindah area' end as t64a4;
commit;

-- t64b denah tidak valid dan hak milik.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '64646464-0000-0000-0000-000000000001';
select pg_temp.expect_fail_code(pg_temp.save64(
    array(select pg_temp.area64(g, 'Area ' || g) from generate_series(1, 11) g), array[]::jsonb[]),
  'BK064', 't64b 11 area');
select pg_temp.expect_fail_code(pg_temp.save64(
    array[pg_temp.area64(2, 'Luar')], array[pg_temp.table64(3, 2, 'M1'), pg_temp.table64(4, 2, ' m1 ')]),
  'BK064', 't64b nama meja ganda beda huruf besar');
select pg_temp.expect_fail_code(pg_temp.save64(
    array[pg_temp.area64(2, 'Luar'), pg_temp.area64(3, 'Teras')],
    array[pg_temp.table64(1, 3, 'M3'), pg_temp.table64(3, 2, 'M1b', array[pg_temp.t64(1)])]),
  'BK064', 't64b joinable_with ke meja area lain');
select pg_temp.expect_fail_code(pg_temp.save64(
    array[pg_temp.area64(2, 'Luar')], array[pg_temp.table64(3, 9, 'M1b')]),
  'BK064', 't64b area meja tidak ada di payload');
select pg_temp.expect_fail_code(format('select public.save_dining_layout(%L::jsonb, %L::jsonb)',
    jsonb_build_array(pg_temp.area64(2, 'Luar')),
    jsonb_build_array(pg_temp.table64(3, 2, 'M1b') || jsonb_build_object('id', '61616161-7a00-0000-0000-000000000001'))),
  '42501', 't64b id meja milik merchant lain');
commit;
select case when (select merchant_id from public.dining_tables where id = '61616161-7a00-0000-0000-000000000001')
                 = '61616161-0000-0000-0000-000000000001' and pg_temp.names64() = 'M1b M3 M4'
            then 'OK   t64b denah kedua merchant tidak berubah' else 'FAIL t64b denah berubah' end as t64b;
begin;
set local role authenticated;
select pg_temp.expect_fail_code(pg_temp.save64(array[]::jsonb[], array[]::jsonb[]), '42501', 't64b tanpa klaim sub');
commit;

-- t64c meja dengan reservasi mendatang tidak boleh dihapus.
create or replace function pg_temp.ins64(p_start timestamptz, p_table uuid, p_joined uuid, p_label text)
returns void language sql as $$
  insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime,
                               customer_name, customer_whatsapp, status, capacity_mode, party_size, table_id,
                               joined_table_id, table_label)
  values ('64646464-0000-0000-0000-000000000001', 'Reservasi meja', 0, 90, p_start, p_start + interval '90 minutes',
          'Tamu 64', '+6281364000001', 'CONFIRMED', 'TABLE', 4, p_table, p_joined, p_label);
$$;
-- Minggu depan: M1b (t64(3)) digabung M4 (t64(4)). Lampau: M3 (t64(1)).
select pg_temp.ins64(pg_temp.jakarta_future(3, 1, '19:00'), pg_temp.t64(3), pg_temp.t64(4), 'M1b + M4');
select pg_temp.ins64(now() - interval '3 days', pg_temp.t64(1), null, 'M3');
begin;
set local role authenticated;
set local request.jwt.claim.sub = '64646464-0000-0000-0000-000000000001';
select pg_temp.expect_fail_code(pg_temp.save64(
    array[pg_temp.area64(2, 'Luar'), pg_temp.area64(3, 'Teras')],
    array[pg_temp.table64(1, 3, 'M3 baru'), pg_temp.table64(4, 2, 'M4')]),
  'BK062', 't64c hapus meja utama reservasi minggu depan');
select pg_temp.expect_fail_code(pg_temp.save64(
    array[pg_temp.area64(2, 'Luar'), pg_temp.area64(3, 'Teras')],
    array[pg_temp.table64(1, 3, 'M3 baru'), pg_temp.table64(3, 2, 'M1b')]),
  'BK062', 't64c hapus meja gabungan reservasi minggu depan');
select case when pg_temp.names64() = 'M1b M3 M4'
            then 'OK   t64c simpan yang ditolak tidak mengubah apa pun' else 'FAIL t64c perubahan sebagian -> ' || pg_temp.names64() end as t64c1;
select pg_temp.expect_ok(pg_temp.save64(
    array[pg_temp.area64(2, 'Luar')],
    array[pg_temp.table64(3, 2, 'M1b'), pg_temp.table64(4, 2, 'M4')]),
  't64c hapus meja yang hanya punya booking lampau');
commit;
select case when b.table_id is null and b.table_label = 'M3' and pg_temp.names64() = 'M1b M4'
            then 'OK   t64c booking lampau: table_id null, table_label tetap'
            else 'FAIL t64c booking lampau -> ' || coalesce(b.table_label, 'NULL') end as t64c2
from public.bookings b
where b.merchant_id = '64646464-0000-0000-0000-000000000001' and b.start_datetime < now();

-- t64d hak akses.
select case when to_regprocedure('public.save_dining_layout(jsonb, jsonb)') is null
            then 'FAIL t64d save_dining_layout tidak ada'
            when has_function_privilege('anon', to_regprocedure('public.save_dining_layout(jsonb, jsonb)'), 'EXECUTE')
              or not has_function_privilege('authenticated', to_regprocedure('public.save_dining_layout(jsonb, jsonb)'), 'EXECUTE')
            then 'FAIL t64d hak save_dining_layout salah'
            else 'OK   t64d save_dining_layout hanya authenticated' end as t64d;

-- ===========================================================================
-- 65. Progres panduan: skema dan hak akses (20261121000100)
-- ===========================================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('65656565-0000-0000-0000-000000000001', 'guide65-a@example.com', '{}'::jsonb),
  ('65656565-0000-0000-0000-000000000002', 'guide65-b@example.com', '{}'::jsonb),
  ('65656565-0000-0000-0000-000000000003', 'guide65-c@example.com', '{}'::jsonb),
  ('65656565-0000-0000-0000-000000000004', 'guide65-d@example.com', '{}'::jsonb);
update public.merchants set subscription_tier = 'PRO'
  where id in ('65656565-0000-0000-0000-000000000001', '65656565-0000-0000-0000-000000000002');
update public.merchants set subscription_tier = 'STUDIO'
  where id = '65656565-0000-0000-0000-000000000003';

select case when not has_table_privilege('anon', 'public.merchant_onboarding_progress', 'SELECT')
             and not has_table_privilege('anon', 'public.merchant_onboarding_progress', 'INSERT')
             and not has_table_privilege('anon', 'public.merchant_onboarding_progress', 'UPDATE')
             and not has_table_privilege('anon', 'public.merchant_onboarding_progress', 'DELETE')
            then 'OK   t65a anon tanpa hak apa pun ke merchant_onboarding_progress'
            else 'FAIL t65a anon punya hak ke merchant_onboarding_progress' end as t65a;

select case when has_any_column_privilege('authenticated', 'public.merchant_onboarding_progress', 'SELECT')
             and not has_table_privilege('authenticated', 'public.merchant_onboarding_progress', 'INSERT')
             and not has_table_privilege('authenticated', 'public.merchant_onboarding_progress', 'UPDATE')
             and not has_table_privilege('authenticated', 'public.merchant_onboarding_progress', 'DELETE')
            then 'OK   t65b authenticated hanya boleh SELECT'
            else 'FAIL t65b hak authenticated salah' end as t65b;

select case when to_regprocedure('public.save_onboarding_progress(text, text, boolean)') is null
              or to_regprocedure('public.onboarding_state()') is null
            then 'FAIL t65c fungsi tidak ada'
            when has_function_privilege('anon', 'public.save_onboarding_progress(text, text, boolean)', 'EXECUTE')
              or has_function_privilege('anon', 'public.onboarding_state()', 'EXECUTE')
              or not has_function_privilege('authenticated', 'public.save_onboarding_progress(text, text, boolean)', 'EXECUTE')
              or not has_function_privilege('authenticated', 'public.onboarding_state()', 'EXECUTE')
            then 'FAIL t65c hak EXECUTE salah'
            else 'OK   t65c kedua fungsi hanya authenticated' end as t65c;

select pg_temp.expect_fail_code(
  $q$insert into public.merchant_onboarding_progress (merchant_id, steps_completed)
     values ('65656565-0000-0000-0000-000000000004', '{BOOKING}')$q$,
  '23514', 't65d steps_completed di luar PAGE/SHARE');
select pg_temp.expect_fail_code(
  $q$insert into public.merchant_onboarding_progress (merchant_id, tours_seen)
     values ('65656565-0000-0000-0000-000000000004', '{beranda}')$q$,
  '23514', 't65d tours_seen di luar 13 kunci');

-- ===========================================================================
-- 66. save_onboarding_progress
-- ===========================================================================

begin;
set local role authenticated;
set local request.jwt.claim.sub = '65656565-0000-0000-0000-000000000001';
select public.save_onboarding_progress(p_step => 'SHARE');
select public.save_onboarding_progress(p_step => 'SHARE');
commit;
select case when count(*) = 1 and min(steps_completed::text) = '{SHARE}'
            then 'OK   t66a SHARE dua kali: satu baris, tanpa duplikat'
            else 'FAIL t66a -> ' || count(*) || ' baris, ' || coalesce(min(steps_completed::text), 'NULL') end as t66a
from public.merchant_onboarding_progress where merchant_id = '65656565-0000-0000-0000-000000000001';

begin;
set local role authenticated;
set local request.jwt.claim.sub = '65656565-0000-0000-0000-000000000001';
select public.save_onboarding_progress(p_tour => 'today');
select public.save_onboarding_progress(p_tour => 'services');
select public.save_onboarding_progress(p_tour => 'today');
commit;
select case when tours_seen = '{today,services}' and steps_completed = '{SHARE}'
            then 'OK   t66b tour ditambah sekali, langkah tetap'
            else 'FAIL t66b -> ' || tours_seen::text || ' / ' || steps_completed::text end as t66b
from public.merchant_onboarding_progress where merchant_id = '65656565-0000-0000-0000-000000000001';

begin;
set local role authenticated;
set local request.jwt.claim.sub = '65656565-0000-0000-0000-000000000001';
select public.save_onboarding_progress(p_dismissed => true);
commit;
create temp table t66c_awal as
  select checklist_dismissed_at as ts from public.merchant_onboarding_progress
  where merchant_id = '65656565-0000-0000-0000-000000000001';
select pg_sleep(0.05);
begin;
set local role authenticated;
set local request.jwt.claim.sub = '65656565-0000-0000-0000-000000000001';
select public.save_onboarding_progress(p_dismissed => true);
commit;
select case when p.checklist_dismissed_at is not null and p.checklist_dismissed_at = a.ts
            then 'OK   t66c dismissed terisi dan tidak berubah saat diulang'
            else 'FAIL t66c dismissed -> ' || coalesce(p.checklist_dismissed_at::text, 'NULL') end as t66c1
from public.merchant_onboarding_progress p, t66c_awal a
where p.merchant_id = '65656565-0000-0000-0000-000000000001';
begin;
set local role authenticated;
set local request.jwt.claim.sub = '65656565-0000-0000-0000-000000000001';
select public.save_onboarding_progress(p_dismissed => false);
commit;
select case when checklist_dismissed_at is null and tours_seen = '{today,services}'
            then 'OK   t66c false mengosongkan dismissed, kolom lain utuh'
            else 'FAIL t66c false -> ' || coalesce(checklist_dismissed_at::text, 'NULL') end as t66c2
from public.merchant_onboarding_progress where merchant_id = '65656565-0000-0000-0000-000000000001';

begin;
set local role authenticated;
set local request.jwt.claim.sub = '65656565-0000-0000-0000-000000000001';
select pg_temp.expect_fail_code($q$select public.save_onboarding_progress(p_step => 'SERVICE')$q$,
  '23514', 't66d langkah di luar PAGE/SHARE');
select pg_temp.expect_fail_code($q$select public.save_onboarding_progress(p_tour => 'beranda')$q$,
  '23514', 't66d kunci tur tidak dikenal');
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '';
select pg_temp.expect_fail_code($q$select public.save_onboarding_progress(p_tour => 'today')$q$,
  '42501', 't66e tanpa sesi');
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '65656565-0000-0000-0000-000000000002';
select case when count(*) = 0 then 'OK   t66f B tidak melihat progres A'
            else 'FAIL t66f B melihat ' || count(*) || ' baris' end as t66f1
from public.merchant_onboarding_progress;
select public.save_onboarding_progress(p_tour => 'billing');
commit;
select case when (select tours_seen from public.merchant_onboarding_progress
                  where merchant_id = '65656565-0000-0000-0000-000000000001') = '{today,services}'
             and (select tours_seen from public.merchant_onboarding_progress
                  where merchant_id = '65656565-0000-0000-0000-000000000002') = '{billing}'
            then 'OK   t66f tulis B hanya mengubah baris B'
            else 'FAIL t66f tulis B memengaruhi A' end as t66f2;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '65656565-0000-0000-0000-000000000001';
select case when count(*) = 1 then 'OK   t66f A melihat barisnya sendiri'
            else 'FAIL t66f A melihat ' || count(*) end as t66f3
from public.merchant_onboarding_progress;
commit;

-- ===========================================================================
-- 67. onboarding_state: fakta kesiapan
-- ===========================================================================

-- Ringkas: has_service has_hours has_active_payment needs_online page_customized has_online_booking.
create or replace function pg_temp.facts67(p_merchant integer) returns text language plpgsql as $$
declare r record;
begin
  perform set_config('request.jwt.claim.sub',
    '65656565-0000-0000-0000-' || lpad(p_merchant::text, 12, '0'), true);
  select * into r from public.onboarding_state();
  return r.has_service::int::text || r.has_hours::int::text || r.has_active_payment::int::text
    || r.needs_online_payment::int::text || r.page_customized::int::text || r.has_online_booking::int::text;
end $$;

create or replace function pg_temp.chk67(p_label text, p_merchant integer, p_expect text) returns text
language sql as $$
  select case when pg_temp.facts67(p_merchant) = p_expect then 'OK   ' || p_label
              else 'FAIL ' || p_label || ' -> ' || pg_temp.facts67(p_merchant) || ' (harap ' || p_expect || ')' end;
$$;

-- t67a merchant kosong.
begin;
set local role authenticated;
select pg_temp.chk67('t67a merchant kosong: semua false', 4, '000000');
select case when s.steps_completed = '{}' and s.tours_seen = '{}' and s.checklist_dismissed_at is null
            then 'OK   t67a progres kosong' else 'FAIL t67a progres tidak kosong' end as t67a2
from public.onboarding_state() s;
commit;

-- t67b jam buka: availability (A) atau hanya staff_availability (C).
insert into public.availability (merchant_id, day_of_week, start_time, end_time)
  values ('65656565-0000-0000-0000-000000000001', 1, '09:00', '17:00');
insert into public.staff (id, merchant_id, name, sort_order)
  values ('65656565-57af-0000-0000-000000000003', '65656565-0000-0000-0000-000000000003', 'Ayu', 0);
insert into public.staff_availability (staff_id, merchant_id, day_of_week, start_time, end_time)
  values ('65656565-57af-0000-0000-000000000003', '65656565-0000-0000-0000-000000000003', 1, '09:00', '17:00');
begin;
set local role authenticated;
select pg_temp.chk67('t67b availability: has_hours', 1, '010000');
select pg_temp.chk67('t67b hanya staff_availability: has_hours', 3, '010000');
commit;

-- t67c layanan: ON_SITE, gratis, dan nonaktif tidak butuh gateway; REQUEST butuh.
insert into public.services (merchant_id, name, price, duration_minutes, payment_mode, is_active)
  values ('65656565-0000-0000-0000-000000000001', 'Di tempat', 100000, 30, 'ON_SITE', true);
begin; set local role authenticated;
select pg_temp.chk67('t67c ON_SITE aktif: has_service, tanpa gateway', 1, '110000'); commit;
insert into public.services (merchant_id, name, price, duration_minutes, payment_mode, is_active)
  values ('65656565-0000-0000-0000-000000000001', 'Gratis', 0, 30, 'FULL', true);
begin; set local role authenticated;
select pg_temp.chk67('t67c FULL harga 0 tetap tanpa gateway', 1, '110000'); commit;
insert into public.services (merchant_id, name, price, duration_minutes, payment_mode, is_active)
  values ('65656565-0000-0000-0000-000000000001', 'Nonaktif', 100000, 30, 'FULL', false);
begin; set local role authenticated;
select pg_temp.chk67('t67c FULL nonaktif tidak dihitung', 1, '110000'); commit;
insert into public.services (merchant_id, name, price, duration_minutes, payment_mode, is_active)
  values ('65656565-0000-0000-0000-000000000001', 'Permintaan', 100000, 30, 'REQUEST', true);
begin; set local role authenticated;
select pg_temp.chk67('t67c REQUEST aktif butuh gateway', 1, '110100'); commit;

-- t67d koneksi pembayaran: EXPIRED tidak dihitung, ACTIVE dihitung.
insert into public.payment_connections (merchant_id, provider, status)
  values ('65656565-0000-0000-0000-000000000001', 'MIDTRANS', 'EXPIRED');
begin; set local role authenticated;
select pg_temp.chk67('t67d koneksi EXPIRED: has_active_payment false', 1, '110100'); commit;
update public.payment_connections set status = 'ACTIVE'
  where merchant_id = '65656565-0000-0000-0000-000000000001';
begin; set local role authenticated;
select pg_temp.chk67('t67d koneksi ACTIVE: has_active_payment true', 1, '111100'); commit;

-- t67e tampilan: baris merchant_themes (A) atau avatar_url (D).
insert into public.merchant_themes (merchant_id) values ('65656565-0000-0000-0000-000000000001');
update public.merchants set avatar_url = 'https://lh3.googleusercontent.com/guide65'
  where id = '65656565-0000-0000-0000-000000000004';
begin; set local role authenticated;
select pg_temp.chk67('t67e merchant_themes: page_customized', 1, '111110');
select pg_temp.chk67('t67e avatar_url: page_customized', 4, '000010');
commit;

-- t67f booking: MANUAL tidak dihitung, ONLINE (status apa pun) dihitung.
insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime,
  customer_name, customer_whatsapp, status, expires_at, amount_due_now, amount_due_on_site, payment_mode, source)
values ('65656565-0000-0000-0000-000000000001', 'Layanan 67', 100000, 30, now() + interval '2 days',
  now() + interval '2 days 30 minutes', 'Pelanggan 67', '+6281365000001', 'CONFIRMED',
  now() + interval '15 minutes', 0, 100000, 'ON_SITE', 'MANUAL');
begin; set local role authenticated;
select pg_temp.chk67('t67f booking MANUAL saja: has_online_booking false', 1, '111110'); commit;
insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime,
  customer_name, customer_whatsapp, status, expires_at, amount_due_now, amount_due_on_site, payment_mode, source)
values ('65656565-0000-0000-0000-000000000001', 'Layanan 67', 100000, 30, now() + interval '3 days',
  now() + interval '3 days 30 minutes', 'Pelanggan 67', '+6281365000002', 'CANCELLED',
  now() + interval '15 minutes', 0, 100000, 'ON_SITE', 'ONLINE');
begin; set local role authenticated;
select pg_temp.chk67('t67f booking ONLINE CANCELLED: has_online_booking true', 1, '111111'); commit;

-- t67g B mendapat fakta B, bukan A.
begin; set local role authenticated;
select pg_temp.chk67('t67g B tidak melihat fakta A', 2, '000000'); commit;

-- t67h tanpa sesi: 0 baris.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '';
select case when count(*) = 0 then 'OK   t67h tanpa sesi: 0 baris'
            else 'FAIL t67h tanpa sesi: ' || count(*) || ' baris' end as t67h
from public.onboarding_state();
commit;

-- 70. Klaim username dari landing (20261122000100)
select pg_temp.expect_fail(
  $q$update public.merchants set username = 'untuk' where id = '11111111-1111-1111-1111-111111111111'$q$,
  'username reserved "untuk"');

select
  case when not has_table_privilege('anon', 'public.username_check_attempts', 'SELECT')
        and not has_table_privilege('authenticated', 'public.username_check_attempts', 'SELECT')
       then 'OK   t70b anon/authenticated tanpa SELECT di username_check_attempts'
       else 'FAIL t70b tabel username_check_attempts terbuka' end as t70b1,
  case when not has_function_privilege('anon', 'public.check_username_claim(text, text)', 'EXECUTE')
        and not has_function_privilege('authenticated', 'public.check_username_claim(text, text)', 'EXECUTE')
        and has_function_privilege('service_role', 'public.check_username_claim(text, text)', 'EXECUTE')
       then 'OK   t70b check_username_claim hanya service_role'
       else 'FAIL t70b grant check_username_claim salah' end as t70b2;

select case when public.check_username_claim('untuk', 'hash-70-c') = 'reserved'
             and public.check_username_claim('dashboard', 'hash-70-c') = 'reserved'
             and public.check_username_claim((select username from public.merchants where username is not null limit 1), 'hash-70-c') = 'taken'
             and public.check_username_claim('belum-ada-70', 'hash-70-c') = 'available'
            then 'OK   t70c reserved/taken/available'
            else 'FAIL t70c status username salah' end as t70c;

select case when (select count(*) from generate_series(1, 30)
                  where public.check_username_claim('belum-ada-70', 'hash-70-d') = 'rate_limited') = 0
             and public.check_username_claim('belum-ada-70', 'hash-70-d') = 'rate_limited'
            then 'OK   t70d cek ke-31 rate_limited'
            else 'FAIL t70d batas 30 per hash salah' end as t70d;

select case when public.check_username_claim('belum-ada-70', 'hash-70-e') = 'available'
            then 'OK   t70e hash lain tidak ikut terblokir'
            else 'FAIL t70e hash lain terblokir' end as t70e;

select case when (select count(*) from generate_series(1, 40)
                  where public.check_username_claim('belum-ada-70', '') = 'rate_limited') = 0
             and (select count(*) from public.username_check_attempts where ip_hash = '') = 0
            then 'OK   t70f hash kosong: tanpa batas, tanpa catatan'
            else 'FAIL t70f hash kosong salah' end as t70f;

-- 71. Masa awal gratis: merchant baru bertier STUDIO (20261123000100)
alter table public.merchants alter column subscription_tier set default 'STUDIO';
insert into auth.users (id, email) values
  ('71717171-7171-7171-7171-717171717171', 'awal-gratis-71@example.com');

select case when (select subscription_tier from public.merchants
                  where id = '71717171-7171-7171-7171-717171717171') = 'STUDIO'
            then 'OK   t71a merchant baru otomatis bertier STUDIO'
            else 'FAIL t71a merchant baru tidak bertier STUDIO' end as t71a;

select case when (select count(*) from public.merchants
                  where subscription_tier <> 'STUDIO'
                    and id = '71717171-7171-7171-7171-717171717171') = 0
             and (select column_default from information_schema.columns
                  where table_schema = 'public' and table_name = 'merchants'
                    and column_name = 'subscription_tier') like '%STUDIO%'
            then 'OK   t71b default kolom subscription_tier adalah STUDIO'
            else 'FAIL t71b default kolom bukan STUDIO' end as t71b;

-- 72. Batas QRIS: PENDING di atas Rp10.000.000 ditolak BK037 (20261124000200)
-- Merchant fixture dari bagian 67; slot beda-beda agar bookings_no_overlap tidak menangkap lebih dulu.
select pg_temp.expect_fail_code(
  $q$insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime,
       customer_name, customer_whatsapp, status, expires_at, amount_due_now, amount_due_on_site, payment_mode, source)
     values ('65656565-0000-0000-0000-000000000001', 'Layanan 72', 10000001, 30, now() + interval '10 days',
       now() + interval '10 days 30 minutes', 'Pelanggan 72', '+6281372000001', 'PENDING',
       now() + interval '15 minutes', 10000001, 0, 'FULL', 'ONLINE')$q$,
  'BK037', 't72a PENDING 10000001 ditolak');

select pg_temp.expect_ok(
  $q$insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime,
       customer_name, customer_whatsapp, status, expires_at, amount_due_now, amount_due_on_site, payment_mode, source)
     values ('65656565-0000-0000-0000-000000000001', 'Layanan 72', 10000000, 30, now() + interval '11 days',
       now() + interval '11 days 30 minutes', 'Pelanggan 72', '+6281372000002', 'PENDING',
       now() + interval '15 minutes', 10000000, 0, 'FULL', 'ONLINE')$q$,
  't72b PENDING 10000000 diterima');

select pg_temp.expect_ok(
  $q$insert into public.bookings (merchant_id, service_name, service_price, duration_minutes, start_datetime, end_datetime,
       customer_name, customer_whatsapp, status, expires_at, amount_due_now, amount_due_on_site, payment_mode, source)
     values ('65656565-0000-0000-0000-000000000001', 'Layanan 72', 50000000, 30, now() + interval '12 days',
       now() + interval '12 days 30 minutes', 'Pelanggan 72', '+6281372000003', 'CONFIRMED',
       now() + interval '15 minutes', 0, 50000000, 'ON_SITE', 'ONLINE')$q$,
  't72c CONFIRMED harga di atas batas diterima');

-- ===========================================================================
-- 73. Tautan iklan, pixel, link-in-bio (20261125000200)
-- ===========================================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('73737373-0000-0000-0000-000000000001', 'funnel73-a@example.com', '{}'::jsonb),
  ('73737373-0000-0000-0000-000000000002', 'funnel73-b@example.com', '{}'::jsonb);
update public.merchants set username = 'funnel73a' where id = '73737373-0000-0000-0000-000000000001';
update public.merchants set username = 'funnel73b' where id = '73737373-0000-0000-0000-000000000002';

insert into public.ad_links (id, merchant_id, slug, name, channel, voucher_code) values
  ('73737373-1111-0000-0000-000000000001', '73737373-0000-0000-0000-000000000001', 'bio-ig', 'Bio IG', 'IG_BIO', 'HEMAT'),
  ('73737373-1111-0000-0000-000000000002', '73737373-0000-0000-0000-000000000001', 'lama', 'Lama', 'META_ADS', null);
update public.ad_links set archived_at = now() where id = '73737373-1111-0000-0000-000000000002';

-- anon tidak boleh membaca tabel mentah
begin;
set local role anon;
select pg_temp.expect_fail_code($q$select * from public.ad_links$q$, '42501', 't73a anon select ad_links ditolak');
select pg_temp.expect_fail_code($q$select * from public.merchant_tracking$q$, '42501', 't73b anon select merchant_tracking ditolak');
rollback;

-- CHECK ID pixel
select pg_temp.expect_fail_code(
  $q$insert into public.merchant_tracking (merchant_id, meta_pixel_id) values ('73737373-0000-0000-0000-000000000001', '12345-678')$q$,
  '23514', 't73c meta_pixel_id "12345-678" ditolak CHECK');
select pg_temp.expect_fail_code(
  $q$insert into public.merchant_tracking (merchant_id, ga4_measurement_id) values ('73737373-0000-0000-0000-000000000001', 'G-abc')$q$,
  '23514', 't73d ga4 tidak cocok pola ditolak');
select pg_temp.expect_fail_code(
  $q$insert into public.merchant_tracking (merchant_id, tiktok_pixel_id) values ('73737373-0000-0000-0000-000000000001', 'abc')$q$,
  '23514', 't73e tiktok tidak cocok pola ditolak');

insert into public.merchant_tracking (merchant_id, meta_pixel_id, tiktok_pixel_id, ga4_measurement_id, meta_enabled, tiktok_enabled, ga4_enabled)
values ('73737373-0000-0000-0000-000000000001', '123456789012345', 'ABCDEFGHIJ0123456789', 'G-ABC123XYZ', true, false, true);

select case when (select meta_pixel_id from public.get_public_tracking('73737373-0000-0000-0000-000000000001')) = '123456789012345'
             and (select tiktok_pixel_id from public.get_public_tracking('73737373-0000-0000-0000-000000000001')) is null
             and (select ga4_measurement_id from public.get_public_tracking('73737373-0000-0000-0000-000000000001')) = 'G-ABC123XYZ'
            then 'OK   t73f get_public_tracking hanya mengembalikan ID yang aktif'
            else 'FAIL t73f get_public_tracking membocorkan ID yang dimatikan' end as t73f;

begin;
set local role anon;
select case when (select count(*) from public.get_public_tracking('73737373-0000-0000-0000-000000000001')) = 1
            then 'OK   t73g anon boleh memanggil get_public_tracking'
            else 'FAIL t73g anon tidak bisa get_public_tracking' end as t73g;
rollback;

-- resolve_ad_link
select case when (select count(*) from public.resolve_ad_link('funnel73a', 'bio-ig')) = 1
             and (select voucher_code from public.resolve_ad_link('funnel73a', 'bio-ig')) = 'HEMAT'
             and (select channel::text from public.resolve_ad_link('funnel73a', 'bio-ig')) = 'IG_BIO'
            then 'OK   t73h resolve_ad_link mengembalikan tautan aktif'
            else 'FAIL t73h resolve_ad_link tautan aktif' end as t73h;
select case when (select count(*) from public.resolve_ad_link('funnel73a', 'lama')) = 0
             and (select count(*) from public.resolve_ad_link('funnel73b', 'bio-ig')) = 0
            then 'OK   t73i resolve_ad_link mengabaikan slug diarsipkan dan milik merchant lain'
            else 'FAIL t73i resolve_ad_link mengembalikan slug diarsipkan/merchant lain' end as t73i;

-- slug tidak valid
select pg_temp.expect_fail_code(
  $q$insert into public.ad_links (merchant_id, slug, name, channel) values ('73737373-0000-0000-0000-000000000001', 'Ab', 'x', 'OTHER')$q$,
  '23514', 't73j slug tidak valid ditolak');

-- merchant_links: URL dan batas 8
select pg_temp.expect_fail_code(
  $q$insert into public.merchant_links (merchant_id, label, url) values ('73737373-0000-0000-0000-000000000001', 'x', 'javascript:alert(1)')$q$,
  '23514', 't73k url javascript: ditolak');
select pg_temp.expect_fail_code(
  $q$insert into public.merchant_links (merchant_id, label, url) values ('73737373-0000-0000-0000-000000000001', 'x', 'http://a.b')$q$,
  '23514', 't73l url http:// ditolak');

insert into public.merchant_links (merchant_id, label, url, sort_order)
select '73737373-0000-0000-0000-000000000001', 'Tautan ' || n, 'https://contoh.id/' || n, n from generate_series(1, 8) n;
select pg_temp.expect_fail_code(
  $q$insert into public.merchant_links (merchant_id, label, url) values ('73737373-0000-0000-0000-000000000001', 'Ke-9', 'https://contoh.id/9')$q$,
  'BK080', 't73m tautan ke-9 ditolak trigger');

-- anon hanya melihat tautan is_visible
update public.merchant_links set is_visible = false
  where merchant_id = '73737373-0000-0000-0000-000000000001' and sort_order = 1;
begin;
set local role anon;
select case when (select count(*) from public.merchant_links where merchant_id = '73737373-0000-0000-0000-000000000001') = 7
            then 'OK   t73n anon hanya melihat tautan is_visible'
            else 'FAIL t73n anon melihat tautan tersembunyi' end as t73n;
select pg_temp.expect_fail_code($q$select is_visible from public.merchant_links$q$, '42501', 't73o anon tidak boleh membaca kolom is_visible');
select pg_temp.expect_fail_code($q$select contact_instagram from public.merchant_settings$q$, '42501', 't73p anon tidak boleh membaca kontak mentah');
rollback;

-- tema: LINKS di depan, constraint empat nilai
insert into public.merchant_themes (merchant_id) values ('73737373-0000-0000-0000-000000000001');
select case when (select section_order from public.merchant_themes where merchant_id = '73737373-0000-0000-0000-000000000001')
                 = array['PROMO', 'SERVICES', 'FAQ']
             and (select show_social_icons from public.merchant_themes where merchant_id = '73737373-0000-0000-0000-000000000001')
            then 'OK   t73q section_order bawaan tiga bagian (0600), show_social_icons true'
            else 'FAIL t73q section_order bawaan' end as t73q;
select pg_temp.expect_fail_code(
  $q$update public.merchant_themes set section_order = array['LINKS', 'PROMO', 'FAQ'] where merchant_id = '73737373-0000-0000-0000-000000000001'$q$,
  '23514', 't73r section_order tanpa SERVICES ditolak');
select pg_temp.expect_ok(
  $q$update public.merchant_themes set hidden_sections = array['LINKS', 'FAQ'] where merchant_id = '73737373-0000-0000-0000-000000000001'$q$,
  't73s hidden_sections menerima LINKS');

-- save_merchant_links
begin;
set local role authenticated;
set local request.jwt.claim.sub = '73737373-0000-0000-0000-000000000001';
select public.save_merchant_links(
  '[{"id":"73737373-2222-0000-0000-000000000001","label":"Menu","url":"https://menu.id","sort_order":0,"is_visible":true}]'::jsonb,
  false, array['FAQ', 'LINKS', 'SERVICES', 'PROMO']);
commit;
select case when (select count(*) from public.merchant_links where merchant_id = '73737373-0000-0000-0000-000000000001') = 1
             and (select show_social_icons from public.merchant_themes where merchant_id = '73737373-0000-0000-0000-000000000001') = false
             and (select section_order from public.merchant_themes where merchant_id = '73737373-0000-0000-0000-000000000001')
                 = array['FAQ', 'LINKS', 'SERVICES', 'PROMO']
            then 'OK   t73t save_merchant_links mengganti daftar (8 lama dihapus) dan tema'
            else 'FAIL t73t save_merchant_links' end as t73t;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '73737373-0000-0000-0000-000000000002';
select pg_temp.expect_fail_code(
  $q$select public.save_merchant_links('[{"id":"73737373-2222-0000-0000-000000000001","label":"Curi","url":"https://x.id","sort_order":0}]'::jsonb, true, array['LINKS','PROMO','SERVICES','FAQ'])$q$,
  '42501', 't73u save_merchant_links menolak id milik merchant lain');
select pg_temp.expect_fail_code(
  $q$select public.save_merchant_links('[{"id":"73737373-2222-0000-0000-000000000009","label":"x","url":"http://x.id","sort_order":0}]'::jsonb, true, array['LINKS','PROMO','SERVICES','FAQ'])$q$,
  'BK081', 't73v save_merchant_links menolak url http://');
select pg_temp.expect_fail_code(
  $q$select public.save_merchant_links('[]'::jsonb, true, array['LINKS','PROMO','FAQ'])$q$,
  'BK081', 't73w save_merchant_links menolak section_order tidak lengkap');
select pg_temp.expect_fail_code(
  $q$select public.save_merchant_links((select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'label', 'x', 'url', 'https://x.id', 'sort_order', n)) from generate_series(1, 9) n), true, array['LINKS','PROMO','SERVICES','FAQ'])$q$,
  'BK081', 't73x save_merchant_links menolak 9 tautan');
rollback;

begin;
set local role anon;
select pg_temp.expect_fail_code(
  $q$select public.save_merchant_links('[]'::jsonb, true, array['LINKS','PROMO','SERVICES','FAQ'])$q$,
  '42501', 't73y anon tidak boleh menjalankan save_merchant_links');
rollback;

-- get_public_contacts menghormati contact_hidden
insert into public.merchant_settings (merchant_id) values ('73737373-0000-0000-0000-000000000001') on conflict do nothing;
update public.merchants set whatsapp_number = '+6281200000073' where id = '73737373-0000-0000-0000-000000000001';
update public.merchant_settings set contact_instagram = 'toko73', contact_tiktok = 'toko73', contact_phone = '+6281200009999',
  contact_hidden = array['INSTAGRAM']::public.contact_channel[]
  where merchant_id = '73737373-0000-0000-0000-000000000001';
begin;
set local role anon;
select case when (select instagram from public.get_public_contacts('73737373-0000-0000-0000-000000000001')) is null
             and (select tiktok from public.get_public_contacts('73737373-0000-0000-0000-000000000001')) = 'toko73'
             and (select whatsapp from public.get_public_contacts('73737373-0000-0000-0000-000000000001')) is null
            then 'OK   t73z Instagram tersembunyi mengembalikan null ke anon, TikTok tampil, WhatsApp null tanpa opt-in'
            else 'FAIL t73z get_public_contacts membocorkan kontak tersembunyi' end as t73z;
rollback;

-- ===========================================================================
-- 74. Kejadian funnel dan atribusi booking (20261125000300)
-- ===========================================================================
-- Merchant A ...0001, B ...0002. Sesi 1..3 membuka halaman A lewat tautan
-- IG_BIO; sesi 1 dan 2 booking, sesi 1 membayar.

insert into auth.users (id, email, raw_user_meta_data) values
  ('74747474-0000-0000-0000-000000000001', 'funnel74-a@example.com', '{}'::jsonb),
  ('74747474-0000-0000-0000-000000000002', 'funnel74-b@example.com', '{}'::jsonb);
update public.merchants set username = 'funnel74a' where id = '74747474-0000-0000-0000-000000000001';
update public.merchants set username = 'funnel74b' where id = '74747474-0000-0000-0000-000000000002';
insert into public.availability (merchant_id, day_of_week, start_time, end_time)
select m, d, '08:00', '22:00'
from generate_series(1, 7) d,
     unnest(array['74747474-0000-0000-0000-000000000001', '74747474-0000-0000-0000-000000000002']::uuid[]) m;
insert into public.services (id, merchant_id, name, price, duration_minutes, payment_mode) values
  ('74747474-5e00-0000-0000-000000000001', '74747474-0000-0000-0000-000000000001', 'Potong 74', 50000, 60, 'FULL'),
  ('74747474-5e00-0000-0000-000000000002', '74747474-0000-0000-0000-000000000002', 'Potong 74b', 50000, 60, 'FULL');
insert into public.ad_links (id, merchant_id, slug, name, channel) values
  ('74747474-1111-0000-0000-000000000001', '74747474-0000-0000-0000-000000000001', 'ig-74', 'Bio IG', 'IG_BIO'),
  ('74747474-1111-0000-0000-000000000002', '74747474-0000-0000-0000-000000000002', 'ig-74b', 'Bio IG B', 'IG_BIO');

insert into public.funnel_events (merchant_id, session_id, kind, ad_link_id, utm_source, utm_medium, utm_campaign)
select '74747474-0000-0000-0000-000000000001', ('74747474-5555-0000-0000-00000000000' || n)::uuid, 'VIEW',
       '74747474-1111-0000-0000-000000000001', 'instagram', 'bio', 'ig-74'
from generate_series(1, 3) n;
insert into public.funnel_events (merchant_id, session_id, kind, ad_link_id)
values ('74747474-0000-0000-0000-000000000002', '74747474-5555-0000-0000-000000000009', 'VIEW',
        '74747474-1111-0000-0000-000000000002');

-- Booking sesi n, jam berbeda supaya bookings_no_overlap tidak ikut campur.
create or replace function pg_temp.cb74(p_session integer, p_time text, p_ad_link uuid,
  p_utm_source text default 'instagram', p_referrer text default null,
  p_source public.booking_source default 'ONLINE')
returns setof public.bookings language plpgsql as $$
begin
  return query select * from public.create_booking(
    p_merchant_id => '74747474-0000-0000-0000-000000000001',
    p_service_id => '74747474-5e00-0000-0000-000000000001',
    p_start_datetime => pg_temp.jakarta_future(2, 1, p_time),
    p_customer_name => 'Tamu 74',
    p_customer_whatsapp => '+6281374000' || lpad(coalesce(p_session, 0)::text, 3, '0'),
    p_source => p_source,
    p_session_id => case when p_session is null then null
                         else ('74747474-5555-0000-0000-00000000000' || p_session)::uuid end,
    p_ad_link_id => p_ad_link,
    p_utm_source => p_utm_source,
    p_utm_medium => 'bio',
    p_utm_campaign => 'ig-74',
    p_referrer_host => p_referrer);
end $$;

select pg_temp.expect_ok(
  $q$select * from pg_temp.cb74(1, '10:00', '74747474-1111-0000-0000-000000000001',
      'instagram' || repeat('x', 80), 'https://WWW.Instagram.com/p/abc?x=1')$q$,
  't74a booking sesi 1 dengan atribusi');
select pg_temp.expect_ok(
  $q$select * from pg_temp.cb74(2, '12:00', '74747474-1111-0000-0000-000000000001')$q$,
  't74a booking sesi 2 dengan atribusi');

select case when b.session_id = '74747474-5555-0000-0000-000000000001'
             and b.ad_link_id = '74747474-1111-0000-0000-000000000001'
             and b.utm_source = left('instagram' || repeat('x', 80), 64)
             and b.utm_medium = 'bio' and b.utm_campaign = 'ig-74'
             and b.referrer_host = 'www.instagram.com'
             and b.pixel_event_id is not null
             and (select count(*) from public.funnel_events e
                  where e.booking_id = b.id and e.kind = 'BOOKED'
                    and e.session_id = b.session_id and e.ad_link_id = b.ad_link_id
                    and e.utm_source = b.utm_source and e.referrer_host = 'www.instagram.com'
                    and e.service_id = b.service_id) = 1
            then 'OK   t74b atribusi tersimpan (utm dipotong 64, host saja) dan satu BOOKED tertulis'
            else 'FAIL t74b atribusi atau BOOKED salah' end as t74b
from public.bookings b
where b.merchant_id = '74747474-0000-0000-0000-000000000001' and b.customer_whatsapp = '+6281374000001';

-- ad_link milik merchant lain menjadi null, bukan error.
begin;
select pg_temp.expect_ok(
  $q$select * from pg_temp.cb74(4, '14:00', '74747474-1111-0000-0000-000000000002')$q$,
  't74c booking dengan ad_link merchant lain tetap dibuat');
select case when (select ad_link_id from public.bookings where customer_whatsapp = '+6281374000004') is null
             and (select e.ad_link_id from public.funnel_events e join public.bookings b on b.id = e.booking_id
                  where b.customer_whatsapp = '+6281374000004') is null
            then 'OK   t74c ad_link merchant lain diabaikan (null)'
            else 'FAIL t74c ad_link merchant lain tersimpan' end as t74c;
rollback;

-- Tanpa sesi atau MANUAL: tidak masuk funnel, atribusi tidak disimpan.
begin;
select pg_temp.expect_ok($q$select * from pg_temp.cb74(null, '15:00', null)$q$, 't74d booking ONLINE tanpa sesi');
select pg_temp.expect_ok(
  $q$select * from pg_temp.cb74(5, '16:00', '74747474-1111-0000-0000-000000000001', 'instagram', null, 'MANUAL')$q$,
  't74d booking MANUAL dengan sesi');
select case when (select count(*) from public.funnel_events e join public.bookings b on b.id = e.booking_id
                  where b.customer_whatsapp in ('+6281374000005') or (b.merchant_id = '74747474-0000-0000-0000-000000000001'
                        and b.session_id is null and b.source = 'ONLINE')) = 0
             and (select session_id is null and ad_link_id is null and utm_source is null
                  from public.bookings where customer_whatsapp = '+6281374000005')
            then 'OK   t74d tanpa sesi dan MANUAL tidak menulis BOOKED'
            else 'FAIL t74d BOOKED tertulis untuk booking tanpa sesi atau MANUAL' end as t74d;
rollback;

-- record_paid_event: hanya PAID, sekali.
select public.record_paid_event((select id from public.bookings where customer_whatsapp = '+6281374000001'));
select case when (select count(*) from public.funnel_events where kind = 'PAID'
                  and merchant_id = '74747474-0000-0000-0000-000000000001') = 0
            then 'OK   t74e record_paid_event mengabaikan booking PENDING'
            else 'FAIL t74e PAID tertulis untuk PENDING' end as t74e;
update public.bookings set status = 'PAID', paid_at = now() where customer_whatsapp = '+6281374000001';
select public.record_paid_event((select id from public.bookings where customer_whatsapp = '+6281374000001'));
select public.record_paid_event((select id from public.bookings where customer_whatsapp = '+6281374000001'));
select case when (select count(*) from public.funnel_events where kind = 'PAID'
                  and merchant_id = '74747474-0000-0000-0000-000000000001') = 1
            then 'OK   t74f record_paid_event dua kali hanya satu PAID'
            else 'FAIL t74f PAID ganda' end as t74f;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '74747474-0000-0000-0000-000000000001';
select pg_temp.expect_fail_code(
  $q$select public.record_paid_event((select id from public.bookings where customer_whatsapp = '+6281374000001'))$q$,
  '42501', 't74g authenticated tidak boleh record_paid_event');
rollback;

-- get_paid_event (anon)
-- pixel_event_id diambil sebagai superuser lalu dipanggil sebagai anon.
create temp table t74_ids as
  select customer_whatsapp, pixel_event_id from public.bookings
  where merchant_id = '74747474-0000-0000-0000-000000000001';
grant select on t74_ids to anon;
begin;
set local role anon;
select case when (select count(*) from public.get_paid_event(
                    (select pixel_event_id from t74_ids where customer_whatsapp = '+6281374000001'))) = 1
             and (select amount from public.get_paid_event(
                    (select pixel_event_id from t74_ids where customer_whatsapp = '+6281374000001'))) = 50000
             and (select currency from public.get_paid_event(
                    (select pixel_event_id from t74_ids where customer_whatsapp = '+6281374000001'))) = 'IDR'
             and (select service_name from public.get_paid_event(
                    (select pixel_event_id from t74_ids where customer_whatsapp = '+6281374000001'))) = 'Potong 74'
            then 'OK   t74h get_paid_event mengembalikan booking PAID ke anon'
            else 'FAIL t74h get_paid_event booking PAID' end as t74h;
select case when (select count(*) from public.get_paid_event(
                    (select pixel_event_id from t74_ids where customer_whatsapp = '+6281374000002'))) = 0
            then 'OK   t74i get_paid_event menolak booking PENDING'
            else 'FAIL t74i get_paid_event mengembalikan PENDING' end as t74i;
rollback;
begin;
update public.bookings set paid_at = now() - interval '25 hours' where customer_whatsapp = '+6281374000001';
set local role anon;
select case when (select count(*) from public.get_paid_event(
                    (select pixel_event_id from t74_ids where customer_whatsapp = '+6281374000001'))) = 0
            then 'OK   t74j get_paid_event menolak pembayaran lewat 24 jam'
            else 'FAIL t74j get_paid_event mengembalikan pembayaran lama' end as t74j;
rollback;

-- funnel_summary dan ad_link_stats
begin;
set local role authenticated;
set local request.jwt.claim.sub = '74747474-0000-0000-0000-000000000001';
select case when s.views = 3 and s.service_views = 0 and s.checkouts = 0
             and s.booked = 2 and s.paid = 1 and s.revenue = 50000
            then 'OK   t74k funnel_summary IG_BIO views=3 booked=2 paid=1 revenue=50000'
            else format('FAIL t74k funnel_summary %s', row_to_json(s)) end as t74k
from public.funnel_summary(now() - interval '1 day', now() + interval '1 day') s
where s.channel = 'IG_BIO';
select case when (select sum(views) from public.funnel_summary(now() - interval '1 day', now() + interval '1 day')) = 3
            then 'OK   t74l funnel_summary merchant A tidak melihat kejadian merchant B'
            else 'FAIL t74l funnel_summary membocorkan kejadian merchant lain' end as t74l;
select case when a.views = 3 and a.booked = 2 and a.paid = 1 and a.revenue = 50000
             and (select count(*) from public.ad_link_stats(now() - interval '1 day', now() + interval '1 day')) = 1
            then 'OK   t74m ad_link_stats per tautan, hanya milik sendiri'
            else 'FAIL t74m ad_link_stats' end as t74m
from public.ad_link_stats(now() - interval '1 day', now() + interval '1 day') a
where a.ad_link_id = '74747474-1111-0000-0000-000000000001';
rollback;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '74747474-0000-0000-0000-000000000002';
select case when (select sum(views) from public.funnel_summary(now() - interval '1 day', now() + interval '1 day')) = 1
             and (select count(*) from public.funnel_events) = 1
            then 'OK   t74n merchant B hanya melihat kejadiannya sendiri'
            else 'FAIL t74n merchant B melihat kejadian merchant lain' end as t74n;
rollback;

begin;
set local role anon;
select pg_temp.expect_fail_code($q$select * from public.funnel_events$q$, '42501', 't74o anon select funnel_events ditolak');
select pg_temp.expect_fail_code(
  $q$select * from public.funnel_summary(now() - interval '1 day', now())$q$,
  '42501', 't74p anon tidak boleh funnel_summary');
select pg_temp.expect_fail_code(
  $q$select * from public.ad_link_stats(now() - interval '1 day', now())$q$,
  '42501', 't74p anon tidak boleh ad_link_stats');
select pg_temp.expect_fail_code($q$select public.prune_funnel_events()$q$, '42501', 't74p anon tidak boleh prune_funnel_events');
rollback;

-- CHECK host saja: path atau skema ditolak di tabel.
select pg_temp.expect_fail_code(
  $q$insert into public.funnel_events (merchant_id, session_id, kind, referrer_host)
     values ('74747474-0000-0000-0000-000000000001', gen_random_uuid(), 'VIEW', 'contoh.id/pesanan/abc')$q$,
  '23514', 't74q referrer_host berisi path ditolak');
select pg_temp.expect_fail_code(
  $q$insert into public.funnel_events (merchant_id, session_id, kind, ad_link_id)
     values ('74747474-0000-0000-0000-000000000001', gen_random_uuid(), 'VIEW', '74747474-1111-0000-0000-000000000002')$q$,
  '23503', 't74r ad_link merchant lain ditolak FK gabungan');

-- prune_funnel_events: lebih tua dari 13 bulan dihapus.
insert into public.funnel_events (merchant_id, session_id, kind, created_at) values
  ('74747474-0000-0000-0000-000000000001', '74747474-5555-0000-0000-000000000007', 'VIEW', now() - interval '14 months'),
  ('74747474-0000-0000-0000-000000000001', '74747474-5555-0000-0000-000000000008', 'VIEW', now() - interval '12 months');
select public.prune_funnel_events();
select case when not exists (select 1 from public.funnel_events where session_id = '74747474-5555-0000-0000-000000000007')
             and exists (select 1 from public.funnel_events where session_id = '74747474-5555-0000-0000-000000000008')
            then 'OK   t74s prune_funnel_events menghapus yang lebih tua dari 13 bulan saja'
            else 'FAIL t74s prune_funnel_events' end as t74s;

select case when to_regprocedure('public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source, text, integer, uuid, uuid, text)') is null
            then 'OK   t74t signature tiga belas argumen sudah dihapus'
            else 'FAIL t74t signature tiga belas argumen masih ada' end as t74t;

-- t73za: contact_phone tidak pernah keluar; WhatsApp tersembunyi null
select case when not exists (select 1 from public.get_public_contacts('73737373-0000-0000-0000-000000000001') c
                             where c.whatsapp = '+6281200009999')
            then 'OK   t73za contact_phone tidak dikembalikan sebagai WhatsApp'
            else 'FAIL t73za contact_phone bocor' end as t73za;
update public.merchant_settings set contact_hidden = array['WHATSAPP']::public.contact_channel[]
  where merchant_id = '73737373-0000-0000-0000-000000000001';
-- opt-in aktif, supaya null di bawah memang karena disembunyikan
update public.merchant_themes set public_whatsapp = true where merchant_id = '73737373-0000-0000-0000-000000000001';
select case when (select whatsapp from public.get_public_contacts('73737373-0000-0000-0000-000000000001')) is null
             and (select instagram from public.get_public_contacts('73737373-0000-0000-0000-000000000001')) = 'toko73'
            then 'OK   t73zb WhatsApp tersembunyi null'
            else 'FAIL t73zb WhatsApp tersembunyi bocor' end as t73zb;

-- t73zc: simpan 8 tautan, sunting di tempat berhasil, insert ke-9 tetap ditolak
insert into auth.users (id, email, raw_user_meta_data) values ('73737373-0000-0000-0000-000000000003', 'funnel73-c@example.com', '{}'::jsonb);
update public.merchants set username = 'funnel73c' where id = '73737373-0000-0000-0000-000000000003';
create or replace function pg_temp.links73(p_suffix text) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('id', '73737373-3333-0000-0000-00000000000' || n, 'label', 'Tautan ' || p_suffix || n,
    'url', 'https://contoh.id/' || n, 'sort_order', n)) from generate_series(1, 8) n $$;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '73737373-0000-0000-0000-000000000003';
select pg_temp.expect_ok($q$select public.save_merchant_links(pg_temp.links73('a'), true, array['LINKS','PROMO','SERVICES','FAQ'])$q$, 't73zc simpan 8 tautan');
select pg_temp.expect_ok($q$select public.save_merchant_links(pg_temp.links73('b'), true, array['LINKS','PROMO','SERVICES','FAQ'])$q$, 't73zd simpan ulang 8 tautan dengan label disunting');
select pg_temp.expect_fail_code(
  $q$insert into public.merchant_links (merchant_id, label, url) values ('73737373-0000-0000-0000-000000000003', 'Ke-9', 'https://contoh.id/9')$q$,
  'BK080', 't73ze tautan ke-9 tetap ditolak');
rollback;

-- ===========================================================================
-- 75. Batas laju kejadian dan VIEW sekali per sesi (20261125000400)
-- ===========================================================================
select case when public.check_event_rate_limit('hash75', '74747474-0000-0000-0000-000000000001') then 'OK   t75a kejadian pertama lolos'
            else 'FAIL t75a kejadian pertama ditolak' end as t75a;
do $$
declare i int; r boolean;
begin
  for i in 1..125 loop
    r := public.check_event_rate_limit('hash75b', '74747474-0000-0000-0000-000000000001');
  end loop;
  if r then raise exception 'FAIL t75b kejadian ke-125 per menit masih lolos'; end if;
end $$;
select 'OK   t75b kejadian di atas 120 per menit ditolak' as t75b;
select case when not has_function_privilege('anon', 'public.check_event_rate_limit(text, uuid)', 'EXECUTE')
             and not has_function_privilege('authenticated', 'public.check_event_rate_limit(text, uuid)', 'EXECUTE')
             and has_function_privilege('service_role', 'public.check_event_rate_limit(text, uuid)', 'EXECUTE')
            then 'OK   t75c rate limit kejadian hanya service_role'
            else 'FAIL t75c hak eksekusi rate limit kejadian salah' end as t75c;
insert into public.funnel_events (merchant_id, session_id, kind)
  values ('74747474-0000-0000-0000-000000000001', '75757575-0000-0000-0000-000000000001', 'VIEW');
select pg_temp.expect_fail_code(
  $q$insert into public.funnel_events (merchant_id, session_id, kind) values ('74747474-0000-0000-0000-000000000001', '75757575-0000-0000-0000-000000000001', 'VIEW')$q$,
  '23505', 't75d VIEW kedua satu sesi ditolak');
select case when (select count(*) from public.funnel_events where session_id = '75757575-0000-0000-0000-000000000001' and kind = 'SERVICE') = 0
             and public.check_event_rate_limit('hash75e', '74747474-0000-0000-0000-000000000001')
            then 'OK   t75e jenis lain tidak terkena batas VIEW'
            else 'FAIL t75e' end as t75e;

-- t75f: baris event_attempts lama milik IP lain ikut dibuang
insert into public.event_attempts (ip_hash, merchant_id, created_at)
  values ('hash75-lama', '74747474-0000-0000-0000-000000000001', now() - interval '2 hours');
select public.check_event_rate_limit('hash75f', '74747474-0000-0000-0000-000000000001') as t75f_call;
select case when not exists (select 1 from public.event_attempts where ip_hash = 'hash75-lama')
            then 'OK   t75f baris lama IP lain dibuang global'
            else 'FAIL t75f baris lama IP lain tersisa' end as t75f;

-- ===========================================================================
-- 76. Kunci panduan Tautan dan Iklan (20261125000500)
-- ===========================================================================
insert into public.merchant_onboarding_progress (merchant_id, tours_seen)
  values ('74747474-0000-0000-0000-000000000001', '{links,ads}');
select case when (select tours_seen from public.merchant_onboarding_progress
                   where merchant_id = '74747474-0000-0000-0000-000000000001') = '{links,ads}'
            then 'OK   t76a kunci links dan ads diterima'
            else 'FAIL t76a' end as t76a;
select pg_temp.expect_fail_code(
  $q$update public.merchant_onboarding_progress set tours_seen = '{beranda}'
     where merchant_id = '74747474-0000-0000-0000-000000000001'$q$,
  '23514', 't76b kunci di luar 15 ditolak');

-- ===========================================================================
-- 77. Perbaikan review akhir funnel iklan (20261125000600)
-- ===========================================================================
-- I1: tiga atau empat bagian diterima, ganda atau kunci asing ditolak
select pg_temp.expect_ok(
  $q$update public.merchant_themes set section_order = array['FAQ', 'PROMO', 'SERVICES'] where merchant_id = '73737373-0000-0000-0000-000000000001'$q$,
  't77a urutan tiga bagian (aplikasi lama) diterima');
select pg_temp.expect_ok(
  $q$update public.merchant_themes set section_order = array['LINKS', 'FAQ', 'PROMO', 'SERVICES'] where merchant_id = '73737373-0000-0000-0000-000000000001'$q$,
  't77b urutan empat bagian diterima');
select pg_temp.expect_fail_code(
  $q$update public.merchant_themes set section_order = array['LINKS', 'LINKS', 'PROMO', 'SERVICES'] where merchant_id = '73737373-0000-0000-0000-000000000001'$q$,
  '23514', 't77c LINKS ganda ditolak');
select pg_temp.expect_fail_code(
  $q$update public.merchant_themes set section_order = array['KONTAK', 'PROMO', 'SERVICES', 'FAQ'] where merchant_id = '73737373-0000-0000-0000-000000000001'$q$,
  '23514', 't77d kunci asing ditolak');

-- I3: WhatsApp publik hanya bila merchant memilih (setel ulang sisa section 73)
update public.merchant_themes set public_whatsapp = false where merchant_id = '73737373-0000-0000-0000-000000000001';
update public.merchant_settings set contact_hidden = '{}' where merchant_id = '73737373-0000-0000-0000-000000000001';
begin;
set local role anon;
select case when (select whatsapp from public.get_public_contacts('73737373-0000-0000-0000-000000000001')) is null
            then 'OK   t77e WhatsApp tidak publik secara bawaan'
            else 'FAIL t77e WhatsApp bocor tanpa opt-in' end as t77e;
rollback;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '73737373-0000-0000-0000-000000000001';
select public.save_merchant_links('[]'::jsonb, true, array['LINKS','PROMO','SERVICES','FAQ'], true);
commit;
begin;
set local role anon;
select case when (select whatsapp from public.get_public_contacts('73737373-0000-0000-0000-000000000001')) = '+6281200000073'
            then 'OK   t77f WhatsApp tampil setelah opt-in'
            else 'FAIL t77f WhatsApp tidak tampil setelah opt-in' end as t77f;
rollback;

-- ===========================================================================
-- 78. Booking lapangan (20261126000100 dan seterusnya)
-- ===========================================================================
-- 78.0 nilai enum OLAHRAGA
select pg_temp.expect_ok(
  $q$insert into public.merchant_profiles (merchant_id, business_category)
     values ('73737373-0000-0000-0000-000000000001', 'OLAHRAGA')$q$,
  't78.0a business_category OLAHRAGA diterima');
select pg_temp.expect_fail_code(
  $q$update public.merchant_profiles set business_category = 'BOWLING'
     where merchant_id = '73737373-0000-0000-0000-000000000001'$q$,
  '22P02', 't78.0b nilai di luar enum ditolak');

-- 78.1+ skema lapangan (20261126000200, 20261126000300)
insert into auth.users (id, email, raw_user_meta_data) values
  ('78787878-0000-0000-0000-000000000001', 'court78a@example.com', '{}'::jsonb),
  ('78787878-0000-0000-0000-000000000002', 'court78b@example.com', '{}'::jsonb);
update public.merchants set username = 'court78a' where id = '78787878-0000-0000-0000-000000000001';
update public.merchants set username = 'court78b' where id = '78787878-0000-0000-0000-000000000002';
insert into public.services (id, merchant_id, name, price, duration_minutes, payment_mode) values
  ('78787878-5e00-0000-0000-000000000001', '78787878-0000-0000-0000-000000000001', 'Padel 78', 150000, 60, 'FULL'),
  ('78787878-5e00-0000-0000-000000000002', '78787878-0000-0000-0000-000000000002', 'Padel 78b', 150000, 60, 'FULL');
insert into public.courts (id, merchant_id, name, sort_order, sport) values
  ('78787878-c000-0000-0000-000000000001', '78787878-0000-0000-0000-000000000001', 'Lapangan 1', 1, 'PADEL'),
  ('78787878-c000-0000-0000-000000000002', '78787878-0000-0000-0000-000000000001', 'Lapangan 2', 2, 'PADEL'),
  ('78787878-c000-0000-0000-000000000003', '78787878-0000-0000-0000-000000000002', 'Lapangan B', 1, 'PADEL');

-- 78.1 unit bukan 30 atau 60
select pg_temp.expect_fail_code(
  $q$update public.services set court_unit_minutes = 45, court_max_minutes = 135
     where id = '78787878-5e00-0000-0000-000000000001'$q$, '23514', 't78.1 court_unit_minutes 45 ditolak');
-- 78.2 durasi minimum bukan kelipatan unit (unit 60, durasi 90)
select pg_temp.expect_fail_code(
  $q$update public.services set court_unit_minutes = 60, court_max_minutes = 120, duration_minutes = 90
     where id = '78787878-5e00-0000-0000-000000000001'$q$, '23514', 't78.2 duration_minutes bukan kelipatan unit ditolak');
-- 78.3 maksimum 500 menit
select pg_temp.expect_fail_code(
  $q$update public.services set court_unit_minutes = 30, court_max_minutes = 500
     where id = '78787878-5e00-0000-0000-000000000001'$q$, '23514', 't78.3 court_max_minutes 500 ditolak');
-- 78.3b maksimum di bawah minimum
select pg_temp.expect_fail_code(
  $q$update public.services set court_unit_minutes = 30, court_max_minutes = 30
     where id = '78787878-5e00-0000-0000-000000000001'$q$, '23514', 't78.3b court_max_minutes < duration_minutes ditolak');
-- 78.4 reservasi kursi dan sewa lapangan sekaligus
select pg_temp.expect_fail_code(
  $q$update public.services set court_unit_minutes = 30, court_max_minutes = 120,
       party_min = 1, party_max = 4, seat_duration_minutes = 60
     where id = '78787878-5e00-0000-0000-000000000001'$q$, '23514', 't78.4 seat_duration dan court_unit sekaligus ditolak');
select pg_temp.expect_ok(
  $q$update public.services set court_unit_minutes = 30, court_max_minutes = 120
     where id = '78787878-5e00-0000-0000-000000000001'$q$, 't78.4b layanan sewa valid diterima');
-- 78.5 service_courts ke lapangan merchant lain
select pg_temp.expect_ok(
  $q$insert into public.service_courts (service_id, court_id, merchant_id) values
     ('78787878-5e00-0000-0000-000000000001', '78787878-c000-0000-0000-000000000001', '78787878-0000-0000-0000-000000000001')$q$,
  't78.5a service_courts milik sendiri diterima');
select pg_temp.expect_fail_code(
  $q$insert into public.service_courts (service_id, court_id, merchant_id) values
     ('78787878-5e00-0000-0000-000000000001', '78787878-c000-0000-0000-000000000003', '78787878-0000-0000-0000-000000000001')$q$,
  '23503', 't78.5b service_courts ke lapangan merchant lain ditolak FK');
-- 78.6 aturan harga tumpang tindih
select pg_temp.expect_ok(
  $q$insert into public.court_price_rules (merchant_id, service_id, day_of_week, start_time, end_time, price_per_hour) values
     ('78787878-0000-0000-0000-000000000001', '78787878-5e00-0000-0000-000000000001', 1, '17:00', '22:00', 250000)$q$,
  't78.6a aturan harga pertama');
select pg_temp.expect_fail_code(
  $q$insert into public.court_price_rules (merchant_id, service_id, day_of_week, start_time, end_time, price_per_hour) values
     ('78787878-0000-0000-0000-000000000001', '78787878-5e00-0000-0000-000000000001', 1, '21:00', '23:00', 300000)$q$,
  '23P01', 't78.6b aturan tumpang tindih di hari sama ditolak');
select pg_temp.expect_ok(
  $q$insert into public.court_price_rules (merchant_id, service_id, day_of_week, start_time, end_time, price_per_hour) values
     ('78787878-0000-0000-0000-000000000001', '78787878-5e00-0000-0000-000000000001', 2, '21:00', '23:00', 300000),
     ('78787878-0000-0000-0000-000000000001', '78787878-5e00-0000-0000-000000000001', 1, '22:00', '23:00', 300000)$q$,
  't78.6c hari berbeda dan rentang bersambung diterima');
-- 78.7 rentang jam terbalik
select pg_temp.expect_fail_code(
  $q$insert into public.court_price_rules (merchant_id, service_id, day_of_week, start_time, end_time, price_per_hour) values
     ('78787878-0000-0000-0000-000000000001', '78787878-5e00-0000-0000-000000000001', 3, '22:00', '22:00', 300000)$q$,
  '23514', 't78.7 start_time >= end_time ditolak');
select pg_temp.expect_fail_code(
  $q$insert into public.court_price_rules (merchant_id, service_id, day_of_week, start_time, end_time, price_per_hour) values
     ('78787878-0000-0000-0000-000000000001', '78787878-5e00-0000-0000-000000000001', 8, '10:00', '11:00', 300000)$q$,
  '23514', 't78.7b day_of_week 8 ditolak');
-- 78.8 foto: maksimal 5 per lapangan, path di folder court merchant
create or replace function pg_temp.photo78(n integer, p_court text default '78787878-c000-0000-0000-000000000001') returns text language sql as $$
  select format($f$insert into public.court_media (court_id, merchant_id, path, alt_text, width, height, sort_order)
    values (%L, '78787878-0000-0000-0000-000000000001',
            '78787878-0000-0000-0000-000000000001/court/f%s.webp', %L, 800, 600, %s)$f$,
    p_court, n, case when n = 3 then null else 'Foto ' || n end, n);
$$;
select pg_temp.expect_ok(pg_temp.photo78(1), 't78.8a foto 1');
select pg_temp.expect_ok(pg_temp.photo78(2), 't78.8a foto 2');
select pg_temp.expect_ok(pg_temp.photo78(3), 't78.8a foto 3 (tanpa alt, tersimpan)');
select pg_temp.expect_ok(pg_temp.photo78(4), 't78.8a foto 4');
select pg_temp.expect_ok(pg_temp.photo78(5), 't78.8a foto 5');
select pg_temp.expect_fail_code(pg_temp.photo78(6), 'P0001', 't78.8b foto ke-6 ditolak');
select pg_temp.expect_fail_code(
  $q$insert into public.court_media (court_id, merchant_id, path, alt_text, width, height)
     values ('78787878-c000-0000-0000-000000000002', '78787878-0000-0000-0000-000000000001',
             '78787878-0000-0000-0000-000000000002/court/x.webp', 'x', 800, 600)$q$,
  '23514', 't78.8c path di folder merchant lain ditolak');
select pg_temp.expect_fail_code(
  $q$insert into public.court_media (court_id, merchant_id, path, alt_text, width, height)
     values ('78787878-c000-0000-0000-000000000003', '78787878-0000-0000-0000-000000000001',
             '78787878-0000-0000-0000-000000000001/court/y.webp', 'y', 800, 600)$q$,
  '23503', 't78.8d foto ke lapangan merchant lain ditolak FK');
-- 78.9 nilai profil
select pg_temp.expect_fail_code(
  $q$update public.courts set rotation = 45 where id = '78787878-c000-0000-0000-000000000001'$q$, '23514', 't78.9a rotation 45 ditolak');
select pg_temp.expect_fail_code(
  $q$update public.courts set features = array['a','b','c','d','e','f'] where id = '78787878-c000-0000-0000-000000000001'$q$, '23514', 't78.9b 6 ciri ditolak');
select pg_temp.expect_fail_code(
  $q$insert into public.courts (merchant_id, name) values ('78787878-0000-0000-0000-000000000001', 'Lapangan 1')$q$, '23505', 't78.9c nama ganda ditolak');

-- 78.10 anon tidak membaca tabel lapangan langsung
begin;
set local role anon;
select pg_temp.expect_fail_code($q$select * from public.courts$q$, '42501', 't78.10a anon select courts ditolak');
select pg_temp.expect_fail_code($q$select * from public.court_media$q$, '42501', 't78.10b anon select court_media ditolak');
select pg_temp.expect_fail_code($q$select * from public.court_price_rules$q$, '42501', 't78.10c anon select court_price_rules ditolak');
select pg_temp.expect_fail_code($q$select * from public.service_courts$q$, '42501', 't78.10d anon select service_courts ditolak');
select pg_temp.expect_fail_code($q$select * from public.venue_areas$q$, '42501', 't78.10e anon select venue_areas ditolak');
select pg_temp.expect_fail_code($q$select * from public.venue_markers$q$, '42501', 't78.10f anon select venue_markers ditolak');
select case when (select court_unit_minutes from public.services where id = '78787878-5e00-0000-0000-000000000001') = 30
            then 'OK   t78.10g kolom sewa layanan terbaca anon' else 'FAIL t78.10g' end as t78_10g;
rollback;

-- 78.11 get_court_profiles: anon, tanpa foto tanpa alt, tanpa lapangan nonaktif
update public.courts set is_active = false where id = '78787878-c000-0000-0000-000000000002';
begin;
set local role anon;
select case when (select jsonb_array_length(courts) from public.get_court_profiles('78787878-0000-0000-0000-000000000001')) = 1
            then 'OK   t78.11a lapangan nonaktif tidak tampil' else 'FAIL t78.11a' end as t78_11a;
select case when (select jsonb_array_length(courts -> 0 -> 'photos') from public.get_court_profiles('78787878-0000-0000-0000-000000000001')) = 4
            then 'OK   t78.11b foto tanpa alt tidak tampil (4 dari 5)' else 'FAIL t78.11b' end as t78_11b;
select case when (select courts -> 0 -> 'service_ids' from public.get_court_profiles('78787878-0000-0000-0000-000000000001'))
                 = jsonb_build_array('78787878-5e00-0000-0000-000000000001')
            then 'OK   t78.11c service_ids lapangan' else 'FAIL t78.11c' end as t78_11c;
select case when (select array_agg(k order by k) from public.get_court_profiles('78787878-0000-0000-0000-000000000001') p,
                    jsonb_object_keys(p.courts -> 0) k)
                 = array['description', 'environment', 'features', 'id', 'name', 'photos', 'pos_x', 'pos_y',
                         'rotation', 'service_ids', 'sort_order', 'sport', 'surface']
            then 'OK   t78.11d kunci profil lapangan persis kolom tampilan' else 'FAIL t78.11d kunci profil lapangan' end as t78_11d;
rollback;

-- 78.12 save_court_pricing
begin;
set local role authenticated;
set local request.jwt.claim.sub = '78787878-0000-0000-0000-000000000002';
select pg_temp.expect_fail_code(
  $q$select public.save_court_pricing('78787878-5e00-0000-0000-000000000001', '[]'::jsonb)$q$,
  '42501', 't78.12a save_court_pricing layanan merchant lain ditolak');
rollback;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '78787878-0000-0000-0000-000000000001';
select pg_temp.expect_fail_code(
  $q$select public.save_court_pricing('78787878-5e00-0000-0000-000000000001', '[
     {"day_of_week":4,"start_time":"10:00","end_time":"14:00","price_per_hour":200000},
     {"day_of_week":4,"start_time":"13:00","end_time":"16:00","price_per_hour":220000}]'::jsonb)$q$,
  '23P01', 't78.12b payload tumpang tindih ditolak');
select case when (select count(*) from public.court_price_rules where service_id = '78787878-5e00-0000-0000-000000000001') = 3
            then 'OK   t78.12c aturan lama utuh setelah simpan gagal' else 'FAIL t78.12c' end as t78_12c;
select pg_temp.expect_ok(
  $q$select public.save_court_pricing('78787878-5e00-0000-0000-000000000001', '[
     {"day_of_week":4,"start_time":"10:00","end_time":"14:00","price_per_hour":200000},
     {"day_of_week":5,"start_time":"10:00","end_time":"14:00","price_per_hour":200000}]'::jsonb)$q$,
  't78.12d simpan aturan baru');
select case when (select count(*) from public.court_price_rules where service_id = '78787878-5e00-0000-0000-000000000001') = 2
            then 'OK   t78.12e aturan diganti seluruhnya' else 'FAIL t78.12e' end as t78_12e;
rollback;

-- 78.13 save_venue_layout atomik
begin;
set local role authenticated;
set local request.jwt.claim.sub = '78787878-0000-0000-0000-000000000001';
select pg_temp.expect_ok(
  $q$select public.save_venue_layout(
     '[{"id":"78787878-c000-0000-0000-000000000001","pos_x":48,"pos_y":52,"rotation":90}]'::jsonb,
     '[{"id":"78787878-a000-0000-0000-000000000001","label":"Gedung utama","pos_x":0,"pos_y":0,"width":300,"height":200,"sort_order":0}]'::jsonb,
     '[{"id":"78787878-b000-0000-0000-000000000001","label":"Pintu masuk","pos_x":10,"pos_y":10,"width":40,"height":40,"sort_order":0}]'::jsonb)$q$,
  't78.13a simpan denah');
select case when (select pos_x from public.courts where id = '78787878-c000-0000-0000-000000000001') = 48
             and (select rotation from public.courts where id = '78787878-c000-0000-0000-000000000001') = 90
             and (select count(*) from public.venue_areas where merchant_id = '78787878-0000-0000-0000-000000000001') = 1
             and (select count(*) from public.venue_markers where merchant_id = '78787878-0000-0000-0000-000000000001') = 1
            then 'OK   t78.13b denah tertulis' else 'FAIL t78.13b' end as t78_13b;
select pg_temp.expect_fail_code(
  $q$select public.save_venue_layout(
     '[{"id":"78787878-c000-0000-0000-000000000001","pos_x":999,"pos_y":999,"rotation":0}]'::jsonb,
     '[]'::jsonb,
     '[{"id":"78787878-b000-0000-0000-000000000002","label":"","pos_x":10,"pos_y":10,"width":40,"height":40,"sort_order":0}]'::jsonb)$q$,
  '22023', 't78.13c payload dengan satu baris tak valid ditolak');
select case when (select pos_x from public.courts where id = '78787878-c000-0000-0000-000000000001') = 48
             and (select count(*) from public.venue_areas where merchant_id = '78787878-0000-0000-0000-000000000001') = 1
             and (select count(*) from public.venue_markers where merchant_id = '78787878-0000-0000-0000-000000000001') = 1
            then 'OK   t78.13d simpan gagal tidak mengubah apa pun' else 'FAIL t78.13d' end as t78_13d;
select pg_temp.expect_fail_code(
  $q$select public.save_venue_layout(
     '[{"id":"78787878-c000-0000-0000-000000000003","pos_x":1,"pos_y":1,"rotation":0}]'::jsonb, '[]'::jsonb, '[]'::jsonb)$q$,
  '42501', 't78.13e lapangan merchant lain ditolak');
-- area/penanda yang hilang dari payload terhapus, lapangan tidak
select pg_temp.expect_ok(
  $q$select public.save_venue_layout('[]'::jsonb, '[]'::jsonb, '[]'::jsonb)$q$, 't78.13f payload kosong');
select case when (select count(*) from public.venue_areas where merchant_id = '78787878-0000-0000-0000-000000000001') = 0
             and (select count(*) from public.courts where merchant_id = '78787878-0000-0000-0000-000000000001') = 2
            then 'OK   t78.13g area dan penanda terhapus, lapangan utuh' else 'FAIL t78.13g' end as t78_13g;
rollback;

-- 78.14 pengerasan Task 2 (20261126000350)
-- authenticated merchant A: insert lapangan sendiri, bukan milik B
select pg_temp.act34('t78.14a authenticated insert lapangan dengan ciri', '78787878-0000-0000-0000-000000000001',
  $q$insert into public.courts (merchant_id, name, features) values
     ('78787878-0000-0000-0000-000000000001', 'Lapangan 14', array['Kaca', 'Lampu LED'])$q$);
select pg_temp.act34('t78.14b authenticated insert lapangan untuk merchant B ditolak', '78787878-0000-0000-0000-000000000001',
  $q$insert into public.courts (merchant_id, name) values ('78787878-0000-0000-0000-000000000002', 'Susup 14')$q$, '42501');
select pg_temp.act34('t78.14c authenticated service_courts ke lapangan B ditolak', '78787878-0000-0000-0000-000000000001',
  $q$insert into public.service_courts (service_id, court_id, merchant_id) values
     ('78787878-5e00-0000-0000-000000000001', '78787878-c000-0000-0000-000000000003', '78787878-0000-0000-0000-000000000001')$q$, '23503');
select pg_temp.expect_fail_code(
  $q$insert into public.courts (merchant_id, name) values ('78787878-0000-0000-0000-000000000001', 'Lapangan 1 ')$q$,
  '23514', 't78.14d nama berspasi di ujung ditolak');
select pg_temp.expect_fail_code(
  $q$insert into public.courts (merchant_id, name, features) values
     ('78787878-0000-0000-0000-000000000001', 'Lapangan 15', array['Kaca', null])$q$,
  '23514', 't78.14e ciri null ditolak');
begin;
set local role authenticated;
set local request.jwt.claim.sub = '78787878-0000-0000-0000-000000000001';
select pg_temp.expect_fail_code(
  $q$select public.save_venue_layout('[{"id":null,"pos_x":1,"pos_y":1,"rotation":0}]'::jsonb, '[]'::jsonb, '[]'::jsonb)$q$,
  '22023', 't78.14f id lapangan null di denah = 22023');
select pg_temp.expect_fail_code(
  $q$select public.save_venue_layout('[{"id":"78787878-c000-0000-0000-000000000001","pos_x":5000,"pos_y":1,"rotation":0}]'::jsonb, '[]'::jsonb, '[]'::jsonb)$q$,
  '22023', 't78.14g posisi lapangan di luar batas = 22023');
select pg_temp.expect_fail_code(
  $q$select public.save_venue_layout('[{"id":"78787878-c000-0000-0000-000000000001","pos_x":1,"pos_y":1,"rotation":45}]'::jsonb, '[]'::jsonb, '[]'::jsonb)$q$,
  '22023', 't78.14h rotasi lapangan tidak valid = 22023');
select pg_temp.expect_fail_code(
  $q$select public.save_court_pricing('78787878-5e00-0000-0000-000000000001',
     '[{"day_of_week":3,"start_time":"12:00","end_time":"10:00","price_per_hour":200000}]'::jsonb)$q$,
  '22023', 't78.14i aturan jam terbalik = 22023');
select pg_temp.expect_fail_code(
  $q$select public.save_court_pricing('78787878-5e00-0000-0000-000000000001',
     '[{"day_of_week":3,"start_time":"10:00","end_time":"12:00","price_per_hour":null}]'::jsonb)$q$,
  '22023', 't78.14j harga null = 22023');
select pg_temp.expect_fail_code(
  format($q$select public.save_court_pricing('78787878-5e00-0000-0000-000000000001', %L::jsonb)$q$,
    (select jsonb_agg(jsonb_build_object('day_of_week', 1 + (g % 7), 'start_time', make_time(g / 7, 0, 0),
       'end_time', make_time(g / 7, 30, 0), 'price_per_hour', 100000)) from generate_series(0, 50) g)),
  '22023', 't78.14k lebih dari 50 aturan = 22023');
rollback;
insert into public.services (id, merchant_id, name, price, duration_minutes, payment_mode) values
  ('78787878-5e00-0000-0000-000000000003', '78787878-0000-0000-0000-000000000001', 'Salon 78', 50000, 60, 'FULL');
begin;
set local role authenticated;
set local request.jwt.claim.sub = '78787878-0000-0000-0000-000000000001';
select pg_temp.expect_fail_code(
  $q$select public.save_court_pricing('78787878-5e00-0000-0000-000000000003', '[]'::jsonb)$q$,
  '22023', 't78.14l aturan harga untuk layanan bukan sewa = 22023');
rollback;

-- ===========================================================================
-- 79. Mesin booking lapangan: pelanggan (20261126000400)
-- ===========================================================================
-- Merchant A (STUDIO bawaan sejak bagian 71, tanpa staf) dan B. Jam buka
-- Senin dan Sabtu 08.00-23.00. Lapangan 1 (urut 1), Lapangan 2 (urut 2),
-- Lapangan 3 (tidak terkait Padel), Lapangan 0 (urut 0, nonaktif, terkait).
insert into auth.users (id, email, raw_user_meta_data) values
  ('79797979-0000-0000-0000-000000000001', 'court79a@example.com', '{}'::jsonb),
  ('79797979-0000-0000-0000-000000000002', 'court79b@example.com', '{}'::jsonb);
update public.merchants set username = 'court79a' where id = '79797979-0000-0000-0000-000000000001';
update public.merchants set username = 'court79b' where id = '79797979-0000-0000-0000-000000000002';
insert into public.availability (merchant_id, day_of_week, start_time, end_time) values
  ('79797979-0000-0000-0000-000000000001', 1, '08:00', '23:00'),
  ('79797979-0000-0000-0000-000000000001', 6, '08:00', '23:00');
insert into public.services (id, merchant_id, name, price, duration_minutes, payment_mode,
  court_unit_minutes, court_max_minutes, deposit_type, deposit_value) values
  ('79797979-5e00-0000-0000-000000000001', '79797979-0000-0000-0000-000000000001', 'Padel 79', 150000, 60, 'FULL', 30, 120, null, null),
  ('79797979-5e00-0000-0000-000000000002', '79797979-0000-0000-0000-000000000001', 'Badminton 79', 150000, 60, 'FULL', 60, 120, null, null),
  ('79797979-5e00-0000-0000-000000000003', '79797979-0000-0000-0000-000000000001', 'Padel DP 79', 10000, 60, 'DEPOSIT', 60, 120, 'PERCENT', 10),
  ('79797979-5e00-0000-0000-000000000004', '79797979-0000-0000-0000-000000000001', 'Salon 79', 100000, 60, 'FULL', null, null, null, null),
  ('79797979-5e00-0000-0000-000000000006', '79797979-0000-0000-0000-000000000001', 'Bulat 79a', 100000, 30, 'FULL', 30, 60, null, null),
  ('79797979-5e00-0000-0000-000000000007', '79797979-0000-0000-0000-000000000001', 'Bulat 79b', 99999, 30, 'FULL', 30, 60, null, null),
  ('79797979-5e00-0000-0000-000000000099', '79797979-0000-0000-0000-000000000002', 'Padel B 79', 150000, 60, 'FULL', 30, 120, null, null);
insert into public.courts (id, merchant_id, name, sort_order, is_active) values
  ('79797979-c000-0000-0000-000000000001', '79797979-0000-0000-0000-000000000001', 'Lapangan 1', 1, true),
  ('79797979-c000-0000-0000-000000000002', '79797979-0000-0000-0000-000000000001', 'Lapangan 2', 2, true),
  ('79797979-c000-0000-0000-000000000003', '79797979-0000-0000-0000-000000000001', 'Lapangan 3', 3, true),
  ('79797979-c000-0000-0000-000000000009', '79797979-0000-0000-0000-000000000001', 'Lapangan 0', 0, false),
  ('79797979-c000-0000-0000-000000000099', '79797979-0000-0000-0000-000000000002', 'Lapangan B', 1, true);
insert into public.service_courts (service_id, court_id, merchant_id) values
  ('79797979-5e00-0000-0000-000000000001', '79797979-c000-0000-0000-000000000001', '79797979-0000-0000-0000-000000000001'),
  ('79797979-5e00-0000-0000-000000000001', '79797979-c000-0000-0000-000000000002', '79797979-0000-0000-0000-000000000001'),
  ('79797979-5e00-0000-0000-000000000001', '79797979-c000-0000-0000-000000000009', '79797979-0000-0000-0000-000000000001'),
  ('79797979-5e00-0000-0000-000000000002', '79797979-c000-0000-0000-000000000001', '79797979-0000-0000-0000-000000000001'),
  ('79797979-5e00-0000-0000-000000000003', '79797979-c000-0000-0000-000000000001', '79797979-0000-0000-0000-000000000001'),
  ('79797979-5e00-0000-0000-000000000099', '79797979-c000-0000-0000-000000000099', '79797979-0000-0000-0000-000000000002');
-- Jam ramai Senin-Jumat 17.00-22.00 Rp250.000 untuk Padel dan Badminton.
insert into public.court_price_rules (merchant_id, service_id, day_of_week, start_time, end_time, price_per_hour)
select '79797979-0000-0000-0000-000000000001', s::uuid, d, '17:00', '22:00', 250000
  from generate_series(1, 5) d,
       unnest(array['79797979-5e00-0000-0000-000000000001', '79797979-5e00-0000-0000-000000000002']) s;

-- Booking merchant A: hasil 'lapangan:service_price:amount_due_now', atau SQLSTATE.
create or replace function pg_temp.cb79(p_svc integer, p_start timestamptz, p_dur integer,
  p_court integer default null, p_phone text default '+6281790000000', p_voucher text default null)
returns text language plpgsql as $$
declare b public.bookings;
begin
  select * into b from public.create_booking(
    '79797979-0000-0000-0000-000000000001', ('79797979-5e00-0000-0000-0000000000' || lpad(p_svc::text, 2, '0'))::uuid,
    p_start, 'Pelanggan 79', p_phone,
    p_voucher_code => p_voucher,
    p_court_id => case when p_court is not null then ('79797979-c000-0000-0000-0000000000' || lpad(p_court::text, 2, '0'))::uuid end,
    p_duration_minutes => p_dur);
  return coalesce(b.court_name, '-') || ':' || trim_scale(b.service_price) || ':' || trim_scale(b.amount_due_now);
exception when others then
  return sqlstate;
end $$;

create or replace function pg_temp.is79(p_label text, p_got text, p_want text) returns text language sql as $$
  select case when p_got is not distinct from p_want then 'OK   ' || p_label
              else 'FAIL ' || p_label || ' (dapat ' || coalesce(p_got, 'NULL') || ', harap ' || p_want || ')' end;
$$;

create or replace function pg_temp.cp79(p_svc integer, p_start timestamptz, p_dur integer) returns text language sql as $$
  select trim_scale(public.court_price(('79797979-5e00-0000-0000-0000000000' || lpad(p_svc::text, 2, '0'))::uuid, p_start, p_dur))::text;
$$;

-- 79.1 court_price: tabel kasus yang sama dengan src/lib/booking/court.test.ts
select pg_temp.is79('t79.1a Senin 16.30 90 menit lintas jam ramai', pg_temp.cp79(1, pg_temp.jakarta_future(1, 1, '16:30'), 90), '325000');
select pg_temp.is79('t79.1b Senin 16.00 60 menit harga dasar', pg_temp.cp79(1, pg_temp.jakarta_future(1, 1, '16:00'), 60), '150000');
select pg_temp.is79('t79.1c Senin 17.00 60 menit jam ramai', pg_temp.cp79(1, pg_temp.jakarta_future(1, 1, '17:00'), 60), '250000');
select pg_temp.is79('t79.1d Sabtu tanpa aturan 90 menit', pg_temp.cp79(1, pg_temp.jakarta_future(6, 1, '16:00'), 90), '225000');
select pg_temp.is79('t79.1e unit 60 Senin 16.00 120 menit', pg_temp.cp79(2, pg_temp.jakarta_future(1, 1, '16:00'), 120), '400000');
select pg_temp.is79('t79.1f dasar 100000 30 menit', pg_temp.cp79(6, pg_temp.jakarta_future(1, 1, '10:00'), 30), '50000');
select pg_temp.is79('t79.1g dasar 99999 30 menit dibulatkan', pg_temp.cp79(7, pg_temp.jakarta_future(1, 1, '10:00'), 30), '50000');
select pg_temp.is79('t79.1h Senin 21.30 60 menit keluar jam ramai', pg_temp.cp79(1, pg_temp.jakarta_future(1, 1, '21:30'), 60), '200000');
select pg_temp.is79('t79.1i layanan bukan sewa = null', pg_temp.cp79(4, pg_temp.jakarta_future(1, 1, '10:00'), 60), null);

-- 79.2 create_booking: harga dari court_price, "Mana saja" urut sort_order
select pg_temp.is79('t79.2a Mana saja pertama = Lapangan 1, harga 325000',
  pg_temp.cb79(1, pg_temp.jakarta_future(1, 1, '16:30'), 90, null, '+6281790000001'), 'Lapangan 1:325000:325000');
select case when end_datetime - start_datetime = interval '90 minutes' and duration_minutes = 90
             and staff_id is null and capacity_mode = 'NONE'
             and court_id = '79797979-c000-0000-0000-000000000001'
            then 'OK   t79.2b durasi 90, tanpa staf, court_id tersimpan'
            else 'FAIL t79.2b ' || (end_datetime - start_datetime)::text end as t79_2b
  from public.bookings where customer_whatsapp = '+6281790000001';
select pg_temp.is79('t79.2c Mana saja kedua = Lapangan 2',
  pg_temp.cb79(1, pg_temp.jakarta_future(1, 1, '16:30'), 90, null, '+6281790000002'), 'Lapangan 2:325000:325000');
select pg_temp.is79('t79.2d semua terisi (Lapangan 0 nonaktif) = BK072',
  pg_temp.cb79(1, pg_temp.jakarta_future(1, 1, '17:00'), 60, null, '+6281790000003'), 'BK072');
select pg_temp.is79('t79.2e lapangan diminta terisi = BK070',
  pg_temp.cb79(1, pg_temp.jakarta_future(1, 1, '17:00'), 60, 1, '+6281790000003'), 'BK070');
select pg_temp.is79('t79.2f lapangan merchant lain = BK070',
  pg_temp.cb79(1, pg_temp.jakarta_future(1, 1, '10:00'), 60, 99, '+6281790000003'), 'BK070');
select pg_temp.is79('t79.2g lapangan tidak terkait layanan = BK070',
  pg_temp.cb79(1, pg_temp.jakarta_future(1, 1, '10:00'), 60, 3, '+6281790000003'), 'BK070');
select pg_temp.is79('t79.2h lapangan nonaktif = BK070',
  pg_temp.cb79(1, pg_temp.jakarta_future(1, 1, '10:00'), 60, 9, '+6281790000003'), 'BK070');

-- 79.3 lama main tidak valid
select pg_temp.is79('t79.3a 45 menit bukan kelipatan unit = BK071', pg_temp.cb79(1, pg_temp.jakarta_future(1, 2, '10:00'), 45), 'BK071');
select pg_temp.is79('t79.3b 30 menit di bawah minimum = BK071', pg_temp.cb79(1, pg_temp.jakarta_future(1, 2, '10:00'), 30), 'BK071');
select pg_temp.is79('t79.3c 150 menit di atas maksimum = BK071', pg_temp.cb79(1, pg_temp.jakarta_future(1, 2, '10:00'), 150), 'BK071');
select pg_temp.is79('t79.3d tanpa lama main = BK071', pg_temp.cb79(1, pg_temp.jakarta_future(1, 2, '10:00'), null), 'BK071');

-- 79.4 grid dan jam kerja
select pg_temp.is79('t79.4a jam mulai 16.15 di luar grid = BK001', pg_temp.cb79(1, pg_temp.jakarta_future(1, 2, '16:15'), 60), 'BK001');
select pg_temp.is79('t79.4b 22.30 + 60 melewati jam tutup = BK001', pg_temp.cb79(1, pg_temp.jakarta_future(1, 2, '22:30'), 60), 'BK001');
select pg_temp.is79('t79.4c 22.00 + 60 tepat jam tutup diterima',
  pg_temp.cb79(1, pg_temp.jakarta_future(1, 2, '22:00'), 60, null, '+6281790000004'), 'Lapangan 1:150000:150000');
select pg_temp.is79('t79.4d hari tutup = BK001', pg_temp.cb79(1, pg_temp.jakarta_future(2, 2, '10:00'), 60), 'BK001');

-- 79.5 constraint bookings_court_no_overlap pada INSERT langsung
create or replace function pg_temp.err79(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute p_sql;
  return 'tanpa error';
exception when others then
  get stacked diagnostics v = constraint_name;
  return sqlstate || ':' || coalesce(v, '');
end $$;
create or replace function pg_temp.ins79sql(p_court text, p_start timestamptz, p_phone text) returns text language sql as $$
  select format($f$insert into public.bookings (merchant_id, service_id, service_name, service_price, duration_minutes,
      start_datetime, end_datetime, customer_name, customer_whatsapp, status, amount_due_now, amount_due_on_site,
      payment_mode, court_id, court_name)
    values ('79797979-0000-0000-0000-000000000001', '79797979-5e00-0000-0000-000000000001', 'Padel 79', 150000, 60,
      %L, %L, 'Langsung 79', %L, 'CONFIRMED', 0, 150000, 'ON_SITE', %L, 'X')$f$,
    p_start, p_start + interval '60 minutes', p_phone, p_court);
$$;
select pg_temp.is79('t79.5a INSERT beririsan di lapangan sama ditolak bookings_court_no_overlap',
  pg_temp.err79(pg_temp.ins79sql('79797979-c000-0000-0000-000000000001', pg_temp.jakarta_future(1, 1, '17:00'), '+6281790000005')),
  '23P01:bookings_court_no_overlap');
select pg_temp.is79('t79.5b INSERT dengan lapangan merchant lain ditolak FK',
  left(pg_temp.err79(pg_temp.ins79sql('79797979-c000-0000-0000-000000000099', pg_temp.jakarta_future(1, 1, '08:00'), '+6281790000005')), 5),
  '23503');
select case when pg_get_constraintdef(oid) like '%court_id IS NULL%'
            then 'OK   t79.5c bookings_no_overlap hanya untuk booking tanpa lapangan'
            else 'FAIL t79.5c ' || pg_get_constraintdef(oid) end as t79_5c
  from pg_constraint where conname = 'bookings_no_overlap';

-- 79.6 salon tanpa staf tidak bentrok dengan lapangan; salon dengan salon tetap bentrok
select pg_temp.is79('t79.6a salon di jam yang sama dengan booking lapangan diterima',
  pg_temp.cb79(4, pg_temp.jakarta_future(1, 1, '16:30'), null, null, '+6281790000006'), '-:100000:100000');
select pg_temp.is79('t79.6b salon beririsan dengan salon tetap 23P01',
  pg_temp.cb79(4, pg_temp.jakarta_future(1, 1, '17:00'), null, null, '+6281790000007'), '23P01');

-- 79.7 lapangan serbaguna (Lapangan 1 dipakai Padel dan Badminton)
select pg_temp.is79('t79.7a Badminton Mana saja saat Lapangan 1 terisi Padel = BK072',
  pg_temp.cb79(2, pg_temp.jakarta_future(1, 1, '17:00'), 60, null, '+6281790000008'), 'BK072');
select pg_temp.is79('t79.7b Badminton minta Lapangan 1 = BK070',
  pg_temp.cb79(2, pg_temp.jakarta_future(1, 1, '17:00'), 60, 1, '+6281790000008'), 'BK070');
select pg_temp.is79('t79.7c Badminton 19.00 di Lapangan 1, jam ramai',
  pg_temp.cb79(2, pg_temp.jakarta_future(1, 1, '19:00'), 60, null, '+6281790000009'), 'Lapangan 1:250000:250000');

-- 79.8 DP persen dan minimum Rp1.500 dari total court_price
select pg_temp.is79('t79.8a DP 10% dari total 20000 = 2000 (bukan dari harga per jam)',
  pg_temp.cb79(3, pg_temp.jakarta_future(6, 3, '10:00'), 120, null, '+6281790000010'), 'Lapangan 1:20000:2000');
select pg_temp.is79('t79.8b DP 10% dari 10000 dinaikkan ke minimum 1500',
  pg_temp.cb79(3, pg_temp.jakarta_future(6, 3, '13:00'), 60, null, '+6281790000011'), 'Lapangan 1:10000:1500');
select case when amount_due_on_site = 18000 and payment_mode = 'DEPOSIT'
            then 'OK   t79.8c sisa di tempat dari total' else 'FAIL t79.8c ' || amount_due_on_site end as t79_8c
  from public.bookings where customer_whatsapp = '+6281790000010';

-- 79.9 voucher: minimal transaksi dan diskon dari total
select pg_temp.v45('LAP79', 'PERCENT', 10, '{"min_spend": 200000}', '79797979-0000-0000-0000-000000000001');
select pg_temp.is79('t79.9a total 300000 memenuhi minimal 200000 walau harga per jam 150000',
  pg_temp.cb79(1, pg_temp.jakarta_future(6, 4, '10:00'), 120, null, '+6281790000012', 'LAP79'), 'Lapangan 1:300000:270000');
select case when discount_amount = 30000 and voucher_code = 'LAP79' and amount_due_on_site = 0
            then 'OK   t79.9b diskon 10% dari total' else 'FAIL t79.9b ' || discount_amount end as t79_9b
  from public.bookings where customer_whatsapp = '+6281790000012';
select pg_temp.is79('t79.9c total 150000 di bawah minimal = BK054',
  pg_temp.cb79(1, pg_temp.jakarta_future(6, 4, '14:00'), 60, null, '+6281790000013', 'LAP79'), 'BK054');

-- 79.10 layanan bukan sewa mengabaikan p_court_id dan p_duration_minutes
select pg_temp.is79('t79.10a salon dengan p_court_id dan lama main 999 = perilaku lama',
  pg_temp.cb79(4, pg_temp.jakarta_future(6, 5, '10:00'), 999, 1, '+6281790000014'), '-:100000:100000');
select case when court_id is null and duration_minutes = 60 and end_datetime - start_datetime = interval '60 minutes'
            then 'OK   t79.10b salon tanpa lapangan, durasi layanan' else 'FAIL t79.10b' end as t79_10b
  from public.bookings where customer_whatsapp = '+6281790000014';

-- 79.11 dua sesi berebut slot terakhir lewat dblink. Sesi 1 memegang kunci
-- merchant dalam transaksi terbuka, sesi 2 terbukti menunggu kunci itu, lalu
-- sesi 1 commit: sesi 2 harus melihat lapangan terakhir sudah terisi.
select pg_temp.is79('t79.11a Lapangan 1 diisi lebih dulu',
  pg_temp.cb79(1, pg_temp.jakarta_future(6, 6, '10:00'), 60, 1, '+6281790000015'), 'Lapangan 1:150000:150000');
create schema t79;
create extension dblink schema t79;
create function t79.race(p_start timestamptz, p_phone text) returns text language plpgsql as $$
declare b public.bookings;
begin
  select * into b from public.create_booking('79797979-0000-0000-0000-000000000001',
    '79797979-5e00-0000-0000-000000000001', p_start, 'Balapan 79', p_phone, p_duration_minutes => 60);
  return 'OK:' || b.court_name;
exception when others then
  return sqlstate;
end $$;
create or replace function pg_temp.wait79(p_pid integer) returns boolean language plpgsql as $$
begin
  for i in 1..100 loop
    if exists (select 1 from pg_stat_activity where pid = p_pid and wait_event_type = 'Lock' and wait_event = 'advisory') then
      return true;
    end if;
    perform pg_sleep(0.05);
  end loop;
  return false;
end $$;
select t79.dblink_connect('s1', 'dbname=' || current_database() || ' user=' || current_user || ' password=postgres');
select t79.dblink_connect('s2', 'dbname=' || current_database() || ' user=' || current_user || ' password=postgres');
select pid as race_pid2 from t79.dblink('s2', 'select pg_backend_pid()') as t(pid integer) \gset
select t79.dblink_exec('s1', 'begin');
select pg_temp.is79('t79.11b sesi 1 mendapat Lapangan 2 (belum commit)',
  (select r from t79.dblink('s1', format('select t79.race(%L, %L)', pg_temp.jakarta_future(6, 6, '10:00'), '+6281790000016')) as t(r text)),
  'OK:Lapangan 2');
select t79.dblink_send_query('s2', format('select t79.race(%L, %L)', pg_temp.jakarta_future(6, 6, '10:00'), '+6281790000017'));
select case when pg_temp.wait79(:race_pid2)
            then 'OK   t79.11c sesi 2 menunggu kunci merchant sesi 1'
            else 'FAIL t79.11c sesi 2 tidak menunggu kunci' end as t79_11c;
select t79.dblink_exec('s1', 'commit');
select pg_temp.is79('t79.11d sesi 2 sesudah commit = BK072',
  (select r from t79.dblink_get_result('s2') as t(r text)), 'BK072');
select count(*) from t79.dblink_get_result('s2') as t(r text);
select t79.dblink_disconnect('s1');
select t79.dblink_disconnect('s2');
select case when (select count(*) from public.bookings
                  where merchant_id = '79797979-0000-0000-0000-000000000001'
                    and start_datetime = pg_temp.jakarta_future(6, 6, '10:00')
                    and service_id = '79797979-5e00-0000-0000-000000000001') = 2
             and not exists (select 1 from public.bookings where customer_whatsapp = '+6281790000017')
            then 'OK   t79.11e tepat dua lapangan terisi, pemenang tunggal'
            else 'FAIL t79.11e hasil balapan salah' end as t79_11e;
drop schema t79 cascade;

-- 79.12 get_court_availability: anon, tanpa kolom pelanggan, hanya booking aktif
update public.bookings set status = 'CANCELLED', cancelled_at = now() where customer_whatsapp = '+6281790000002';
update public.bookings set expires_at = now() - interval '1 minute' where customer_whatsapp = '+6281790000009';
begin;
set local role anon;
select case when (select array_agg(distinct k order by k) from (
                    select jsonb_object_keys(to_jsonb(r)) k
                    from public.get_court_availability('79797979-0000-0000-0000-000000000001',
                      '79797979-5e00-0000-0000-000000000001',
                      (pg_temp.jakarta_future(1, 1, '00:00') at time zone 'Asia/Jakarta')::date) r) x)
                 = array['court_id', 'court_name', 'end_datetime', 'start_datetime']
            then 'OK   t79.12a kolom ketersediaan hanya lapangan dan rentang'
            else 'FAIL t79.12a kolom ketersediaan' end as t79_12a;
select case when (select string_agg(court_name || '@' || to_char(start_datetime at time zone 'Asia/Jakarta', 'HH24:MI'), ',' order by start_datetime, court_name)
                  from public.get_court_availability('79797979-0000-0000-0000-000000000001',
                    '79797979-5e00-0000-0000-000000000001',
                    (pg_temp.jakarta_future(1, 1, '00:00') at time zone 'Asia/Jakarta')::date))
                 = 'Lapangan 1@16:30'
            then 'OK   t79.12b CANCELLED dan PENDING kedaluwarsa tidak tampil'
            else 'FAIL t79.12b ' || coalesce((select string_agg(court_name || '@' || to_char(start_datetime at time zone 'Asia/Jakarta', 'HH24:MI'), ',')
                  from public.get_court_availability('79797979-0000-0000-0000-000000000001',
                    '79797979-5e00-0000-0000-000000000001',
                    (pg_temp.jakarta_future(1, 1, '00:00') at time zone 'Asia/Jakarta')::date)), 'kosong') end as t79_12b;
select case when (select count(*) from public.get_court_availability('79797979-0000-0000-0000-000000000001',
                    '79797979-5e00-0000-0000-000000000099',
                    (pg_temp.jakarta_future(1, 1, '00:00') at time zone 'Asia/Jakarta')::date)) = 0
            then 'OK   t79.12c layanan merchant lain kosong' else 'FAIL t79.12c' end as t79_12c;
select pg_temp.expect_fail_code(
  $q$select public.court_price('79797979-5e00-0000-0000-000000000001', now(), 60)$q$, '42501', 't79.12d anon tidak bisa court_price');
rollback;

-- 79.13 hak akses dan signature
select
  case when to_regprocedure('public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source, text, integer, uuid, uuid, text, uuid, uuid, text, text, text, text)') is null
       then 'OK   t79.13a signature 19 argumen sudah dihapus' else 'FAIL t79.13a overload lama masih ada' end as t79_13a,
  case when (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'create_booking') = 1
       then 'OK   t79.13b satu create_booking' else 'FAIL t79.13b overload create_booking' end as t79_13b,
  case when exists (select 1 from unnest(array['anon', 'authenticated']) r,
                      unnest(array['public.court_price(uuid, timestamptz, integer)',
                                   'public.pick_court(uuid, uuid, timestamptz, timestamptz, uuid, uuid)',
                                   'public.evaluate_voucher(uuid, text, uuid, text, numeric)']) f
                    where has_function_privilege(r, f, 'EXECUTE'))
       then 'FAIL t79.13c helper lapangan terbuka' else 'OK   t79.13c court_price, pick_court, evaluate_voucher harga tertutup' end as t79_13c,
  case when has_function_privilege('anon', 'public.get_court_availability(uuid, uuid, date)', 'EXECUTE')
        and has_function_privilege('authenticated', 'public.get_court_availability(uuid, uuid, date)', 'EXECUTE')
       then 'OK   t79.13d get_court_availability untuk anon' else 'FAIL t79.13d' end as t79_13d;

-- 79.14 layanan sewa melewati staf walau merchant STUDIO punya staf aktif
insert into public.staff (merchant_id, name) values ('79797979-0000-0000-0000-000000000001', 'Staf 79');
select pg_temp.is79('t79.14a sewa dengan staf aktif tetap tanpa staf',
  pg_temp.cb79(1, pg_temp.jakarta_future(6, 7, '10:00'), 60, null, '+6281790000018'), 'Lapangan 1:150000:150000');
select case when staff_id is null and staff_name is null
            then 'OK   t79.14b staff_id null' else 'FAIL t79.14b staf terisi' end as t79_14b
  from public.bookings where customer_whatsapp = '+6281790000018';
delete from public.staff where merchant_id = '79797979-0000-0000-0000-000000000001';

-- ===========================================================================
-- 80. Mesin booking lapangan: merchant (20261126000400)
-- ===========================================================================
create or replace function pg_temp.mb80sql(p_start timestamptz, p_dur integer, p_court text, p_phone text) returns text language sql as $$
  select format($f$select * from public.create_manual_booking('79797979-5e00-0000-0000-000000000001', %L,
    'Manual 80', %L, p_court_id => %L::uuid, p_duration_minutes => %s)$f$, p_start, p_phone, p_court, p_dur);
$$;
create or replace function pg_temp.c80(p_phone text) returns text language sql as $$
  select coalesce(court_name, '-') || ':' || trim_scale(service_price) || ':' || duration_minutes || ':'
         || to_char(start_datetime at time zone 'Asia/Jakarta', 'HH24:MI') || '-' || to_char(end_datetime at time zone 'Asia/Jakarta', 'HH24:MI')
  from public.bookings where customer_whatsapp = p_phone;
$$;

-- 80.1 create_manual_booking: lapangan dan lama main, harga otomatis
select pg_temp.act34('t80.1a manual Sabtu 10.00 90 menit Mana saja', '79797979-0000-0000-0000-000000000001',
  pg_temp.mb80sql(pg_temp.jakarta_future(6, 8, '10:00'), 90, null, '+6281800000001'));
select pg_temp.is79('t80.1b manual Lapangan 1, harga 225000', pg_temp.c80('+6281800000001'), 'Lapangan 1:225000:90:10:00-11:30');
select case when status = 'CONFIRMED' and source = 'MANUAL' and staff_id is null
            then 'OK   t80.1c manual CONFIRMED tanpa staf' else 'FAIL t80.1c' end as t80_1c
  from public.bookings where customer_whatsapp = '+6281800000001';
select pg_temp.act34('t80.1d manual minta Lapangan 1 yang terisi = BK070', '79797979-0000-0000-0000-000000000001',
  pg_temp.mb80sql(pg_temp.jakarta_future(6, 8, '10:30'), 60, '79797979-c000-0000-0000-000000000001', '+6281800000002'), 'BK070');
select pg_temp.act34('t80.1e manual lama main 45 = BK071', '79797979-0000-0000-0000-000000000001',
  pg_temp.mb80sql(pg_temp.jakarta_future(6, 8, '14:00'), 45, null, '+6281800000002'), 'BK071');
-- 80.2 merchant A tidak bisa memakai lapangan merchant B
select pg_temp.act34('t80.2 manual dengan lapangan merchant B = BK070', '79797979-0000-0000-0000-000000000001',
  pg_temp.mb80sql(pg_temp.jakarta_future(6, 8, '14:00'), 60, '79797979-c000-0000-0000-000000000099', '+6281800000002'), 'BK070');

-- 80.3 jadwal ulang merchant: lapangan dan durasi dipertahankan, pindah bila bentrok, harga tetap
select pg_temp.act34('t80.3a X Senin 10.00 90 menit', '79797979-0000-0000-0000-000000000001',
  pg_temp.mb80sql(pg_temp.jakarta_future(1, 9, '10:00'), 90, '79797979-c000-0000-0000-000000000001', '+6281800000003'));
select pg_temp.act34('t80.3b Z Senin 17.00 di Lapangan 1', '79797979-0000-0000-0000-000000000001',
  pg_temp.mb80sql(pg_temp.jakarta_future(1, 9, '17:00'), 60, '79797979-c000-0000-0000-000000000001', '+6281800000004'));
select pg_temp.act34('t80.3c X dijadwal ulang ke 17.00 (Lapangan 1 terisi)', '79797979-0000-0000-0000-000000000001',
  format('select public.reschedule_booking_by_merchant(%L, %L)',
    (select id from public.bookings where customer_whatsapp = '+6281800000003'), pg_temp.jakarta_future(1, 9, '17:00')));
select pg_temp.is79('t80.3d X pindah ke Lapangan 2, durasi 90, harga lama 225000 (bukan jam ramai)',
  pg_temp.c80('+6281800000003'), 'Lapangan 2:225000:90:17:00-18:30');
select pg_temp.act34('t80.3e W Senin 19.00', '79797979-0000-0000-0000-000000000001',
  pg_temp.mb80sql(pg_temp.jakarta_future(1, 9, '19:00'), 60, null, '+6281800000005'));
select pg_temp.act34('t80.3f V Senin 19.00', '79797979-0000-0000-0000-000000000001',
  pg_temp.mb80sql(pg_temp.jakarta_future(1, 9, '19:00'), 60, null, '+6281800000006'));
select pg_temp.act34('t80.3g Z ke 19.00 tanpa lapangan kosong = BK072', '79797979-0000-0000-0000-000000000001',
  format('select public.reschedule_booking_by_merchant(%L, %L)',
    (select id from public.bookings where customer_whatsapp = '+6281800000004'), pg_temp.jakarta_future(1, 9, '19:00')), 'BK072');
select pg_temp.is79('t80.3h Z tetap di tempat lama', pg_temp.c80('+6281800000004'), 'Lapangan 1:250000:60:17:00-18:00');
select pg_temp.act34('t80.3i X ke 17.30 tetap di Lapangan 2 (lapangan sendiri kosong)', '79797979-0000-0000-0000-000000000001',
  format('select public.reschedule_booking_by_merchant(%L, %L)',
    (select id from public.bookings where customer_whatsapp = '+6281800000003'), pg_temp.jakarta_future(1, 9, '17:30')));
select pg_temp.is79('t80.3j X di Lapangan 2 17.30-19.00', pg_temp.c80('+6281800000003'), 'Lapangan 2:225000:90:17:30-19:00');

-- 80.4 ubah jadwal oleh pelanggan mempertahankan lapangan dan durasi
insert into public.merchant_settings (merchant_id, allow_customer_reschedule, reschedule_min_hours, max_reschedules)
  values ('79797979-0000-0000-0000-000000000001', true, 0, 5)
  on conflict (merchant_id) do update set allow_customer_reschedule = true, reschedule_min_hours = 0, max_reschedules = 5;
select pg_temp.expect_ok(
  format('select * from public.reschedule_booking(%L, %L)',
    (select access_token from public.bookings where customer_whatsapp = '+6281800000003'), pg_temp.jakarta_future(1, 10, '10:00')),
  't80.4a reschedule_booking pelanggan');
select pg_temp.is79('t80.4b pelanggan: lapangan, durasi, dan harga tetap', pg_temp.c80('+6281800000003'), 'Lapangan 2:225000:90:10:00-11:30');

-- 80.4c ubah jadwal pelanggan tanpa lapangan kosong = BK072
select pg_temp.expect_fail_code(
  format('select * from public.reschedule_booking(%L, %L)',
    (select access_token from public.bookings where customer_whatsapp = '+6281800000004'), pg_temp.jakarta_future(1, 9, '19:00')),
  'BK072', 't80.4c pelanggan ke jam tanpa lapangan kosong');
select pg_temp.is79('t80.4d Z tidak berubah', pg_temp.c80('+6281800000004'), 'Lapangan 1:250000:60:17:00-18:00');
-- 80.4e jadwal ulang merchant melewati jam tutup = BK001
select pg_temp.act34('t80.4e X ke 22.00 + 90 melewati jam tutup = BK001', '79797979-0000-0000-0000-000000000001',
  format('select public.reschedule_booking_by_merchant(%L, %L)',
    (select id from public.bookings where customer_whatsapp = '+6281800000003'), pg_temp.jakarta_future(1, 9, '22:00')), 'BK001');
-- 80.4f tanpa login = 42501
select pg_temp.expect_fail_code(
  format('select public.reschedule_booking_by_merchant(%L, %L)',
    (select id from public.bookings where customer_whatsapp = '+6281800000003'), pg_temp.jakarta_future(1, 9, '12:00')),
  '42501', 't80.4f reschedule_booking_by_merchant tanpa login');
select pg_temp.expect_fail_code(pg_temp.mb80sql(pg_temp.jakarta_future(6, 8, '16:00'), 60, null, '+6281800000009'),
  '42501', 't80.4g create_manual_booking tanpa login');
-- 80.4h manual Mana saja: Lapangan 2 lalu BK072
select pg_temp.act34('t80.4h manual Sabtu 10.00 Mana saja kedua', '79797979-0000-0000-0000-000000000001',
  pg_temp.mb80sql(pg_temp.jakarta_future(6, 8, '10:00'), 60, null, '+6281800000007'));
select pg_temp.is79('t80.4i manual kedua di Lapangan 2', pg_temp.c80('+6281800000007'), 'Lapangan 2:150000:60:10:00-11:00');
select pg_temp.act34('t80.4j manual ketiga tanpa lapangan kosong = BK072', '79797979-0000-0000-0000-000000000001',
  pg_temp.mb80sql(pg_temp.jakarta_future(6, 8, '10:00'), 60, null, '+6281800000008'), 'BK072');

-- 80.5 lapangan yang punya booking tidak bisa dihapus (FK NO ACTION)
select pg_temp.expect_fail_code(
  $q$delete from public.courts where id = '79797979-c000-0000-0000-000000000002'$q$, '23503', 't80.5 hapus lapangan berbooking ditolak');

-- 80.6 check_voucher (pratinjau) untuk layanan sewa memakai total sewa
begin;
set local role service_role;
select case when reason is null and code = 'LAP79' and discount = 30000
            then 'OK   t80.6a pratinjau: total 300000 memenuhi minimal, diskon 10% = 30000'
            else 'FAIL t80.6a ' || coalesce(reason, discount::text) end
  from public.check_voucher('79797979-0000-0000-0000-000000000001', 'LAP79', '79797979-5e00-0000-0000-000000000001',
                            pg_temp.jakarta_future(6, 4, '10:00'), 120);
select case when reason = 'BK054' and code is null
            then 'OK   t80.6b pratinjau: total 150000 di bawah minimal = BK054'
            else 'FAIL t80.6b ' || coalesce(reason, 'NULL') end
  from public.check_voucher('79797979-0000-0000-0000-000000000001', 'LAP79', '79797979-5e00-0000-0000-000000000001',
                            pg_temp.jakarta_future(6, 4, '14:00'), 60);
select case when reason = 'BK071' and code is null
            then 'OK   t80.6c pratinjau: lama main 45 menit = BK071'
            else 'FAIL t80.6c ' || coalesce(reason, 'NULL') end
  from public.check_voucher('79797979-0000-0000-0000-000000000001', 'LAP79', '79797979-5e00-0000-0000-000000000001',
                            pg_temp.jakarta_future(6, 4, '10:00'), 45);
select case when reason = 'BK054'
            then 'OK   t80.6d tanpa jam dan lama main: harga per jam (perilaku lama)'
            else 'FAIL t80.6d ' || coalesce(reason, 'NULL') end
  from public.check_voucher('79797979-0000-0000-0000-000000000001', 'LAP79', '79797979-5e00-0000-0000-000000000001');
rollback;

-- 80.7 get_court_price_rules: anon membaca aturan publik, tidak lintas merchant
begin;
set local role anon;
select case when count(*) = 5 and min(price_per_hour) = 250000 and max(day_of_week) = 5
            and (select array_agg(k order by k) from (
                   select jsonb_object_keys(to_jsonb(r)) k
                   from public.get_court_price_rules('79797979-0000-0000-0000-000000000001',
                     '79797979-5e00-0000-0000-000000000001') r limit 4) x)
                = array['day_of_week', 'end_time', 'price_per_hour', 'start_time']
            then 'OK   t80.7a anon membaca 5 aturan jam ramai, hanya kolom harga dan jam'
            else 'FAIL t80.7a ' || count(*) end
  from public.get_court_price_rules('79797979-0000-0000-0000-000000000001', '79797979-5e00-0000-0000-000000000001');
select case when count(*) = 0
            then 'OK   t80.7b layanan merchant A dengan id merchant B = kosong'
            else 'FAIL t80.7b ' || count(*) end
  from public.get_court_price_rules('79797979-0000-0000-0000-000000000002', '79797979-5e00-0000-0000-000000000001');
rollback;

-- 80.6 jadwal ulang lapangan memakai jam kerja dan grid yang sama dengan create_booking
create or replace function pg_temp.rsm80(p_phone text, p_new timestamptz) returns text language sql as $$
  select format('select public.reschedule_booking_by_merchant(%L, %L)',
    (select id from public.bookings where customer_whatsapp = p_phone), p_new);
$$;
create or replace function pg_temp.rsc80(p_phone text, p_new timestamptz) returns text language sql as $$
  select format('select * from public.reschedule_booking(%L, %L)',
    (select access_token from public.bookings where customer_whatsapp = p_phone), p_new);
$$;
select pg_temp.act34('t80.6a Q Senin 10.00 120 menit', '79797979-0000-0000-0000-000000000001',
  pg_temp.mb80sql(pg_temp.jakarta_future(1, 12, '10:00'), 120, null, '+6281800000010'));
select pg_temp.act34('t80.6b merchant: 22.30 + 120 lewat tengah malam = BK001', '79797979-0000-0000-0000-000000000001',
  pg_temp.rsm80('+6281800000010', pg_temp.jakarta_future(1, 12, '22:30')), 'BK001');
select pg_temp.act34('t80.6c merchant: jam mulai 10.15 di luar grid = BK001', '79797979-0000-0000-0000-000000000001',
  pg_temp.rsm80('+6281800000010', pg_temp.jakarta_future(1, 12, '10:15')), 'BK001');
select pg_temp.expect_fail_code(pg_temp.rsc80('+6281800000010', pg_temp.jakarta_future(1, 12, '10:45')),
  'BK001', 't80.6d pelanggan: jam mulai 10.45 di luar grid');
select pg_temp.act34('t80.6e merchant: 11.00 valid', '79797979-0000-0000-0000-000000000001',
  pg_temp.rsm80('+6281800000010', pg_temp.jakarta_future(1, 12, '11:00')));
select pg_temp.is79('t80.6f Q di 11.00-13.00, lapangan dan harga tetap', pg_temp.c80('+6281800000010'), 'Lapangan 1:300000:120:11:00-13:00');

-- 80.7 BK073: pelanggan tidak boleh pindah ke jam yang lebih mahal
select pg_temp.act34('t80.7a R Senin 10.00 60 menit (150000)', '79797979-0000-0000-0000-000000000001',
  pg_temp.mb80sql(pg_temp.jakarta_future(1, 13, '10:00'), 60, null, '+6281800000011'));
select pg_temp.expect_fail_code(pg_temp.rsc80('+6281800000011', pg_temp.jakarta_future(1, 13, '17:00')),
  'BK073', 't80.7b pelanggan: biasa ke jam ramai');
select pg_temp.is79('t80.7c R tidak berubah', pg_temp.c80('+6281800000011'), 'Lapangan 1:150000:60:10:00-11:00');
select pg_temp.expect_ok(pg_temp.rsc80('+6281800000011', pg_temp.jakarta_future(1, 13, '12:00')),
  't80.7d pelanggan: ke jam berharga sama');
select pg_temp.act34('t80.7e P Senin 18.00 60 menit (250000)', '79797979-0000-0000-0000-000000000001',
  pg_temp.mb80sql(pg_temp.jakarta_future(1, 13, '18:00'), 60, null, '+6281800000012'));
select pg_temp.expect_ok(pg_temp.rsc80('+6281800000012', pg_temp.jakarta_future(1, 13, '14:00')),
  't80.7f pelanggan: ramai ke jam biasa');
select pg_temp.is79('t80.7g P harga tetap 250000', pg_temp.c80('+6281800000012'), 'Lapangan 1:250000:60:14:00-15:00');
select pg_temp.act34('t80.7h merchant: biasa ke jam ramai diterima', '79797979-0000-0000-0000-000000000001',
  pg_temp.rsm80('+6281800000011', pg_temp.jakarta_future(1, 13, '17:00')));
select pg_temp.is79('t80.7i R harga tetap 150000', pg_temp.c80('+6281800000011'), 'Lapangan 1:150000:60:17:00-18:00');

-- 80.8 layanan sudah dihapus: lapangan sendiri tetap dipakai bila kosong
insert into public.services (id, merchant_id, name, price, duration_minutes, payment_mode, court_unit_minutes, court_max_minutes)
  values ('79797979-5e00-0000-0000-000000000008', '79797979-0000-0000-0000-000000000001', 'Padel hapus 80', 150000, 60, 'FULL', 30, 120);
insert into public.service_courts (service_id, court_id, merchant_id)
  values ('79797979-5e00-0000-0000-000000000008', '79797979-c000-0000-0000-000000000003', '79797979-0000-0000-0000-000000000001');
select pg_temp.act34('t80.8a booking layanan yang nanti dihapus', '79797979-0000-0000-0000-000000000001',
  format($f$select * from public.create_manual_booking('79797979-5e00-0000-0000-000000000008', %L,
    'Manual 80', '+6281800000013', p_duration_minutes => 60)$f$, pg_temp.jakarta_future(1, 14, '10:00')));
delete from public.services where id = '79797979-5e00-0000-0000-000000000008';
select pg_temp.act34('t80.8b jadwal ulang tanpa layanan tetap di Lapangan 3', '79797979-0000-0000-0000-000000000001',
  pg_temp.rsm80('+6281800000013', pg_temp.jakarta_future(1, 14, '12:00')));
select pg_temp.is79('t80.8c Lapangan 3 12.00-13.00', pg_temp.c80('+6281800000013'), 'Lapangan 3:150000:60:12:00-13:00');
select pg_temp.expect_fail_code(pg_temp.rsc80('+6281800000013', pg_temp.jakarta_future(1, 14, '14:00')),
  'BK073', 't80.8d pelanggan: harga tidak bisa dihitung (layanan dihapus)');

-- 80.9 get_court_availability kosong untuk layanan nonaktif atau bukan sewa
create or replace function pg_temp.ga80(p_svc text, p_day timestamptz) returns integer language sql as $$
  select count(*)::integer from public.get_court_availability('79797979-0000-0000-0000-000000000001', p_svc::uuid,
    (p_day at time zone 'Asia/Jakarta')::date);
$$;
select pg_temp.is79('t80.9a Badminton aktif melihat Lapangan 1 terisi',
  (pg_temp.ga80('79797979-5e00-0000-0000-000000000002', pg_temp.jakarta_future(1, 13, '00:00')) > 0)::text, 'true');
update public.services set is_active = false where id = '79797979-5e00-0000-0000-000000000002';
select pg_temp.is79('t80.9b layanan nonaktif = kosong',
  pg_temp.ga80('79797979-5e00-0000-0000-000000000002', pg_temp.jakarta_future(1, 13, '00:00'))::text, '0');
update public.services set is_active = true where id = '79797979-5e00-0000-0000-000000000002';
update public.services set court_unit_minutes = null, court_max_minutes = null where id = '79797979-5e00-0000-0000-000000000003';
select pg_temp.is79('t80.9c layanan bukan sewa (masih tertaut) = kosong',
  pg_temp.ga80('79797979-5e00-0000-0000-000000000003', pg_temp.jakarta_future(6, 3, '00:00'))::text, '0');
select case when (select count(*) from pg_proc where proname = 'court_slot_fits') = 1
             and not has_function_privilege('anon', 'public.court_slot_fits(uuid, timestamptz, integer, integer)', 'EXECUTE')
             and not has_function_privilege('authenticated', 'public.court_slot_fits(uuid, timestamptz, integer, integer)', 'EXECUTE')
            then 'OK   t80.9d court_slot_fits tertutup' else 'FAIL t80.9d court_slot_fits terbuka' end as t80_9d;

-- ===========================================================================
-- 81. save_court_service: simpan layanan sewa secara atomik (20261126000800)
-- ===========================================================================
insert into auth.users (id, email, raw_user_meta_data) values
  ('81818181-0000-0000-0000-000000000001', 'court81a@example.com', '{}'::jsonb),
  ('81818181-0000-0000-0000-000000000002', 'court81b@example.com', '{}'::jsonb);
insert into public.services (id, merchant_id, name, price, duration_minutes, payment_mode, seat_duration_minutes, party_min, party_max) values
  ('81818181-5e00-0000-0000-000000000001', '81818181-0000-0000-0000-000000000001', 'Padel 81', 150000, 60, 'FULL', null, null, null),
  ('81818181-5e00-0000-0000-000000000002', '81818181-0000-0000-0000-000000000001', 'Resto 81', 100000, 60, 'FULL', 90, 1, 4),
  ('81818181-5e00-0000-0000-000000000099', '81818181-0000-0000-0000-000000000002', 'Padel B 81', 150000, 60, 'FULL', null, null, null);
insert into public.courts (id, merchant_id, name, sort_order) values
  ('81818181-c000-0000-0000-000000000001', '81818181-0000-0000-0000-000000000001', 'Lapangan 1', 1),
  ('81818181-c000-0000-0000-000000000002', '81818181-0000-0000-0000-000000000001', 'Lapangan 2', 2),
  ('81818181-c000-0000-0000-000000000099', '81818181-0000-0000-0000-000000000002', 'Lapangan B', 1);

-- unit:max:durasi:seat:jumlah tautan:jumlah aturan
create or replace function pg_temp.s81(p_svc text) returns text language sql as $$
  select coalesce(s.court_unit_minutes::text, '-') || ':' || coalesce(s.court_max_minutes::text, '-') || ':'
    || s.duration_minutes || ':' || coalesce(s.seat_duration_minutes::text, '-') || ':'
    || (select count(*) from public.service_courts c where c.service_id = s.id) || ':'
    || (select count(*) from public.court_price_rules r where r.service_id = s.id)
  from public.services s where s.id = p_svc::uuid;
$$;

select pg_temp.act34('t81.1a sewa menyala: kolom, tautan, aturan tersimpan', '81818181-0000-0000-0000-000000000001',
  $q$select public.save_court_service('81818181-5e00-0000-0000-000000000001', true, 30::smallint, 120::smallint, 60,
    array['81818181-c000-0000-0000-000000000001', '81818181-c000-0000-0000-000000000002']::uuid[],
    '[{"day_of_week":6,"start_time":"17:00","end_time":"22:00","price_per_hour":250000},
      {"day_of_week":7,"start_time":"17:00","end_time":"22:00","price_per_hour":250000}]'::jsonb)$q$);
select pg_temp.is79('t81.1b hasil: 30:120:60, 2 lapangan, 2 aturan', pg_temp.s81('81818181-5e00-0000-0000-000000000001'), '30:120:60:-:2:2');

select pg_temp.act34('t81.2a aturan tumpang tindih ditolak 23P01', '81818181-0000-0000-0000-000000000001',
  $q$select public.save_court_service('81818181-5e00-0000-0000-000000000001', true, 60::smallint, 240::smallint, 120,
    array['81818181-c000-0000-0000-000000000001']::uuid[],
    '[{"day_of_week":6,"start_time":"17:00","end_time":"18:00","price_per_hour":250000},
      {"day_of_week":6,"start_time":"17:30","end_time":"19:00","price_per_hour":200000}]'::jsonb)$q$, '23P01');
select pg_temp.is79('t81.2b atomik: kolom, tautan, dan aturan tidak berubah', pg_temp.s81('81818181-5e00-0000-0000-000000000001'), '30:120:60:-:2:2');

select pg_temp.act34('t81.3a payload melanggar CHECK (max < durasi) ditolak 22023', '81818181-0000-0000-0000-000000000001',
  $q$select public.save_court_service('81818181-5e00-0000-0000-000000000001', true, 30::smallint, 60::smallint, 120,
    array['81818181-c000-0000-0000-000000000001']::uuid[], '[]'::jsonb)$q$, '22023');
select pg_temp.act34('t81.3b tanpa lapangan ditolak 22023', '81818181-0000-0000-0000-000000000001',
  $q$select public.save_court_service('81818181-5e00-0000-0000-000000000001', true, 30::smallint, 120::smallint, 60,
    '{}'::uuid[], '[]'::jsonb)$q$, '22023');
select pg_temp.is79('t81.3c tetap utuh setelah dua penolakan', pg_temp.s81('81818181-5e00-0000-0000-000000000001'), '30:120:60:-:2:2');

select pg_temp.act34('t81.4a layanan merchant lain 42501', '81818181-0000-0000-0000-000000000001',
  $q$select public.save_court_service('81818181-5e00-0000-0000-000000000099', true, 30::smallint, 120::smallint, 60,
    array['81818181-c000-0000-0000-000000000001']::uuid[], '[]'::jsonb)$q$, '42501');
select pg_temp.act34('t81.4b lapangan merchant lain 42501', '81818181-0000-0000-0000-000000000001',
  $q$select public.save_court_service('81818181-5e00-0000-0000-000000000001', true, 30::smallint, 120::smallint, 60,
    array['81818181-c000-0000-0000-000000000099']::uuid[], '[]'::jsonb)$q$, '42501');
select pg_temp.is79('t81.4c layanan merchant lain tak tersentuh', pg_temp.s81('81818181-5e00-0000-0000-000000000099'), '-:-:60:-:0:0');
select pg_temp.is79('t81.4d layanan sendiri utuh setelah lapangan asing ditolak', pg_temp.s81('81818181-5e00-0000-0000-000000000001'), '30:120:60:-:2:2');

select pg_temp.act34('t81.5a sewa mati: kolom null, tautan dan aturan terhapus', '81818181-0000-0000-0000-000000000001',
  $q$select public.save_court_service('81818181-5e00-0000-0000-000000000001', false, null, null, null, '{}'::uuid[], '[]'::jsonb)$q$);
select pg_temp.is79('t81.5b hasil: -:-:60, 0 lapangan, 0 aturan', pg_temp.s81('81818181-5e00-0000-0000-000000000001'), '-:-:60:-:0:0');

select pg_temp.act34('t81.6a sewa menyala pada layanan restoran: seat dan tamu dikosongkan', '81818181-0000-0000-0000-000000000001',
  $q$select public.save_court_service('81818181-5e00-0000-0000-000000000002', true, 60::smallint, 120::smallint, 60,
    array['81818181-c000-0000-0000-000000000001']::uuid[], '[]'::jsonb)$q$);
select pg_temp.is79('t81.6b hasil: 60:120:60, seat null', pg_temp.s81('81818181-5e00-0000-0000-000000000002'), '60:120:60:-:1:0');
select pg_temp.is79('t81.6c party dikosongkan',
  (select (party_min is null and party_max is null)::text from public.services where id = '81818181-5e00-0000-0000-000000000002'), 'true');

select case when has_function_privilege('anon', 'public.save_court_service(uuid, boolean, smallint, smallint, integer, uuid[], jsonb, boolean)', 'EXECUTE')
              or not has_function_privilege('authenticated', 'public.save_court_service(uuid, boolean, smallint, smallint, integer, uuid[], jsonb, boolean)', 'EXECUTE')
            then 'FAIL t81.7 hak eksekusi save_court_service salah' else 'OK   t81.7 save_court_service hanya authenticated' end as t81_7;

-- 81.8 layanan sewa baru: nonaktif sampai RPC sukses, aktif atomik; gagal tetap nonaktif
insert into public.services (id, merchant_id, name, price, duration_minutes, payment_mode, is_active) values
  ('81818181-5e00-0000-0000-000000000003', '81818181-0000-0000-0000-000000000001', 'Padel baru 81', 150000, 60, 'FULL', false),
  ('81818181-5e00-0000-0000-000000000004', '81818181-0000-0000-0000-000000000001', 'Padel nonaktif 81', 150000, 60, 'FULL', false);
select pg_temp.act34('t81.8a RPC gagal (aturan tumpang tindih): tetap nonaktif', '81818181-0000-0000-0000-000000000001',
  $q$select public.save_court_service('81818181-5e00-0000-0000-000000000003', true, 30::smallint, 120::smallint, 60,
    array['81818181-c000-0000-0000-000000000001']::uuid[],
    '[{"day_of_week":6,"start_time":"17:00","end_time":"18:00","price_per_hour":250000},
      {"day_of_week":6,"start_time":"17:30","end_time":"19:00","price_per_hour":200000}]'::jsonb, true)$q$, '23P01');
select pg_temp.is79('t81.8b nonaktif dan bukan sewa', (select is_active::text || ':' || (court_unit_minutes is null)::text from public.services where id = '81818181-5e00-0000-0000-000000000003'), 'false:true');
select pg_temp.act34('t81.8c RPC sukses dengan p_activate: aktif', '81818181-0000-0000-0000-000000000001',
  $q$select public.save_court_service('81818181-5e00-0000-0000-000000000003', true, 30::smallint, 120::smallint, 60,
    array['81818181-c000-0000-0000-000000000001']::uuid[], '[]'::jsonb, true)$q$);
select pg_temp.is79('t81.8d aktif dan sewa', (select is_active::text || ':' || (court_unit_minutes is not null)::text from public.services where id = '81818181-5e00-0000-0000-000000000003'), 'true:true');
select pg_temp.act34('t81.8e simpan ulang tanpa p_activate tidak menayangkan layanan yang sengaja nonaktif', '81818181-0000-0000-0000-000000000001',
  $q$select public.save_court_service('81818181-5e00-0000-0000-000000000004', true, 30::smallint, 120::smallint, 60,
    array['81818181-c000-0000-0000-000000000001']::uuid[], '[]'::jsonb)$q$);
select pg_temp.is79('t81.8f tetap nonaktif', (select is_active::text from public.services where id = '81818181-5e00-0000-0000-000000000004'), 'false');
