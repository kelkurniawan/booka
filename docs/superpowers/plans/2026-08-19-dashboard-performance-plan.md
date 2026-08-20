# Rencana: Optimasi Performa & UX Dashboard Booka

Basis: `main` @ b69fcb1. Branch: `feat/dashboard-performance`.
Worktree: `/Users/michael/Documents/GitHub/project-booka-dashperf`

## Konteks masalah

Satu navigasi ke halaman dashboard saat ini memicu **7 round-trip jaringan**
sebelum HTML pertama terkirim, dan **tidak ada satu pun Suspense boundary**
di seluruh `src/app/dashboard/`, sehingga layar benar-benar diam sampai
seluruh query selesai.

| Sumber lambat | Lokasi |
| --- | --- |
| `auth.getUser()` 3x berurutan | `src/lib/supabase/proxy.ts`, `src/app/dashboard/layout.tsx`, tiap `page.tsx` |
| query `merchants` 2x redundan | `proxy.ts` (protected path) + `layout.tsx` |
| nol `loading.tsx` / `<Suspense>` | seluruh `src/app/dashboard/` |
| 4 query agregat terpisah untuk 3 kartu | `src/app/dashboard/bookings/page.tsx` |
| SUM pendapatan ditarik semua barisnya ke JS | `bookings/page.tsx` (`revenueResult` + `.reduce()`) |
| `paid_at` tanpa index sama sekali | `supabase/migrations/20260729000100_init_schema.sql` |
| function region default `iad1`, Supabase di `ap-southeast-1` | `vercel.json` |

## Global Constraints

Aturan berikut mengikat SEMUA task. Pelanggaran = review gagal.

1. **Bahasa.** Seluruh teks UI dan seluruh komentar kode dalam bahasa
   Indonesia. Nama variabel, tabel, kolom, dan fungsi tetap Inggris.
2. **Klien Supabase.** Pilih sesuai `AGENTS.md`. Server Component memakai
   `createClient()` dari `@/lib/supabase/server`. JANGAN pakai
   `createAdminClient()` di halaman dashboard.
3. **`getSession()` tetap TERLARANG.** `getClaims()` diizinkan karena
   memverifikasi tanda tangan JWT (berbeda dari `getSession()` yang hanya
   membaca cookie tanpa verifikasi).
4. **Perubahan skema wajib migration baru**, bukan edit file lama. Setiap
   fungsi baru tertutup secara default sejak
   `20260730000300_lock_down_function_execute.sql` — wajib `grant execute`
   eksplisit ke peran yang tepat.
5. **`src/types/database.ts` wajib ikut diperbarui** setiap skema berubah.
   Semua tipe tabel wajib `type`, BUKAN `interface`.
6. **Semantik angka tidak boleh berubah.** Kartu "Booking bulan ini" wajib
   tetap persis sama dengan `count_bookings_this_month`
   (PAID mana pun, ATAU PENDING yang `expires_at > now()`), difilter
   `created_at >= date_trunc('month', now() at time zone 'Asia/Jakarta')`.
   Pendapatan tetap `sum(service_price)` untuk PAID dengan `paid_at` di
   bulan berjalan. Ini refactor performa, BUKAN perubahan bisnis.
7. **Tanpa dependency baru.** Animasi memakai CSS + `tw-animate-css` yang
   sudah terpasang. Dilarang menambah framer-motion / motion / react-spring.
8. **Aksesibilitas.** Setiap animasi wajib dimatikan di bawah
   `@media (prefers-reduced-motion: reduce)`.
9. **Verifikasi.** Task yang menyentuh TypeScript wajib lulus
   `npm run typecheck` dan `npm run lint`. Task yang menyentuh migration
   wajib lulus `npm run docker:test`. Jalankan dari worktree
   `/Users/michael/Documents/GitHub/project-booka-dashperf`.
10. **Commit** setelah verifikasi lulus, satu commit per task, pesan bahasa
    Indonesia.

