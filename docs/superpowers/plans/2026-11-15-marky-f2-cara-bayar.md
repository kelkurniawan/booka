# F2 Cara bayar per layanan: rencana implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tiap layanan punya cara bayar sendiri (`FULL`, `DEPOSIT`, `ON_SITE`, `REQUEST`), dengan bayar di tempat, alur ajukan lalu setujui, dan status booking baru `CONFIRMED` dan `REQUESTED`, tanpa mengubah perilaku merchant yang tidak menyentuh pengaturan ini.

**Architecture:** Skema dulu: nilai enum baru di migration tersendiri, lalu kolom, `merchant_settings`, dan satu fungsi `booking_holds_slot()` yang dipakai semua pembaca slot supaya constraint, slot publik, kuota, staf "siapa saja", dan pembersih kedaluwarsa sepakat. `create_booking` menghitung cara bayar efektif dan nominal di server. Keputusan merchant (setujui, tolak, lunas di tempat, hadir, tidak datang) lewat tiga RPC `security definer` berbasis `auth.uid()`. Di TypeScript, satu modul murni `src/lib/booking/payment-mode.ts` mencerminkan aturan yang sama untuk label dan ringkasan. Pembuatan charge QRIS dipindah ke satu helper yang dipakai `POST /api/bookings` dan rute bayar baru untuk permintaan yang disetujui.

**Tech Stack:** Postgres (migration Supabase, uji `npm run docker:test`), Next.js 16 App Router, React 19, Zod, `node:test` lewat tsx, Storybook 10.

**Spec:** `docs/superpowers/specs/2026-11-14-marky-redesign-design.md` bagian 1, 2, 5 (F2), 6, 7. Arah visual: `DESIGN.md`. Artboard: M1 (`CaraBayar.dc.html`), M4 bagian "Booking tanpa bayar" (`Pengaturan.dc.html`), 03b (`DataDiriTempat.dc.html`), 05b (`SelesaiTempat.dc.html`), teks DP dari `DataDiri.dc.html` dan `Bayar.dc.html`. Teks artboard: `python3 .superpowers/design/extract.py .superpowers/design/app/<file>`.

## Keputusan (spec diam, diputuskan di sini)

1. Tidak ada feature flag terpisah. `services.payment_mode` default `FULL` adalah sakelarnya (spec bagian 3).
2. `REQUEST` boleh punya DP opsional (kolom DP yang sama). Diisi: setelah disetujui pelanggan membayar DP, sisanya di tempat. Kosong: tagihan penuh. Ini menjembatani teks M1 "tautan bayar DP".
3. Menyetujui permintaan tidak langsung membuat QRIS. Status jadi `PENDING` dengan `expires_at = least(now() + 24 jam, start_datetime)` dan `payment_url` kosong. QRIS dibuat saat pelanggan menekan Bayar di `/pesanan/[token]`, dan saat itu tenggat dipendekkan ke `least(expires_at, now() + 15 menit)`. Alasan: QR gateway kedaluwarsa sendiri (Midtrans sekitar 15 menit) dan satu booking hanya boleh punya satu `order_id`.
4. `ON_SITE` dengan `auto_confirm_on_site = false` menjadi `REQUESTED` dengan aturan 24 jam yang sama; disetujui menjadi `CONFIRMED`.
5. `merchant_settings`: satu baris per merchant, dibuat trigger dan di-backfill. Default `allow_pay_on_site = true`, `auto_confirm_on_site = true`, `max_active_per_phone = 2` (spec bagian 6 butir 3), `deposit_after_no_show = false`. `max_active_per_phone` null berarti tanpa batas, selain itu 1 sampai 10.
6. Batas booking aktif per nomor hanya ditegakkan untuk booking yang efektifnya `ON_SITE` atau `REQUEST` (booking tanpa bayar di muka). Yang dihitung: booking nomor itu di merchant itu yang memegang slot dan `end_datetime > now()`.
7. Nomor yang pernah `no_show_at` (bila `deposit_after_no_show` aktif): layanan `ON_SITE` jatuh ke `FULL`, karena layanan bayar di tempat tidak punya konfigurasi DP. Teks UI "wajib bayar di muka", bukan "wajib bayar DP".
8. `REQUESTED.expires_at = least(now() + 24 jam, start_datetime)`.
9. Memegang slot: `PAID` dan `CONFIRMED` selalu; `PENDING` dan `REQUESTED` selama `expires_at > now()`. Constraint eksklusi mencakup keempatnya (baris kedaluwarsa dibersihkan inline sebelum insert, seperti sekarang).
10. Kuota bulanan menghitung keempat status dengan aturan yang sama.
11. Hadir boleh ditandai mulai `start_datetime - 1 jam`, Tidak datang mulai `start_datetime`; keduanya saling meniadakan dan bisa ditukar. Lunas di tempat tidak bisa dibatalkan di F2.
12. Notifikasi baru: `BOOKING_CONFIRMED_MERCHANT`, `BOOKING_CONFIRMED_CUSTOMER`, `BOOKING_REQUESTED_MERCHANT`, `BOOKING_APPROVED_CUSTOMER`, `BOOKING_REJECTED_CUSTOMER`. Permintaan yang kedaluwarsa otomatis tidak mengirim pesan.
13. Pendapatan (kartu ringkasan dan Analitik) = uang yang benar-benar masuk: `amount_due_now` booking `PAID` menurut `paid_at`, ditambah `amount_due_on_site` menurut `paid_on_site_at`.
14. Booking `CONFIRMED` tidak butuh koneksi payment. Booking yang perlu membayar online (`PENDING`, atau `REQUEST` dengan `amount_due_now > 0`) butuh koneksi ACTIVE saat dibuat (errcode `BK021`).
15. DP `PERCENT` 1 sampai 90, `FIXED` minimal 1 dan kurang dari harga. Pembulatan ke rupiah utuh, setengah ke atas (`round()` Postgres = `Math.round` untuk nilai positif).
16. Label cara bayar dari M1: `Lunas di muka`, `DP 30% di muka` / `DP Rp100.000 di muka`, `Bayar di tempat`, `Ajukan dulu`.
17. Teks yang menjanjikan fitur F4 atau konfigurasi yang belum tentu ada tidak dipakai: pengingat H-1, "lewat WhatsApp", "tunai atau QRIS", kode booking, Ubah atau batalkan booking.
18. Constraint `amount_due_now + amount_due_on_site = service_price` berlaku di F2; F5 (voucher) wajib menggantinya.

## Pembaca status `PAID`/`PENDING` dan keputusannya

| Berkas | Keputusan | Task |
|---|---|---|
| `init_schema.sql` `bookings_no_overlap` (versi terakhir di `20261005180027_staff.sql`) | Dibuat ulang dengan empat status | 1 |
| `count_bookings_this_month` (`20260813051417_reap_expired_pending_inline.sql`) | Pakai `booking_holds_slot` | 1 |
| `get_booked_ranges` (`20261005180027_staff.sql`) | Pakai `booking_holds_slot` | 1 |
| `reap_expired_bookings` (`20260818095349_harden_booking_abuse.sql`) | Juga membatalkan `REQUESTED` kedaluwarsa | 1 |
| `dashboard_booking_summary` (`20260819000400_dashboard_perf.sql`) | Pendapatan per Keputusan 13; `pending_count` tetap | 1 |
| Policy `bookings_cancel_own` (`20260819000200_bookings_merchant_cancel.sql`) | USING mencakup `CONFIRMED`, `REQUESTED` | 1 |
| `create_booking` (`20261005180027_staff.sql`) | Ditulis ulang | 2 |
| `notification_log` enum `notification_kind` | Lima nilai baru | 1 |
| `src/app/api/bookings/route.ts` | Charge hanya bila `PENDING`, nominal `amount_due_now` | 5 |
| `src/app/api/webhooks/[provider]/route.ts`, `src/lib/payments/webhook-status.ts` | Tidak berubah. Permintaan disetujui adalah `PENDING`, jadi `PENDING -> PAID` tetap satu-satunya transisi webhook | – |
| `src/app/api/cron/cancel-unpaid/route.ts` | Tidak berubah (spec: hanya `PENDING`). `REQUESTED` kedaluwarsa dibersihkan `reap_expired_bookings` dan inline, dan semua pembaca sudah menganggapnya kedaluwarsa | – |
| `src/app/api/bookings/[id]/status/route.ts` | Tidak berubah, mengembalikan status apa adanya | – |
| `src/lib/notify/dispatch.ts`, `templates.ts` | Nominal DP/sisa, pengingat juga untuk `CONFIRMED`, notifikasi baru | 6 |
| `src/app/dashboard/bookings/booking-state.ts` | `STATUS_META` dua status baru (Task 1), `getDisplayStatus` dan kolom (Task 9) | 1, 9 |
| `src/app/dashboard/bookings/actions.ts`, `booking-detail-dialog.tsx`, `bookings-table.tsx`, `bookings-filters.tsx`, `src/lib/validations/booking.ts` | Aksi baru, filter dua status baru | 9 |
| `src/app/dashboard/bookings/notification-history.tsx` | Label lima jenis baru | 1 |
| `src/app/dashboard/bookings/bookings-summary.tsx` | Tidak berubah (angka dari RPC) | – |
| `src/app/dashboard/upcoming-bookings.tsx` | `PAID` dan `CONFIRMED` | 10 |
| `src/app/dashboard/settings/account-actions.ts` | Penjaga hapus akun: `PAID`/`CONFIRMED` mendatang, `PENDING`/`REQUESTED` hidup | 10 |
| `src/lib/analytics/aggregate.ts`, `src/app/dashboard/analitik/page.tsx` | Keputusan 13; `CONFIRMED` dihitung terkonfirmasi | 10 |
| `src/app/dashboard/settings/ekspor/route.ts` | Ekspor kolom baru dan `merchant_settings` | 10 |
| `src/app/pesanan/[token]/page.tsx`, `booking-status-view.tsx`, `booking-live-status.tsx`, stories | Tampilan `CONFIRMED`, `REQUESTED`, disetujui, ditolak, DP | 8 |
| `src/components/booking-page/fixtures.ts` | Kolom baru (Task 1), contoh per cara bayar (Task 8) | 1, 8 |
| `src/types/database.ts` | Task 1 dan 3 | 1, 3 |

