# F9 Panduan merchant baru: checklist, tur, panduan per halaman: rencana implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merchant yang baru membuat akun dipandu sampai booking pertama masuk dan paham setiap halaman dashboard: checklist 6 langkah di Hari ini yang dihitung dari data sungguhan, tur coachmark yang bisa dipakai dengan keyboard (G1 di desktop, G2 di HP), dan panel "Panduan halaman ini" di setiap halaman merchant.

**Architecture:** Satu migration menambah tabel `merchant_onboarding_progress` (satu baris per merchant, hanya bisa dibaca pemiliknya, hanya ditulis lewat RPC `save_onboarding_progress`) dan RPC baca `onboarding_state()` yang mengembalikan fakta kesiapan (ada layanan, jam, pembayaran, dan lainnya) plus progres dalam satu panggilan. Aturan checklist, pemetaan rute ke halaman, penyaringan langkah tur, dan penempatan tooltip ada di modul murni `src/lib/guide/guide.ts`. Semua teks panduan ada di satu modul `src/lib/guide/content.ts`. Di klien, `GuideProvider` di layout dashboard memegang panel (shadcn `Sheet`) dan tur (Radix `Dialog` dari paket `radix-ui` yang sudah terpasang). Elemen yang disorot ditandai atribut `data-tour`.

**Tech Stack:** Postgres (migration Supabase, uji `npm run docker:test`), Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui (`Sheet`, `Button`) dan `radix-ui` (`Dialog`), Zod, `node:test` lewat tsx, Storybook 10. Tanpa dependensi baru.

**Spec:** `docs/superpowers/specs/2026-11-14-marky-redesign-design.md` bagian 1, 2, 5 (F9), 7. Arah visual: `DESIGN.md` bagian 1 dan "Larangan". Artboard: G1 `Panduan.dc.html`, G2 `PanduanHP.dc.html` (`python3 .superpowers/design/extract.py .superpowers/design/app/<file>`; data langkahnya ada di blok `<script type="text/x-dc">`). Aturan proyek: `AGENTS.md`. Struktur dashboard: `docs/superpowers/plans/2026-11-15-marky-f3-dashboard.md`. Halaman yang dijelaskan panduan: rencana F2 dan F4 sampai F8 di folder yang sama.

## Prasyarat

F9 dimulai setelah F8 selesai dan di-commit. F9 memakai: `PageHeader`, `CopyLinkButton`, `sections.tsx` Hari ini, `MobileNav`, sidebar berkelompok, `getTabCounts` (F3); `bookings.source` (F3); `ROUTES.promoBanners` dan `promosi/layout.tsx` (F5); `ROUTES.floorPlan`, `src/app/dashboard/denah/*` (F8); form pengaturan F4 (`customer-policy-form.tsx`, `contact-settings-form.tsx`, `reminder-settings-form.tsx`); editor tampilan F6; dialog profil staf F7. Bila salah satu belum ada di cabang, berhenti dan lapor. Isi panduan wajib menjelaskan halaman sebagaimana kodenya di cabang saat F9 dikerjakan, bukan sebagaimana rencana F4 sampai F8 menulisnya.

## Keputusan (spec diam atau bentrok, diputuskan di sini)

1. **Bentuk tabel.** `merchant_onboarding_progress`: `merchant_id` (PK, FK `merchants` `on delete cascade`), `steps_completed text[]` (hanya `PAGE`, `SHARE`), `tours_seen text[]` (13 kunci halaman, Keputusan 16), `checklist_dismissed_at timestamptz`, `created_at`, `updated_at`. Nilai dijaga constraint `<@` tanpa fungsi (pola F6 Keputusan 3). Baris dibuat malas oleh RPC tulis; tidak ada baris berarti progres kosong. Tidak ada backfill.
2. **Langkah yang bisa dibuktikan data tidak disimpan.** `SERVICE`, `HOURS`, `PAYMENT`, `BOOKING` dihitung ulang setiap kali dari data. Merchant yang menghapus semua layanannya melihat langkah itu terbuka lagi, dan itu jujur. Hanya `PAGE` dan `SHARE` yang punya tanda manual di tabel.
3. **Aturan enam langkah** (`buildChecklist`, urutan tampil sama):
   - `SERVICE` Tambah layanan pertama: ada layanan aktif.
   - `HOURS` Atur jam buka: ada baris `availability` atau `staff_availability` merchant itu.
   - `PAYMENT` Pilih cara menerima uang: ada `payment_connections` berstatus `ACTIVE`, ATAU ada layanan aktif dan tidak satu pun layanan aktif butuh bayar online (`payment_mode <> 'ON_SITE'` dan `price > 0`). Alasan: `REQUEST` tanpa DP ditagih penuh online setelah disetujui (F2 Keputusan 2), jadi hanya `ON_SITE` dan layanan gratis yang aman tanpa gateway.
   - `PAGE` Rapikan tampilan halaman: ada baris `merchant_themes` (berarti editor Tampilan pernah disimpan, termasuk logo F6), ATAU `merchants.avatar_url` terisi, ATAU ditandai manual.
   - `SHARE` Bagikan tautan halaman: ada booking `source = 'ONLINE'`, ATAU tanda manual. Tanda manual ditulis otomatis saat merchant menyalin tautan lewat `CopyLinkButton` atau tombol salin di checklist, atau lewat "Tandai selesai".
   - `BOOKING` Terima booking pertama: ada booking `source = 'ONLINE'` dengan status apa pun. Booking manual tidak dihitung karena tidak membuktikan halaman menerima pesanan.
4. "Tandai selesai" hanya ada di `PAGE` (merchant boleh puas dengan tampilan bawaan) dan `SHARE` (tautan bisa dibagikan di luar Marky). Langkah lain hanya selesai lewat data.
5. **Hak akses.** `REVOKE ALL` dari `anon` dan `authenticated`, lalu `grant select (<enam kolom>)` ke `authenticated` dengan policy SELECT `(select auth.uid()) = merchant_id`. Tidak ada grant INSERT/UPDATE/DELETE. Tulis hanya lewat `save_onboarding_progress` (`security definer`, merchant dari `auth.uid()`). `anon` tidak punya hak apa pun ke tabel dan kedua fungsi.
6. **Satu RPC baca.** `onboarding_state()` (`security invoker`, `stable`) mengembalikan fakta mentah dan progres sekaligus. Aturan `PAYMENT` dihitung di TypeScript (diuji unit), bukan di SQL. `getOnboardingState()` di `queries.ts` dibungkus `cache()`, dipanggil layout (paralel dengan `requireMerchant` dan `getTabCounts`) lalu dipakai ulang Hari ini dan `SetupAlerts` dalam render yang sama.
7. **Arti "dilihat".** Kunci halaman masuk `tours_seen` saat panel halaman itu dibuka ATAU tur halaman itu ditutup dengan cara apa pun (Selesai, Lewati, Esc). Tur Hari ini mulai sendiri sekali bila `today` belum dilihat, termasuk untuk merchant lama, karena F3 mengubah dashboard. Halaman lain tidak pernah memulai tur sendiri; tombol "Panduan halaman ini" diberi titik penanda sampai halaman itu dilihat.
8. **Tur tanpa library.** Radix `Dialog` (paket `radix-ui` yang sudah dipakai `src/components/ui/dialog.tsx`) memberi `aria-modal`, kunci fokus, Esc, dan pengembalian fokus. Posisi tooltip dihitung fungsi murni `placeTip`. shadcn `Popover` tidak dipakai: belum terpasang, dan mode modalnya tidak menandai `aria-modal`. driver.js, Shepherd, dan react-joyride ditolak karena kebutuhan ini sekitar 150 baris dengan primitif yang sudah ada.
9. **Tur di HP mengikuti G2.** Di bawah 768px (`useIsMobile`) kartu tur menempel di bawah layar di atas nav bawah, dengan titik kemajuan. Mulai 768px kartu 300px di sebelah target (G1). Setiap langkah boleh punya `viewport` (`desktop` atau `mobile`); langkah tanpa `viewport` tampil di keduanya. Langkah yang targetnya tidak ada atau tidak terlihat dilewati saat tur dimulai. Langkah dengan `target: null` tampil di tengah tanpa sorotan.
10. **Target lewat `data-tour`.** Satu nilai boleh dipasang di beberapa elemen (mis. item sidebar dan item nav bawah); yang dipakai adalah elemen pertama yang terlihat (`getClientRects().length > 0`). Uji unit memastikan setiap target di `content.ts` ada di kode.
11. **Panel "Panduan halaman ini"** adalah `Sheet` kanan (380px mulai `sm`, penuh di bawahnya). Isinya: ringkasan, slot video, daftar poin, tombol "Mulai tur halaman ini". Tidak ada "Buka pusat bantuan" (pusat bantuan tidak ada).
12. **Video placeholder.** Setiap halaman `video: null` di F9. Slotnya kotak `aspect-video` bergaris dengan teks "Video panduan belum tersedia." Bila kelak diisi, bentuknya `{ src, captionsSrc }` berkas lokal (`/...`) dan dirender `<video controls preload="none">` dengan `<track kind="captions">`. Tidak ada URL video, durasi, atau klaim lain.
13. **Tanpa angka waktu.** "3 menit", "Sekitar 15 menit", "Tur dashboard 1 menit", dan "Video 1 menit" dari artboard tidak dipakai: perkiraan yang tidak bisa dibuktikan termasuk angka karangan (spec bagian 1, anti-goal).
14. **Penempatan dan tutup checklist.** Kartu "Panduan memulai Marky" di Hari ini setelah `SetupAlerts`, sebelum `ProfileNudge` dan grid. Tombol "Sembunyikan" mengisi `checklist_dismissed_at`; panel Hari ini menawarkan "Tampilkan lagi panduan memulai" untuk mengosongkannya. Saat keenam langkah selesai kartu menampilkan keadaan selesai dan tetap ada sampai disembunyikan. Di HP kartu tertutup menjadi satu baris ringkasan ("2 dari 6 selesai") yang bisa dibuka (G2); mulai 768px daftar selalu terbuka.
15. **`SetupAlerts` tidak menggandakan checklist.** Peringatan kuota tetap. Daftar langkah setup (layanan, jam, pembayaran) hanya tampil setelah checklist disembunyikan, dan memakai `buildChecklist` yang sama, jadi merchant yang hanya bayar di tempat tidak lagi disuruh menghubungkan gateway. `getServiceCount` dan `getActivePaymentConnections` dihapus bila tidak ada pemakai lain.
16. **Halaman yang dipandu (13).** `today` (`/dashboard`), `bookings` (`/dashboard/bookings`, termasuk `/baru`), `analytics`, `services`, `availability`, `floor_plan`, `staff`, `payments`, `appearance`, `promo` (termasuk `/voucher`), `domain`, `billing`, `settings`. Analitik ikut walau tidak disebut di arahan karena halamannya ada. Semua di bawah `/dashboard`, jadi tidak ada segmen baru untuk `ROUTES` tingkat atas atau `reserved_usernames`.
17. **Gagal muat.** Bila `onboarding_state()` gagal: error di-`console.error` dengan `merchantId`, layout memperlakukan semua halaman sebagai sudah dilihat (tidak ada tur otomatis, tidak ada titik), kartu checklist menampilkan teks netral `role="alert"`, dan `SetupAlerts` hanya menampilkan peringatan kuota. Server action yang gagal tidak memblokir UI: tur tetap tertutup, dan checklist menampilkan pesan netral di bawah tombol.
18. Progres tidak ikut "Unduh data": isinya status UI tanpa data pribadi. Hapus akun menghapusnya lewat `on delete cascade`.
19. Kunci `sessionStorage` `booka:onboarding:<userId>` (draf wizard) tidak disentuh. Task 2 menambah uji yang mematok nilainya supaya tetap terbaca.
20. Tanda centang dan tutup memakai ikon lucide (`Check`, `X`, `CircleHelp`, `ChevronDown`), bukan karakter `✓`, `✕`, `?`, atau `+` di teks tombol (F3 Keputusan 14).

