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
  case when has_function_privilege('anon', 'public.create_booking(uuid, uuid, timestamptz, text, text)', 'EXECUTE')
       then 'FAIL anon bisa memanggil create_booking'
       else 'OK   anon TIDAK bisa memanggil create_booking' end as t11f_anon,
  case when has_function_privilege('authenticated', 'public.create_booking(uuid, uuid, timestamptz, text, text)', 'EXECUTE')
       then 'FAIL authenticated bisa memanggil create_booking'
       else 'OK   authenticated TIDAK bisa memanggil create_booking' end as t11f_auth,
  case when has_function_privilege('service_role', 'public.create_booking(uuid, uuid, timestamptz, text, text)', 'EXECUTE')
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