## Observasi yang SENGAJA tidak diperbaiki

Kartu "Pendapatan terkonfirmasi" berlabel "Total DP yang sudah dibayar",
tetapi menjumlahkan `service_price` (harga penuh) — tabel `bookings` tidak
punya kolom nominal DP. Ini inkonsistensi lama. Rencana ini
**mempertahankannya persis** agar refactor performa tidak menyelundupkan
perubahan angka. Catat sebagai isu terpisah, jangan perbaiki di sini.

---

## Task 1 — Migration: index + RPC agregat

**File baru:** `supabase/migrations/20260819000400_dashboard_perf.sql`

### 1a. Index yang hilang

Index yang SUDAH ada (jangan dibuat ulang, lihat `init_schema.sql:319-335`):
`bookings_merchant_start_idx (merchant_id, start_datetime desc)`,
`bookings_pending_expiry_idx (expires_at) where status='PENDING'`,
`bookings_merchant_created_idx (merchant_id, created_at desc)`.

Tambahkan yang benar-benar belum ada:

```sql
-- Query pendapatan bulanan memfilter paid_at, yang sampai sekarang tidak
-- punya index sama sekali -- satu-satunya jalan adalah sequential scan.
create index bookings_merchant_paid_idx
  on public.bookings (merchant_id, paid_at desc)
  where status = 'PAID';

-- Ledger yang difilter status (?status=PAID) dan jadwal terdekat di
-- Ringkasan. bookings_merchant_start_idx tidak memuat status, sehingga
-- setiap filter status harus memeriksa ulang tiap baris.
create index bookings_merchant_status_start_idx
  on public.bookings (merchant_id, status, start_datetime desc);
```

### 1b. RPC agregat

Menggantikan 4 query terpisah di `bookings/page.tsx` dengan satu panggilan,
dan memindahkan `SUM` ke Postgres.

```sql
create or replace function public.dashboard_booking_summary()
returns table (
  bookings_this_month integer,
  confirmed_revenue numeric,
  pending_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ...
$$;
```

Ketentuan wajib:

- Ambil merchant dari `(select auth.uid())`, mengikuti pola
  `my_quota_usage()` di `20260730000200_enforce_booking_quota.sql`.
- `bookings_this_month` wajib memakai definisi yang sama persis dengan
  `count_bookings_this_month` (Global Constraint 6). Cara paling aman dan
  paling anti-drift: panggil `public.count_bookings_this_month((select auth.uid()))`
  langsung, jangan menyalin ulang logikanya.
- `confirmed_revenue` = `coalesce(sum(service_price), 0)` untuk
  `status='PAID'` dan `paid_at >= date_trunc('month', (now() at time zone 'Asia/Jakarta')) at time zone 'Asia/Jakarta'`.
- `pending_count` = jumlah `status='PENDING'` dengan `expires_at > now()`
  (TANPA batas bulan — ini meniru `pendingResult` yang sekarang).
- Fungsi wajib mengembalikan tepat satu baris meski merchant belum punya
  booking (nol, bukan kosong).

### 1c. Grants

```sql
revoke execute on function public.dashboard_booking_summary() from public, anon;
grant execute on function public.dashboard_booking_summary() to authenticated;
```

### 1d. Tes

Tambahkan kasus ke `supabase/tests/99_verify.sql` mengikuti gaya file itu.
Minimal harus menguji:

1. `anon` TIDAK boleh `execute` `dashboard_booking_summary()`.
2. `authenticated` boleh.
3. Angka `bookings_this_month` dari RPC == `count_bookings_this_month()`
   untuk merchant yang sama (inilah pengaman Global Constraint 6).
4. `confirmed_revenue` mengabaikan booking CANCELLED dan booking PAID dari
   bulan lalu.
5. `pending_count` mengabaikan PENDING yang `expires_at` sudah lewat.