## Global Constraints

- Migration baru saja, nama berurutan setelah `20261114000100`: `20261115000100_booking_status_values.sql`, `20261115000200_payment_modes.sql`, `20261115000300_create_booking_payment_modes.sql`, `20261115000400_merchant_booking_actions.sql`. Jangan edit migration lama.
- `ALTER TYPE ... ADD VALUE` hanya di `20261115000100`. Tidak ada statement lain yang memakai nilai baru di file itu.
- Tabel baru: `revoke all ... from anon, authenticated` lalu grant per kolom. Fungsi baru: `revoke execute ... from public, anon, authenticated`, lalu `grant execute` eksplisit hanya ke peran yang memang memanggil.
- `src/types/database.ts` memakai `type`, bukan `interface`.
- Setiap task migration menambah kasus ke `supabase/tests/99_verify.sql` dan lulus `npm run docker:test` (Docker harus jalan: `open -a Docker`). Lulus berarti tidak ada baris output yang diawali `FAIL`.
- Uang DP selalu langsung ke akun gateway merchant lewat adapter yang ada. Tidak ada saldo, dompet, atau penampungan di platform.
- Perilaku lama tetap default: layanan tanpa perubahan = `FULL`, `PENDING`, QRIS penuh, 15 menit.
- `createAdminClient()` selalu difilter `merchant_id` (atau `access_token` lalu `merchant_id`).
- Halaman publik dan `src/components/booking-page/*` hanya memakai token tema. Dashboard tetap monokrom (`DESIGN.md` bagian 1).
- Larangan `DESIGN.md`: tanpa em dash, tanpa eyebrow, tanpa label kapital berjarak, tanpa `·` sebagai pemisah, tanpa panah di teks tombol. Target sentuh 44px, fokus terlihat.
- UI dan komentar berbahasa Indonesia, nama variabel Inggris.
- Tidak ada langkah deploy produksi.

## Review Focus

1. Merchant mematikan "bayar di tempat" saat pelanggan sudah di langkah 3 dengan label `Bayar di tempat`: server jatuh ke `FULL`, pelanggan mendarat di halaman bayar QRIS, tidak pernah ada `CONFIRMED` tanpa izin. Diuji t33e dan alur Task 8 selalu mengikuti `bookingUrl`.
2. Pelanggan menekan Bayar dua kali atau di dua tab untuk permintaan yang disetujui: paling banyak satu charge tersimpan, panggilan kedua mendapat QR yang sudah ada. Diuji `payDecision` di Task 5.
3. Permintaan untuk jadwal kurang dari 24 jam lagi: tenggatnya jadwal itu sendiri, dan persetujuan setelah lewat ditolak dengan pesan jelas. Diuji t33k dan t34d.
4. Batas booking aktif per nomor tidak menghitung booking yang sudah lewat atau sudah batal, dan tidak membatasi booking berbayar penuh. Diuji t33h.
5. Harga layanan diturunkan di bawah DP nominal: penyimpanan ditolak dengan pesan ramah, booking lama tetap memakai nominal snapshot. Diuji t32a dan `service.test.ts`.

---

### Task 1: Skema cara bayar dan kesepakatan pemegang slot

Model: sonnet.

**Files:**
- Create: `supabase/migrations/20261115000100_booking_status_values.sql`, `supabase/migrations/20261115000200_payment_modes.sql`
- Modify: `supabase/tests/99_verify.sql` (bagian baru `-- 32. Cara bayar: skema (20261115000200)`)
- Modify: `src/types/database.ts`, `src/app/dashboard/bookings/booking-state.ts` (`STATUS_META` saja), `src/app/dashboard/bookings/notification-history.tsx` (label saja), `src/components/booking-page/fixtures.ts` (kolom baru di `Service`)

**Interfaces:**
- Produces (SQL):
  - `booking_status` + `'CONFIRMED'`, `'REQUESTED'`; `notification_kind` + `'BOOKING_CONFIRMED_MERCHANT'`, `'BOOKING_CONFIRMED_CUSTOMER'`, `'BOOKING_REQUESTED_MERCHANT'`, `'BOOKING_APPROVED_CUSTOMER'`, `'BOOKING_REJECTED_CUSTOMER'`.
  - Tipe `public.payment_mode ('FULL','DEPOSIT','ON_SITE','REQUEST')`, `public.deposit_type ('PERCENT','FIXED')`, `public.on_site_payment_method ('CASH','QRIS','TRANSFER')`.
  - `services.payment_mode payment_mode not null default 'FULL'`, `services.deposit_type deposit_type`, `services.deposit_value integer`.
  - `bookings.payment_mode payment_mode not null default 'FULL'`, `amount_due_now numeric(12,2) not null`, `amount_due_on_site numeric(12,2) not null default 0`, `paid_on_site_at timestamptz`, `paid_on_site_method on_site_payment_method`, `attended_at timestamptz`, `no_show_at timestamptz`.
  - Tabel `public.merchant_settings(merchant_id pk, allow_pay_on_site, auto_confirm_on_site, max_active_per_phone, deposit_after_no_show, created_at, updated_at)`.
  - `public.booking_holds_slot(p_status public.booking_status, p_expires_at timestamptz) returns boolean`, internal.
  - Teks `cancel_reason` baru: `'Permintaan tidak dijawab dalam batas waktu'`.
- Produces (TS, `src/types/database.ts`):
  - `BookingStatus = "PENDING" | "PAID" | "CANCELLED" | "CONFIRMED" | "REQUESTED"`
  - `PaymentMode = "FULL" | "DEPOSIT" | "ON_SITE" | "REQUEST"`, `DepositType = "PERCENT" | "FIXED"`, `OnSitePaymentMethod = "CASH" | "QRIS" | "TRANSFER"`
  - `Service` + `payment_mode: PaymentMode; deposit_type: DepositType | null; deposit_value: number | null`
  - `Booking` + `payment_mode: PaymentMode; amount_due_now: number; amount_due_on_site: number; paid_on_site_at: string | null; paid_on_site_method: OnSitePaymentMethod | null; attended_at: string | null; no_show_at: string | null`
  - `MerchantSettings = { merchant_id: string; allow_pay_on_site: boolean; auto_confirm_on_site: boolean; max_active_per_phone: number | null; deposit_after_no_show: boolean; created_at: string; updated_at: string }`, tabel `merchant_settings` dengan `Update: Partial<Pick<MerchantSettings, "allow_pay_on_site" | "auto_confirm_on_site" | "max_active_per_phone" | "deposit_after_no_show">>`
  - `NotificationKind` + lima nilai di atas; `Enums` + `payment_mode`, `deposit_type`, `on_site_payment_method`.
  - `services.Insert`: tiga kolom baru opsional (mereka punya default atau nullable).

- [ ] **Step 1: Tulis kasus uji yang gagal** di bagian 32 `99_verify.sql`. Siapkan merchant PRO `32323232-0000-0000-0000-000000000001` (username `cara-bayar-32`, jam kerja tiap hari 09:00 sampai 17:00) dan merchant kedua `...0002`. Kasus (label diawali `t32`):
  - t32a constraint layanan, masing-masing `expect_fail_code(..., '23514', ...)`: `DEPOSIT` tanpa DP; `PERCENT` 95; `PERCENT` 0; `FIXED` 350000 untuk harga 350000; `FULL` dengan DP terisi; `deposit_type` tanpa `deposit_value`. `expect_ok`: `DEPOSIT PERCENT 30`, `REQUEST` tanpa DP, `REQUEST FIXED 100000`, `ON_SITE` tanpa DP. Plus: update harga layanan `FIXED 100000` jadi 90000 ditolak `23514`.
  - t32b insert booking langsung tanpa kolom nominal: `amount_due_now = service_price`, `amount_due_on_site = 0`, `payment_mode = 'FULL'`.
  - t32c `amount_due_now = 100, amount_due_on_site = 0` untuk harga 350000 ditolak `23514`; `paid_on_site_method` tanpa `paid_on_site_at` ditolak `23514`; `attended_at` dan `no_show_at` sekaligus ditolak `23514`.
  - t32d booking `CONFIRMED` dan `REQUESTED` (belum kedaluwarsa) masing-masing membuat insert `PENDING` yang beririsan ditolak `23P01`.
  - t32e kesepakatan pemegang slot: satu `REQUESTED` dengan `expires_at = now() - interval '1 minute'` dan satu `CONFIRMED`. `get_booked_ranges('cara-bayar-32', ...)` memuat yang `CONFIRMED` dan tidak memuat yang `REQUESTED` kedaluwarsa; `count_bookings_this_month` menghitung `CONFIRMED` dan tidak menghitung `REQUESTED` kedaluwarsa; `booking_holds_slot('REQUESTED', now() + interval '1 hour')` true, `booking_holds_slot('CANCELLED', now() + interval '1 hour')` false.
  - t32f `select public.reap_expired_bookings()` mengubah `REQUESTED` kedaluwarsa jadi `CANCELLED` dengan `cancel_reason = 'Permintaan tidak dijawab dalam batas waktu'` dan tidak menyentuh `CONFIRMED`.
  - t32g `merchant_settings`: merchant baru (insert `auth.users`) langsung punya baris dengan nilai default Keputusan 5; jumlah baris `merchant_settings` = jumlah `merchants`; `max_active_per_phone = 0` ditolak `23514`.
  - t32h hak akses, pola `has_column_privilege`/`has_table_privilege`/`has_function_privilege` seperti t31h: anon bisa SELECT `allow_pay_on_site` dan `auto_confirm_on_site`, tidak bisa SELECT `max_active_per_phone` dan `deposit_after_no_show`, tidak bisa INSERT/UPDATE; authenticated bisa UPDATE `allow_pay_on_site`, tidak bisa UPDATE `merchant_id`, tidak bisa INSERT; anon dan authenticated tidak bisa EXECUTE `booking_holds_slot(booking_status, timestamptz)`.
  - t32i sebagai `authenticated` merchant `...0001` (pola `begin; set local role authenticated; set local request.jwt.claim.sub = ...`): update `merchant_settings` milik `...0002` mengubah 0 baris; membatalkan booking `CONFIRMED` miliknya sendiri berhasil; `rollback`.
  - t32j `dashboard_booking_summary()` sebagai merchant: `confirmed_revenue` = `amount_due_now` booking `PAID` (DP 105000, `paid_at = now()`) + `amount_due_on_site` booking `CONFIRMED` dengan `paid_on_site_at = now()` (450000) = 555000.