## Konflik dengan spec, artboard, atau arahan

- G1 berisi langkah "Buat akun" dan "Coba booking sebagai pelanggan". Arahan meminta enam langkah turunan data (layanan, jam, pembayaran, tampilan, tautan, booking pertama). Arahan menang: "Buat akun" selalu selesai sehingga tidak bermakna, dan "Coba booking" menjadi isi langkah `BOOKING` (Keputusan 3).
- G1 menulis "Salin lalu pasang" pada target tautan sidebar, padahal tautan itu membuka halaman, bukan menyalin. Teksnya diganti.
- G2 menulis "Geser untuk menandai hadir atau lunas". Gestur geser tidak ada; panel detail F3 yang dipakai. Teksnya diganti.
- G1 menaruh "Selamat datang, Sekar" di atas judul (eyebrow, dilarang `DESIGN.md`) dan memakai `✓`, `✕`, `+ Booking manual`. Tidak dipakai (Keputusan 20); deskripsi tanggal F3 tetap.
- Arahan menyebut kunci `localStorage` `booka:onboarding:*`. Kunci itu ada di `sessionStorage` (`src/app/onboarding/wizard-state.ts`) dan berisi draf wizard. F9 tidak membacanya atau menulisnya; kompatibilitas dijaga dengan tidak mengubahnya (Keputusan 19).
- Sidebar G1 tidak berisi Domain, Langganan, Pengaturan, dan Denah meja. Navigasi F3, F5, dan F8 yang berlaku.

## Global Constraints

- Migration baru saja: `supabase/migrations/20261121000100_onboarding_progress.sql`. Akhiri dengan `notify pgrst, 'reload schema';`. Jangan edit migration lama.
- Uji SQL di `supabase/tests/99_verify.sql` bagian 65 sampai 67 (label `t65`, `t66`, `t67`; bagian 68 dan 69 dicadangkan, tidak dipakai). Lulus berarti tidak ada baris output diawali `FAIL` di seluruh output `npm run docker:test` (Docker harus jalan: `open -a Docker`).
- Fungsi baru: `revoke execute ... from public, anon, authenticated`, lalu `grant execute ... to authenticated`. Tipe baru di `src/types/database.ts` memakai `type`, bukan `interface`.
- Query dashboard memakai `createClient()` dari `src/lib/supabase/server.ts`. Tidak ada `createAdminClient()` di F9.
- Dashboard monokrom: token `primary`, `muted-foreground`, `border`. Tidak ada merah di F9. Pesan gagal teks netral `role="alert"`.
- Larangan `DESIGN.md`: tanpa em dash, en dash, eyebrow, label kapital berjarak, `·` sebagai pemisah, panah di teks tombol, atau angka karangan. Target sentuh minimal 44px (`min-h-11`/`size-11`). Fokus selalu terlihat dan semua bisa dipakai dengan keyboard.
- Gerakan hanya `motion-safe:` (transisi sorotan dan kartu), tidak ada animasi lebih dari 5 detik.
- Komponen tampilan baru menerima data dan server action sebagai props bila mungkin, dan punya story (`parameters.nextjs.appDirectory`, pola `today.stories.tsx`).
- UI dan komentar berbahasa Indonesia, nama variabel Inggris. Tidak ada langkah deploy.

## Review Focus

1. **Target tur tidak ada di halaman**: merchant Starter membuka panduan Staf, Domain, atau Analitik (yang tampil hanya ajakan upgrade), mode Denah bukan "Pakai denah meja" sehingga editor tidak tampil, atau checklist sudah disembunyikan saat tur HP dimulai. Yang diharapkan: langkah itu dilewati, tidak pernah ada sorotan di tempat kosong, dan tur dengan sisa nol langkah tidak terbuka. Diuji `tourStepsFor` (Task 2) dan langkah browser Task 7.
2. **Esc atau Lewati di tengah tur di HP**: fokus kembali ke elemen sebelumnya, halaman bisa digulir lagi, `pointer-events` body pulih, dan tur Hari ini tidak mulai lagi saat halaman dimuat ulang. Diuji t66 (`tours_seen` tersimpan sekali) dan langkah browser Task 7.
3. **Merchant hanya bayar di tempat tanpa gateway**: langkah pembayaran selesai. Merchant dengan layanan lunas di muka dan koneksi `EXPIRED`: belum selesai. Diuji `buildChecklist` (Task 2) dan t67.
4. **Merchant lain atau pengunjung anonim**: tidak bisa membaca atau menulis progres merchant lain, termasuk lewat RPC. Diuji t65 dan t66.
5. **Server action progres gagal (jaringan putus)**: tur tetap tertutup, checklist tetap bisa dipakai dan menampilkan "Gagal menyimpan. Coba lagi." tanpa kehilangan keadaan terbuka/tertutup langkah. Diuji story `GagalSimpan` (Task 6).

---

### Task 1: Tabel progres dan RPC panduan

Model: sonnet.

**Files:**
- Create: `supabase/migrations/20261121000100_onboarding_progress.sql`
- Modify: `supabase/tests/99_verify.sql` (bagian `-- 65.`, `-- 66.`, `-- 67.`), `src/types/database.ts`

**Interfaces:**
- Consumes: `public.set_updated_at()`, tabel `services`, `availability`, `staff_availability`, `payment_connections`, `merchant_themes`, `merchants`, `bookings.source` (F3).
- Produces (SQL):

```sql
create table public.merchant_onboarding_progress (
  merchant_id uuid primary key references public.merchants(id) on delete cascade,
  steps_completed text[] not null default '{}',
  tours_seen text[] not null default '{}',
  checklist_dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merchant_onboarding_progress_steps
    check (steps_completed <@ array['PAGE', 'SHARE']::text[]),
  constraint merchant_onboarding_progress_tours
    check (tours_seen <@ array['today', 'bookings', 'analytics', 'services', 'availability',
      'floor_plan', 'staff', 'payments', 'appearance', 'promo', 'domain', 'billing', 'settings']::text[])
);

public.save_onboarding_progress(
  p_step text default null, p_tour text default null, p_dismissed boolean default null
) returns void          -- security definer, authenticated saja

public.onboarding_state() returns table (
  has_service boolean, has_hours boolean, has_active_payment boolean,
  needs_online_payment boolean, page_customized boolean, has_online_booking boolean,
  steps_completed text[], tours_seen text[], checklist_dismissed_at timestamptz
)                       -- security invoker, stable, authenticated saja
```

- Produces (TS, `src/types/database.ts`):
  - `export type ManualStepKey = "PAGE" | "SHARE";`
  - `export type GuidePageKey = "today" | "bookings" | "analytics" | "services" | "availability" | "floor_plan" | "staff" | "payments" | "appearance" | "promo" | "domain" | "billing" | "settings";`
  - `export type MerchantOnboardingProgress = { merchant_id: string; steps_completed: ManualStepKey[]; tours_seen: GuidePageKey[]; checklist_dismissed_at: string | null; created_at: string; updated_at: string };`
  - `Tables.merchant_onboarding_progress: { Row: MerchantOnboardingProgress; Insert: never; Update: never; Relationships: [] }` (ikuti bentuk tabel lain di berkas itu bila `never` tidak diterima; yang penting klien tidak punya jalan tulis yang diketik).
  - `Functions.onboarding_state: { Args: Record<string, never>; Returns: { has_service: boolean; has_hours: boolean; has_active_payment: boolean; needs_online_payment: boolean; page_customized: boolean; has_online_booking: boolean; steps_completed: ManualStepKey[]; tours_seen: GuidePageKey[]; checklist_dismissed_at: string | null }[] }`
  - `Functions.save_onboarding_progress: { Args: { p_step?: ManualStepKey | null; p_tour?: GuidePageKey | null; p_dismissed?: boolean | null }; Returns: undefined }`