Hati-hati: pastikan constraint lain (mis. `bookings_no_overlap`) tidak
menangkap baris uji lebih dulu sehingga label tesnya jadi menyesatkan —
beri tiap baris uji rentang waktu yang tidak bertabrakan.

### 1e. Tipe

Perbarui `src/types/database.ts`: tambahkan `dashboard_booking_summary` ke
map `Functions`, dengan `Args: Record<PropertyKey, never>` dan `Returns`
array of `{ bookings_this_month: number; confirmed_revenue: number; pending_count: number }`.
Ikuti persis bentuk entri `my_quota_usage` yang sudah ada di file itu.

**Verifikasi:** `npm run docker:test` harus hijau, `npm run typecheck` lulus.

---

## Task 2 — Modul sesi: hapus round-trip berulang

### 2a. File baru `src/lib/auth/session.ts`

```ts
import { cache } from "react";
```

Ekspor dua fungsi, keduanya dibungkus `cache()` sehingga layout dan page
dalam SATU render pass berbagi satu hasil:

- `getSessionUser()` → `Promise<{ id: string; email: string } | null>`
  - Pakai `supabase.auth.getClaims()`. Ambil `sub` sebagai id dan `email`.
  - Kalau `getClaims()` mengembalikan error ATAU data kosong, jatuh ke
    `supabase.auth.getUser()` sebagai fallback, lalu petakan hasilnya.
  - Kembalikan `null` kalau keduanya gagal — JANGAN melempar.
- `requireMerchant()` → `Promise<{ user, merchant }>`
  - Memanggil `getSessionUser()`; `redirect(ROUTES.login)` kalau null.
  - Query `merchants` sekali: `select("username, full_name, avatar_url, subscription_tier")`.
  - `redirect(ROUTES.onboarding)` kalau `username` kosong.

Komentar wajib menjelaskan **kenapa `getClaims()` bukan pelanggaran aturan
`getSession()`**: `getClaims()` memverifikasi tanda tangan JWT (lokal lewat
JWKS bila signing key asimetris aktif), sedangkan `getSession()` hanya
membaca cookie mentah tanpa verifikasi sama sekali.

### 2b. Pakai di halaman

- `src/app/dashboard/layout.tsx` — ganti blok `getUser()` + query merchants
  dengan satu `await requireMerchant()`. Pertahankan perilaku redirect yang
  sama persis. Pertahankan `export const dynamic = "force-dynamic"`.
- `src/app/dashboard/page.tsx` dan `src/app/dashboard/bookings/page.tsx` —
  ganti `getUser()` + `redirect` dengan `getSessionUser()`/`requireMerchant()`
  sesuai kebutuhan masing-masing. Karena `cache()`, ini TIDAK menambah
  round-trip baru: layout sudah memanggilnya di render pass yang sama.

### 2c. Pangkas `proxy.ts`

Di `src/lib/supabase/proxy.ts`, blok `if (protectedPath)` melakukan query
`merchants` untuk SEMUA rute privat. Untuk `/dashboard/*` itu duplikat
murni dari `dashboard/layout.tsx` yang melakukan redirect identik.

Ubah supaya query `merchants` hanya dijalankan ketika
`pathname === ROUTES.onboarding` — satu-satunya rute yang layout dashboard
tidak membungkusnya, sehingga proxy-lah satu-satunya yang bisa memantulkan
merchant yang sudah onboarding keluar dari `/onboarding`.

Redirect "belum onboarding → /onboarding" untuk `/dashboard/*` menjadi
tanggung jawab `dashboard/layout.tsx` sepenuhnya. Tulis komentar yang
menjelaskan pembagian tugas ini, supaya tidak terlihat seperti lubang
keamanan bagi pembaca berikutnya.

**Jangan** menghapus `getUser()` di proxy — itu batas keamanan yang
menegakkan "rute privat butuh sesi", dan berjalan di request pass yang
berbeda dari RSC sehingga `cache()` tidak menjangkaunya.

