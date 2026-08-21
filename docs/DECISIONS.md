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

`payment_connections` juga punya `connection_mode` (`OAUTH` / `MANUAL_KEY`,
membedakan token hasil OAuth Connect dari Server Key yang di-paste manual) dan
`environment` (`SANDBOX` / `PRODUCTION`, per-merchant, per-koneksi). Kolom
`environment` tidak punya rujukan di PRD sama sekali — ini konsep produk baru
dari fase kredensial-manual. Sumber kebenarannya adalah kolom ini di DB, bukan
`MIDTRANS_ENV`/`XENDIT_ENV` di `src/lib/env/server.ts`: kedua env var itu
hanya konfigurasi proses-level (mis. base URL API mana yang dipanggil server
saat belum ada satu pun merchant terhubung), sedangkan `environment` per baris
menentukan kredensial dan endpoint mana yang dipakai untuk merchant tertentu.
Kalau keduanya berbeda, kolom `environment` merchant yang menang.

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

## 16. RPC `get_payment_credential`/`upsert_payment_credential` untuk menembus schema `private`

Task 4 (halaman Pembayaran) awalnya diinstruksikan tanpa migration baru,
dengan asumsi `createAdminClient()` (klien service_role via PostgREST) bisa
langsung membaca/menulis `private.payment_credentials` karena "melewati
RLS". Itu keliru: RLS dan **exposed schema** PostgREST adalah dua lapis
proteksi yang berbeda. Service role memang melewati RLS, tapi PostgREST
menolak permintaan ke schema yang tidak ada di daftar "Exposed schemas"
untuk **peran apa pun** — termasuk service_role — karena penyaringannya
terjadi di level routing PostgREST, sebelum peran diperiksa sama sekali.
`docs/SETUP.md` bagian 4 secara eksplisit melarang `private` masuk daftar
itu, jadi tanpa jalan lain, `payment_credentials` sama sekali tidak bisa
disentuh dari kode aplikasi manapun.

Solusinya sama dengan pola yang sudah dipakai `get_booked_ranges` untuk
menyembunyikan tabel `bookings` dari `anon`: dua fungsi `SECURITY DEFINER` di
schema `public` (yang exposed) —`get_payment_credential` dan
`upsert_payment_credential` — yang mengakses `private.payment_credentials`
dengan hak pemilik fungsi, bukan hak pemanggil. Hanya `service_role` yang
diberi `GRANT EXECUTE`; `anon`/`authenticated`/`PUBLIC` eksplisit direvoke.
Keduanya menerima `merchant_id` + `provider` (bukan `connection_id` mentah)
dan memverifikasi kepemilikan baris `payment_connections` sendiri lewat
constraint unique `payment_connections_unique_provider`, supaya pemanggil
tidak bisa membaca/menimpa kredensial connection_id milik merchant lain
sekalipun connection_id itu tertebak.

Ditambahkan di `20260730000600_payment_credential_rpc.sql`, diuji lewat
`npm run docker:test` (hak EXECUTE per peran + round-trip upsert/get) di
`supabase/tests/99_verify.sql` bagian 10.

## 17. Format tanggal/jam selalu Asia/Jakarta, tidak pernah zona waktu host

`src/lib/format.ts` (`formatDateTime`, `formatDate`, `formatTime`) sengaja
menghitung sendiri jam dinding WIB (geser instant UTC-nya +7 jam, baca lewat
getter UTC) alih-alih memakai zona waktu proses yang merendernya. Sebelum
perbaikan ini fungsi-fungsi itu memakai `date-fns/format` polos, yang selalu
resolve ke `TZ` proses Node — tidak ada satu pun dari `Dockerfile`,
`compose.yaml`, atau `next.config.ts` yang menyetel `TZ`, jadi server produksi
(mis. Vercel) berjalan UTC dan setiap jam yang ditampilkan meleset 7 jam dari
label "WIB" di sampingnya, termasuk jam kedaluwarsa QRIS dan bukti pembayaran
di `/pesanan/[token]`.

