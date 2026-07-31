# Rencana: Phase 3–6 (menuntaskan MVP Booka)

Referensi: `docs/PRD-Smart-Booking-Invoicing-SaaS-V3.md` bagian 6.
Penyimpangan yang sudah disepakati: `docs/DECISIONS.md`.

Phase 1–2 sudah selesai: skema + RLS, auth (`/masuk`, `/daftar`,
`/lupa-password`, `/reset-password`), onboarding, shell dashboard, landing
page, penegakan kuota transaksi.

---

## Global Constraints

Aturan berikut mengikat SEMUA task. Pelanggaran = review gagal.

### Bahasa
- Seluruh teks UI dan komentar kode: **Bahasa Indonesia**.
- Nama variabel, fungsi, tabel, dan kolom: **Inggris**.

### Klien Supabase — pilih sesuai konteks
| Modul | Peran | Untuk |
| --- | --- | --- |
| `lib/supabase/client.ts` | anon/authenticated | komponen client |
| `lib/supabase/server.ts` → `createClient` | authenticated | Server Component, Server Action, Route Handler bersesi |
| `lib/supabase/server.ts` → `createPublicClient` | anon, tanpa sesi | halaman publik `/[username]` |
| `lib/supabase/admin.ts` → `createAdminClient` | service role, **melewati RLS** | `/api/bookings`, webhook, cron, OAuth callback |

- Setiap query lewat `createAdminClient()` **wajib** memfilter `merchant_id`
  secara eksplisit — tidak ada RLS yang menjaga di sana.
- Selalu `getUser()`, **jangan** `getSession()`.

### Database
- Perubahan skema = file migration BARU di `supabase/migrations/`, penamaan
  `<YYYYMMDDHHMMSS>_<nama_snake_case>.sql`. Jangan edit file migration lama.
- Tabel baru di `public`: `REVOKE ALL` dari `anon, authenticated` lebih dulu,
  lalu grant seminimal mungkin. Grant **per kolom**, bukan grant tabel lalu
  revoke kolom.
- Fungsi baru **tidak** otomatis dapat EXECUTE (sudah dicabut lewat
  `ALTER DEFAULT PRIVILEGES`). Fungsi yang harus dipanggil klien wajib
  di-`GRANT EXECUTE` eksplisit.
- `src/types/database.ts` wajib ikut diperbarui. Semua tipe tabel harus
  `type`, **bukan** `interface` (postgrest-js menuntut
  `Record<string, unknown>`; interface tidak punya index signature implisit
  sehingga hasil query diam-diam jadi `never`).
- Setiap perubahan skema wajib lolos `npm run docker:test`, dan kasus ujinya
  ditambahkan ke `supabase/tests/99_verify.sql`. Pastikan constraint lain
  tidak menangkap baris uji lebih dulu sehingga labelnya menyesatkan.

### Rute
- Segmen tingkat atas baru wajib ditambahkan ke `ROUTES` di
  `src/lib/routes.ts` **dan** ke tabel `reserved_usernames` lewat migration —
  keduanya berbagi ruang nama dengan `/[username]`.

### Definisi selesai
Setiap task harus lolos `npm run check` (typecheck + lint + build) sebelum
dilaporkan DONE. Task yang menyentuh skema juga harus lolos
`npm run docker:test`.

### Yang TIDAK dikerjakan di rencana ini
- Notifikasi WhatsApp (ditunda atas keputusan pemilik produk).
- Pembayaran langganan otomatis ke platform — halaman Billing hanya
  menampilkan paket, pemakaian, dan CTA upgrade.
- Multi-staff, analytics, custom domain (fitur paket Studio).

---

## Task 1 — Enkripsi kredensial & skema koneksi payment

**Tujuan:** fondasi penyimpanan kredensial payment gateway merchant.

Buat `src/lib/crypto/secret-box.ts`:
- `encryptSecret(plaintext: string): string` dan
  `decryptSecret(payload: string): string`.
- AES-256-GCM memakai `node:crypto`. Kunci dari `serverEnv().tokenEncryptionKey`
  (base64, 32 byte). Lempar error jelas berbahasa Indonesia kalau kunci kosong.
- IV acak 12 byte per enkripsi. Format tersimpan:
  `v1.<iv_base64>.<ciphertext_base64>.<authTag_base64>`. Prefiks versi wajib —
  supaya rotasi algoritma nanti bisa dibedakan.