- [ ] **Step 2: Jalankan** `npm run docker:test`. Harapan: baris `FAIL` di bagian 32 (kolom dan tabel belum ada).
- [ ] **Step 3: Tulis `20261115000100_booking_status_values.sql`**: komentar satu baris kenapa file ini berdiri sendiri, lalu tujuh `alter type ... add value if not exists ...` (dua `booking_status`, lima `notification_kind`). Tidak ada statement lain.
- [ ] **Step 4: Tulis `20261115000200_payment_modes.sql`** dengan bagian berikut, persis untuk constraint dan predikat:

```sql
create type public.payment_mode as enum ('FULL', 'DEPOSIT', 'ON_SITE', 'REQUEST');
create type public.deposit_type as enum ('PERCENT', 'FIXED');
create type public.on_site_payment_method as enum ('CASH', 'QRIS', 'TRANSFER');

alter table public.services
  add column payment_mode public.payment_mode not null default 'FULL',
  add column deposit_type public.deposit_type,
  add column deposit_value integer,
  add constraint services_deposit_pair check ((deposit_type is null) = (deposit_value is null)),
  add constraint services_deposit_required check (payment_mode <> 'DEPOSIT' or deposit_type is not null),
  add constraint services_deposit_allowed check (deposit_type is null or payment_mode in ('DEPOSIT', 'REQUEST')),
  add constraint services_deposit_percent_range check (deposit_type is distinct from 'PERCENT' or deposit_value between 1 and 90),
  add constraint services_deposit_fixed_range check (deposit_type is distinct from 'FIXED' or (deposit_value >= 1 and deposit_value < price));

alter table public.bookings
  add column payment_mode public.payment_mode not null default 'FULL',
  add column amount_due_now numeric(12, 2),
  add column amount_due_on_site numeric(12, 2) not null default 0,
  add column paid_on_site_at timestamptz,
  add column paid_on_site_method public.on_site_payment_method,
  add column attended_at timestamptz,
  add column no_show_at timestamptz;
update public.bookings set amount_due_now = service_price;
alter table public.bookings alter column amount_due_now set not null;
alter table public.bookings
  -- F5 (voucher) wajib mengganti constraint ini: diskon mengubah jumlahnya.
  add constraint bookings_amount_split check (
    amount_due_now >= 0 and amount_due_on_site >= 0
    and amount_due_now + amount_due_on_site = service_price),
  add constraint bookings_paid_on_site_pair check ((paid_on_site_at is null) = (paid_on_site_method is null)),
  add constraint bookings_attendance_exclusive check (attended_at is null or no_show_at is null);
```

  Sisa isi file:
  - Trigger `bookings_fill_amounts` (`before insert`, fungsi `public.fill_booking_amounts()` biasa, bukan `security definer` karena hanya mengubah `new`, `set search_path = ''`): `new.amount_due_now := coalesce(new.amount_due_now, new.service_price - new.amount_due_on_site)`. Supaya insert lama (tes, jalur lain) tetap sah.
  - Index `bookings_requested_expiry_idx on public.bookings (expires_at) where status = 'REQUESTED'` dan `bookings_merchant_phone_idx on public.bookings (merchant_id, customer_whatsapp)`.
  - `bookings_no_overlap` di-drop lalu dibuat ulang persis seperti di `20261005180027_staff.sql`, dengan `where (status in ('PENDING', 'PAID', 'CONFIRMED', 'REQUESTED'))`.
  - Tabel `merchant_settings` per Keputusan 5, constraint `merchant_settings_max_active_range check (max_active_per_phone is null or max_active_per_phone between 1 and 10)`, trigger `set_updated_at`, RLS aktif, `revoke all ... from anon, authenticated`, `grant select (merchant_id, allow_pay_on_site, auto_confirm_on_site) ... to anon`, `grant select ... to authenticated`, `grant update (allow_pay_on_site, auto_confirm_on_site, max_active_per_phone, deposit_after_no_show) ... to authenticated`. Policy: `merchant_settings_public_read` (anon, merchant punya `username`, pola `staff_public_read`), `merchant_settings_read_own`, `merchant_settings_update_own` (USING dan WITH CHECK `(select auth.uid()) = merchant_id`). Backfill `insert ... select id from public.merchants on conflict do nothing`. Trigger `merchants_create_settings` (`after insert on public.merchants`, fungsi `security definer` yang menyisipkan baris default).
  - Fungsi pemegang slot, satu sumber kebenaran:

```sql
create or replace function public.booking_holds_slot(p_status public.booking_status, p_expires_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_status in ('PAID', 'CONFIRMED')
      or (p_status in ('PENDING', 'REQUESTED') and p_expires_at > now());
$$;
```

  - `count_bookings_this_month` dan `get_booked_ranges` (signature dan tipe kembalian sama, `create or replace`) memakai `public.booking_holds_slot(b.status, b.expires_at)` menggantikan predikat status lama.
  - `reap_expired_bookings()`: update `where status in ('PENDING', 'REQUESTED') and expires_at <= now()`, `cancel_reason = case when status = 'REQUESTED' then 'Permintaan tidak dijawab dalam batas waktu' else 'DP tidak dibayar dalam batas waktu' end`. Pembersihan `booking_attempts` tetap.
  - `dashboard_booking_summary()`: `confirmed_revenue` jadi jumlah `case when b.status = 'PAID' and b.paid_at >= <awal bulan WIB> then b.amount_due_now else 0 end + case when b.paid_on_site_at >= <awal bulan WIB> then b.amount_due_on_site else 0 end` untuk `b.status in ('PAID', 'CONFIRMED')`. Ekspresi awal bulan sama dengan yang ada. Kolom lain tetap.
  - Policy `bookings_cancel_own` di-drop dan dibuat ulang dengan USING `status in ('PENDING', 'PAID', 'CONFIRMED', 'REQUESTED')`, WITH CHECK tetap `status = 'CANCELLED'`.
  - Semua fungsi baru: `revoke execute ... from public, anon, authenticated`. Grant yang sudah ada pada fungsi yang di-`create or replace` tetap (cek ulang di t32h). Akhiri dengan `notify pgrst, 'reload schema';`.
- [ ] **Step 5: Jalankan** `npm run docker:test`. Harapan: tidak ada baris `FAIL`, termasuk bagian lama 11, 16, 17, 18, 30.
- [ ] **Step 6: Perbarui tipe** sesuai Interfaces. Agar `npm run typecheck` tetap hijau: `STATUS_META` + `CONFIRMED: { label: "Terkonfirmasi", badgeVariant: "default" }` dan `REQUESTED: { label: "Perlu persetujuan", badgeVariant: "secondary" }`; label `notification-history.tsx`: `BOOKING_CONFIRMED_MERCHANT` "Pemberitahuan ke Anda", `BOOKING_CONFIRMED_CUSTOMER` "Konfirmasi ke pelanggan", `BOOKING_REQUESTED_MERCHANT` "Permintaan ke Anda", `BOOKING_APPROVED_CUSTOMER` "Tautan bayar ke pelanggan", `BOOKING_REJECTED_CUSTOMER` "Penolakan ke pelanggan"; pembuat `Service` di `fixtures.ts` mengisi `payment_mode: "FULL", deposit_type: null, deposit_value: null`. Pemakai lain yang gagal karena union status melebar cukup dilebarkan tipenya ke `BookingStatus` tanpa mengubah perilaku.
- [ ] **Step 7: Verifikasi**: `npm run typecheck && npm run test:unit` lulus.
- [ ] **Step 8: Commit**: `git add supabase/migrations/20261115000100_booking_status_values.sql supabase/migrations/20261115000200_payment_modes.sql supabase/tests/99_verify.sql src/types/database.ts src/app/dashboard/bookings/booking-state.ts src/app/dashboard/bookings/notification-history.tsx src/components/booking-page/fixtures.ts` lalu `git commit -m "Tambah skema cara bayar, merchant_settings, dan status booking CONFIRMED/REQUESTED"`.

---

### Task 2: `create_booking` menghitung cara bayar dan nominal

Model: opus (uang dan kunci konkurensi).

**Files:**
- Create: `supabase/migrations/20261115000300_create_booking_payment_modes.sql`
- Modify: `supabase/tests/99_verify.sql` (bagian `-- 33. create_booking cara bayar (20261115000300)`), `src/types/database.ts` (`Args` `create_booking`)

**Interfaces:**
- Consumes: semua keluaran Task 1.
- Produces:

```sql
drop function public.create_booking(uuid, uuid, timestamptz, text, text, uuid);
create or replace function public.create_booking(
  p_merchant_id uuid,
  p_service_id uuid,
  p_start_datetime timestamptz,
  p_customer_name text,
  p_customer_whatsapp text,
  p_staff_id uuid default null,
  -- false bila merchant tidak punya koneksi payment ACTIVE.
  p_can_charge boolean default true
) returns setof public.bookings
-- security definer, set search_path = '', hanya service_role yang boleh EXECUTE.
```

  - errcode `BK020` (batas booking aktif per nomor), `BK021` (perlu pembayaran online tapi `p_can_charge` false).
  - TS `Args` + `p_can_charge?: boolean`.

