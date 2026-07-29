# Keputusan teknis & penyimpangan dari PRD

Catatan tiap tempat di mana implementasi berbeda dari
`docs/PRD-Smart-Booking-Invoicing-SaaS-V3.md`, beserta alasannya.

## 1. Anon tidak boleh INSERT langsung ke `bookings`

**PRD bagian 4:** `INSERT public (anon)` pada tabel `bookings`.

**Implementasi:** `anon` tidak mendapat hak apa pun ke tabel `bookings`.
Pembuatan booking berjalan lewat `POST /api/bookings` dengan service role.

**Alasan:** PRD bagian 5 sendiri mensyaratkan pembuatan booking berada dalam
satu transaksi bersama pengecekan bentrok dan pemanggilan API payment gateway.
Kalau `anon` bisa menulis langsung, siapa pun bisa melewati jalur itu —
menyisipkan booking berstatus `PAID` tanpa membayar, memalsukan
`service_price`, atau membanjiri kalender merchant. Logika transaksionalnya
tetap sama persis seperti di PRD, hanya pintu masuknya yang ditutup.

## 2. Pengecekan slot bentrok lewat fungsi, bukan SELECT publik

**PRD bagian 4:** `SELECT ... public (hanya cek bentrok)` pada `bookings`.

**Implementasi:** fungsi `public.get_booked_ranges(username, from, to)` yang
`SECURITY DEFINER` dan hanya mengembalikan `start_datetime` dan
`end_datetime`.

**Alasan:** RLS bekerja per baris, bukan per kolom. Memberi `anon` hak SELECT
untuk "cek bentrok" berarti memberinya seluruh isi baris — termasuk
`customer_name` dan `customer_whatsapp` pelanggan lain. Fungsi ini memenuhi
kebutuhan yang sama tanpa membocorkan data pribadi.

## 3. Token payment gateway dipisah ke schema `private`

**PRD bagian 4:** kolom `merchants.payment_access_token`.

**Implementasi:** dua tabel —
`public.payment_connections` (metadata: provider, account id, status, masa
berlaku) dan `private.payment_credentials` (access & refresh token,
terenkripsi).

**Alasan:** dua hal. Pertama, OAuth Connect butuh lebih dari satu kolom
(refresh token, expiry, scope, provider account id) dan merchant bisa
menghubungkan Midtrans maupun Xendit. Kedua, kolom di tabel `public` selalu
terjangkau PostgREST; satu policy yang salah tulis langsung membocorkan token.
Schema `private` tidak diekspos ke API sama sekali, jadi hanya kode server yang
bisa menyentuhnya.

## 4. Exclusion constraint di samping pessimistic locking

**PRD bagian 5A:** `SELECT ... FOR UPDATE` untuk mencegah double-booking.

**Implementasi:** keduanya. Constraint `bookings_no_overlap` (GiST exclusion
atas `merchant_id` + `tstzrange`, difilter status `PENDING`/`PAID`) menjadi
jaminan utama; `FOR UPDATE` tetap dipakai di Phase 5 untuk menghasilkan pesan
error yang ramah sebelum API payment gateway dipanggil.

**Alasan:** `FOR UPDATE` hanya melindungi baris yang sudah ada — dua request
yang sama-sama menyisipkan baris baru tidak saling mengunci. Constraint-nya
yang membuat slot bentrok mustahil tersimpan, apa pun jalur masuknya.

## 5. Halaman publik dibaca dengan klien anon tanpa sesi

`createPublicClient()` di `src/lib/supabase/server.ts` sengaja tidak membawa
cookie. Halaman `/[username]` selalu dibaca sebagai peran `anon`, termasuk
ketika pengunjungnya merchant yang sedang login.

**Alasan:** dengan begitu policy `anon` dan `authenticated` bisa dipisah tegas.
Kalau keduanya digabung, `authenticated` butuh hak SELECT tabel penuh untuk
membaca profil merchant lain, dan hak itu otomatis mencakup kolom
`whatsapp_number` milik semua merchant.

## 6. Kolom snapshot pada `bookings`

`bookings` menyimpan `service_name`, `service_price`, dan `duration_minutes`
sendiri, dengan `service_id` yang `ON DELETE SET NULL`.

**Alasan:** merchant akan mengubah harga dan menghapus layanan. Tanpa snapshot,
riwayat booking lama ikut berubah nilainya atau kehilangan nama layanan —
masalah nyata begitu ledger dipakai untuk rekap pemasukan.

## 7. `merchants.username` nullable

Baris `merchants` dibuat otomatis oleh trigger `handle_new_user` saat signup,
padahal username baru ditentukan di halaman onboarding. Selama masih `NULL`,
proxy memaksa user ke `/onboarding`, dan merchant tersebut tidak muncul di
policy publik mana pun.

## 8. Tabel `reserved_usernames`

Username merchant menempati segmen URL teratas (`/[username]`), satu ruang nama
dengan `/dashboard`, `/login`, `/api`, dan seterusnya. Tabel ini plus trigger
`reject_reserved_username` mencegah merchant mengklaim kata yang akan
menaungi route aplikasi.

## 9. Batas paket ditegakkan di database

Trigger `enforce_service_limit` menolak layanan kedua untuk paket `STARTER`,
dan `subscription_tier` tidak masuk daftar kolom yang boleh di-UPDATE oleh
peran `authenticated`.