Isi migration:
- Tabel di atas, `enable row level security`, `revoke all on table ... from anon, authenticated`, `grant select (merchant_id, steps_completed, tours_seen, checklist_dismissed_at, created_at, updated_at) on ... to authenticated`, policy `merchant_onboarding_progress_select_own` `for select to authenticated using ((select auth.uid()) = merchant_id)`, trigger `set_updated_at` sebelum update.
- `save_onboarding_progress` (`plpgsql`, `security definer`, `set search_path = ''`): `v_merchant := (select auth.uid())`; null melempar `42501`. Lalu satu `insert ... on conflict (merchant_id) do update` dengan aturan: argumen null tidak mengubah kolomnya; `p_step`/`p_tour` ditambahkan ke larik hanya bila belum ada (tanpa duplikat); `p_dismissed = true` mengisi `checklist_dismissed_at` dengan `coalesce(lama, now())`; `p_dismissed = false` mengosongkannya. Nilai di luar daftar ditolak constraint (`23514`), bukan dicek ulang di fungsi.
- `onboarding_state` (`sql`, `stable`, `security invoker`, `set search_path = ''`): `from (select (select auth.uid()) as id) u left join merchant_onboarding_progress p on p.merchant_id = u.id where u.id is not null`. Kolom fakta berupa `exists (...)` dengan filter `merchant_id = u.id` sesuai Keputusan 3: `has_service` layanan aktif; `has_hours` `availability` atau `staff_availability`; `has_active_payment` status `ACTIVE`; `needs_online_payment` layanan aktif dengan `payment_mode <> 'ON_SITE' and price > 0`; `page_customized` baris `merchant_themes` atau `merchants.avatar_url is not null`; `has_online_booking` booking `source = 'ONLINE'`. Larik `coalesce(..., '{}')`.
- Grant fungsi sesuai Global Constraints.

- [ ] **Step 1: Tulis kasus uji yang gagal.** Merchant `65656565-0000-0000-0000-000000000001` (A, PRO) dan `...0002` (B, PRO), dibuat lewat `auth.users` seperti bagian 36. Pemanggilan sebagai merchant memakai `begin; set local role authenticated; set local request.jwt.claim.sub = '...'; ... commit;`.
  - **65. Skema dan hak akses** (`-- 65. Progres panduan: skema dan hak akses (20261121000100)`):
    - t65a `anon` tidak punya SELECT, INSERT, UPDATE, DELETE pada tabel.
    - t65b `authenticated` punya SELECT, tidak punya INSERT, UPDATE, DELETE (`has_table_privilege`).
    - t65c `anon` tidak bisa EXECUTE `save_onboarding_progress(text, text, boolean)` dan `onboarding_state()`; `authenticated` bisa keduanya.
    - t65d insert langsung (superuser) dengan `steps_completed = '{BOOKING}'` gagal `23514`; dengan `tours_seen = '{beranda}'` gagal `23514`. Pastikan baris uji hanya melanggar constraint yang dimaksud (AGENTS.md).
  - **66. Simpan progres** (`-- 66. save_onboarding_progress`):
    - t66a A memanggil `p_step => 'SHARE'` dua kali: satu baris, `steps_completed = '{SHARE}'`.
    - t66b A memanggil `p_tour => 'today'` lalu `'services'` lalu `'today'`: `tours_seen = '{today,services}'`, `steps_completed` tetap.
    - t66c `p_dismissed => true` mengisi `checklist_dismissed_at`; panggilan `true` kedua tidak mengubah nilainya (bandingkan dengan nilai yang disimpan sebelumnya); `false` mengosongkannya.
    - t66d `p_step => 'SERVICE'` gagal `23514`; `p_tour => 'beranda'` gagal `23514`.
    - t66e tanpa klaim `sub` gagal `42501`.
    - t66f B `select * from merchant_onboarding_progress` mendapat 0 baris walau baris A ada; A mendapat 1 baris. B memanggil `save_onboarding_progress(p_tour => 'today')` hanya membuat baris B (`tours_seen` A tidak berubah).
  - **67. Fakta panduan** (`-- 67. onboarding_state`), semua dipanggil sebagai A kecuali disebut:
    - t67a merchant tanpa apa pun: satu baris, keenam fakta `false`, larik kosong, `checklist_dismissed_at` null.
    - t67b `availability` A diisi: `has_hours`. Merchant lain dengan hanya `staff_availability` (STUDIO, siapkan seperti bagian 36): `has_hours` juga `true`.
    - t67c layanan aktif `ON_SITE` 100000: `has_service = true`, `needs_online_payment = false`. Tambah layanan aktif `FULL` harga 0: `needs_online_payment` tetap `false`. Tambah layanan nonaktif `FULL` 100000: tetap `false`. Tambah layanan aktif `REQUEST` 100000 tanpa DP: `true`.
    - t67d `payment_connections` A berstatus `EXPIRED`: `has_active_payment = false`; diubah `ACTIVE`: `true` (salin cara menyisipkan baris koneksi dari bagian 9 atau 17).
    - t67e baris `merchant_themes` A: `page_customized = true`. Merchant ketiga tanpa tema dengan `avatar_url` berbentuk yang diterima constraint bagian 26: `true`.
    - t67f booking `MANUAL` saja: `has_online_booking = false`; tambah booking `ONLINE` (status `CANCELLED` pun): `true`.
    - t67g B memanggil: fakta B, bukan A (B tidak punya layanan, `has_service = false`).
    - t67h tanpa klaim `sub`: 0 baris.
- [ ] **Step 2: Jalankan** `npm run docker:test`. Harapan: baris `FAIL` di bagian 65 sampai 67 (fungsi dan tabel belum ada).
- [ ] **Step 3: Tulis migration** sesuai Interfaces dan Isi migration.
- [ ] **Step 4: Jalankan** `npm run docker:test`. Harapan: tidak ada baris `FAIL` di seluruh output, termasuk bagian 8 (RLS aktif di semua tabel).
- [ ] **Step 5: Perbarui tipe** sesuai Interfaces, lalu `npm run typecheck`.
- [ ] **Step 6: Commit**: `git add supabase/migrations/20261121000100_onboarding_progress.sql supabase/tests/99_verify.sql src/types/database.ts` lalu `git commit -m "Tambah tabel progres panduan dan RPC fakta kesiapan merchant"`.

---

### Task 2: Modul murni panduan

Model: haiku (uji lengkap di rencana, badan fungsi pendek).

**Files:**
- Create: `src/lib/guide/guide.ts`, `src/lib/guide/guide.test.ts`
- Modify: `src/app/onboarding/wizard-state.test.ts` (satu asersi)

**Interfaces:**
- Consumes: `ManualStepKey`, `GuidePageKey` (Task 1), `ROUTES` (termasuk `floorPlan` dari F8 dan `promoBanners` dari F5).
- Produces (`src/lib/guide/guide.ts`, tanpa impor React atau DOM):

```ts
export const GUIDE_PAGE_KEYS: readonly GuidePageKey[]; // urutan Keputusan 16, 13 kunci
export const MANUAL_STEP_KEYS: readonly ManualStepKey[]; // ["PAGE", "SHARE"]
export type ChecklistStepKey = "SERVICE" | "HOURS" | "PAYMENT" | "PAGE" | "SHARE" | "BOOKING";
export const CHECKLIST_ORDER: readonly ChecklistStepKey[]; // urutan di atas

export type OnboardingFacts = {
  hasService: boolean; hasHours: boolean; hasActivePayment: boolean;
  needsOnlinePayment: boolean; pageCustomized: boolean; hasOnlineBooking: boolean;
};
export type ChecklistItem = { key: ChecklistStepKey; done: boolean; manual: boolean };
export function buildChecklist(facts: OnboardingFacts, stepsCompleted: readonly ManualStepKey[]): ChecklistItem[];

export function guidePageForPath(pathname: string): GuidePageKey | null;

export type TourViewport = "desktop" | "mobile";
export type TourTarget =
  | "page-link" | "nav-today" | "nav-bookings" | "new-booking" | "page-guide" | "getting-started"
  | "booking-tabs" | "booking-search" | "analytics-summary" | "service-add" | "service-list"
  | "hours-days" | "dining-capacity" | "dining-editor" | "staff-list" | "payment-providers"
  | "appearance-editor" | "appearance-preview" | "promo-tabs" | "domain-form" | "billing-plans"
  | "settings-profile" | "settings-booking" | "settings-customer" | "settings-reminders" | "settings-account";
export type TourStep = { target: TourTarget | null; title: string; body: string; viewport?: TourViewport };
export type GuidePoint = { term: string; text: string };
export type GuideVideo = { src: string; captionsSrc: string };
export type GuidePage = {
  title: string;            // nama halaman seperti di sidebar, mis. "Layanan"
  summary: string;          // satu kalimat: untuk apa halaman ini
  points: GuidePoint[];     // 3 sampai 7
  note: string | null;      // syarat paket, mis. "Khusus paket Studio."
  video: GuideVideo | null; // null di F9 (Keputusan 12)
  tour: TourStep[];
};
export function tourStepsFor<T extends { target: string | null; viewport?: TourViewport }>(
  steps: readonly T[], viewport: TourViewport, hasTarget: (target: string) => boolean,
): T[];

export type Rect = { top: number; left: number; width: number; height: number };
export function placeTip(
  target: Rect | null, tip: { width: number; height: number }, viewport: { width: number; height: number },
): { top: number; left: number };
```

