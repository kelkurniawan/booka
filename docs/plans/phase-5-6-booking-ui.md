# Plan — Phase 5–6 UI: Ledger Merchant & Halaman Pesanan Pelanggan

## Konteks

Backend Phase 5–6 sudah selesai: `POST /api/bookings` (pessimistic lock lewat RPC
`create_booking`), `GET /api/bookings/[id]/status`, `POST /api/webhooks/[provider]`,
dan `GET /api/cron/cancel-unpaid`. Yang belum ada adalah lapisan UI di kedua sisi:

1. `/dashboard/bookings` masih `PhasePlaceholder` — merchant tidak punya ledger.
2. Pelanggan tidak punya halaman apa pun. QRIS hanya ditampilkan sebagai string
   mentah di dalam `<code>` (pelanggan tidak bisa membayar), dan seluruh state
   pembayaran hidup di memori client `booking-picker.tsx` — tutup tab = booking
   hilang selamanya.

## Global Constraints

Semua dari `AGENTS.md`, mengikat setiap task:

- **Bahasa UI Indonesia. Komentar kode Indonesia.** Nama variabel/tabel/kolom Inggris.
- **Empat klien Supabase, pilih sesuai konteks.** `createClient()` untuk Server
  Component/Server Action bersesi. `createPublicClient()` untuk halaman publik.
  `createAdminClient()` (melewati RLS) hanya untuk route handler/webhook/cron —
  **setiap query dengannya wajib memfilter secara eksplisit**.
- **Selalu `getUser()`, jangan `getSession()`.**
- **Perubahan skema butuh migration baru** di `supabase/migrations/`, bukan edit
  file lama. Tabel baru di `public` harus `REVOKE ALL` dulu dari `anon` dan
  `authenticated`. Grant per kolom, bukan grant tabel lalu revoke kolom.
- **Fungsi baru tertutup secara default** — `GRANT EXECUTE` eksplisit kalau perlu
  dipanggil dari klien. `REVOKE ... FROM PUBLIC` saja tidak cukup.
- **`src/types/database.ts` wajib ikut diperbarui setiap skema berubah.** Semua
  tipe tabel wajib `type`, **bukan** `interface`.
- **Setiap segmen tingkat atas baru** harus ada di `ROUTES` (`src/lib/routes.ts`)
  **dan** di tabel `reserved_usernames`.
- **Setiap perubahan skema wajib diuji** dengan `npm run docker:test`. Tambahkan
  kasus uji ke `supabase/tests/99_verify.sql`; pastikan constraint lain tidak
  menangkap baris uji lebih dulu sehingga labelnya menyesatkan.
- **`npm run check` harus lulus** (typecheck + lint + unit test + build) sebelum
  task dianggap selesai.
- Ikuti gaya kode yang sudah ada. Pola referensi: `src/app/dashboard/services/`
  (page + actions + dialog + table + state) dan `src/app/dashboard/payments/`.
- Baca `node_modules/next/dist/docs/` bila ragu soal API Next.js 16 — versi ini
  punya breaking changes dari yang ada di data latih.
- Jangan menambah dependency selain yang disebut eksplisit di task.

---

## Task 1 — Fondasi: `access_token` booking + kontrak API

Booking pelanggan harus bisa dibuka kembali lewat URL permanen tanpa membocorkan
PII ke siapa pun yang menebak UUID. Sumber kebenarannya satu kolom rahasia baru.

### 1a. Migration

Buat `supabase/migrations/20260819000100_booking_access_token.sql`:

- `alter table public.bookings add column access_token text not null default encode(gen_random_bytes(24), 'hex');`
  — 48 karakter hex, 192 bit entropi, aman dipakai di URL apa adanya.