Aturan (urutan penting, semua di bawah `pg_advisory_xact_lock` yang sama):
1. Bersihkan inline `PENDING` dan `REQUESTED` kedaluwarsa milik merchant, alasan sama dengan `reap_expired_bookings` Task 1.
2. Cek jam lewat (`P0006`), layanan (`P0005`) seperti sekarang; ambil juga `payment_mode`, `deposit_type`, `deposit_value`.
3. Baca `merchant_settings` merchant (bila tidak ada, pakai default Keputusan 5).
4. Mode efektif: mulai dari `services.payment_mode`. `ON_SITE` jadi `FULL` bila `not allow_pay_on_site`, atau bila `deposit_after_no_show` dan ada booking merchant ini dengan `customer_whatsapp = p_customer_whatsapp and no_show_at is not null`.
5. Nominal dari harga `v_price`: `FULL` → `price/0`; `DEPOSIT` → `PERCENT`: `round(price * value / 100.0)`, `FIXED`: `least(value, price)`, sisa di tempat; `ON_SITE` → `0/price`; `REQUEST` → seperti `DEPOSIT` bila DP terisi, selain itu `price/0`.
6. Status: `FULL`, `DEPOSIT` → `PENDING` (`expires_at` default 15 menit); `ON_SITE` → `CONFIRMED` bila `auto_confirm_on_site`, selain itu `REQUESTED`; `REQUEST` → `REQUESTED`. `REQUESTED` memakai `expires_at = least(now() + interval '24 hours', p_start_datetime)`.
7. `if (v_status = 'PENDING' or v_due_now > 0) and not p_can_charge` → `raise ... using errcode = 'BK021'`.
8. Bila mode efektif `ON_SITE` atau `REQUEST` dan `max_active_per_phone` tidak null: hitung booking merchant ini dengan nomor yang sama, `public.booking_holds_slot(status, expires_at)` dan `end_datetime > now()`; bila `>= max_active_per_phone` → `BK020`.
9. Logika staf tetap, tetapi pengecekan "siapa saja" memakai `public.booking_holds_slot(b.status, b.expires_at)`, bukan `status in ('PENDING','PAID')`.
10. Insert menyimpan `payment_mode` (efektif), `amount_due_now`, `amount_due_on_site`, `status`, `expires_at`.

- [ ] **Step 1: Tulis kasus uji yang gagal** (bagian 33, merchant PRO `33333333-0000-0000-0000-000000000001`, username `cara-bayar-33`, jam 09:00 sampai 17:00 tiap hari; layanan: `FULL 350000`, `DEPOSIT PERCENT 30` harga 350000, `ON_SITE 450000`, `REQUEST FIXED 100000` harga 1000000, `REQUEST` tanpa DP harga 200000; tanggal lewat `pg_temp.jakarta_future`):
  - t33a `FULL` → `PENDING`, 350000/0, `payment_mode = 'FULL'`, `expires_at` antara now+14 dan now+16 menit.
  - t33b `DEPOSIT` → `PENDING`, 105000/245000, `payment_mode = 'DEPOSIT'`.
  - t33c `ON_SITE` (default setelan) → `CONFIRMED`, 0/450000.
  - t33d `auto_confirm_on_site = false` → `ON_SITE` jadi `REQUESTED`, `expires_at <= now() + interval '24 hours'`.
  - t33e `allow_pay_on_site = false` → `ON_SITE` jadi `PENDING`, `payment_mode = 'FULL'`, 450000/0.
  - t33f `REQUEST FIXED` → `REQUESTED`, 100000/900000; `REQUEST` tanpa DP → `REQUESTED`, 200000/0.
  - t33g `p_can_charge => false`: `FULL` → `BK021`; `REQUEST FIXED` → `BK021`; `ON_SITE` (auto-confirm) → diterima.
  - t33h `max_active_per_phone = 2`: dua `ON_SITE` nomor X diterima, yang ketiga `BK020`; `FULL` nomor X tetap diterima; `ON_SITE` nomor Y diterima; booking `CONFIRMED` nomor Z yang disisipkan langsung dengan jadwal minggu lalu tidak dihitung (dua `ON_SITE` baru untuk Z diterima); setelah `max_active_per_phone = null`, `ON_SITE` ketiga X diterima.
  - t33i `deposit_after_no_show = true` dan booking nomor W dengan `no_show_at` terisi: `ON_SITE` untuk W → `PENDING`, `payment_mode = 'FULL'`; untuk nomor lain → `CONFIRMED`; setelah setelan dimatikan, W → `CONFIRMED`.
  - t33j `REQUESTED` kedaluwarsa (disisipkan langsung, `expires_at` lewat) di slot yang sama tidak menghalangi `create_booking`; baris lama jadi `CANCELLED` dengan `'Permintaan tidak dijawab dalam batas waktu'`.
  - t33k permintaan untuk jadwal sekitar 2 jam lagi: merchant ketiga `...0003` dengan jam 00:00 sampai 23:59 tiap hari dan layanan `REQUEST` 5 menit, `p_start_datetime = date_trunc('minute', now()) + interval '2 hours'`. Harapan `expires_at = start_datetime`. Bila jam WIB start itu lewat 23:50 (melewati tengah malam), cetak `OK   t33k dilewati (dekat tengah malam)`.
  - t33l merchant STUDIO `33333333-0000-0000-0000-000000000002` dengan staf A dan B: booking `CONFIRMED` untuk A di jam X membuat "siapa saja" di jam X jatuh ke B.
  - t33m `has_function_privilege('anon', 'public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean)', 'EXECUTE')` false, sama untuk `authenticated`; signature enam argumen lama sudah tidak ada (`to_regprocedure(...) is null`).
- [ ] **Step 2: Jalankan** `npm run docker:test`. Harapan: `FAIL` di bagian 33.
- [ ] **Step 3: Tulis migration** sesuai Interfaces dan aturan. Komentar kepala menjelaskan tabel keputusan mode dan kenapa `p_can_charge` ada. Grant: `revoke ... from public, anon, authenticated; grant execute ... to service_role`.
- [ ] **Step 4: Jalankan** `npm run docker:test`. Harapan: tidak ada `FAIL` di seluruh output (bagian 11 dan 30 memanggil `create_booking` dengan 5 dan 6 argumen dan harus tetap lulus).
- [ ] **Step 5: Perbarui `Args` `create_booking`** di `database.ts`, jalankan `npm run typecheck`.
- [ ] **Step 6: Commit**: `git commit -m "Hitung cara bayar efektif dan nominal di create_booking"`.

---

### Task 3: RPC keputusan merchant

Model: sonnet.

**Files:**
- Create: `supabase/migrations/20261115000400_merchant_booking_actions.sql`
- Modify: `supabase/tests/99_verify.sql` (bagian `-- 34. Aksi merchant atas booking (20261115000400)`), `src/types/database.ts` (`Functions`)

**Interfaces:**
- Consumes: Task 1 (kolom, status), Task 2 (`create_booking` untuk membuat data uji).
- Produces (semua `security definer`, `set search_path = ''`, memfilter `merchant_id = (select auth.uid())`, `grant execute ... to authenticated` saja):

```sql
public.decide_booking_request(p_booking_id uuid, p_approve boolean)
  returns table (id uuid, status public.booking_status)
public.mark_booking_paid_on_site(p_booking_id uuid, p_method public.on_site_payment_method)
  returns void
public.mark_booking_attendance(p_booking_id uuid, p_attended boolean)
  returns void
```

  - `decide_booking_request`: kunci baris (`for update`) `status = 'REQUESTED'` milik merchant, tidak ada → `BK030`; `expires_at <= now()` → `BK031`. Setujui: `amount_due_now > 0` → `PENDING`, `expires_at = least(now() + interval '24 hours', start_datetime)`; selain itu `CONFIRMED`. Tolak: `CANCELLED`, `cancelled_at = now()`, `cancel_reason = 'Permintaan ditolak merchant'`. Tidak mengembalikan `access_token`.
  - `mark_booking_paid_on_site`: hanya `status in ('PAID','CONFIRMED') and amount_due_on_site > 0 and paid_on_site_at is null`, selain itu `BK032`. Mengisi `paid_on_site_at = now()`, `paid_on_site_method = p_method`.
  - `mark_booking_attendance`: hanya `status in ('PAID','CONFIRMED')` dan `now() >= start_datetime - interval '1 hour'` (hadir) atau `now() >= start_datetime` (tidak datang), selain itu `BK033`. Mengisi salah satu kolom dan mengosongkan yang lain.
  - TS `Functions`: `decide_booking_request: { Args: { p_booking_id: string; p_approve: boolean }; Returns: { id: string; status: BookingStatus }[] }`, `mark_booking_paid_on_site: { Args: { p_booking_id: string; p_method: OnSitePaymentMethod }; Returns: undefined }`, `mark_booking_attendance: { Args: { p_booking_id: string; p_attended: boolean }; Returns: undefined }`.

- [ ] **Step 1: Tulis kasus uji yang gagal** (bagian 34, merchant PRO `34343434-...-0001` dan `...-0002`, booking dibuat lewat `create_booking` atau disisipkan langsung untuk jadwal lampau). Panggilan merchant di dalam `begin; set local role authenticated; set local request.jwt.claim.sub = ...; ... commit;`:
  - t34a setujui `REQUESTED` dengan `amount_due_now > 0` → `PENDING`, `expires_at > now()` dan `<= start_datetime`.
  - t34b setujui `REQUESTED` bayar di tempat → `CONFIRMED`.
  - t34c tolak → `CANCELLED`, `cancel_reason = 'Permintaan ditolak merchant'`.
  - t34d `BK030` untuk booking merchant lain dan untuk keputusan kedua; `BK031` untuk `REQUESTED` yang `expires_at` lewat.
  - t34e lunas di tempat pada `CONFIRMED` mengisi kolom; panggilan kedua `BK032`; `PAID` dengan `amount_due_on_site = 0` → `BK032`.
  - t34f hadir untuk jadwal minggu depan → `BK033`; untuk jadwal yang mulai 30 menit lalu: hadir lalu tidak datang → `no_show_at` terisi, `attended_at` null.
  - t34g anon tidak bisa EXECUTE ketiganya, authenticated bisa.
- [ ] **Step 2: Jalankan** `npm run docker:test`, harapan `FAIL` di bagian 34.
- [ ] **Step 3: Tulis migration**, lalu jalankan lagi: tidak ada `FAIL`.
- [ ] **Step 4: Perbarui `Functions`** di `database.ts`, `npm run typecheck`.
- [ ] **Step 5: Commit**: `git commit -m "Tambah RPC setujui, tolak, lunas di tempat, dan kehadiran"`.

---

### Task 4: Modul murni cara bayar dan kode error