Aturan yang tidak ditentukan uji:
- `buildChecklist`: Keputusan 3; `manual` = kunci ada di `MANUAL_STEP_KEYS` (tidak bergantung pada `done`).
- `guidePageForPath`: `/dashboard` persis jadi `today`; kunci lain cocok bila `pathname === route || pathname.startsWith(route + "/")` untuk `ROUTES.bookings`, `analytics`, `services`, `availability`, `floorPlan`, `staff`, `payments`, `appearance`, `promoBanners`, `domain`, `billing`, `settings`. Selain itu `null`.
- `tourStepsFor`: pertahankan urutan; buang langkah yang `viewport`-nya ada dan berbeda; buang langkah ber-target yang `hasTarget(target)` false; langkah `target: null` selalu tetap.
- `placeTip` (`GAP = 12`, `MARGIN = 16`): target null berarti tengah layar. Kandidat berurutan: kanan (`left = t.left + t.width + GAP`, `top = t.top`), bawah (`left = t.left`, `top = t.top + t.height + GAP`), atas (`top = t.top - GAP - h`), kiri (`left = t.left - GAP - w`). Kandidat diterima bila sumbu utamanya muat di dalam `[MARGIN, viewport - MARGIN]`; sumbu silangnya lalu dijepit `clamp(x, MARGIN, v - size - MARGIN)` dengan `clamp = max(min, min(x, max))`. Bila tidak ada yang muat, pakai bawah dengan kedua sumbu dijepit.

- [ ] **Step 1: Tulis uji yang gagal** di `src/lib/guide/guide.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildChecklist, CHECKLIST_ORDER, GUIDE_PAGE_KEYS, guidePageForPath, placeTip, tourStepsFor, type OnboardingFacts } from "./guide";

const NONE: OnboardingFacts = { hasService: false, hasHours: false, hasActivePayment: false, needsOnlinePayment: false, pageCustomized: false, hasOnlineBooking: false };
const done = (facts: Partial<OnboardingFacts>, steps: ("PAGE" | "SHARE")[] = []) =>
  Object.fromEntries(buildChecklist({ ...NONE, ...facts }, steps).map((i) => [i.key, i.done]));

describe("buildChecklist", () => {
  it("urutan tetap dan hanya PAGE/SHARE yang manual", () => {
    const items = buildChecklist(NONE, []);
    assert.deepEqual(items.map((i) => i.key), [...CHECKLIST_ORDER]);
    assert.deepEqual(items.filter((i) => i.manual).map((i) => i.key), ["PAGE", "SHARE"]);
    assert.ok(items.every((i) => !i.done));
  });
  it("sesudah wizard: layanan lunas dan jam ada, pembayaran belum", () => {
    assert.deepEqual(done({ hasService: true, hasHours: true, needsOnlinePayment: true }),
      { SERVICE: true, HOURS: true, PAYMENT: false, PAGE: false, SHARE: false, BOOKING: false });
  });
  it("hanya bayar di tempat: pembayaran selesai tanpa gateway", () => {
    assert.equal(done({ hasService: true, needsOnlinePayment: false }).PAYMENT, true);
  });
  it("tanpa layanan: pembayaran belum selesai walau tidak butuh online", () => {
    assert.equal(done({ hasService: false, needsOnlinePayment: false }).PAYMENT, false);
  });
  it("gateway aktif: pembayaran selesai", () => {
    assert.equal(done({ hasService: true, needsOnlinePayment: true, hasActivePayment: true }).PAYMENT, true);
  });
  it("tampilan: data atau tanda manual", () => {
    assert.equal(done({ pageCustomized: true }).PAGE, true);
    assert.equal(done({}, ["PAGE"]).PAGE, true);
  });
  it("booking online menyelesaikan bagikan dan booking; tanda SHARE saja tidak", () => {
    assert.deepEqual([done({ hasOnlineBooking: true }).SHARE, done({ hasOnlineBooking: true }).BOOKING], [true, true]);
    assert.deepEqual([done({}, ["SHARE"]).SHARE, done({}, ["SHARE"]).BOOKING], [true, false]);
  });
});

describe("guidePageForPath", () => {
  it("memetakan rute dashboard", () => {
    assert.equal(GUIDE_PAGE_KEYS.length, 13);
    assert.equal(new Set(GUIDE_PAGE_KEYS).size, 13);
    assert.equal(guidePageForPath("/dashboard"), "today");
    assert.equal(guidePageForPath("/dashboard/bookings"), "bookings");
    assert.equal(guidePageForPath("/dashboard/bookings/baru"), "bookings");
    assert.equal(guidePageForPath("/dashboard/promosi/voucher"), "promo");
    assert.equal(guidePageForPath("/dashboard/denah"), "floor_plan");
    assert.equal(guidePageForPath("/dashboard/analitik"), "analytics");
    assert.equal(guidePageForPath("/dashboard/settings/ekspor"), "settings");
    assert.equal(guidePageForPath("/dashboard/servicesx"), null);
    assert.equal(guidePageForPath("/onboarding"), null);
  });
});

describe("tourStepsFor", () => {
  const steps = [
    { target: null, viewport: undefined },
    { target: "a", viewport: undefined },
    { target: "b", viewport: "desktop" as const },
    { target: "c", viewport: "mobile" as const },
    { target: "hilang", viewport: undefined },
  ];
  const has = (t: string) => t !== "hilang";
  it("menyaring viewport dan target yang hilang, null tetap", () => {
    assert.deepEqual(tourStepsFor(steps, "desktop", has).map((s) => s.target), [null, "a", "b"]);
    assert.deepEqual(tourStepsFor(steps, "mobile", has).map((s) => s.target), [null, "a", "c"]);
    assert.deepEqual(tourStepsFor(steps, "mobile", () => false).map((s) => s.target), [null]);
  });
});

describe("placeTip", () => {
  const vp = { width: 1280, height: 800 };
  const tip = { width: 300, height: 160 };
  it("item sidebar: di kanan target", () => {
    assert.deepEqual(placeTip({ top: 112, left: 12, width: 216, height: 40 }, tip, vp), { top: 112, left: 240 });
  });
  it("tombol kanan atas: di bawah, dijepit ke dalam layar", () => {
    assert.deepEqual(placeTip({ top: 26, left: 1126, width: 134, height: 44 }, tip, vp), { top: 82, left: 964 });
  });
  it("tombol kanan bawah: di atas", () => {
    assert.deepEqual(placeTip({ top: 740, left: 1100, width: 120, height: 44 }, tip, vp), { top: 568, left: 964 });
  });
  it("tanpa target: tengah", () => {
    assert.deepEqual(placeTip(null, tip, vp), { top: 320, left: 490 });
  });
  it("layar terlalu kecil: bawah, dijepit dua sumbu", () => {
    assert.deepEqual(placeTip({ top: 10, left: 10, width: 20, height: 20 }, tip, { width: 320, height: 200 }), { top: 24, left: 16 });
  });
});
```

  Tambahkan di `wizard-state.test.ts` (Keputusan 19): `assert.equal(storageKey("user-a"), "booka:onboarding:user-a");`.
- [ ] **Step 2: Jalankan** `npm run test:unit`. Harapan: gagal karena `./guide` belum ada.
- [ ] **Step 3: Implementasikan** `src/lib/guide/guide.ts` sesuai Interfaces dan aturan.
- [ ] **Step 4: Jalankan** `npm run test:unit && npm run typecheck`. Harapan: lulus.
- [ ] **Step 5: Commit**: `git add src/lib/guide/guide.ts src/lib/guide/guide.test.ts src/app/onboarding/wizard-state.test.ts` lalu `git commit -m "Tambah logika murni checklist, rute, dan penempatan tur"`.

---

### Task 3: Isi panduan

Model: sonnet (prosa yang harus cocok dengan perilaku halaman).

**Files:**
- Create: `src/lib/guide/content.ts`, `src/lib/guide/content.test.ts`

**Interfaces:**
- Consumes: tipe `GuidePage`, `TourStep`, `ChecklistStepKey`, `GUIDE_PAGE_KEYS`, `MANUAL_STEP_KEYS` (Task 2), `ROUTES`.
- Produces:

```ts
export const GUIDE_PAGES: Record<GuidePageKey, GuidePage>;
export const CHECKLIST_COPY: Record<ChecklistStepKey, {
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string | null; // null = halaman publik merchant, dibuka di tab baru; SHARE memakai tombol salin, ctaHref null
}>;
```

Cara menulis isi:
- Setiap kalimat harus benar untuk kode di cabang saat ini. Buka berkas sumber tiap halaman (kolom Sumber di bawah), baca label, teks bantuan, dan cabang paket di sana, lalu tulis poin dari situ. Fakta di tabel adalah titik awal dari rencana F2 sampai F8; bila kodenya berbeda, kode yang menang dan fakta yang tidak ada dibuang. Tulis komentar `// Sumber: <berkas>, <berkas>` di atas entri tiap halaman supaya pemelihara tahu apa yang harus dicek saat halaman berubah.
- Nada: kalimat pendek, "Anda", kata kerja yang ada di tombol halaman itu (mis. "Tandai hadir", bukan "check-in"). Tanpa angka yang tidak dijamin kode (batas yang ditegakkan kode, mis. maksimal 3 banner tayang, boleh).
- `title` = nama di sidebar. `note` hanya untuk syarat paket yang ditegakkan halaman itu.
- Tur halaman selain `today` dimulai dengan satu langkah `target: null` berisi ringkasan, lalu satu langkah per target di tabel, berurutan.