Asia/Jakarta dipilih sebagai satu-satunya zona tampilan (bukan opsional per
pengguna) karena Booka hanya melayani merchant Indonesia dan WIB adalah
UTC+7 tetap tanpa DST — aman dihitung manual tanpa data zona waktu IANA.

## 18. `access_token` booking ada di path URL, bukan header/cookie

`/pesanan/[token]` mengidentifikasi booking lewat token 192-bit di path URL
(`ROUTES.bookingStatus`), bukan lewat header Authorization atau cookie sesi.
Ini keputusan sadar — pelanggan tidak login, jadi tautan itu sendiri HARUS
jadi satu-satunya bukti akses, dan token di path (bukan query string) tidak
ikut ke server via header seperti cookie akan.

Konsekuensinya: token ini otomatis tersimpan di riwayat browser pelanggan dan
di access log platform (Vercel dsb, mana pun yang mencatat path request).
Entropinya (192 bit) membuat tebakan brute-force tidak praktis, jadi ini
diterima sebagai trade-off desain, BUKAN diabaikan begitu saja — dicatat di
sini supaya tidak ada yang nanti menambah logging path request (mis. APM,
analytics) tanpa sadar itu berarti mencatat token akses booking pelanggan.

## 19. Tidak ada load balancer terpisah di depan aplikasi

PRD tidak menyebutkan load balancer secara eksplisit, tapi topik ini muncul
saat mengoptimalkan performa dashboard — wajar untuk ditanyakan kenapa tidak
ada nginx/HAProxy di depan Next.js.

**Implementasi:** tidak ada. Produksi berjalan langsung di Vercel tanpa
reverse proxy tambahan.

**Alasan:** di Vercel, distribusi request sudah inheren pada platform itu
sendiri — Anycast edge network yang merutekan tiap request ke titik terdekat,
lalu Fluid Compute yang me-reuse instance function yang sudah hangat dan
menskalakannya otomatis sesuai beban. Menaruh nginx/HAProxy di depannya
menambah satu hop jaringan tanpa manfaat: tidak ada beberapa server asal yang
perlu diseimbangkan bebannya, karena Vercel sendiri sudah menjadi lapisan itu.

`app-prod` di `compose.yaml` (port 3001, profil `prod`) bisa terlihat seperti
cikal-bakal topologi produksi self-hosted, tapi bukan — itu alat verifikasi
lokal untuk memastikan image produksi berhasil dibangun dan berjalan sebelum
deploy, dijalankan satu instance, tanpa proxy di depannya, dan tidak pernah
dipakai melayani traffic sungguhan.

Trade-off yang sadar diambil: keputusan ini terikat pada Vercel sebagai
platform hosting. Kalau self-hosting (mis. VM sendiri atau Kubernetes) suatu
saat menjadi jalur produksi, premis "distribusi request sudah inheren" tidak
lagi berlaku, dan reverse proxy plus beberapa replika aplikasi harus
dipertimbangkan ulang dari awal — bukan diasumsikan sudah beres karena
pernah tidak dibutuhkan di Vercel.

## 20. `regions: ["sin1"]` di `vercel.json`, dan keterikatannya ke region Supabase

**Status: pemindahan sudah dijalankan (2026-08-20).** Database dan Vercel
Functions kini sama-sama di Singapura. Runbook lengkap beserta catatan
pelaksanaannya ada di `docs/SUPABASE-REGION-MOVE.md`.

**Implementasi:** `vercel.json` menetapkan `"regions": ["sin1"]` (Singapura)
untuk seluruh Vercel Functions — termasuk Route Handler, Server Action, dan
cron `/api/cron/cancel-unpaid`. Project Supabase yang dipakai adalah
`booka-sg` (`fsloouakiaagdrcchzfc`) di `ap-southeast-1`.

**Alasan:** tanpa `regions` disetel, Vercel Functions default ke `iad1`
(Washington, D.C.). Karena hampir setiap route dashboard melakukan query ke
Supabase, tiap request akan menyeberangi Pasifik dua kali sebelum
responsnya terkirim.