Model: haiku (tes lengkap di rencana).

**Files:**
- Create: `src/lib/booking/payment-mode.ts`, `src/lib/booking/payment-mode.test.ts`
- Modify: `src/lib/booking/errors.ts`, `src/lib/booking/errors.test.ts`

**Interfaces:**
- Consumes: tipe Task 1; `formatRupiah` dari `src/lib/format.ts`.
- Produces:
  - `type PaymentSettings = Pick<MerchantSettings, "allow_pay_on_site" | "auto_confirm_on_site">`
  - `DEFAULT_PAYMENT_SETTINGS: PaymentSettings = { allow_pay_on_site: true, auto_confirm_on_site: true }`
  - `type ServicePayment = Pick<Service, "price" | "payment_mode" | "deposit_type" | "deposit_value">`
  - `effectivePaymentMode(service: Pick<Service, "payment_mode">, settings: PaymentSettings): PaymentMode` (aturan no-show hanya di server)
  - `computeAmounts(service: ServicePayment, mode: PaymentMode): { dueNow: number; dueOnSite: number }`
  - `needsApproval(mode: PaymentMode, settings: PaymentSettings): boolean`
  - `paymentLabel(service: ServicePayment, settings: PaymentSettings): string`
  - `PAYMENT_MODE_OPTIONS: { value: PaymentMode; title: string; description: string; fit: string }[]` dengan teks M1: `FULL` "Bayar penuh saat booking" / "Seluruh harga dibayar lewat QRIS. Paling aman dari pembatalan mendadak." / "kelas, sesi foto, tiket acara"; `DEPOSIT` "DP saat booking, sisanya di tempat" / "Pelanggan mengunci jadwal dengan sebagian harga." / "MUA, salon, fotografer, sewa alat"; `ON_SITE` "Bayar di tempat" / "Reservasi gratis tanpa pembayaran online. Pelanggan langsung terkonfirmasi." / "restoran, kafe, barbershop, klinik"; `REQUEST` "Ajukan dulu, bayar setelah disetujui" / "Pelanggan mengirim permintaan. Anda cek ketersediaan, lalu setujui atau tolak." / "wedding, katering, sewa tempat".
  - `ON_SITE_METHOD_LABEL: Record<OnSitePaymentMethod, string> = { CASH: "Tunai", QRIS: "QRIS", TRANSFER: "Transfer" }`
  - `REQUEST_REJECT_REASON = "Permintaan ditolak merchant"`, `REQUEST_EXPIRY_REASON = "Permintaan tidak dijawab dalam batas waktu"` (wajib sama dengan SQL Task 1 dan 3)
  - `errors.ts`: `BK020` 409 `"Nomor WhatsApp ini sudah mencapai batas booking aktif di merchant ini. Selesaikan atau batalkan booking sebelumnya dulu."`; `BK021` 409 `"Merchant belum mengaktifkan pembayaran"`.

- [ ] **Step 1: Tulis tes yang gagal** `payment-mode.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { formatRupiah } from "@/lib/format";

import {
  DEFAULT_PAYMENT_SETTINGS,
  computeAmounts,
  effectivePaymentMode,
  needsApproval,
  paymentLabel,
  type ServicePayment,
} from "./payment-mode";

const svc = (over: Partial<ServicePayment> = {}): ServicePayment => ({
  price: 350000,
  payment_mode: "FULL",
  deposit_type: null,
  deposit_value: null,
  ...over,
});
const on = DEFAULT_PAYMENT_SETTINGS;
const off = { allow_pay_on_site: false, auto_confirm_on_site: true };
const manual = { allow_pay_on_site: true, auto_confirm_on_site: false };

test("effectivePaymentMode jatuh ke FULL bila bayar di tempat dimatikan", () => {
  assert.equal(effectivePaymentMode(svc({ payment_mode: "ON_SITE" }), on), "ON_SITE");
  assert.equal(effectivePaymentMode(svc({ payment_mode: "ON_SITE" }), off), "FULL");
  assert.equal(effectivePaymentMode(svc({ payment_mode: "REQUEST" }), off), "REQUEST");
  assert.equal(effectivePaymentMode(svc({ payment_mode: "DEPOSIT" }), off), "DEPOSIT");
});

test("computeAmounts sama dengan create_booking", () => {
  const dp = svc({ payment_mode: "DEPOSIT", deposit_type: "PERCENT", deposit_value: 30 });
  assert.deepEqual(computeAmounts(dp, "DEPOSIT"), { dueNow: 105000, dueOnSite: 245000 });
  assert.deepEqual(
    computeAmounts(svc({ payment_mode: "DEPOSIT", deposit_type: "FIXED", deposit_value: 100000 }), "DEPOSIT"),
    { dueNow: 100000, dueOnSite: 250000 },
  );
  // 99999 x 30% = 29999,7 dibulatkan ke 30000.
  assert.deepEqual(
    computeAmounts({ ...dp, price: 99999 }, "DEPOSIT"),
    { dueNow: 30000, dueOnSite: 69999 },
  );
  assert.deepEqual(computeAmounts(svc(), "FULL"), { dueNow: 350000, dueOnSite: 0 });
  assert.deepEqual(computeAmounts(svc({ payment_mode: "ON_SITE" }), "ON_SITE"), { dueNow: 0, dueOnSite: 350000 });
  assert.deepEqual(computeAmounts(svc({ payment_mode: "REQUEST" }), "REQUEST"), { dueNow: 350000, dueOnSite: 0 });
  assert.deepEqual(
    computeAmounts(svc({ payment_mode: "REQUEST", deposit_type: "FIXED", deposit_value: 100000 }), "REQUEST"),
    { dueNow: 100000, dueOnSite: 250000 },
  );
  // Mode efektif FULL mengabaikan DP apa pun.
  assert.deepEqual(computeAmounts(dp, "FULL"), { dueNow: 350000, dueOnSite: 0 });
});

test("needsApproval", () => {
  assert.equal(needsApproval("REQUEST", on), true);
  assert.equal(needsApproval("ON_SITE", manual), true);
  assert.equal(needsApproval("ON_SITE", on), false);
  assert.equal(needsApproval("FULL", manual), false);
});

test("paymentLabel memakai teks M1", () => {
  assert.equal(paymentLabel(svc(), on), "Lunas di muka");
  assert.equal(paymentLabel(svc({ payment_mode: "DEPOSIT", deposit_type: "PERCENT", deposit_value: 30 }), on), "DP 30% di muka");
  assert.equal(
    paymentLabel(svc({ payment_mode: "DEPOSIT", deposit_type: "FIXED", deposit_value: 100000 }), on),
    `DP ${formatRupiah(100000)} di muka`,
  );
  assert.equal(paymentLabel(svc({ payment_mode: "ON_SITE" }), on), "Bayar di tempat");
  assert.equal(paymentLabel(svc({ payment_mode: "ON_SITE" }), off), "Lunas di muka");
  assert.equal(paymentLabel(svc({ payment_mode: "ON_SITE" }), manual), "Bayar di tempat");
  assert.equal(paymentLabel(svc({ payment_mode: "REQUEST" }), on), "Ajukan dulu");
});
```

  Di `errors.test.ts` tambahkan: `mapBookingError("BK020").status === 409` dan `mapBookingError("BK021").message === "Merchant belum mengaktifkan pembayaran"`.
- [ ] **Step 2: Jalankan** `npx tsx --test src/lib/booking/payment-mode.test.ts src/lib/booking/errors.test.ts` → FAIL.
- [ ] **Step 3: Implementasikan** sesuai Interfaces. `price` bisa datang sebagai string numeric dari PostgREST: bungkus `Number()`.
- [ ] **Step 4: Jalankan lagi** → PASS, lalu `npm run typecheck`.
- [ ] **Step 5: Commit**: `git commit -m "Tambah aturan cara bayar murni dan kode error batas nomor"`.

---

### Task 5: Charge bersama, `POST /api/bookings`, dan rute bayar permintaan

Model: sonnet.

**Files:**
- Create: `src/lib/payments/charge-booking.ts`, `src/lib/booking/pay-request.ts`, `src/lib/booking/pay-request.test.ts`, `src/app/api/pesanan/[token]/bayar/route.ts`
- Modify: `src/app/api/bookings/route.ts`, `src/lib/routes.ts`

**Interfaces:**
- Consumes: `create_booking` Task 2 (`p_can_charge`, `BK020`, `BK021`); `mapBookingError` Task 4; `notifyBookingCreated` dari Task 6 (bila Task 6 belum selesai, impor tetap ditulis; urutan eksekusi menempatkan Task 6 sebelum Task 5).
- Produces:
  - `findChargeProvider(admin: SupabaseClient<Database>, merchantId: string): Promise<PaymentProvider | null>`: memuat `merchants.active_payment_provider` dan koneksi ACTIVE (`order connected_at asc`) lalu `selectActiveConnection`; melempar bila query gagal.
  - `chargeBooking(admin, input: { bookingId: string; merchantId: string; amount: number; provider: PaymentProvider }): Promise<{ qrString: string }>`: isi blok try di `route.ts` sekarang (kredensial, adapter `createQrisCharge` dengan `orderId = bookingId`, update `payment_provider/payment_url/payment_reference` difilter `id` dan `merchant_id`, `recordChargeSuccess`). Pada `ChargeRejectedError` memanggil `recordChargeRejection` lalu melempar ulang. Tidak membatalkan booking.
  - `payDecision(row: { status: BookingStatus; expires_at: string; payment_url: string | null }, nowMs: number): "CHARGE" | "ALREADY_CHARGED" | "NOT_PAYABLE"` dan `paymentHoldUntil(expiresAt: string, nowMs: number): string` (ISO, `min(expiresAt, now + 15 menit)`).
  - `ROUTES.bookingPay = (token: string) => \`/api/pesanan/${token}/bayar\``.
  - `POST /api/bookings` respons 201: `{ bookingId, status, bookingUrl, payment_url?, expires_at? }`.
  - `POST /api/pesanan/[token]/bayar` respons 200 `{ ok: true }`, 404, 409 `{ error }`, 502 `{ error }`.