- `decryptSecret` menolak payload yang prefiks versinya tidak dikenal.
- File ini **wajib** `import "server-only"`.

Tambahkan ke `src/lib/env/server.ts`: `tokenEncryptionKey` sudah ada —
pastikan tetap opsional di skema, tapi `secret-box.ts` yang melempar error
saat benar-benar dipakai tanpa kunci.

Migration baru:
- Tambah kolom `public.payment_connections.connection_mode` bertipe enum baru
  `public.connection_mode` dengan nilai `('OAUTH', 'MANUAL_KEY')`,
  `not null default 'MANUAL_KEY'`. Ini yang membedakan kredensial hasil OAuth
  dari Server Key yang di-paste merchant.
- Tambah kolom `public.payment_connections.environment` bertipe enum baru
  `public.payment_environment` dengan nilai `('SANDBOX', 'PRODUCTION')`,
  `not null default 'SANDBOX'`.
- Grant `select` kolom baru itu ke `authenticated` (tabelnya sudah punya
  policy `payment_connections_read_own`).

**Tes** (`supabase/tests/99_verify.sql`): kolom baru ada, defaultnya benar,
dan `anon` tetap tidak punya akses ke `payment_connections`.

Tes unit enkripsi: buat `src/lib/crypto/secret-box.test.ts` — jalankan dengan
`node --test` lewat `npx tsx --test` atau setara; kalau belum ada test runner
di project, tambahkan script `npm run test:unit` memakai `node --test` dengan
`tsx`. Kasus: round-trip, ciphertext berbeda tiap enkripsi (IV acak),
payload rusak ditolak, prefiks versi asing ditolak.

---

## Task 2 — Halaman Layanan (CRUD services)

**Rute:** `/dashboard/services` (sudah ada sebagai `PhasePlaceholder`).

- Server Component memuat daftar layanan milik merchant (`createClient()`,
  RLS yang memfilter).
- Server actions di `src/app/dashboard/services/actions.ts`: `createService`,
  `updateService`, `deleteService`, `toggleServiceActive`.
- Validasi Zod di `src/lib/validations/service.ts`, **harus cocok** dengan
  constraint DB: nama 2–80 karakter, harga ≥ 0, durasi 5–480 menit,
  deskripsi ≤ 500 karakter.
- Form dalam Dialog shadcn. Harga diinput sebagai rupiah polos (mis. `350000`),
  tampilkan terformat memakai `formatRupiah` dari `src/lib/format.ts`.
- Trigger `enforce_service_limit` menolak layanan kedua pada paket STARTER
  dengan errcode `P0001`. Tangkap itu dan tampilkan ajakan upgrade yang
  ramah beserta tautan ke `/dashboard/billing` — **jangan** tampilkan pesan
  error mentah dari Postgres.
- Empty state: ajakan menambah layanan pertama.

---

## Task 3 — Halaman Jam Kerja (CRUD availability)

**Rute:** `/dashboard/availability`.

- Tampilkan 7 hari (ISO-8601: 1 = Senin … 7 = Minggu, sesuai kolom
  `day_of_week`). Tiap hari bisa punya beberapa rentang jam.
- Server actions: `addSlot`, `removeSlot`. Validasi Zod di
  `src/lib/validations/availability.ts`: `end_time > start_time`,
  `day_of_week` 1–7, format `HH:mm`.
- Constraint `availability_no_overlap` menolak rentang tumpang tindih
  (errcode `23P01`, exclusion violation). Tangkap dan tampilkan pesan
  Indonesia yang jelas.
- Sediakan aksi "salin ke semua hari kerja" (Senin–Jumat) untuk mengurangi
  pengetikan berulang.

---

## Task 4 — Halaman Pembayaran (koneksi payment gateway)

**Rute:** `/dashboard/payments`.

Abstraksi provider di `src/lib/payments/`:
- `types.ts` — interface `PaymentProviderAdapter` dengan
  `createQrisCharge(params): Promise<QrisCharge>` dan
  `verifyWebhookSignature(payload, headers): boolean`.
- `midtrans.ts` — implementasi Midtrans Core API. QRIS memakai
  `payment_type: "qris"`. Base URL sandbox
  `https://api.sandbox.midtrans.com/v2`, produksi
  `https://api.midtrans.com/v2`. Auth: HTTP Basic, username = Server Key,
  password kosong.