Yang menentukan pilihan region BUKAN kedekatan ke pengguna, melainkan
kedekatan ke database. Vercel menuntaskan TLS di edge PoP terdekat dengan
pengguna lalu meneruskan ke region function lewat backbone-nya, jadi hop
pengguna→function praktis dibayar sekali per request. Hop
function→database dibayar pada SETIAP round-trip berurutan, dan satu
navigasi dashboard masih melakukan sekitar tiga. Round-trip database
berlipat; hop pengguna tidak. Karena pengguna Booka juga ada di Asia
Tenggara, Singapura kebetulan memenangkan keduanya sekaligus.

**Catatan sejarah — asumsi region pernah salah dan tidak ketahuan.** Revisi
pertama entri ini menyatakan project Supabase ada di `ap-southeast-1` dan
membangun seluruh alasannya di atas itu. Kenyataannya project lama
(`ydhllxeeymvthgfsqmkb`) berjalan di `ap-northeast-1` (Tokyo), dan itu baru
ketahuan saat hendak deploy. Selama beberapa commit, `main` berisi
kombinasi function-Singapura + database-Tokyo yang lebih lambat daripada
sebelum optimasi — tanpa satu pun error yang menandainya. Pelajarannya:
verifikasi region lewat `npx supabase projects list`, jangan diingat-ingat.