- [ ] **Step 1: Tulis tes yang gagal** `pay-request.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { payDecision, paymentHoldUntil } from "./pay-request";

const now = Date.parse("2026-11-20T08:00:00Z");
const row = (over = {}) => ({ status: "PENDING" as const, expires_at: "2026-11-21T08:00:00Z", payment_url: null, ...over });

test("payDecision", () => {
  assert.equal(payDecision(row(), now), "CHARGE");
  assert.equal(payDecision(row({ payment_url: "000201..." }), now), "ALREADY_CHARGED");
  assert.equal(payDecision(row({ expires_at: "2026-11-20T07:59:00Z" }), now), "NOT_PAYABLE");
  assert.equal(payDecision(row({ status: "REQUESTED" as never }), now), "NOT_PAYABLE");
  assert.equal(payDecision(row({ status: "PAID" as never }), now), "NOT_PAYABLE");
});

test("paymentHoldUntil memendekkan ke 15 menit, tidak pernah memperpanjang", () => {
  assert.equal(paymentHoldUntil("2026-11-21T08:00:00Z", now), "2026-11-20T08:15:00.000Z");
  assert.equal(paymentHoldUntil("2026-11-20T08:05:00Z", now), "2026-11-20T08:05:00.000Z");
});
```

- [ ] **Step 2: Jalankan** `npx tsx --test src/lib/booking/pay-request.test.ts` → FAIL. Implementasikan, jalankan lagi → PASS.
- [ ] **Step 3: Pindahkan charge** ke `charge-booking.ts` (berkas `import "server-only"`). Komentar penting di `route.ts` ikut pindah atau tetap di tempat yang relevan.
- [ ] **Step 4: Ubah `POST /api/bookings`**:
  - Ganti pemeriksaan koneksi dengan `provider = await findChargeProvider(...)` (gagal query → 500). Tidak lagi 409 sebelum `create_booking`; kirim `p_can_charge: provider !== null`. `BK021` sampai ke klien lewat `mapBookingError`.
  - `booking.status === "PENDING"`: bila `provider` null (harga 0 tanpa koneksi), batalkan dan balas 409 `"Merchant belum mengaktifkan pembayaran"`. Selain itu `chargeBooking(..., amount: Math.round(Number(booking.amount_due_now)))`; jalur gagal (batalkan booking, pesan pelanggan, 502) tetap sama persis.
  - `CONFIRMED` atau `REQUESTED`: `after(() => notifyBookingCreated(booking.id))`, balas 201 `{ bookingId, status, bookingUrl }`.
- [ ] **Step 5: Tulis rute bayar** `src/app/api/pesanan/[token]/bayar/route.ts` (`POST`, tanpa sesi, token adalah kuncinya):
  1. Token harus `/^[0-9a-f]{48}$/`, selain itu 404.
  2. Admin client: `select id, merchant_id, status, expires_at, payment_url, amount_due_now` `.eq("access_token", token)`. Tidak ada → 404.
  3. `payDecision`: `NOT_PAYABLE` → 409 `"Booking ini tidak sedang menunggu pembayaran."`; `ALREADY_CHARGED` → 200.
  4. `findChargeProvider`; null → 409 `"Merchant belum mengaktifkan pembayaran"`.
  5. Klaim: update `expires_at = paymentHoldUntil(...)` dengan filter `id`, `merchant_id`, `status = PENDING`, `payment_url is null`; 0 baris → 200 (pemanggil lain lebih dulu).
  6. `chargeBooking`. Gagal → 502 dengan pesan pelanggan yang sama seperti `POST /api/bookings`; booking TIDAK dibatalkan (tetap `PENDING` sampai tenggat 15 menit, pelanggan boleh mencoba lagi).
  Komentar kepala menjelaskan kenapa charge dibuat di sini dan bukan saat disetujui (Keputusan 3), dan bahwa `/api/*` tidak dilindungi proxy.
- [ ] **Step 6: Verifikasi**: `npm run check` lulus.
- [ ] **Step 7: Commit**: `git commit -m "Satukan pembuatan charge, dukung booking tanpa bayar dan bayar setelah disetujui"`.

---

### Task 6: Notifikasi cara bayar

Model: sonnet.

**Files:**
- Modify: `src/lib/notify/templates.ts`, `src/lib/notify/templates.test.ts`, `src/lib/notify/dispatch.ts`

**Interfaces:**
- Consumes: kind baru Task 1; `REQUEST_REJECT_REASON` Task 4.
- Produces:
  - `BookingMessageData` + `amountDueNow: number; amountDueOnSite: number; respondBefore: string | null` (ISO `expires_at` untuk permintaan dan pembayaran yang disetujui).
  - Templat baru: `merchantConfirmedEmail(data): EmailMessage`, `merchantConfirmedWhatsapp(data): string`, `customerConfirmedWhatsapp(data): string`, `merchantRequestedEmail(data): EmailMessage`, `merchantRequestedWhatsapp(data): string`, `customerApprovedWhatsapp(data): string`, `customerRejectedWhatsapp(data): string`.
  - `notifyBookingCreated(bookingId: string): Promise<void>`: `CONFIRMED` → `BOOKING_CONFIRMED_MERCHANT` (EMAIL, WHATSAPP) + `BOOKING_CONFIRMED_CUSTOMER` (WHATSAPP); `REQUESTED` → `BOOKING_REQUESTED_MERCHANT` (EMAIL, WHATSAPP). Status lain: tidak apa-apa.
  - `notifyRequestDecided(bookingId: string): Promise<void>`: `PENDING` → `BOOKING_APPROVED_CUSTOMER`; `CONFIRMED` → `BOOKING_CONFIRMED_CUSTOMER`; `CANCELLED` dengan `cancel_reason = REQUEST_REJECT_REASON` → `BOOKING_REJECTED_CUSTOMER`. Semua WHATSAPP.
  - Keduanya tidak pernah melempar (pola `notifyBookingPaid`).

Aturan isi:
- Templat lunas yang ada: baris `DP: <servicePrice>` dan `DP diterima` diganti `Dibayar: <amountDueNow>`, ditambah `Sisa di tempat: <amountDueOnSite>` bila > 0. Teks pelanggan "pembayaran DP" jadi "pembayaran" bila `amountDueOnSite = 0`.
- Pengingat: `sendDayBeforeReminders` memakai `.in("status", ["PAID", "CONFIRMED"])`; templat menambah `Bayar di tempat: <amountDueOnSite>` bila > 0 dan belum lunas di tempat (tambahkan `paid_on_site_at` ke kolom yang dibaca).
- Permintaan ke merchant menyebut batas jawab `formatDateTime(respondBefore)` WIB dan `dashboardUrl`. Persetujuan ke pelanggan: nominal `amountDueNow`, `statusUrl`, dan batas bayar. Penolakan: kalimat netral plus tautan halaman merchant bila ada `merchantWhatsapp`.
- Tanpa em dash di teks baru.

- [ ] **Step 1: Tulis tes yang gagal** di `templates.test.ts`: `customerConfirmedWhatsapp` memuat `formatRupiah(450000)` dan `statusUrl`; `merchantPaidWhatsapp` dengan `amountDueNow 105000, amountDueOnSite 245000` memuat `formatRupiah(105000)` dan `Sisa di tempat`; dengan `amountDueOnSite 0` tidak memuat `Sisa di tempat`; `customerApprovedWhatsapp` memuat `formatRupiah(100000)` dan `statusUrl`; `merchantRequestedWhatsapp` memuat `dashboardUrl`; tidak satu pun templat baru memuat `"—"`.
- [ ] **Step 2: Jalankan** `npx tsx --conditions=react-server --test src/lib/notify/templates.test.ts` → FAIL. Implementasikan templat dan dispatch. Jalankan lagi → PASS.
- [ ] **Step 3: Verifikasi**: `npm run typecheck && npm run test:unit`.
- [ ] **Step 4: Commit**: `git commit -m "Kirim notifikasi booking bayar di tempat, permintaan, dan keputusannya"`.

---

### Task 7: Form layanan M1 dan pengaturan booking M4

Model: sonnet.

**Files:**
- Modify: `src/lib/validations/service.ts`, `src/lib/validations/service.test.ts`, `src/app/dashboard/services/actions.ts`, `src/app/dashboard/services/service-form-dialog.tsx`, `src/app/dashboard/services/services-table.tsx`, `src/app/dashboard/services/page.tsx`
- Create: `src/lib/validations/merchant-settings.ts`, `src/lib/validations/merchant-settings.test.ts`, `src/app/dashboard/settings/booking-settings-form.tsx`, `src/app/dashboard/settings/booking-settings-actions.ts`, plus story `booking-settings-form.stories.tsx`
- Modify: `src/app/dashboard/settings/page.tsx`

**Interfaces:**
- Consumes: Task 1 (kolom, `merchant_settings`), Task 4 (`PAYMENT_MODE_OPTIONS`, `computeAmounts`, `paymentLabel`, `effectivePaymentMode`, `DEFAULT_PAYMENT_SETTINGS`).
- Produces:
  - `serviceSchema` + `payment_mode` (enum, default `"FULL"`), `deposit_type` (enum atau kosong → null), `deposit_value` (angka bulat atau kosong → null), dengan `superRefine` yang mencerminkan constraint t32a. Pesan: `"Isi besar DP"`, `"DP persen 1 sampai 90"`, `"DP harus lebih kecil dari harga"`. DP dibuang (null) untuk `FULL` dan `ON_SITE`.
  - `bookingSettingsSchema` (`allow_pay_on_site`, `auto_confirm_on_site`, `max_active_per_phone` 1 sampai 10 atau null, `deposit_after_no_show`) dan `updateBookingSettings(prev, formData): Promise<{ status: "idle" | "success" | "error"; message?: string }>` (update baris sendiri lewat `createClient`, filter `merchant_id = user.id`).
  - `BookingSettingsForm(props: { settings: Pick<MerchantSettings, "allow_pay_on_site" | "auto_confirm_on_site" | "max_active_per_phone" | "deposit_after_no_show">; onSiteServices: { id: string; name: string }[] })`, murni (aksi lewat prop atau `useActionState` di dalamnya).