- `xendit.ts` — implementasi Xendit QR Code API, `channel_code: "QRIS"`.
- `index.ts` — `getAdapter(provider: PaymentProvider): PaymentProviderAdapter`.
- `credentials.ts` — `loadMerchantCredential(merchantId, provider)` yang
  membaca `private.payment_credentials` lewat `createAdminClient()`,
  mendekripsi, dan mengembalikan Server Key/access token. **Wajib** memfilter
  `merchant_id` eksplisit.

UI halaman:
- Kartu per provider (Midtrans, Xendit) dengan status koneksi.
- **Jalur aktif hari ini:** form input Server Key manual + pilihan
  Sandbox/Production. Disimpan terenkripsi lewat `encryptSecret`, metadata ke
  `public.payment_connections` (`connection_mode = 'MANUAL_KEY'`), rahasianya
  ke `private.payment_credentials`. Server action memakai `createAdminClient()`
  karena `private` tidak terjangkau klien bersesi — filter `merchant_id`
  eksplisit dari `getUser()`, **jangan pernah** dari input form.
- **Jalur OAuth:** route `/api/payments/[provider]/connect` (mulai OAuth,
  simpan `state` acak di cookie httpOnly) dan
  `/api/payments/[provider]/callback` (tukar `code`, verifikasi `state`,
  simpan token dengan `connection_mode = 'OAUTH'`). Karena kredensial partner
  Midtrans/Xendit belum tersedia, endpoint ini mengembalikan pesan jelas
  "OAuth Connect belum aktif — kredensial partner belum dikonfigurasi" ketika
  `MIDTRANS_CLIENT_ID`/`XENDIT_CLIENT_ID` kosong. Struktur, penyimpanan token,
  dan verifikasi `state` tetap dibangun penuh.
- Aksi "Putuskan koneksi" — hapus baris koneksi dan kredensialnya.
- Server Key **tidak boleh** pernah dikirim balik ke browser. Tampilkan hanya
  4 karakter terakhir.

---

## Task 5 — Halaman Langganan & Pengaturan

**Rute:** `/dashboard/billing` dan `/dashboard/settings`.

Billing:
- Tampilkan tiga paket (Starter gratis, Pro Rp79.000/bln, Studio
  Rp199.000/bln) dengan paket aktif ditandai.
- Tampilkan pemakaian kuota lewat RPC `my_quota_usage()` (sudah ada).
- Tombol upgrade mengarah ke `https://wa.me/<nomor WhatsApp merchant platform>`
  — ambil dari env baru `NEXT_PUBLIC_SUPPORT_WHATSAPP`, opsional; sembunyikan
  tombol kalau kosong. Tambahkan ke `.env.example`.
- Jangan bangun pembayaran langganan otomatis.

Settings:
- Ubah `full_name`, `bio`, `whatsapp_number`, dan `username`.
- Ganti username memakai validasi yang sama dengan onboarding
  (`usernameSchema`) dan menangani errcode `23505` (sudah dipakai) serta
  `23514` (reserved).
- Peringatkan bahwa mengganti username membuat tautan lama tidak berlaku.

---

## Task 6 — Halaman booking publik `/[username]`

**Rute:** `src/app/[username]/page.tsx`.

- Memakai `createPublicClient()` — **tanpa sesi**, supaya selalu dibaca
  sebagai peran `anon`. Ini yang membuat `whatsapp_number` merchant tidak
  ikut terbaca.
- `notFound()` kalau username tidak ada atau `username is null`.
- Mobile-first, `max-w-md`, minimalis hitam-putih mengikuti landing page.
- Tampilkan profil merchant (nama, bio, avatar) dan daftar layanan aktif
  beserta harga (`formatRupiah`) dan durasi (`formatDuration`).
- Watermark "Dibuat dengan Booka" kalau `subscription_tier === 'STARTER'`.
- `generateMetadata` untuk judul dan deskripsi halaman.
- Kalau merchant belum punya layanan atau jam kerja, tampilkan keadaan
  "belum menerima pesanan" alih-alih alur booking yang rusak.

---

## Task 7 — Pemilih tanggal & jam pada halaman publik