Tur `today` (dari G1 dan G2, sudah dikoreksi; tulis persis):

| # | target | viewport | title | body |
|---|---|---|---|---|
| 1 | `getting-started` | mobile | Panduan memulai | Enam langkah sampai booking pertama masuk. Ketuk satu langkah untuk melihat caranya. |
| 2 | `page-link` | desktop | Tautan Anda ada di sini | Ini alamat halaman booking Anda. Pasang di bio Instagram, TikTok, atau status WhatsApp supaya pelanggan bisa booking. |
| 3 | `nav-today` | desktop | Hari ini | Halaman pertama setiap pagi: siapa datang hari ini dan apa yang perlu Anda cek. |
| 4 | `nav-bookings` | – | Booking | Semua pesanan ada di sini. Buka satu booking untuk menandai hadir atau lunas, mengubah jadwal, atau membatalkan. |
| 5 | `new-booking` | – | Booking manual | Pelanggan menelepon atau datang langsung? Catat di sini supaya jadwalnya tidak bentrok dengan booking online. |
| 6 | `page-guide` | – | Butuh bantuan? | Setiap halaman punya tombol panduan berisi penjelasan singkat halaman itu. Tur ini bisa diulang dari sana. |

Checklist (tulis persis; `ctaHref` dari `ROUTES`):

| Kunci | title | body | ctaLabel | ctaHref |
|---|---|---|---|---|
| `SERVICE` | Tambah layanan pertama | Nama, durasi, harga, dan cara bayar: lunas di muka, DP, bayar di tempat, atau ajukan dulu. | Buka Layanan | `ROUTES.services` |
| `HOURS` | Atur jam buka | Hari dan jam Anda menerima pelanggan. Pelanggan hanya bisa memilih jam di dalam rentang ini. | Atur jam buka | `ROUTES.availability` |
| `PAYMENT` | Pilih cara menerima uang | Hubungkan Midtrans atau Xendit supaya pelanggan bisa membayar lunas atau DP lewat QRIS, langsung ke akun Anda. Belum siap? Pilih bayar di tempat di setiap layanan. | Buka Pembayaran | `ROUTES.payments` |
| `PAGE` | Rapikan tampilan halaman | Foto profil atau logo, warna, dan latar halaman booking. Ini yang pertama dilihat pelanggan. | Buka Tampilan | `ROUTES.appearance` |
| `SHARE` | Bagikan tautan halaman | Pasang tautan di bio Instagram, TikTok, atau status WhatsApp. Langkah ini selesai saat Anda menyalin tautan atau booking online pertama masuk. | Salin tautan | `null` |
| `BOOKING` | Terima booking pertama | Coba pesan sendiri dari halaman Anda untuk melihat alurnya dari sisi pelanggan. Booking percobaan memegang jamnya dan ikut dihitung kuota bulanan; batalkan dari Booking bila perlu. | Buka halaman saya | `null` |

Halaman, fakta awal, dan target tur:

| Kunci | Sumber | Fakta yang harus tercakup (cek di kode) | Target tur berurutan |
|---|---|---|---|
| `today` | `src/app/dashboard/page.tsx`, `_today/*` | Perlu tindakan (permintaan menunggu persetujuan dan otomatis ditolak bila lewat batas, booking belum dibayar dengan tautan ingatkan lewat WhatsApp, booking lewat yang belum ditandai); Agenda hari ini dan "Tandai hadir" mulai satu jam sebelum jadwal; Ditagih di tempat hari ini; 7 hari terakhir; Booking manual; salin tautan di HP | tabel di atas |
| `bookings` | `bookings/page.tsx`, `booking-tabs.tsx`, `booking-detail-panel.tsx`, `baru/*` | Tab Perlu tindakan, Mendatang, Riwayat, Dibatalkan; cari nama atau WhatsApp; panel detail: setujui/tolak, tandai lunas di tempat beserta metodenya, hadir/tidak datang, jadwal ulang dan tautan kabari pelanggan, batalkan; kode booking; voucher, tamu, dan meja bila ada; booking manual langsung terkonfirmasi dan dibayar di tempat | `booking-tabs`, `booking-search`, `new-booking` |
| `analytics` | `analitik/page.tsx` | Pendapatan yang benar-benar masuk (online dan di tempat), tingkat bayar, layanan terlaris; dihitung WIB dari booking terkonfirmasi atau dibayar; khusus Studio | `analytics-summary` |
| `services` | `services/*` | Nama, durasi, harga, deskripsi, galeri foto/video; empat cara bayar dan arti DP persen atau nominal; aktif/nonaktif; batas layanan paket Starter; jumlah tamu dan lama duduk untuk reservasi (F8) | `service-add`, `service-list` |
| `availability` | `availability/*` | Rentang jam per hari, rentang tidak boleh tumpang tindih, jam di luar rentang tidak bisa dipesan; staf punya jam sendiri di halaman Staf | `hours-days` |
| `floor_plan` | `denah/*` | Tiga pilihan: Mati, Total kursi per jam, Pakai denah meja; area dan meja di kanvas; bisa dipesan online; gabung meja; meja yang masih punya reservasi mendatang tidak bisa dihapus; hanya layanan reservasi yang memakainya | `dining-capacity`, `dining-editor` |
| `staff` | `staf/*`, `staff-profile-dialog.tsx` | Kalender dan jam kerja per staf; pelanggan memilih staf atau "Siapa saja"; profil: foto, peran, perkenalan, keahlian, klip pendek; khusus Studio | `staff-list` |
| `payments` | `payments/*` | Hubungkan Midtrans atau Xendit; uang pelanggan masuk langsung ke akun Anda, bukan ke Marky; status koneksi dan cara menyambung ulang; layanan bayar di tempat tidak butuh koneksi | `payment-providers` |
| `appearance` | `halaman/*` | Tema, warna, huruf, sudut, latar (termasuk bergerak), foto profil dan logo, sampul, gaya tombol, susunan bagian, FAQ; pratinjau sama dengan halaman publik; fitur yang khusus Pro/Studio | `appearance-editor`, `appearance-preview` |
| `promo` | `promosi/*` | Banner (maksimal 3 tayang bersamaan, tujuan tombol voucher/layanan/tautan); voucher publik atau rahasia, syarat (minimal transaksi, kuota, pelanggan baru, layanan tertentu, tanggal); DP dihitung dari harga setelah diskon; khusus Pro dan Studio | `promo-tabs` |
| `domain` | `domain/*` | Alamat sendiri, verifikasi lewat catatan TXT `_marky.<domain>` dan langkah DNS yang ditampilkan halaman; khusus Studio | `domain-form` |
| `billing` | `billing/page.tsx`, `src/lib/plans.ts` | Paket Starter, Pro, Studio dan bedanya (sebut dari halaman, bukan harga tertulis di panduan); terpisah dari pembayaran pelanggan | `billing-plans` |
| `settings` | `settings/*` | Profil publik dan WhatsApp; aturan bayar di tempat dan batas booking per nomor (F2); ubah jadwal dan batal oleh pelanggan, kontak, pengingat (F4); unduh data dan hapus akun | `settings-profile`, `settings-booking`, `settings-customer`, `settings-reminders`, `settings-account` |

- [ ] **Step 1: Tulis uji yang gagal** di `src/lib/guide/content.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHECKLIST_COPY, GUIDE_PAGES } from "./content";
import { CHECKLIST_ORDER, GUIDE_PAGE_KEYS } from "./guide";

const strings = (v: unknown): string[] =>
  typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(strings) : [];

describe("isi panduan", () => {
  it("setiap halaman dan langkah punya isi", () => {
    assert.deepEqual(Object.keys(GUIDE_PAGES).sort(), [...GUIDE_PAGE_KEYS].sort());
    assert.deepEqual(Object.keys(CHECKLIST_COPY).sort(), [...CHECKLIST_ORDER].sort());
    for (const [key, page] of Object.entries(GUIDE_PAGES)) {
      assert.ok(page.points.length >= 3 && page.points.length <= 7, key);
      assert.ok(page.tour.length > 0, key);
      if (key !== "today") assert.equal(page.tour[0].target, null, `${key}: langkah pertama ringkasan`);
    }
  });
  it("tanpa video karangan", () => {
    for (const page of Object.values(GUIDE_PAGES)) assert.equal(page.video, null);
  });
  it("tanpa karakter terlarang DESIGN.md dan tanpa URL", () => {
    for (const s of strings({ GUIDE_PAGES, CHECKLIST_COPY })) {
      assert.doesNotMatch(s, /[—–·→✓✕]|https?:\/\/|\bmenit\b/, s);
    }
  });
  it("kunci halaman sama dengan constraint migration", () => {
    const sql = readFileSync("supabase/migrations/20261121000100_onboarding_progress.sql", "utf8");
    const list = sql.match(/tours_seen <@ array\[([^\]]+)\]/)?.[1] ?? "";
    assert.deepEqual([...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort(), [...GUIDE_PAGE_KEYS].sort());
  });
});
```

  (`\bmenit\b` menolak perkiraan waktu, Keputusan 13. Bila sebuah halaman sungguh menegakkan batas dalam menit, mis. meja ditahan N menit di Denah, tulis tanpa angka atau pindahkan asersi ke daftar pengecualian bernama dengan komentar alasannya.)