- Unique index: `create unique index bookings_access_token_key on public.bookings (access_token);`
- Kolom ini **tidak boleh** ter-grant ke `anon` maupun `authenticated`. Periksa
  grant yang sudah ada di `supabase/migrations/20260729000200_rls_policies.sql`:
  kalau `bookings` di-grant per kolom, jangan tambahkan `access_token`; kalau
  ternyata ada grant tingkat tabel, `revoke` tidak akan bisa per kolom — laporkan
  ini sebagai temuan, jangan diam-diam dibiarkan.
- **Periksa `supabase/migrations/20260730000700_create_booking.sql`.** Kalau
  `create_booking` dideklarasikan `returns setof public.bookings`, kolom baru ikut
  otomatis dan fungsi tidak perlu diubah. Kalau dideklarasikan dengan daftar kolom
  eksplisit (`returns table(...)`), fungsi WAJIB dibuat ulang di migration ini
  dengan `access_token` ikut dikembalikan — `POST /api/bookings` butuh nilainya.
  Kalau fungsi dibuat ulang, `grant execute` yang lama harus dipasang ulang juga
  (lihat aturan default-privileges di Global Constraints).

### 1b. Uji migration

Tambahkan ke `supabase/tests/99_verify.sql`:

- Booking baru mendapat `access_token` non-null sepanjang 48 karakter.
- Dua booking mendapat token berbeda (unique index bekerja).
- Peran `anon` **tidak bisa** membaca `access_token`.

Jalankan `npm run docker:test` sampai hijau. Ini wajib, bukan opsional.

### 1c. Tipe

`src/types/database.ts`: tambahkan `access_token: string` ke `type Booking`.
Masukkan `access_token` ke daftar `Omit` pada `Insert` (diisi default database)
dan pada `Update` (tidak pernah diubah setelah dibuat).

### 1d. Rute

`src/lib/routes.ts`: tambahkan
`bookingStatus: (token: string) => \`/pesanan/${token}\``.

Segmen `pesanan` **sudah** ada di `reserved_usernames`
(`20260730000100_reserve_indonesian_routes.sql`) — verifikasi ini benar dan
sebutkan di report; kalau ternyata tidak ada, tambahkan lewat migration 1a.

### 1e. Kontrak API

`src/app/api/bookings/route.ts`: RPC `create_booking` sekarang mengembalikan
`access_token`. Tambahkan `bookingUrl: ROUTES.bookingStatus(booking.access_token)`
ke body respons 201, di samping field yang sudah ada (`bookingId`, `payment_url`,
`expires_at` — jangan hapus atau ubah nama field lama). Token mentah **tidak**
dikembalikan sebagai field tersendiri dan **tidak** boleh masuk ke `console.error`
mana pun.

### Selesai bila

`npm run docker:test` hijau, `npm run check` hijau, di-commit.

---

## Task 2 — Ledger merchant `/dashboard/bookings`

Ganti `PhasePlaceholder` dengan ledger sungguhan. Independen dari Task 1 — jangan
menyentuh `access_token` di sini.

### Struktur berkas

Ikuti pola `src/app/dashboard/services/`:

- `page.tsx` — Server Component, ambil data + render.
- `actions.ts` — Server Action pembatalan.
- `bookings-table.tsx` — client, tabel + baris.
- `booking-detail-dialog.tsx` — client, detail satu booking.
- `bookings-filters.tsx` — client, filter status + kolom pencarian.
- `booking-state.ts` — bila butuh tipe state Server Action bersama (lihat
  `service-state.ts`).

### Data

Server Component memakai `createClient()` (bersesi, RLS menjaga kepemilikan).
Tetap filter `merchant_id` secara eksplisit — biaya nol, dan tidak bergantung pada
policy yang bisa berubah. `getUser()`, bukan `getSession()`.

`searchParams` (Next.js 16: `searchParams` adalah Promise — `await` dulu):

- `status` — `PENDING` | `PAID` | `CANCELLED`, kosong = semua. Validasi dengan Zod;
  nilai tak dikenal diperlakukan sebagai "semua", bukan error.