Perilaku:
- Form layanan: fieldset `Cara pembayaran` dengan legend `Kapan pelanggan membayar?`, empat kartu radio dari `PAYMENT_MODE_OPTIONS` (judul, deskripsi, `Cocok untuk: <fit>`), keadaan terpilih memakai garis tebal plus titik radio (monokrom). `DEPOSIT`: pemilih `%` atau `Rp` dan kolom `Besar DP`, lalu kalimat hidup `Pelanggan bayar <dueNow> saat booking, <dueOnSite> di tempat.` dari `computeAmounts`. `REQUEST`: kolom DP yang sama tetapi opsional dengan bantuan `Kosongkan untuk meminta bayar penuh setelah disetujui.`, lalu catatan `Setelah Anda setujui di menu Booking, pelanggan menerima tautan bayar. Permintaan yang tidak dijawab 24 jam otomatis ditolak.` `ON_SITE` atau `REQUEST`: blok `Kurangi no-show` hanya-baca yang merangkum setelan merchant (`Satu nomor WhatsApp maksimal <n> booking aktif.` atau `Tanpa batas booking aktif per nomor.`, dan bila aktif `Nomor yang pernah tidak datang wajib bayar di muka di booking berikutnya.`) dengan tautan `Ubah di Pengaturan`. `ON_SITE` saat `allow_pay_on_site` false: peringatan `Bayar di tempat sedang dimatikan di Pengaturan. Layanan ini meminta bayar penuh sampai fitur itu dinyalakan lagi.` Baris bawah `Tampil di halaman pelanggan: <paymentLabel>`. Halaman layanan memuat `merchant_settings` sendiri untuk ini.
- `services-table.tsx`: label `paymentLabel` kecil di bawah harga.
- Pengaturan: kartu `Booking tanpa bayar` di antara `SettingsForm` dan `AccountSection`, teks M4: sakelar `Izinkan booking tanpa bayar di muka` dengan bantuan `Pelanggan memesan dulu dan membayar di tempat. Berlaku untuk layanan yang cara bayarnya "Bayar di tempat".`; `Dipakai oleh <n> layanan: <nama, nama>.` dengan tautan `Atur per layanan` ke `ROUTES.services`; sakelar `Konfirmasi otomatis. Jika dimatikan, setiap booking menunggu persetujuan Anda.`; kotak centang plus angka `Satu nomor WhatsApp maksimal <n> booking aktif`; kotak centang `Nomor yang pernah tidak datang wajib bayar di muka di booking berikutnya`. Saat sakelar pertama mati: `Mati: <n> layanan yang memakai "Bayar di tempat" otomatis meminta bayar penuh saat booking sampai fitur ini dinyalakan lagi. Booking yang sudah ada tidak berubah.` Tombol `Simpan perubahan`. Bagian Ubah jadwal, Kontak, dan Pengingat milik F4, tidak dibuat.

- [ ] **Step 1: Tulis tes yang gagal**: `service.test.ts` (DEPOSIT tanpa DP ditolak dengan `"Isi besar DP"`; PERCENT 95 ditolak; FIXED 350000 untuk harga 350000 ditolak dengan `"DP harus lebih kecil dari harga"`; `ON_SITE` dengan DP terisi diterima dan DP-nya jadi null; REQUEST tanpa DP diterima; input tanpa `payment_mode` menghasilkan `"FULL"`) dan `merchant-settings.test.ts` (`max_active_per_phone` "0" ditolak, "" jadi null, "2" jadi 2; checkbox `"on"`/absen jadi boolean).
- [ ] **Step 2: Jalankan** `npx tsx --test src/lib/validations/service.test.ts src/lib/validations/merchant-settings.test.ts` → FAIL. Implementasikan skema → PASS.
- [ ] **Step 3: Sambungkan** aksi layanan (create dan update mengirim tiga kolom baru; error `23514` dipetakan ke pesan DP yang ramah), form, tabel, dan kartu pengaturan.
- [ ] **Step 4: Verifikasi**: `npm run check` lulus, `npm run build-storybook` lulus.
- [ ] **Step 5: Commit**: `git commit -m "Atur cara bayar per layanan dan pengaturan booking tanpa bayar"`.

---

### Task 8: Alur pelanggan dan halaman booking saya

Model: sonnet.

**Files:**
- Modify: `src/app/[username]/page.tsx`, `src/app/[username]/booking-page-view.tsx`, `src/app/[username]/booking-page-view.stories.tsx`, `src/app/[username]/booking-flow.tsx`, `src/components/booking-page/booking-summary.tsx`, `src/components/booking-page/booking-steps.stories.tsx`, `src/components/booking-page/fixtures.ts`, `src/app/dashboard/halaman/preview-frame.tsx`, `src/app/dashboard/halaman/page.tsx`
- Modify: `src/app/pesanan/[token]/page.tsx`, `booking-status-view.tsx`, `booking-status-view.stories.tsx`, `booking-live-status.tsx`
- Create: `src/app/pesanan/[token]/pay-now-button.tsx` (client)

**Interfaces:**
- Consumes: Task 4 (semua ekspor), Task 5 (`ROUTES.bookingPay`, bentuk respons), kolom Task 1.
- Produces:
  - `BookingFlowProps` + `paymentSettings: PaymentSettings`; `BookingPageViewProps` + `paymentSettings: PaymentSettings`.
  - `BookingSummary({ rows, total, onSite }: { rows: { label: string; value: string }[]; total: string; onSite?: string })`: baris `Bayar di tempat` setelah `Dibayar sekarang` bila `onSite` ada.
  - `BookingPageRow` + `payment_mode`, `amount_due_now`, `amount_due_on_site`, `paid_on_site_at`; `status: BookingStatus`.
  - `PayNowButton({ token, label }: { token: string; label: string })`: POST `ROUTES.bookingPay(token)`, sukses → `router.refresh()`, gagal → pesan `error` dari respons di bawah tombol (`role="alert"`).

Perilaku pelanggan:
- `[username]/page.tsx` membaca `merchant_settings` (`allow_pay_on_site, auto_confirm_on_site`) lewat `createPublicClient`; tidak ada baris atau error → `DEFAULT_PAYMENT_SETTINGS`. Halaman editor `/dashboard/halaman` membaca baris yang sama lewat `createClient` untuk preview.
- Kartu layanan: `paymentLabel={paymentLabel(service, paymentSettings)}` di `BookingFlow` dan `preview-frame.tsx`.
- Langkah 3, dengan `mode = effectivePaymentMode(...)`, `{ dueNow, dueOnSite } = computeAmounts(...)`, `approval = needsApproval(mode, settings)`:
  - Ringkasan: bila `dueNow !== price` tambah baris `Harga layanan`; `total = formatRupiah(dueNow)`; `onSite` bila `dueOnSite > 0`.
  - Catatan: online (`FULL`/`DEPOSIT` tanpa persetujuan) teks F1 yang ada, ditambah untuk DP `Sisanya <dueOnSite> dibayar langsung ke <merchant> saat layanan.`; `ON_SITE` tanpa persetujuan `Tidak perlu bayar sekarang.` dan `Bayar <dueOnSite> langsung ke <merchant> saat layanan.`; dengan persetujuan `Ini permintaan booking. <merchant> akan menyetujui atau menolak dalam 24 jam.` plus, bila `dueNow > 0`, `Setelah disetujui, Anda membayar <dueNow> lewat halaman booking Anda.`
  - Tombol bar lengket: online `Bayar <dueNow>`, `ON_SITE` tanpa persetujuan `Konfirmasi booking`, dengan persetujuan `Kirim permintaan`.
  - Setelah POST selalu `router.push(bookingUrl)`; server yang menentukan hasil akhir (Review Focus 1).
- Story `BookingPageView`: tambah `CaraBayarCampuran` (empat layanan, satu per mode). Story langkah 3 untuk `ON_SITE` dan `DEPOSIT` di `booking-steps.stories.tsx` bila langkah 3 bisa dirender murni; bila tidak, cukup story `BookingSummary` dengan `onSite`.

Perilaku `/pesanan/[token]` (loader menambah kolom baru ke select; `access_token` tetap tidak di-select):
- `CONFIRMED` (05b): judul `Jadwal sudah dipesan`, `Sampai jumpa, <nama depan>.`, blok tanggal, layanan, jadwal, baris `Bayar di tempat` = `amount_due_on_site` dengan keterangan `Dibayar saat layanan` (atau `Lunas di tempat` bila `paid_on_site_at`), `Atas nama`, `AddToCalendarButton`, tautan kembali, catatan `Simpan halaman ini. Tautannya bisa dibuka lagi kapan saja.` Tanpa kode booking dan tanpa Ubah atau batalkan (F4).
- `PAID`: baris `Dibayar` memakai `amount_due_now`; bila `amount_due_on_site > 0` tambah `Sisa di tempat` (atau `Lunas di tempat`).
- `REQUESTED` belum lewat: judul `Permintaan terkirim`, `<merchant> akan menjawab sebelum <tanggal dan jam> WIB. Buka lagi halaman ini untuk melihat jawabannya.`, ringkasan.
- `PENDING` tanpa `payment_url`: judul `Permintaan disetujui`, `Bayar <amount_due_now> sebelum <jam> WIB untuk mengunci jadwal.`, `PayNowButton` berlabel `Bayar <amount_due_now>`. Dengan `payment_url`: tampilan PENDING F1 apa adanya; untuk DP judul nominal `DP dibayar sekarang` dan catatan sisa.
- `CANCELLED` dengan `REQUEST_REJECT_REASON`: `Permintaan ditolak`; dengan `REQUEST_EXPIRY_REASON` atau `REQUESTED` yang lewat: `Permintaan tidak dijawab`. Pembatalan lain tetap seperti sekarang.
- `booking-live-status.tsx`: tipe status jadi `BookingStatus`, semua selain `PENDING` dianggap terminal (refresh).
- Story baru: `Terkonfirmasi`, `DpSisaDiTempat`, `MenungguPersetujuan`, `Disetujui`, `Ditolak`, di tema HANGAT dan MALAM.