- [ ] **Step 2: Jalankan** `npm run test:unit`. Harapan: gagal karena `./content` belum ada.
- [ ] **Step 3: Tulis** `src/lib/guide/content.ts` sesuai Cara menulis isi.
- [ ] **Step 4: Jalankan** `npm run test:unit && npm run typecheck && npm run lint`. Harapan: lulus.
- [ ] **Step 5: Commit**: `git add src/lib/guide/content.ts src/lib/guide/content.test.ts` lalu `git commit -m "Tulis isi panduan per halaman dan checklist memulai"`.

---

### Task 4: Komponen tur coachmark

Model: sonnet.

**Files:**
- Create: `src/components/guide/coachmark-tour.tsx`, `src/components/guide/coachmark-tour.stories.tsx`

**Interfaces:**
- Consumes: `TourStep`, `placeTip`, `Rect` (Task 2), `Dialog` dari `radix-ui` (`import { Dialog as DialogPrimitive } from "radix-ui"`), `useIsMobile` (`src/hooks/use-mobile.ts`), `Button`.
- Produces:

```ts
/** Elemen pertama ber-`data-tour` itu yang terlihat (getClientRects().length > 0), atau null. */
export function findTourTarget(target: string): HTMLElement | null;

export function CoachmarkTour(props: {
  steps: TourStep[];   // sudah disaring tourStepsFor; komponen tidak menyaring lagi
  open: boolean;
  onClose: () => void; // dipanggil oleh Selesai, Lewati, dan Esc
}): React.JSX.Element | null;
```

Ketentuan:
- `DialogPrimitive.Root` `open={open}` `onOpenChange={(o) => !o && onClose()}` `modal`. Indeks langkah di state lokal, kembali ke 0 tiap kali `open` berubah jadi `true`.
- Tiap langkah: `findTourTarget`, lalu `scrollIntoView({ block: isMobile ? "start" : "center", inline: "nearest" })` tanpa animasi, lalu ukur `getBoundingClientRect()`. Ukur ulang (lewat `requestAnimationFrame`) saat `resize` dan `scroll` (capture). Target yang hilang di tengah tur membuat langkah itu tampil di tengah tanpa sorotan, tidak membuat error.
- Sorotan: `div` `aria-hidden`, `fixed`, `pointer-events-none`, di rect target ditambah 4px, sudut `rounded-lg`, bayangan `0 0 0 3px` warna `background` dan `0 0 0 9999px` hitam 55%. Tanpa target: lapisan penuh hitam 55%. Transisi posisi hanya `motion-safe:`.
- Kartu (`DialogPrimitive.Content`, `aria-describedby` ke isi): desktop `fixed`, lebar 300px, `style={{ top, left }}` dari `placeTip(rect, ukuranKartu, ukuranLayar)` (ukur kartu lewat ref). HP: `fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))]` dan baris titik kemajuan (`aria-hidden`, hitam untuk langkah yang sudah dan sedang dilihat, `border` untuk sisanya).
- Isi kartu: "Langkah {n} dari {total}" (abu), `DialogPrimitive.Title` sebagai `h2`, `DialogPrimitive.Description` sebagai `p`, lalu tombol "Lewati tur" (desktop) atau "Lewati" (HP) varian ghost, "Kembali" outline (disabled di langkah pertama), dan tombol utama "Lanjut" atau "Selesai" di langkah terakhir. Semua `min-h-11`.
- Fokus: `onOpenAutoFocus` memindah fokus ke tombol utama. Wilayah `sr-only` `aria-live="polite"` berisi "Langkah {n} dari {total}: {title}" supaya pergantian langkah diumumkan. `onPointerDownOutside` dicegah (klik di luar tidak menutup; Esc dan Lewati yang menutup). Radix mengembalikan fokus ke elemen sebelumnya saat tutup.
- Tidak ada kunci panah atau gestur tambahan.
- Story (`Panduan/Tur`): halaman tiruan dengan tiga elemen ber-`data-tour` (`nav-today`, `nav-bookings`, `page-guide`) dan langkah dari `GUIDE_PAGES.today.tour` yang disaring `tourStepsFor`. Varian: `Desktop` (1280px), `HP` (viewport 390px), `TargetHilang` (satu target dihapus dari halaman tiruan, tur melewatinya), `TanpaTarget` (satu langkah `target: null`, kartu di tengah).

- [ ] **Step 1:** Tulis story lebih dulu, lalu komponen sampai keempat story benar di 390px dan 1280px.
- [ ] **Step 2: Verifikasi** di Storybook dengan keyboard saja: Tab hanya berputar di dalam kartu, Enter di Lanjut maju, Esc menutup, fokus kembali ke tombol pemicu story. Panel a11y Storybook tanpa pelanggaran. Emulasi `prefers-reduced-motion: reduce` membuat sorotan pindah tanpa transisi.
- [ ] **Step 3: Jalankan** `npm run typecheck && npm run lint`.
- [ ] **Step 4: Commit**: `git add src/components/guide` lalu `git commit -m "Tambah tur coachmark modal yang bisa dipakai dengan keyboard"`.

---

### Task 5: Provider, panel per halaman, dan tombol di header

Model: sonnet.

**Files:**
- Create: `src/app/dashboard/guide-actions.ts`, `src/components/guide/guide-provider.tsx`, `src/components/guide/page-guide-panel.tsx`, `src/components/guide/page-guide-button.tsx`, `src/components/guide/page-guide-panel.stories.tsx`
- Modify: `src/app/dashboard/queries.ts`, `src/app/dashboard/layout.tsx`, `src/components/layout/page-header.tsx`, `src/app/dashboard/setup-alerts.tsx`

**Interfaces:**
- Consumes: Task 1 RPC dan tipe, Task 2 (`buildChecklist`, `guidePageForPath`, `tourStepsFor`, `GUIDE_PAGE_KEYS`, `MANUAL_STEP_KEYS`, `OnboardingFacts`), Task 3 (`GUIDE_PAGES`, `CHECKLIST_COPY`), Task 4 (`CoachmarkTour`, `findTourTarget`), `useIsMobile`, `getQuotaUsage`, `requireMerchant`, `ROUTES`, shadcn `Sheet`.
- Produces:

```ts
// src/app/dashboard/guide-actions.ts ("use server")
export type GuideActionResult = { ok: boolean; message?: string };
export async function markGuideStep(step: ManualStepKey): Promise<GuideActionResult>;
export async function markGuideSeen(page: GuidePageKey): Promise<GuideActionResult>;
export async function setChecklistDismissed(dismissed: boolean): Promise<GuideActionResult>;

// src/app/dashboard/queries.ts
export type OnboardingState = {
  facts: OnboardingFacts;
  stepsCompleted: ManualStepKey[];
  toursSeen: GuidePageKey[];
  checklistDismissedAt: string | null;
};
export const getOnboardingState: () => Promise<OnboardingState | null>; // cache()

// src/components/guide/guide-provider.tsx ("use client")
export type GuideContextValue = {
  page: GuidePageKey | null;               // guidePageForPath(usePathname())
  isSeen: (page: GuidePageKey) => boolean;
  openPanel: () => void;
  startTour: (page: GuidePageKey) => void;
  checklistDismissed: boolean;
};
export function GuideProvider(props: {
  toursSeen: GuidePageKey[];
  checklistDismissed: boolean;
  children: React.ReactNode;
}): React.JSX.Element;
export function useGuide(): GuideContextValue | null; // null di luar provider

// src/components/guide/page-guide-panel.tsx ("use client")
export function PageGuidePanel(props: {
  page: GuidePageKey;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartTour: () => void;
  checklistDismissed: boolean;             // hanya dipakai untuk page === "today"
  onRestoreChecklist: () => Promise<GuideActionResult>;
}): React.JSX.Element;

// src/components/guide/page-guide-button.tsx ("use client")
export function PageGuideButton(): React.JSX.Element | null; // null bila useGuide() null atau page null
```