- `q` — pencarian nama pelanggan atau nomor WhatsApp. Pakai `.or()` dengan
  `ilike`. **Escape/tolak karakter yang punya arti khusus di filter PostgREST**
  (`,` `.` `(` `)` `%` `\`) supaya string pencarian tidak bisa menyuntik filter
  tambahan. Batasi panjangnya (mis. 80 karakter).
- `page` — pagination, 20 baris per halaman, `.range()`. Halaman < 1 = 1.

Urutkan `start_datetime` menurun (jadwal terbaru dulu).

### Ringkasan

Di atas tabel, tiga kartu ringkas (pakai `Card`, samakan gaya dengan
`src/app/dashboard/page.tsx`):

- Booking bulan ini (jumlah).
- Pendapatan terkonfirmasi bulan ini — jumlah `service_price` untuk status `PAID`.
- Menunggu pembayaran (jumlah `PENDING` yang belum kedaluwarsa).

Angka ringkasan dihitung dari query terpisah atas seluruh data merchant, **bukan**
dari halaman yang sedang ditampilkan — ringkasan yang berubah saat pindah halaman
adalah bug.

### Tabel

Kolom: Jadwal (tanggal + jam, `src/lib/format.ts`), Pelanggan, Layanan, Nilai,
Status, aksi.

- Status sebagai `Badge` dengan varian berbeda per status; sertakan teks, jangan
  hanya warna (aksesibilitas).
- `PENDING` yang `expires_at`-nya sudah lewat ditampilkan sebagai "Kedaluwarsa",
  bukan "Menunggu pembayaran" — cron membatalkannya beberapa saat kemudian, dan
  merchant tidak boleh mengira slot itu masih hidup.
- Mobile: tabel tidak boleh memaksa halaman menggulir horizontal. Bungkus dalam
  kontainer `overflow-x-auto`, atau render daftar kartu di bawah `sm`.
- Kosong: pakai komponen `Empty`. Bedakan "belum ada booking sama sekali"
  (ajak bagikan tautan `/[username]`) dari "tidak ada hasil untuk filter ini"
  (tawarkan reset filter).

### Detail

Dialog berisi: nama pelanggan, nomor WhatsApp dengan tautan `wa.me` (normalisasi
ke format internasional tanpa `+`/spasi/strip), layanan, durasi, jadwal mulai–
selesai, nilai, status, provider + `payment_reference`, waktu dibuat/dibayar/
dibatalkan, dan `cancel_reason` bila ada. **`payment_url` jangan ditampilkan** —
itu payload QRIS mentah, tidak berguna bagi merchant.

### Pembatalan manual

Server Action di `actions.ts`:

- `getUser()`, lalu update lewat `createClient()` dengan filter `id`,
  `merchant_id`, dan `status in ('PENDING','PAID')` sekaligus. Kepemilikan
  ditegakkan oleh filter + RLS, bukan oleh pemeriksaan terpisah sebelumnya.
- Set `status = 'CANCELLED'`, `cancelled_at = now`, `cancel_reason` diisi teks
  Indonesia yang menandakan pembatalan oleh merchant.
- Booking yang sudah `CANCELLED` → pesan jelas, bukan error mentah.
- `revalidatePath` setelah sukses.
- Validasi input dengan Zod (id harus uuid).
- UI: konfirmasi dulu lewat Dialog — pembatalan melepas slot dan tidak bisa
  dibatalkan. Feedback lewat `sonner`.

### Selesai bila

`npm run check` hijau, di-commit.

---

## Task 3 — Halaman pesanan pelanggan `/pesanan/[token]` + QRIS asli

**Tergantung Task 1** (`access_token`, `ROUTES.bookingStatus`, `bookingUrl` di
respons `POST /api/bookings`).

Ini yang membuat pelanggan benar-benar bisa membayar dan membuka kembali
pesanannya. Mobile-first, `max-w-md`, sejajar gaya `src/app/[username]/page.tsx`.

### Dependency

Tambahkan `qrcode` (dependency) dan `@types/qrcode` (devDependency). Render QR di
**server** menjadi SVG string — nol JavaScript tambahan di client dan tajam di
semua ukuran layar.

### Berkas

- `src/app/pesanan/[token]/page.tsx` — Server Component.
- `src/components/qris-code.tsx` — render `payment_url` (payload QRIS mentah)
  menjadi SVG. Beri `role="img"` dan `aria-label` Indonesia. Error correction
  level `M`. Bila render gagal, tampilkan pesan Indonesia + tautan salin payload,
  jangan lempar sampai membunuh halaman.
- `src/app/pesanan/[token]/booking-live-status.tsx` — client, polling.

### Pengambilan data

`createAdminClient()` difilter `access_token` (kolomnya unik, jadi token itu
sendiri yang mengunci baris). `.select()` daftar kolom **eksplisit** — jangan
`select("*")`; `access_token` tidak boleh ikut terbaca ke dalam props client.
Ambil juga nama merchant + username lewat query terpisah yang difilter
`merchant_id` dari baris booking (jangan mengandalkan join implisit).

- Token tidak cocok → `notFound()`.
- Query gagal → `throw` (biar error boundary yang menangani), bukan `notFound()` —
  alasannya sama dengan yang sudah didokumentasikan di `src/app/[username]/page.tsx`.
- `generateMetadata`: judul netral, dan **`robots: { index: false, follow: false }`**
  — halaman ini berisi PII, tidak boleh masuk indeks mesin pencari.

### Tampilan per status

- **PENDING (belum lewat `expires_at`)** — QR QRIS besar, nominal, hitung mundur
  ke `expires_at`, nama layanan, jadwal, nama pelanggan, dan nama merchant.
  Instruksi Indonesia singkat cara memindai. Polling status tiap 3 detik lewat
  `GET /api/bookings/[id]/status` (id booking diambil server-side lalu diteruskan
  sebagai prop — id bukan rahasia, token yang rahasia).
- **PAID** — struk konfirmasi: layanan, jadwal, nominal, waktu pembayaran, nama
  merchant, tautan kembali ke `/[username]`. Tanpa QR.
- **CANCELLED, atau PENDING yang sudah kedaluwarsa** — jelaskan slot sudah
  dilepas, tampilkan `cancel_reason` bila ada, dan tautan ke `/[username]` untuk
  memesan ulang. Tanpa QR.

Logika polling + kedaluwarsa sisi klien di `src/app/[username]/payment-status.tsx`
sudah benar (interval dibersihkan di cleanup, watchdog `setTimeout` terpisah,
`useState` lazy initializer karena aturan `react-hooks/purity`). **Pindahkan pola
itu**, jangan tulis ulang dari nol dan jangan salin-tempel dua salinan yang bisa
diam-diam berbeda. Saat status berubah jadi terminal, halaman dimuat ulang
(`router.refresh()`) supaya server merender tampilan terminal yang benar.

### Wiring `/[username]`

Setelah `POST /api/bookings` sukses, `booking-picker.tsx` mengarahkan pelanggan ke
`bookingUrl` (`router.push`) alih-alih merender `PaymentStatus` di tempat. Ini
menghapus satu-satunya tempat QRIS ditampilkan sebagai string mentah, dan
membuat pesanan bertahan setelah tab ditutup.

Bersihkan sisa jalur lama: `payment-status.tsx` beserta state `checkoutResult`/
`handleStartOver` yang hanya melayaninya. Jangan tinggalkan komponen mati.
Tipe `CheckoutResult` bertambah `bookingUrl`.

### Selesai bila

`npm run check` hijau, di-commit.

---

## Di luar cakupan

Notifikasi WhatsApp (PRD bagian 5B) tidak dikerjakan — gateway-nya belum ada di
repo ini. Sisa Phase 6 lainnya sudah terimplementasi di backend.
