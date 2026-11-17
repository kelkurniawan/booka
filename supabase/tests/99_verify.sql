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
  case when has_function_privilege('anon', 'public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source)', 'EXECUTE')
       then 'FAIL anon bisa memanggil create_booking'
       else 'OK   anon TIDAK bisa memanggil create_booking' end as t11f_anon,
  case when has_function_privilege('authenticated', 'public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source)', 'EXECUTE')
       then 'FAIL authenticated bisa memanggil create_booking'
       else 'OK   authenticated TIDAK bisa memanggil create_booking' end as t11f_auth,
  case when has_function_privilege('service_role', 'public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source)', 'EXECUTE')
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
-- Sejak 20261115000600 signature terbarunya delapan argumen (p_source).
select
  case when to_regprocedure('public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source)') is null
       then 'FAIL t33m signature delapan argumen (20261115000600) tidak ada'
       when has_function_privilege('anon', to_regprocedure('public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source)'), 'EXECUTE')
         or has_function_privilege('authenticated', to_regprocedure('public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source)'), 'EXECUTE')
       then 'FAIL t33m anon/authenticated bisa EXECUTE create_booking'
       when not has_function_privilege('service_role', to_regprocedure('public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source)'), 'EXECUTE')
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
  case when has_function_privilege('anon', 'public.create_manual_booking(uuid, timestamptz, text, text, uuid)', 'EXECUTE')
         or has_function_privilege('anon', 'public.reschedule_booking_by_merchant(uuid, timestamptz)', 'EXECUTE')
       then 'FAIL t36l anon bisa EXECUTE RPC merchant'
       when not (has_function_privilege('authenticated', 'public.create_manual_booking(uuid, timestamptz, text, text, uuid)', 'EXECUTE')
         and has_function_privilege('authenticated', 'public.reschedule_booking_by_merchant(uuid, timestamptz)', 'EXECUTE'))
       then 'FAIL t36l authenticated tidak bisa EXECUTE RPC merchant'
       else 'OK   t36l RPC merchant hanya untuk authenticated' end as t36l1,
  case when has_function_privilege('anon', 'public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source)', 'EXECUTE')
         or has_function_privilege('authenticated', 'public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source)', 'EXECUTE')
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
                      unnest(array['public.evaluate_voucher(uuid, text, uuid, text)', 'public.check_voucher(uuid, text, uuid)',
                                   'public.check_voucher_rate_limit(text, uuid)']) f
                    where has_function_privilege(r, f, 'EXECUTE'))
       then 'FAIL t45f fungsi internal voucher terbuka'
       else 'OK   t45f evaluate/check/rate limit tertutup untuk anon dan authenticated' end as t45f4,
  case when has_function_privilege('service_role', 'public.check_voucher(uuid, text, uuid)', 'EXECUTE')
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