Ketentuan:
- **Server action:** validasi masukan dengan `z.enum([...MANUAL_STEP_KEYS])`, `z.enum([...GUIDE_PAGE_KEYS])`, `z.boolean()` (batas kepercayaan). Panggil `supabase.rpc("save_onboarding_progress", ...)` dengan hanya argumen yang relevan. Gagal: `console.error("[dashboard/guide] ...", { error })` lalu `{ ok: false, message: "Gagal menyimpan. Coba lagi." }`. `markGuideStep` dan `setChecklistDismissed` memanggil `revalidatePath(ROUTES.dashboard, "layout")`; `markGuideSeen` tidak (provider memegang keadaannya sendiri).
- **`getOnboardingState`:** `requireMerchant()` untuk `user.id`, `rpc("onboarding_state")`, ambil baris pertama, petakan snake_case ke `OnboardingState`. Error atau tanpa baris: `console.error` dengan `merchantId`, kembalikan `null` (Keputusan 17).
- **Layout:** `Promise.all([requireMerchant(), getTabCounts(), getOnboardingState()])`. Bungkus isi `SidebarProvider` (sidebar, inset, `MobileNav`) dengan `GuideProvider`, `toursSeen={state?.toursSeen ?? [...GUIDE_PAGE_KEYS]}`, `checklistDismissed={state ? state.checklistDismissedAt !== null : true}`.
- **Provider:** `seen` di state lokal (`Set`), diisi dari props. `openPanel()`: buka panel, tandai halaman dilihat (lokal + `markGuideSeen`, hasilnya diabaikan). `startTour(page)`: tutup panel bila terbuka, lalu pada frame berikutnya hitung `tourStepsFor(GUIDE_PAGES[page].tour, isMobile ? "mobile" : "desktop", (t) => findTourTarget(t) !== null)`; bila hasilnya kosong jangan buka. Tutup tur: tandai halaman dilihat (lokal + `markGuideSeen`). Provider merender `PageGuidePanel` (untuk `page` saat ini) dan `CoachmarkTour`. `onRestoreChecklist` memanggil `setChecklistDismissed(false)`.
- **Panel:** `Sheet` sisi kanan, `w-full sm:max-w-[380px]` (pastikan kelas lebar bawaan `Sheet` tertimpa). `SheetTitle` "Panduan: {title}", `SheetDescription` = `summary`, lalu `note` bila ada (abu), slot video (Keputusan 12: kotak `aspect-video` bergaris, ikon `Video` `aria-hidden`, teks "Video panduan belum tersedia."; bila `video` terisi, `<video controls preload="none">` dengan `<track kind="captions" srcLang="id" default>`), lalu `ol` poin dengan `term` tebal diikuti `text`, lalu tombol utama "Mulai tur halaman ini". Untuk `today` dengan `checklistDismissed`: tombol outline "Tampilkan lagi panduan memulai"; pesan gagal di bawahnya `role="alert"`.
- **Tombol:** di `PageHeader`, sebelum `action` (bungkus keduanya dalam satu `div flex gap-2`). Desktop: Button outline `h-11` dengan ikon `CircleHelp` dan teks "Panduan halaman ini". HP: `size-11` ikon saja dengan `sr-only` "Panduan halaman ini". Atribut `data-tour="page-guide"`. Bila `!isSeen(page)`: titik 8px `bg-primary` di pojok tombol, `aria-hidden`, plus teks `sr-only` ", belum dibuka". `PageHeader` tetap Server Component; hanya tombolnya klien.
- **`SetupAlerts`:** peringatan kuota tanpa perubahan. Daftar setup: ambil `getOnboardingState()`; tampil hanya bila `state` ada dan `checklistDismissedAt !== null`; isinya langkah `SERVICE`, `HOURS`, `PAYMENT` dari `buildChecklist` yang belum selesai, dengan label dan tautan dari `CHECKLIST_COPY` (`title`, `ctaHref`). Hapus query lama dan perbarui komentar kepala. Setelah itu `grep -rn "getServiceCount\|getActivePaymentConnections" src`; hapus keduanya dari `queries.ts` bila tidak ada pemakai lain.
- **Story** (`Panduan/Panel`): panel `services` (tanpa catatan paket), `staff` (dengan catatan Studio), dan `today` dengan `checklistDismissed`. Aksi palsu `async () => ({ ok: true })`.

- [ ] **Step 1:** Tulis `guide-actions.ts` dan `getOnboardingState`, lalu `npm run typecheck`.
- [ ] **Step 2:** Tulis provider, panel, tombol, dan story; pasang di layout dan `PageHeader`.
- [ ] **Step 3:** Ubah `SetupAlerts` sesuai Ketentuan.
- [ ] **Step 4: Verifikasi** `npm run typecheck && npm run lint && npm run test:unit`, lalu story panel di 390px dan 1280px: fokus terkunci di panel, Esc menutup, "Mulai tur halaman ini" menutup panel lalu memulai tur di halaman tiruan.
- [ ] **Step 5: Commit**: `git add src/app/dashboard/guide-actions.ts src/app/dashboard/queries.ts src/app/dashboard/layout.tsx src/app/dashboard/setup-alerts.tsx src/components/guide src/components/layout/page-header.tsx` lalu `git commit -m "Tambah panel Panduan halaman ini dan provider tur di dashboard"`.

---

### Task 6: Checklist "Panduan memulai" di Hari ini

Model: sonnet.

**Files:**
- Create: `src/app/dashboard/_today/getting-started.tsx`, `src/app/dashboard/_today/auto-start-tour.tsx`, `src/app/dashboard/_today/getting-started.stories.tsx`
- Modify: `src/app/dashboard/_today/sections.tsx`, `src/app/dashboard/page.tsx`, `src/app/dashboard/_today/copy-link-button.tsx`, `src/app/dashboard/_today/fixtures.ts`

**Interfaces:**
- Consumes: `getOnboardingState` (Task 5), `buildChecklist`, `ChecklistItem` (Task 2), `CHECKLIST_COPY` (Task 3), `markGuideStep`, `setChecklistDismissed`, `GuideActionResult` (Task 5), `useGuide` (Task 5), `ROUTES.merchantPage`.
- Produces:

```ts
// getting-started.tsx ("use client")
export function GettingStarted(props: {
  items: ChecklistItem[];
  pagePath: string; // "/<username>"
  onMarkStep: (step: ManualStepKey) => Promise<GuideActionResult>;
  onDismiss: () => Promise<GuideActionResult>;
}): React.JSX.Element;

// auto-start-tour.tsx ("use client")
/** Memulai tur halaman itu sekali saat mount bila belum dilihat. */
export function AutoStartTour(props: { page: GuidePageKey }): null;

// sections.tsx
export async function GettingStartedSection(): Promise<React.JSX.Element>;
export function GettingStartedSkeleton(): React.JSX.Element;

// copy-link-button.tsx: tanda tangan tetap; setelah salin berhasil memanggil markGuideStep("SHARE")
```

Ketentuan:
- **Section:** ambil `getOnboardingState()` dan `requireMerchant()`. `null`: teks netral "Gagal memuat panduan memulai. Muat ulang halaman." `role="alert"`, tanpa `AutoStartTour`. Checklist disembunyikan: hanya `<AutoStartTour page="today" />`. Selain itu `GettingStarted` (dengan `buildChecklist(state.facts, state.stepsCompleted)`, aksi `markGuideStep` dan `() => setChecklistDismissed(true)`) diikuti `AutoStartTour`. `AutoStartTour` sengaja dirender di dalam bagian ini supaya tur Hari ini baru mulai setelah kartu checklist (target `getting-started` di HP) ada di DOM.
- **Page:** setelah `SetupAlerts`, `<Suspense fallback={<GettingStartedSkeleton />}><GettingStartedSection /></Suspense>`, lalu `ProfileNudge` dan grid seperti sekarang.
- **Kartu** (`section` dengan `aria-labelledby`, `data-tour="getting-started"`, garis `border`, latar `card`):
  - Kepala: `h2` "Panduan memulai Marky", teks abu "{n} dari 6 selesai. Bisa dicicil." Tombol outline "Tur dashboard" (`useGuide()?.startTour("today")`, disembunyikan bila tidak ada provider) dan ghost "Sembunyikan" (memanggil `onDismiss`). Di HP kepala adalah satu `button` penuh lebar `aria-expanded` berisi "Panduan memulai", "{n} dari 6 selesai", dan ikon `ChevronDown`; daftar dan tombol kepala tampil hanya saat terbuka. Mulai `md` daftar selalu tampil dan tombol pembuka disembunyikan.
  - `div role="progressbar"` `aria-label="Kemajuan panduan memulai"` `aria-valuemin=0` `aria-valuemax=6` `aria-valuenow={n}`, batang hitam 4px di atas `muted`.
  - `ol` enam langkah. Tiap langkah `button` penuh lebar `aria-expanded` (`min-h-11`): lingkaran 24px berisi nomor (garis) atau ikon `Check` (latar hitam) dengan `sr-only` "Selesai:"; judul (dicoret dan abu bila selesai); teks "Selesai" abu di kanan bila selesai. Hanya satu langkah terbuka; awalnya langkah pertama yang belum selesai.
  - Isi langkah terbuka: `body`, lalu aksi. `ctaHref` terisi: `Link` outline `ctaLabel`. `BOOKING`: tautan ke `pagePath` di tab baru (`target="_blank" rel="noopener noreferrer"`). `SHARE`: tombol "Salin tautan" yang menyalin `${location.origin}${pagePath}`, menampilkan toast "Tautan disalin", lalu `onMarkStep("SHARE")`. Langkah `manual` yang belum selesai mendapat tombol ghost "Tandai selesai" (`onMarkStep(key)`).
  - Semua selesai: daftar diganti kalimat "Semua langkah selesai. Halaman Anda siap menerima booking." dengan tombol "Sembunyikan".
  - Aksi berjalan: tombolnya `disabled` dengan `useTransition`. Gagal: pesan dari hasil aksi di bawah tombol, `role="alert"`, tidak merah; langkah yang terbuka tetap terbuka.
- **`CopyLinkButton`:** setelah `writeText` berhasil, panggil `markGuideStep("SHARE")` tanpa menunggu dan tanpa pesan bila gagal (komentar satu baris: tanda ini opsional, salin tetap berhasil).
- **Fixtures dan story** (`Dashboard/Hari ini/Panduan memulai`): `Baru` (dua langkah selesai, dari `buildChecklist` dengan fakta sesudah wizard), `HampirSelesai` (lima selesai), `Selesai`, `HP` (viewport 390px, tertutup), `GagalSimpan` (aksi `async () => ({ ok: false, message: "Gagal menyimpan. Coba lagi." })`). Bungkus dengan `GuideProvider` ber-`toursSeen` semua kunci supaya tur tidak mulai.

- [ ] **Step 1:** Fixture dan story lebih dulu, lalu `GettingStarted` sampai kelima story benar di 390px dan 1280px.
- [ ] **Step 2:** `AutoStartTour`, section, page, dan `CopyLinkButton`.
- [ ] **Step 3: Verifikasi** `npm run typecheck && npm run lint && npm run test:unit`. Di Storybook dengan keyboard saja: buka tutup langkah, salin, Tandai selesai, Sembunyikan; panel a11y tanpa pelanggaran.
- [ ] **Step 4: Commit**: `git add src/app/dashboard/_today src/app/dashboard/page.tsx` lalu `git commit -m "Tambah checklist Panduan memulai di Hari ini"`.