### 2d. AGENTS.md

Perbarui baris "Selalu `getUser()`, jangan `getSession()`" menjadi aturan
yang mencatat nuansanya: `getSession()` terlarang; `getUser()` dan
`getClaims()` keduanya memverifikasi dan boleh dipakai; di Server Component
pakai helper ber-`cache()` di `src/lib/auth/session.ts` supaya tidak ada
round-trip ganda.

**Verifikasi:** `npm run typecheck` dan `npm run lint`.

---

## Task 3 — Primitif skeleton + animasi

Task ini murni aditif — tidak menyentuh halaman mana pun.

### 3a. `src/app/globals.css`

Tambahkan di akhir file:

- `@keyframes booka-reveal` — dari `opacity: 0; transform: translateY(4px)`
  ke `opacity: 1; transform: none`.
- Kelas utilitas `.booka-reveal` — `animation: booka-reveal 180ms ease-out both;`
- Blok wajib:

```css
@media (prefers-reduced-motion: reduce) {
  .booka-reveal { animation: none; }
  [data-slot="skeleton"] { animation: none; }
}
```

### 3b. `src/components/ui/reveal.tsx`

Server Component (TANPA `"use client"` — ini murni CSS, tidak butuh JS):

```tsx
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  /** Jeda mulai animasi dalam milidetik, untuk efek berurutan antar kartu. */
  delay?: number;
  className?: string;
}) { ... }
```

Render `<div>` dengan `cn("booka-reveal", className)` dan
`style={{ animationDelay: delay ? `${delay}ms` : undefined }}`.

### 3c. `src/components/ui/skeletons.tsx`

Server Components, memakai `<Skeleton>` yang sudah ada di
`src/components/ui/skeleton.tsx` dan `<Card>` dari `@/components/ui/card`
supaya tinggi fallback mendekati konten aslinya (menghindari layout shift):

- `StatCardsSkeleton({ count = 3 })` — grid dengan kelas yang SAMA PERSIS
  dengan grid kartu di halaman aslinya (`grid gap-4 sm:grid-cols-2 lg:grid-cols-3`
  untuk Ringkasan, `grid gap-4 sm:grid-cols-3` untuk Booking). Terima prop
  `className` supaya kedua halaman bisa mencocokkan grid-nya masing-masing.
- `TableSkeleton({ rows = 8, columns = 5 })` — dibungkus
  `<div className="overflow-hidden rounded-xl border">` agar bingkainya sama
  dengan `BookingsTable`/`ServicesTable`.
- `ListSkeleton({ rows = 5 })` — untuk kartu "Jadwal terdekat".

Semua skeleton wajib punya `aria-hidden="true"` pada pembungkus dekoratifnya
dan satu `<span className="sr-only">Memuat…</span>` agar pembaca layar tahu
ada proses muat, bukan konten kosong.

**Verifikasi:** `npm run typecheck` dan `npm run lint`.

---

## Task 4 — Halaman Ringkasan: streaming + skeleton

Bergantung pada Task 1, 2, 3.

### 4a. `src/app/dashboard/loading.tsx` (baru)

Fallback tingkat rute yang muncul INSTAN saat navigasi: `PageHeader` versi
skeleton + `StatCardsSkeleton` + `ListSkeleton`. Ini yang menghapus jeda
layar-diam saat merchant mengklik menu sidebar.

### 4b. Pecah `src/app/dashboard/page.tsx`

Struktur baru: `page.tsx` menjadi shell tipis yang TIDAK meng-`await` query
apa pun sebelum mengembalikan JSX. Semua pengambilan data pindah ke
komponen async terpisah yang dibungkus `<Suspense>`:

```
export default async function DashboardPage() {
  return (
    <>
      <PageHeader ... />                         {/* render seketika */}
      <Suspense fallback={<SetupAlertsSkeleton/>}><SetupAlerts /></Suspense>
      <Suspense fallback={<StatCardsSkeleton/>}><OverviewStats /></Suspense>
      <Suspense fallback={<ListSkeleton/>}><UpcomingBookings /></Suspense>
      <div><Button asChild variant="outline">…</Button></div>
    </>
  );
}
```

Komponen async ditaruh di file terpisah agar `page.tsx` tetap kecil:

- `src/app/dashboard/overview-stats.tsx` — kuota (`my_quota_usage`), jumlah
  layanan, koneksi pembayaran. Bungkus tiap kartu dengan `<Reveal delay={i*40}>`.
- `src/app/dashboard/setup-alerts.tsx` — alert kuota habis + langkah setup
  yang belum selesai. Query `services`/`availability`/`payment_connections`.
- `src/app/dashboard/upcoming-bookings.tsx` — kartu "Jadwal terdekat".

Tiap komponen memanggil `getSessionUser()` dari Task 2 (gratis, ter-`cache`)
dan menjalankan HANYA query yang dibutuhkannya, dengan `Promise.all` di
dalam komponen itu sendiri.

**Perilaku dan teks yang ditampilkan harus identik dengan versi sekarang** —
termasuk semua ambang, label, dan urutan langkah setup. Ini refactor
struktural, bukan desain ulang konten.

Catatan: `OverviewStats` dan `SetupAlerts` sama-sama butuh jumlah layanan
dan koneksi pembayaran. Bungkus query bersama itu dalam helper ber-`cache()`
(mis. `src/app/dashboard/queries.ts`) supaya tidak dijalankan dua kali.

**Verifikasi:** `npm run typecheck`, `npm run lint`, `npm run build`.

---

## Task 5 — Halaman Booking: streaming, RPC, paginasi

Bergantung pada Task 1, 2, 3.

### 5a. `src/components/ui/data-table-pagination.tsx` (baru)

Komponen paginasi yang bisa dipakai ulang, Server Component:

```tsx
export function DataTablePagination({
  page, pageSize, totalCount, buildHref,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
  /** Membangun URL untuk halaman/ukuran tertentu. */
  buildHref: (next: { page?: number; size?: number }) => string;
}) 
```

Wajib menampilkan:

- Teks jangkauan: `Menampilkan 1–20 dari 137` (gunakan en dash `–`).
  Hitung batas atas dengan `Math.min(page * pageSize, totalCount)`.
- Tombol Sebelumnya/Berikutnya. **Pertahankan pola yang sudah benar di
  `bookings/page.tsx`**: saat tidak ada halaman tujuan, render `<Button disabled>`
  biasa, BUKAN `<Button asChild>` yang `disabled`-nya cuma kosmetik pada `<a>`.
- Pemilih ukuran halaman: 10 / 20 / 50. Karena ini Server Component, gunakan
  `<Link>` biasa untuk tiap opsi (bukan `<Select>` yang butuh JS), atau
  komponen klien kecil terpisah kalau `<Select>` lebih rapi — pilih salah
  satu dan konsisten.

### 5b. Validasi `size` di `bookings/page.tsx`

Tambah `size` ke `searchParams`. Nilai yang diterima hanya 10, 20, 50;
apa pun selain itu jatuh ke 20 (perlakukan seperti `status` tak dikenal:
diam-diam ke default, bukan error). Sertakan `size` di `buildBookingsHref`
agar filter dan ukuran halaman tidak saling menghapus saat berpindah halaman.

### 5c. Streaming

- `src/app/dashboard/bookings/loading.tsx` (baru) — `PageHeader` skeleton +
  `StatCardsSkeleton` (grid `sm:grid-cols-3`) + `TableSkeleton`.
