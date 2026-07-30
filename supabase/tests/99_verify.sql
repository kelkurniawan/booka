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
  case when has_function_privilege('anon', 'public.upsert_payment_credential(uuid, public.payment_provider, text, text)', 'EXECUTE')
       then 'FAIL anon bisa memanggil upsert_payment_credential'
       else 'OK   anon TIDAK bisa memanggil upsert_payment_credential' end as t10d,
  case when has_function_privilege('authenticated', 'public.upsert_payment_credential(uuid, public.payment_provider, text, text)', 'EXECUTE')
       then 'FAIL authenticated bisa memanggil upsert_payment_credential'
       else 'OK   authenticated TIDAK bisa memanggil upsert_payment_credential' end as t10e,
  case when has_function_privilege('service_role', 'public.upsert_payment_credential(uuid, public.payment_provider, text, text)', 'EXECUTE')
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
-- BENAR, bukan cuma "ada error" -- 23P01 (bentrok), P0002 (kuota), dan P0004
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

-- 11a. Booking pertama sukses: Selasa 11:00-12:30 (Makeup Wisuda, 90 menit),
-- di dalam jam kerja 11:00-14:00.
select pg_temp.expect_ok(
  $q$select * from public.create_booking(
    '11111111-1111-1111-1111-111111111111',
    (select id from public.services where merchant_id = '11111111-1111-1111-1111-111111111111' and name = 'Makeup Wisuda'),
    '2026-08-18 11:00+07', 'Pelanggan Booking A', '+6281199991111'
  )$q$,
  'create_booking sukses: Selasa 11:00-12:30 di dalam jam kerja');

-- Snapshot service_name/service_price/duration_minutes wajib berasal dari
-- tabel services yang dibaca ulang di dalam fungsi, dan end_datetime wajib
-- persis start_datetime + duration_minutes layanan tersebut (90 menit).
select case when service_name = 'Makeup Wisuda'
              and service_price = 350000
              and duration_minutes = 90
              and start_datetime = '2026-08-18 11:00+07'::timestamptz
              and end_datetime = '2026-08-18 12:30+07'::timestamptz
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
    '2026-08-18 12:00+07', 'Pelanggan Booking B', '+6281199992222'
  )$q$,
  '23P01',
  'create_booking ditolak (23P01): 12:00-14:00 bentrok dengan 11:00-12:30');

-- 11c. Slot di luar jam kerja: Selasa 08:00 (jam kerja mulai 11:00) -> harus
-- ditolak errcode P0004, bukan lolos begitu saja karena tidak ada booking
-- lain yang bentrok pada jam itu.
select pg_temp.expect_fail_code(
  $q$select * from public.create_booking(
    '11111111-1111-1111-1111-111111111111',
    (select id from public.services where merchant_id = '11111111-1111-1111-1111-111111111111' and name = 'Makeup Wisuda'),
    '2026-08-18 08:00+07', 'Pelanggan Booking C', '+6281199993333'
  )$q$,
  'P0004',
  'create_booking ditolak (P0004): 08:00 Selasa sebelum jam kerja mulai (11:00)');

-- 11d. Layanan tidak aktif -> harus ditolak errcode P0005, bukan diam-diam
-- membuat booking untuk layanan yang sudah merchant nonaktifkan.
select pg_temp.expect_ok(
  $q$insert into public.services (merchant_id, name, price, duration_minutes, is_active) values ('11111111-1111-1111-1111-111111111111', 'Layanan Nonaktif', 100000, 60, false)$q$,
  'buat layanan nonaktif untuk tes 11d');
select pg_temp.expect_fail_code(
  $q$select * from public.create_booking(
    '11111111-1111-1111-1111-111111111111',
    (select id from public.services where merchant_id = '11111111-1111-1111-1111-111111111111' and name = 'Layanan Nonaktif'),
    '2026-08-25 11:00+07', 'Pelanggan Booking D', '+6281199995555'
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
    '2026-08-11 11:00+07', 'Pelanggan Booking E', '+6281199994444'
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