---

### Task 7: Pasang target tur di semua halaman

Model: haiku (mekanis; uji lengkap di rencana).

**Files:**
- Modify: berkas di tabel di bawah, `src/lib/guide/content.test.ts`

**Interfaces:**
- Consumes: `TourTarget` (Task 2), `GUIDE_PAGES` (Task 3).
- Produces: atribut `data-tour="<target>"` di elemen berikut. Hanya tambah atribut; jangan ubah struktur, kelas, atau teks.

| Target | Berkas | Elemen |
|---|---|---|
| `page-link` | `src/components/layout/app-sidebar.tsx` | `SidebarMenuButton` tautan `/{username}` |
| `nav-today`, `nav-bookings` | `app-sidebar.tsx`, `src/components/layout/mobile-nav.tsx` | item Hari ini dan Booking di keduanya (di sidebar, ke `SidebarMenuButton` item itu; tambah properti `tour` di `NAV_GROUPS` bila perlu) |
| `new-booking` | `src/app/dashboard/page.tsx`, `mobile-nav.tsx` | tombol "Booking manual" di header dan tombol bulat tambah booking |
| `booking-tabs` | `src/app/dashboard/bookings/booking-tabs.tsx` | elemen `tablist` atau `nav` tab |
| `booking-search` | `src/app/dashboard/bookings/` (berkas form pencarian) | `input` pencarian |
| `analytics-summary` | `src/app/dashboard/analitik/page.tsx` | grid kartu ringkasan pertama |
| `service-add`, `service-list` | `services/add-service-button.tsx`, `services/services-table.tsx` | tombol tambah; wadah daftar |
| `hours-days` | `availability/page.tsx` | wadah kartu hari |
| `dining-capacity`, `dining-editor` | `denah/capacity-settings-form.tsx`, `denah/floor-plan-editor.tsx` | `form` kapasitas; wadah editor |
| `staff-list` | `staf/staff-manager.tsx` | wadah daftar staf |
| `payment-providers` | `payments/page.tsx` | wadah kartu provider |
| `appearance-editor`, `appearance-preview` | `halaman/appearance-editor.tsx`, `halaman/preview-frame.tsx` | kolom form; bingkai pratinjau |
| `promo-tabs` | `promosi/layout.tsx` | `nav` tab Banner/Voucher |
| `domain-form` | `domain/domain-manager.tsx` | `form` domain |
| `billing-plans` | `billing/page.tsx` | wadah kartu paket |
| `settings-profile`, `settings-booking`, `settings-customer`, `settings-reminders`, `settings-account` | `settings/settings-form.tsx`, `booking-settings-form.tsx`, `customer-policy-form.tsx`, `reminder-settings-form.tsx`, `account-section.tsx` | elemen terluar tiap bagian |

(`page-guide` sudah dipasang Task 5, `getting-started` Task 6.)

- [ ] **Step 1: Tambah uji yang gagal** di `content.test.ts`:

```ts
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(p) && !/\.stories\.tsx$/.test(p) ? [p] : [];
  });

it("setiap target tur terpasang di kode aplikasi", () => {
  const source = walk("src").map((p) => readFileSync(p, "utf8")).join("\n");
  const targets = new Set(Object.values(GUIDE_PAGES).flatMap((p) => p.tour.map((s) => s.target)).filter((t) => t !== null));
  // Menerima data-tour="x", data-tour={"x"}, dan properti tour: "x" / tour="x" (item nav yang dirender dari larik).
  for (const t of targets) assert.match(source, new RegExp(`tour\\s*[=:]\\s*\\{?["']${t}["']`), `target "${t}" tidak ditemukan`);
});
```

  (Story dikecualikan supaya halaman tiruan Task 4 tidak menutupi target yang hilang di aplikasi. Bila target diteruskan lewat properti, pastikan komponen penerimanya benar-benar merender `data-tour`; cek di browser Task 8.)
- [ ] **Step 2: Jalankan** `npm run test:unit`. Harapan: gagal dengan daftar target yang belum dipasang.
- [ ] **Step 3:** Pasang atribut sesuai tabel. Bila elemen di tabel tidak ada di kode (mis. pencarian berada di komponen lain), pasang di elemen setara terdekat yang terlihat dan sebutkan di laporan; jangan buat elemen baru.
- [ ] **Step 4: Jalankan** `npm run test:unit && npm run typecheck && npm run lint`. Harapan: lulus.
- [ ] **Step 5: Commit**: `git add` berkas di tabel yang diubah dan `src/lib/guide/content.test.ts`, lalu `git commit -m "Pasang target tur di semua halaman dashboard"`.

---

### Task 8: Verifikasi akhir dan dokumentasi (khusus controller)

Dikerjakan controller, bukan subagen.

- [ ] **Step 1:** `open -a Docker`, lalu `npm run docker:test`. Tidak ada baris `FAIL` di seluruh output, termasuk semua bagian lama dan 65 sampai 67.
- [ ] **Step 2:** `npm run check` lulus.
- [ ] **Step 3:** `npm run build-storybook` lulus; story `Panduan/Tur` (empat varian), `Panduan/Panel`, dan `Dashboard/Hari ini/Panduan memulai` ada.
- [ ] **Step 4: Pemeriksaan browser di aplikasi sungguhan dengan stack Supabase lokal** (bukan hanya Storybook). `npx supabase start` (bila `supabase/config.toml` belum ada, `npx supabase init` dulu dan jangan commit berkas itu kecuali memang diinginkan), `npx supabase db reset`, arahkan `.env.local` ke URL dan kunci lokal, lalu `npm run dev`. Di 390px dan 1280px:
  - Daftar akun baru, selesaikan wizard: Hari ini menampilkan checklist 2 dari 6 dan tur Hari ini mulai sendiri (G1 lima langkah di 1280, G2 empat langkah di 390 dengan kartu di atas nav bawah). Muat ulang: tur tidak mulai lagi.
  - Tur hanya dengan keyboard: Tab berputar di kartu, Enter maju, Kembali mundur, Esc menutup, fokus kembali, halaman bisa digulir lagi. Sembunyikan checklist lalu ulangi tur di 390: langkah checklist dilewati.
  - Checklist: tanpa menghubungkan gateway, ubah layanan ke Bayar di tempat, langkah pembayaran selesai; simpan Tampilan, langkah tampilan selesai; salin tautan (tombol HP dan tombol checklist), langkah bagikan selesai; pesan dari `/<username>` di tab lain, langkah booking selesai. Sembunyikan, lalu "Tampilkan lagi panduan memulai" dari panel Hari ini.
  - Setelah disembunyikan dengan langkah setup belum lengkap: `SetupAlerts` menampilkan daftar yang sama; merchant bayar di tempat saja tidak disuruh menghubungkan gateway.
  - Di setiap halaman (Hari ini, Booking, Booking manual, Analitik, Layanan, Jam buka, Denah meja, Staf, Pembayaran, Tampilan, Promosi dan Voucher, Domain, Langganan, Pengaturan): tombol panduan ada dengan titik penanda sampai dibuka, panel membuka dengan isi yang cocok dengan halaman itu (baca setiap poin terhadap layar), slot video bertuliskan "Video panduan belum tersedia.", dan "Mulai tur halaman ini" menyorot elemen yang benar. Akun Starter: tur Staf, Domain, Analitik, dan Promosi hanya menampilkan langkah ringkasan.
  - Akun kedua di jendela samaran tidak mewarisi progres akun pertama.
  - Di semua tampilan baru: target sentuh 44px atau lebih, fokus terlihat, tidak ada em dash, en dash, `·`, panah, atau angka waktu, tidak ada warna merah.
  Hentikan stack lokal setelah selesai (`npx supabase stop`).
- [ ] **Step 5:** Tambah `## <nomor berikutnya setelah F8>. Panduan merchant baru` di `docs/DECISIONS.md` (Keputusan 2, 3, 5, 7, 8, 12, 13, 15 dengan alasannya). Perbarui bagian Status di `AGENTS.md` dengan satu paragraf F9: checklist "Panduan memulai" di Hari ini dihitung dari data lewat `onboarding_state()` (aturan di `src/lib/guide/guide.ts`), progres di `merchant_onboarding_progress` yang hanya ditulis `save_onboarding_progress`, tur coachmark Radix `Dialog` dengan target `data-tour`, panel "Panduan halaman ini" di setiap halaman dashboard, semua teks di `src/lib/guide/content.ts` (wajib diperbarui saat halaman berubah; uji `content.test.ts` memeriksa target). Perbarui baris F9 di `docs/superpowers/plans/2026-11-14-marky-roadmap.md` (rencana `2026-11-15-marky-f9-panduan.md`, status selesai). Jalankan `graphify update .`.
- [ ] **Step 6: Commit**: `git add docs/DECISIONS.md AGENTS.md docs/superpowers/plans/2026-11-14-marky-roadmap.md` lalu `git commit -m "Catat F9 selesai di keputusan, status, dan roadmap"`. `graphify-out/` ikut di-stage bila cabang ini memang meng-commit-nya.

## Urutan eksekusi

1, 2, 3, 4, 5, 6, 7, 8. Task 3 butuh tipe Task 2. Task 5 merender tur Task 4 dan isi Task 3. Task 6 memakai provider dan aksi Task 5. Task 7 terakhir karena target `page-guide` dan `getting-started` baru ada setelah Task 5 dan 6, dan uji kehadiran target memerlukan semuanya.