- Pecah `page.tsx`:
  - `src/app/dashboard/bookings/bookings-summary.tsx` — komponen async yang
    memanggil RPC `dashboard_booking_summary()` dari Task 1, menggantikan
    empat query `monthPaidResult`/`monthPendingResult`/`revenueResult`/`pendingResult`.
    Bungkus tiap kartu dengan `<Reveal delay={i*40}>`.
  - `src/app/dashboard/bookings/bookings-list.tsx` — komponen async berisi
    query tabel yang dipaginasi, seluruh cabang render Empty/error, dan
    `<DataTablePagination>`.
- Di `page.tsx`, bungkus keduanya:
  - `<Suspense fallback={<StatCardsSkeleton .../>}><BookingsSummary /></Suspense>`
  - `<Suspense key={`${status}|${q}|${page}|${size}`} fallback={<TableSkeleton/>}><BookingsList ... /></Suspense>`

  `key` pada Suspense tabel itulah yang membuat ganti halaman/filter
  menampilkan skeleton baris sementara kartu ringkasan tetap terpampang
  tanpa ikut berkedip.

### 5d. Yang WAJIB dipertahankan apa adanya

Halaman ini punya banyak perilaku halus yang sudah benar dan dijaga komentar
panjang. Jangan ada yang hilang saat dipecah:

1. `startOfMonthJakartaIso` dan alasannya (kini sebagian pindah ke RPC —
   kalau fungsi TS-nya tidak terpakai lagi, hapus dan pindahkan komentar
   penjelasnya ke migration).
2. Penanganan `searchError`: query jalan tanpa filter pencarian, TAPI
   merchant tetap diberi tahu lewat pesan di atas tabel.
3. Pembedaan tegas tiga cabang: `bookingsResult.error` (gagal memuat) vs
   `totalCount === 0 && hasFilters` (tak ada hasil) vs benar-benar belum ada
   booking. Cabang error wajib diperiksa LEBIH DULU.
4. `console.error` untuk setiap query yang gagal — jangan ada yang ditelan
   diam-diam. Kartu ringkasan boleh degradasi ke 0; tabel tidak boleh.
5. Redirect ke halaman valid terakhir saat `page > totalPages && totalCount > 0`.
6. `key={rawParams.q}` pada `<BookingsFilters>`.
7. `nowMs` dihitung SEKALI di Server Component lalu diteruskan ke
   `BookingsTable` — jangan diganti `Date.now()` di komponen klien.

**Verifikasi:** `npm run typecheck`, `npm run lint`, `npm run build`.

---

## Task 6 — Region Vercel + dokumentasi load balancer

### 6a. `vercel.json`

Tambahkan `"regions": ["sin1"]`. Supabase pengguna dikonfirmasi berada di
`ap-southeast-1` (Singapura); tanpa setelan ini fungsi berjalan default di
`iad1` (Washington DC) sehingga setiap query menyeberangi Pasifik dua kali.

### 6b. `docs/DECISIONS.md`

Tambahkan entri yang mencatat, dengan alasannya:

- **Tidak memakai load balancer terpisah.** Di Vercel distribusi request
  sudah inheren lewat Anycast edge network dan Fluid Compute yang me-reuse
  serta menskalakan instance otomatis. Menaruh nginx/HAProxy di depannya
  menambah satu hop tanpa manfaat. `app-prod` di `compose.yaml` adalah alat
  verifikasi build lokal, bukan topologi produksi — kalau suatu saat
  self-host jadi jalur produksi, barulah reverse proxy + replika dibahas
  ulang.
- **`regions: ["sin1"]`** dan kaitannya dengan region Supabase. Catat bahwa
  keduanya harus dipindahkan bersama kalau region Supabase berubah.

Ikuti format entri yang sudah ada di `docs/DECISIONS.md`.

### 6c. `README.md` / `AGENTS.md`

Kalau ada bagian yang menyebut status Phase 1–2 atau daftar halaman
dashboard, perbarui seperlunya saja. Jangan menulis ulang dokumen.

**Verifikasi:** `npm run build` lulus (memastikan `vercel.json` valid secara
sintaks JSON dan tidak memecahkan apa pun).