Trade-off yang tetap ada: ini pin satu region, bukan multi-region. Pengguna
jauh dari Asia Tenggara akan mendapat latensi lebih tinggi dibanding kalau
function-nya tersebar. Untuk profil pengguna Booka (merchant Indonesia,
lihat keputusan #17 soal zona tampilan WIB) trade-off ini menguntungkan.

**Kaitan yang wajib diingat:** region Supabase dan `regions` di
`vercel.json` harus selalu bergerak bersama. Kalau project Supabase
dipindahkan lagi, `regions` di sini wajib ikut berubah — kalau tidak,
performa mundur diam-diam tanpa error apa pun.

## 21. Paket Starter mendapat sebagian kustomisasi tampilan

PRD bagian 1 menempatkan "Custom Theme" sepenuhnya di paket Pro. Implementasi
memberi paket Starter tiga preset gratis (Bersih, Hangat, Malam), pilihan gaya
sudut, foto profil, dan FAQ.

Alasannya: halaman merchant Starter justru halaman yang memasang watermark
"Dibuat dengan Booka". Halaman itu etalase platform, dan etalase yang seragam
dan hambar merugikan kami sendiri. Batas yang terasa — tiga preset premium,
warna sendiri, background foto, pilihan font, ukuran teks, dan video layanan
masih terkunci — mendorong upgrade lebih baik daripada tembok penuh yang
membuat merchant tidak pernah tahu ada yang bisa dibeli.

FAQ sengaja terbuka untuk semua paket: manfaatnya adalah berkurangnya
pertanyaan berulang yang masuk ke WhatsApp merchant, dan itu manfaat yang
membuat merchant bertahan cukup lama untuk akhirnya upgrade.

Penegakannya berlapis dua, dan lapisannya tidak saling menggantikan. Trigger
`merchant_themes_enforce_tier` menolak nilai premium saat ditulis. Fungsi
`resolveTheme()` di `src/lib/theme/resolve.ts` memangkasnya lagi saat dibaca,
karena trigger TIDAK pernah menyala saat merchant Pro **turun** ke Starter —
barisnya sudah terlanjur premium dan tidak ada UPDATE yang terjadi.

## 22. Terang/gelap diturunkan, bukan dipilih

Tema halaman publik tidak punya kolom `color_mode`. Kalau merchant bisa
menyetel mode gelap terpisah dari warna, ia bisa memasang kelas `dark` di atas
preset berlatar putih dan halamannya jadi tidak terbaca. `resolveTheme()`
menurunkannya dari luminansi permukaan yang sudah jadi, sehingga keduanya
mustahil tidak sinkron.

Alasan yang sama membuat `font_pair` dan `corner_style` nullable dengan null
berarti "ikut preset". Sebagai kolom `not null` bernilai default, memilih preset
Elegan tidak akan pernah memakai sudut tajam dan font Playfair miliknya — nilai
default kolom selalu menang atas nilai preset.

## 23. Warna aksen dipecah jadi isian dan teks

`accent` menghasilkan dua token berbeda: `--accent-fill` memakai warna mentah
pilihan merchant untuk latar tombol, sedangkan `--accent-text` sudah digeser ke
arah hitam atau putih sampai kontrasnya terhadap latar mencapai 4.5:1.

Dengan begitu merchant tetap mendapat kuning cerah yang dia inginkan untuk
tombol, tanpa pernah bisa menghasilkan tulisan yang hilang. Menolak warnanya
mentah-mentah akan terasa seperti aplikasi yang rewel; membiarkannya apa adanya
menghasilkan halaman booking yang tidak terbaca.

## 24. Path berkas dibatasi ke folder merchant di level database

`service_media.path`, `service_media.poster_path`, dan
`merchant_themes.background_image_path` datang dari browser. Ketiganya
sekarang terikat constraint `check` yang mewajibkan path diawali
`{merchant_id}/` dengan charset `[A-Za-z0-9._/-]` dan tanpa `..`.

Charsetnya sempit karena `background_image_path` berakhir di dalam
`url("...")` pada CSS halaman publik. Tanpa pembatasan, nilai seperti

    x.webp"), url("https://pihak-ketiga/beacon.png

menghasilkan daftar `background-image` yang SAH menurut CSS — halaman yang
berjalan di domain kita memuat URL pihak ketiga dan membocorkan IP pengunjung.
Tanda kutip, kurung, koma, dan spasi mustahil masuk, jadi tidak ada lagi cara
keluar dari `url()`.

Ditegakkan di database, bukan hanya di Zod: policy Storage sudah membatasi ke
folder siapa merchant boleh MENULIS berkas, tapi tidak membatasi path apa yang
boleh DIRUJUK sebuah baris. Aturan yang sama diulang di
`src/lib/media/path.ts` semata untuk memberi pesan yang bisa dibaca sebelum
requestnya sampai ke Postgres.

`merchants.avatar_url` menyimpan URL penuh dan bisa berisi tautan Google dari
proses signup, jadi tidak bisa diberi constraint yang sama. Server Action
`updateProfileMedia` yang membatasinya: hanya URL dari bucket kita sendiri yang
diterima saat DITULIS. Nilai lama dari Google tetap berfungsi karena tidak
pernah divalidasi ulang saat dibaca.

## 25. FAQ disimpan lewat satu fungsi, bukan delete lalu insert

Penyimpanan FAQ mengganti seluruh daftar. Sebagai dua panggilan terpisah dari
Server Action, insert yang ditolak — oleh constraint panjang atau trigger batas
sepuluh — meninggalkan penghapusan yang sudah commit, dan merchant kehilangan
seluruh FAQ-nya justru pada saat menekan Simpan.

`public.replace_merchant_faqs(jsonb)` membungkus keduanya. Satu pemanggilan
fungsi adalah satu statement, jadi delete dan insert berhasil bersama atau
gagal bersama. Fungsinya `security invoker` supaya RLS tetap berlaku;
`authenticated` bisa memanggil `auth.uid()` dari dalamnya karena Supabase
memberi `usage` pada schema `auth` ke peran itu — sudah diverifikasi lewat
`supabase db dump --schema auth` pada project ini. Tiruannya sekarang ada di
`supabase/tests/00_supabase_stub.sql`; tanpa tiruan itu, uji yang mengharapkan
penolakan lulus karena alasan yang salah.

## 26. Berkas Storage dibersihkan saat layanan dihapus

`ON DELETE CASCADE` menghapus baris `service_media`, tapi tidak tahu apa-apa
soal berkas di bucket. `deleteService` mengumpulkan path media sebelum
penghapusan dan mengembalikannya, lalu kliennya menghapus berkasnya. Tanpa ini
setiap layanan yang dihapus meninggalkan gambar dan video yang dibayar
selamanya tanpa pernah dirujuk apa pun.