**Alasan:** batas paket adalah aturan bisnis yang menentukan pendapatan. Kalau
hanya dicek di UI, siapa pun yang memanggil PostgREST langsung dengan anon key
bisa melewatinya — termasuk menaikkan tier-nya sendiri.

## 10. Auth tetap Supabase, bukan Clerk

Sempat dipertimbangkan memakai Clerk. Tidak jadi, karena seluruh model
keamanan sudah terikat ke `auth.uid()`: 17 RLS policy, foreign key
`merchants.id → auth.users(id)`, dan trigger `handle_new_user`.

Memakai Clerk berarti memilih antara memasangnya sebagai third-party auth
provider Supabase — dua sistem identitas untuk satu produk — atau membuang RLS
dan memindahkan seluruh kontrol akses ke kode aplikasi. Yang kedua membuang
properti keamanan terkuat dari desain ini.

Ekonominya juga tidak cocok: paket Pro Rp79.000/bulan, sementara Clerk menagih
biaya tetap bulanan plus per-MAU — termasuk untuk merchant Starter yang gratis
dan mungkin tidak pernah konversi.

Yang benar-benar hilang dengan tidak memakai Clerk adalah Organizations, yang
baru relevan saat fitur multi-staff paket Studio dibangun. Sampai saat itu tiba,
tabel `staff` biasa sudah cukup.

## 11. Password sebagai jalur masuk utama

Awalnya hanya Magic Link dan Google. Ditambahkan email + password, dengan
Magic Link dipertahankan sebagai opsi "masuk tanpa password".

Alasannya audiens: pemilik usaha kecil membuka Booka dari HP. Magic Link
memaksa mereka keluar aplikasi, mencari email yang sering mendarat di tab
Promosi, lalu kembali. Setiap perpindahan itu kehilangan sebagian orang.

Pesan kegagalan sengaja tidak membedakan "email tidak terdaftar" dari "password
salah", dan `resetPasswordForEmail` selalu melaporkan berhasil — supaya halaman
masuk tidak bisa dipakai memetakan siapa saja yang punya akun.

## 12. Kuota transaksi ditegakkan di database

Batas 10 transaksi/bulan paket STARTER semula hanya ditampilkan di dashboard
dan tidak ditegakkan di mana pun — merchant Starter bisa memakai Booka tanpa
batas selamanya.

Sekarang dijaga trigger `bookings_enforce_quota`. Yang dihitung adalah booking
`PENDING` + `PAID` yang dibuat bulan berjalan menurut waktu Jakarta; booking
`CANCELLED` mengembalikan kuotanya, supaya pesanan yang ditinggalkan pelanggan
tidak menghanguskan jatah merchant.

Angka di dashboard memanggil `my_quota_usage()`, yang memakai fungsi hitung
yang sama dengan trigger — supaya yang ditampilkan tidak pernah berbeda dari
yang diberlakukan.

Sisa celah yang diketahui: dua insert bersamaan bisa sama-sama lolos dan
melewati kuota satu baris. Advisory lock per merchant di dalam transaksi
`POST /api/bookings` akan menutupnya di Phase 5.

## 13. Grant EXECUTE fungsi harus dicabut eksplisit dari anon & authenticated

Migration awal sudah benar menangani tabel: setiap tabel di-`REVOKE ALL` dulu
dari `anon`/`authenticated`, karena Supabase memasang `ALTER DEFAULT
PRIVILEGES` yang memberi `ALL` pada tabel baru di schema `public`.

Yang terlewat: Supabase memasang default privileges yang sama untuk **fungsi**.
`REVOKE EXECUTE ... FROM PUBLIC` yang ditulis di migration awal tidak menyentuh
grant langsung ke `anon`/`authenticated` tersebut, sehingga setiap fungsi ikut
terekspos di `/rest/v1/rpc/`.

Yang paling serius: `count_bookings_this_month(uuid)` bisa dipanggil tanpa sesi
sama sekali, membocorkan jumlah transaksi bulan berjalan milik merchant mana
pun yang UUID-nya diketahui.

Diperbaiki di `20260730000300_lock_down_function_execute.sql`, yang juga
memasang `alter default privileges in schema public revoke execute on functions
from anon, authenticated` supaya kelas bug ini tidak terulang — fungsi baru
sekarang tertutup secara default, dan yang memang publik wajib di-`GRANT`
eksplisit.

Ditemukan lewat Supabase security advisor setelah migration diterapkan ke
project cloud, lalu dikonfirmasi langsung dengan membaca `pg_proc.proacl` dan
`pg_default_acl`. Regresinya sekarang dijaga tes di `supabase/tests/99_verify.sql`.

## 14. Tipe `my_quota_usage` ditulis manual, berbeda dari hasil generate

`supabase gen types` menuliskan `quota` sebagai `number` non-null, padahal
`booking_quota_for_tier()` mengembalikan `NULL` untuk paket PRO dan STUDIO.
Generator tidak bisa menyimpulkan nullability dari nilai balik fungsi SQL.

`src/types/database.ts` memakai `quota: number | null`. Kalau file itu suatu
saat diganti hasil generate, perbedaan ini harus dipasang kembali.

## 15. Next.js 16, bukan 14/15

PRD menyebut Next.js 14/15. `create-next-app@latest` memasang 16.2.12. App
Router tetap sama; perbedaan yang berdampak: konvensi `middleware.ts` berganti
nama menjadi `proxy.ts` dengan named export `proxy` (lihat `src/proxy.ts`).