- [ ] **Step 1: Ubah komponen dan loader** sesuai di atas.
- [ ] **Step 2: Verifikasi**: `npm run check` lulus, `npm run build-storybook` lulus.
- [ ] **Step 3: Commit**: `git commit -m "Tampilkan cara bayar di alur pelanggan dan halaman booking saya"`.

---

### Task 9: Aksi merchant di detail booking

Model: sonnet.

**Files:**
- Modify: `src/app/dashboard/bookings/actions.ts`, `booking-state.ts`, `booking-state.test.ts`, `booking-detail-dialog.tsx`, `bookings-table.tsx`, `bookings-filters.tsx`, `src/lib/validations/booking.ts`, `src/lib/validations/booking.test.ts`

**Interfaces:**
- Consumes: RPC Task 3, `findChargeProvider` Task 5, `notifyRequestDecided` Task 6, `ON_SITE_METHOD_LABEL`, `REQUEST_EXPIRY_REASON` Task 4.
- Produces:
  - Server action: `decideRequest(id: string, approve: boolean): Promise<CancelBookingResult>`, `markPaidOnSite(id: string, method: OnSitePaymentMethod): Promise<CancelBookingResult>`, `markAttendance(id: string, attended: boolean): Promise<CancelBookingResult>`.
  - `BOOKING_LIST_COLUMNS` dan `BOOKING_LIST_COLUMN_LIST` + `payment_mode, amount_due_now, amount_due_on_site, paid_on_site_at, paid_on_site_method, attended_at, no_show_at` (keduanya, tes kesamaan yang ada menjaga).
  - `getDisplayStatus`: `REQUESTED` dengan `expires_at` lewat → `"EXPIRED"`; `CANCELLED` dengan `REQUEST_EXPIRY_REASON` → `"EXPIRED"`.
  - `bookingStatusFilterSchema = z.enum(["PENDING", "PAID", "CONFIRMED", "REQUESTED", "CANCELLED"])`.

Aturan:
- Tiap aksi: validasi uuid (pola `cancelBookingSchema`), `getUser()`, panggil RPC, petakan `BK030` `"Permintaan ini sudah dijawab atau tidak ditemukan."`, `BK031` `"Permintaan ini sudah kedaluwarsa."`, `BK032` `"Booking ini tidak punya tagihan di tempat yang belum lunas."`, `BK033` `"Kehadiran baru bisa ditandai mendekati jadwal."`, lainnya `"Gagal menyimpan. Coba lagi."`; `revalidatePath(ROUTES.bookings)`.
- `decideRequest(approve = true)` untuk booking dengan `amount_due_now > 0`: periksa `findChargeProvider` lebih dulu (admin client, filter `merchant_id = user.id`); null → `"Aktifkan pembayaran dulu di menu Pembayaran sebelum menyetujui permintaan berbayar."`. Setelah RPC sukses: `after(() => notifyRequestDecided(id))`.
- `cancelBooking`: `.in("status", ["PENDING", "PAID", "CONFIRMED"])` (`REQUESTED` memakai Tolak).
- Detail dialog, minimal (F3 akan mendesain ulang): bagian Pembayaran (`Dibayar online` = `amount_due_now` bila `PAID`; `Ditagih di tempat` = `amount_due_on_site` dengan `Lunas, <metode>` atau `Belum dibayar`; `Hadir`/`Tidak datang` bila terisi). Tombol: `REQUESTED` belum lewat → `Setujui` dan `Tolak` (Tolak minta konfirmasi, varian destructive); `PAID`/`CONFIRMED` dengan sisa belum lunas → `Tandai lunas di tempat` dengan pilihan Tunai/QRIS/Transfer; `PAID`/`CONFIRMED` → `Hadir` dan `Tidak datang` (nonaktif dengan teks bantu bila belum waktunya). Tombol dinonaktifkan saat aksi berjalan, pesan error tampil di dialog.
- Filter: opsi `Terkonfirmasi` (`CONFIRMED`) dan `Perlu persetujuan` (`REQUESTED`). Tabel: kolom yang kini hanya untuk `PAID` (baris 172) juga menangani `CONFIRMED`.

- [ ] **Step 1: Tulis tes yang gagal**: `booking-state.test.ts` (`getDisplayStatus` untuk `REQUESTED` lewat → `EXPIRED`, `REQUESTED` hidup → `REQUESTED`, `CANCELLED` + `REQUEST_EXPIRY_REASON` → `EXPIRED`, `CONFIRMED` → `CONFIRMED`); `booking.test.ts` (`bookingStatusFilterSchema` menerima `CONFIRMED` dan `REQUESTED`).
- [ ] **Step 2: Jalankan** `npx tsx --test src/app/dashboard/bookings/booking-state.test.ts src/lib/validations/booking.test.ts` → FAIL. Implementasikan → PASS.
- [ ] **Step 3: Sambungkan** aksi dan dialog.
- [ ] **Step 4: Verifikasi**: `npm run check` lulus.
- [ ] **Step 5: Commit**: `git commit -m "Tambah aksi setujui, tolak, lunas di tempat, dan kehadiran di detail booking"`.

---

### Task 10: Pembaca status lainnya

Model: sonnet.

**Files:**
- Modify: `src/app/dashboard/upcoming-bookings.tsx`, `src/app/dashboard/settings/account-actions.ts`, `src/lib/analytics/aggregate.ts`, `src/lib/analytics/aggregate.test.ts`, `src/app/dashboard/analitik/page.tsx`, `src/app/dashboard/settings/ekspor/route.ts`

**Interfaces:**
- Consumes: kolom Task 1.
- Produces: `AnalyticsBooking` + `amount_due_now: number; amount_due_on_site: number; paid_on_site_at: string | null`.

Aturan:
- `upcoming-bookings.tsx`: `.in("status", ["PAID", "CONFIRMED"])`.
- `account-actions.ts`: hitungan pertama `.in("status", ["PAID", "CONFIRMED"])`, kedua `.in("status", ["PENDING", "REQUESTED"])`; teks pesan tetap.
- `aggregate.ts` (Keputusan 13): booking terkonfirmasi = `PAID` pada `paid_at` atau `CONFIRMED` pada `created_at`; itu yang masuk `paidCount`, `byWeekday`, `count` seri, dan pembilang `payRate` (penyebut tetap semua booking yang dibuat). Pendapatan = `amount_due_now` booking `PAID` pada `paid_at` + `amount_due_on_site` pada `paid_on_site_at`, masing-masing ke bucket waktunya sendiri, juga untuk `topServices` dan `byStaff`. `repeatCustomerRate` memakai booking terkonfirmasi.
- `analitik/page.tsx`: tambah tiga kolom ke select.
- `ekspor/route.ts`: tambah kolom baru ke select booking dan `merchant_settings` (`select("*")` difilter `merchant_id`) ke berkas ekspor.

- [ ] **Step 1: Tulis tes yang gagal** di `aggregate.test.ts`: booking `PAID` DP (`amount_due_now 105000, amount_due_on_site 245000`, `paid_at` di periode, `paid_on_site_at` null) menyumbang pendapatan 105000; booking yang sama dengan `paid_on_site_at` di periode menyumbang 350000; `CONFIRMED` (0/450000) tanpa `paid_on_site_at` menyumbang 0 pendapatan dan 1 ke `paidCount`; `CONFIRMED` dengan `paid_on_site_at` di periode menyumbang 450000; `REQUESTED` tidak menyumbang apa pun selain ke `createdCount`. Perbarui fixture tes lama dengan kolom baru (`amount_due_now = service_price`, `amount_due_on_site = 0`, `paid_on_site_at = null`) supaya angka lama tetap sama.
- [ ] **Step 2: Jalankan** `npx tsx --test src/lib/analytics/aggregate.test.ts` → FAIL. Implementasikan → PASS.
- [ ] **Step 3: Ubah berkas lain**, lalu `npm run check` lulus.
- [ ] **Step 4: Commit**: `git commit -m "Sertakan status CONFIRMED dan REQUESTED di beranda, analitik, ekspor, dan hapus akun"`.

---

### Task 11: Verifikasi akhir dan dokumentasi

Dikerjakan controller, bukan subagen.

- [ ] **Step 1:** `open -a Docker`, lalu `npm run docker:test`. Tidak ada baris `FAIL` di seluruh output.
- [ ] **Step 2:** `npm run check` dan `npm run build-storybook` lulus.
- [ ] **Step 3:** `npm run storybook`, buka di browser pada 390px dan 1280px: `BookingPageView/CaraBayarCampuran` (label tiap kartu), ringkasan langkah 3 untuk DP dan bayar di tempat, dan semua story `BookingStatusView` baru di HANGAT dan MALAM. Periksa panel a11y tanpa pelanggaran, tombol tidak terpotong, teks tanpa em dash.
- [ ] **Step 4:** Bila Supabase lokal tersedia, jalankan satu putaran nyata: layanan `ON_SITE` sampai `/pesanan/[token]` `CONFIRMED`; layanan `REQUEST` lalu Setujui di dashboard lalu tombol Bayar memunculkan QRIS (sandbox). Bila tidak tersedia, catat bagian yang tidak terverifikasi di PR.
- [ ] **Step 5:** Tambah `## 31. Cara bayar per layanan` di `docs/DECISIONS.md` (Keputusan 2, 3, 7, 9, 13 dengan alasannya). Perbarui bagian Status di `AGENTS.md` (satu kalimat F2: cara bayar per layanan, bayar di tempat, ajukan lalu setujui, `merchant_settings`) dan baris F2 di `docs/superpowers/plans/2026-11-14-marky-roadmap.md` (rencana `2026-11-15-marky-f2-cara-bayar.md`, status selesai di cabang `fitur/marky-f2`). Jalankan `graphify update .`.
- [ ] **Step 6: Commit**: `git add docs/DECISIONS.md AGENTS.md docs/superpowers/plans/2026-11-14-marky-roadmap.md` lalu `git commit -m "Catat F2 selesai di keputusan, status, dan roadmap"`. Jangan stage `graphify-out/` kecuali proyek memang meng-commit-nya di cabang ini.

## Urutan eksekusi

1, 2, 3 (migration berurutan), 4, 6, 5, 7, 8, 9, 10, 11. Task 6 sebelum 5 karena rute booking mengimpor `notifyBookingCreated`.