- Route handler `GET /api/slots?username=&date=` mengembalikan slot yang
  tersedia untuk satu tanggal.
- Logika: ambil `availability` untuk `day_of_week` tanggal itu, potong
  menjadi slot selebar `duration_minutes` layanan terpilih, lalu buang slot
  yang beririsan dengan hasil RPC `get_booked_ranges(username, from, to)`.
- Semua perhitungan tanggal memakai zona **Asia/Jakarta**. Tanggal di masa
  lalu dan slot yang sudah lewat hari ini tidak boleh muncul.
- Komponen client memilih layanan → tanggal → jam, lalu lanjut ke form
  checkout (nama + WhatsApp, validasi Zod, nomor dinormalkan ke E.164 memakai
  `normalizeWhatsapp` yang sudah ada).

---

## Task 8 — Booking engine `POST /api/bookings`

Ini bagian paling kritikal. Baca `docs/DECISIONS.md` butir 1, 2, dan 4 lebih
dulu.

- `createAdminClient()` — anon tidak punya hak apa pun ke tabel `bookings`.
- Validasi Zod atas seluruh input.
- Harga dan durasi **wajib** dibaca ulang dari tabel `services` di server.
  Jangan pernah memercayai harga yang dikirim klien.
- Migration baru berisi fungsi Postgres `public.create_booking(...)` yang
  `SECURITY DEFINER`, dijalankan dalam satu transaksi:
  1. `pg_advisory_xact_lock(hashtext(merchant_id::text))` — menutup balapan
     kuota yang disebut di `docs/DECISIONS.md` butir 12.
  2. Cek slot masih di dalam `availability`.
  3. Insert booking; constraint `bookings_no_overlap` dan trigger
     `bookings_enforce_quota` menjadi penjaga terakhir.
  4. Kembalikan baris booking.
  Fungsi ini **tidak** di-grant ke `anon`/`authenticated` — hanya dipanggil
  service role.
- Petakan errcode ke pesan Indonesia: `23P01` → "Jam tersebut baru saja
  dipesan orang lain", `P0002` → "Merchant sedang tidak menerima pesanan
  baru".
- Setelah booking tersimpan, panggil adapter provider untuk membuat QRIS
  memakai kredensial merchant, lalu simpan `payment_url`,
  `payment_reference`, dan `payment_provider`. Kalau merchant belum punya
  koneksi payment, kembalikan 409 dengan pesan jelas — jangan membuat booking
  yang tidak bisa dibayar.
- **Tes** di `99_verify.sql`: dua booking bentrok, kuota habis, slot di luar
  jam kerja.

---

## Task 9 — Webhook pembayaran & polling status

- `POST /api/webhooks/[provider]` — verifikasi signature lewat adapter
  (Midtrans: SHA-512 dari `order_id + status_code + gross_amount + ServerKey`).
  Tolak 401 kalau tidak cocok.
- Cari booking lewat `payment_reference` (`createAdminClient()`), set
  `status = 'PAID'` dan `paid_at`. **Idempoten** — webhook yang sama datang
  dua kali tidak boleh menggandakan efek.
- Balas HTTP 200 secepatnya.
- `GET /api/bookings/[id]/status` untuk polling dari halaman publik.
  Kembalikan **hanya** `status` dan `expires_at` — jangan bocorkan data
  pelanggan.
- UI halaman publik menampilkan QRIS dan polling tiap 3 detik sampai `PAID`
  atau kedaluwarsa, lalu tampilkan layar berhasil / gagal.

---

## Task 10 — Cron pembatalan booking kedaluwarsa

- `GET /api/cron/cancel-unpaid` — verifikasi header
  `Authorization: Bearer <CRON_SECRET>`; tolak 401 kalau salah. Kalau
  `CRON_SECRET` kosong, tolak semua request (fail closed).
- Set `status = 'CANCELLED'`, `cancelled_at`, dan
  `cancel_reason = 'DP tidak dibayar dalam batas waktu'` untuk semua booking
  `PENDING` yang `expires_at < now()`.
- Memakai index parsial `bookings_pending_expiry_idx` yang sudah ada.
- Tambahkan `vercel.json` (atau `vercel.ts`) dengan jadwal cron tiap 5 menit.
- Kembalikan jumlah baris yang dibatalkan supaya bisa dipantau.
