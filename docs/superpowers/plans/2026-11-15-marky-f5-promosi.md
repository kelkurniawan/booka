# F5 Promosi: banner dan voucher: rencana implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merchant Pro dan Studio bisa memasang banner promosi (maksimal 3 tayang bersamaan) di halaman booking dan membuat voucher publik atau rahasia. Pelanggan memilih voucher publik atau mengetik kode rahasia di langkah 3, dan `create_booking` memvalidasi kode di server, menyimpan diskon, lalu menghitung DP dari harga setelah diskon.

**Architecture:** Tiga migration. Yang pertama membuat `vouchers`, kolom voucher di `bookings` (dengan constraint nominal baru), satu fungsi internal `evaluate_voucher` yang menjadi satu-satunya aturan kelayakan, plus pembungkus untuk anon (`public_vouchers`), route cek kode (`check_voucher`, `service_role`), statistik dashboard (`voucher_stats`), dan rate limit cek kode. Yang kedua mendefinisikan ulang `create_booking` dengan argumen kesembilan `p_voucher_code`. Validasi dan hitungan pemakaian berjalan di bawah advisory lock merchant yang sudah ada, jadi kuota aman dari balapan tanpa tabel penebusan terpisah. Yang ketiga membuat `merchant_banners` dengan trigger batas 3 tayang. Di TypeScript, modul murni `src/lib/booking/voucher.ts` dan `src/lib/promo/banner.ts` mencerminkan aturan SQL untuk tampilan. Komponen publik hanya memakai token tema.

**Tech Stack:** Postgres (migration Supabase, uji `npm run docker:test`), Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui, Zod, Supabase Storage (bucket `merchant-media`), `node:test` lewat tsx, Storybook 10.

**Spec:** `docs/superpowers/specs/2026-11-14-marky-redesign-design.md` bagian 1, 2, 5 (F5), 6 (butir 4: maksimal 3 banner tayang), 7. Arah visual: `DESIGN.md`. Artboard: M5 `PromoBanner.dc.html`, M6 `PromoVoucher.dc.html`, V1 `PromoProfil.dc.html`, V2 `PromoCheckout.dc.html`. Teks artboard: `python3 .superpowers/design/extract.py .superpowers/design/app/<file>`; data contoh (alasan voucher, daftar status) ada di blok `<script type="text/x-dc">` berkasnya. Aturan uang yang dipertahankan: `docs/superpowers/plans/2026-11-15-marky-f2-cara-bayar.md` (Keputusan 15, 18) dan `supabase/migrations/20261115000500_payment_mode_minimums.sql`.

## Prasyarat

F5 dimulai setelah F2, F3, dan F4 selesai dan di-commit. F5 memakai dari fase sebelumnya: `public.booking_holds_slot(booking_status, timestamptz)` (F2), `MIN_ONLINE_CHARGE` dan `computeAmounts` di `src/lib/booking/payment-mode.ts` (F2), `create_booking` delapan argumen dengan `p_source` dan `reap_expired_bookings_for(uuid)` (F3 `20261115000600`), `BOOKING_LIST_COLUMNS` dan `booking-detail-panel.tsx` (F3), sidebar berkelompok (F3 Task 4), dan `cancel_booking_by_customer` (F4, membatalkan booking dan karena itu membebaskan pemakaian voucher). Bila salah satunya belum ada di cabang, berhenti dan lapor.

## Keputusan (spec diam atau bentrok, diputuskan di sini)

1. **Voucher dan banner untuk Pro dan Studio.** Starter tidak bisa membuat keduanya (trigger `enforce_promo_tier`, `P0001`). Merchant yang turun ke Starter tetap menyimpan barisnya, tetapi banner tidak tampil (policy anon), `public_vouchers` kosong, dan kode apa pun ditolak sebagai tidak ditemukan (`BK050`). Pola yang sama dengan `merchant_themes_enforce_tier` + `resolveTheme()`: trigger menjaga tulis, pembaca menjaga tampilan.
2. **Tanpa tabel `voucher_redemptions`.** Booking adalah buku besarnya: `bookings.voucher_id`, `voucher_code` (salinan), `discount_amount`. Pemakaian = booking dengan `voucher_id` itu yang `booking_holds_slot(status, expires_at)`. Hitungan ini selalu terjadi di dalam `create_booking`, setelah `pg_advisory_xact_lock(hashtext(merchant_id::text))` dan setelah `reap_expired_bookings_for`, jadi dua pelanggan yang berebut sisa kuota terakhir terserialisasi. Tabel kedua hanya menambah sinkronisasi yang bisa meleset.
3. **Pembatalan dan kedaluwarsa membebaskan pemakaian.** Booking `CANCELLED` (jalan apa pun: tenggat bayar, permintaan ditolak atau kedaluwarsa, dibatalkan merchant, dibatalkan pelanggan F4) dan `PENDING`/`REQUESTED` yang sudah lewat `expires_at` tidak dihitung. `PAID` dan `CONFIRMED` tetap dihitung selamanya, termasuk yang sudah lewat atau tidak datang. Karena hitungannya turunan, tidak ada trigger pelepas.
4. **Rumus diskon.** `PERCENT`: `round(harga * value / 100)` (setengah ke atas, sama dengan F2 Keputusan 15), dibatasi `max_discount` bila diisi. `FIXED`: `value`. Keduanya dibatasi harga. Lalu: bila harga `>= 1500` dan harga setelah diskon jatuh di 1 sampai 1499, diskon dikurangi sampai harga akhir tepat 1500. Harga akhir 0 boleh: F2 berlaku apa adanya (`CONFIRMED`, tanpa koneksi payment, batas per nomor `BK020`). Layanan lama berharga 1 sampai 1499 tidak disentuh dan tetap `BK022` seperti F2.
5. **DP dari harga setelah diskon.** Di `create_booking`, semua rumus F2 (`v_due_now`, lantai DP `least(harga, 1500)`, `PENDING` bernilai 0 jadi `CONFIRMED`, `BK022`, batas `BK020` untuk booking gratis) memakai `v_price = service.price - v_discount`. `amount_due_on_site = v_price - v_due_now`. Constraint `bookings_amount_split` diganti `amount_due_now + amount_due_on_site + discount_amount = service_price` (F2 Keputusan 18).
6. Booking manual (F3, `p_source = 'MANUAL'`) tidak pernah memakai voucher. Cabang `MANUAL` mengabaikan `p_voucher_code`; `create_manual_booking` tidak mengirimnya.
7. Kode: huruf besar dan angka, 4 sampai 16 karakter (artboard M6), disimpan huruf besar, unik per merchant. Masukan pelanggan di-`upper(btrim())`, jadi tidak peka huruf besar/kecil. (Ditambah controller) Voucher privat wajib minimal 6 karakter supaya sulit ditebak: constraint `check (visibility = 'PUBLIC' or char_length(code) >= 6)` dan pesan Zod "Kode voucher privat minimal 6 huruf atau angka", diuji di §45.
8. Pelanggan baru = nomor itu tidak punya booking di merchant ini yang `booking_holds_slot` (artinya `PAID`/`CONFIRMED` kapan pun, atau `PENDING`/`REQUESTED` yang masih hidup).
9. `min_spend` dibandingkan dengan harga layanan sebelum diskon. `service_ids` null berarti semua layanan.
10. **Anon tidak punya hak apa pun ke tabel `vouchers`.** Daftar publik hanya lewat `public_vouchers(p_merchant_id)` (`security definer`, anon boleh EXECUTE) yang mengembalikan voucher `PUBLIC`, sudah mulai, belum berakhir, kuota belum habis, dan merchant bukan Starter, dengan kolom yang dibutuhkan pemilih saja. Voucher publik yang belum mulai tidak ditampilkan.
11. **Kode rahasia hanya divalidasi dengan kode persis**, lewat `check_voucher` (`service_role`) di `POST /api/vouchers/check` atau lewat `create_booking`. Route cek dibatasi 10 percobaan per (hash IP, merchant) per 15 menit dan gagal tertutup (RPC rate limit gagal berarti 503). Jalur booking sudah dibatasi `check_booking_rate_limit` (3 per 15 menit). Route cek tidak menerima nomor WhatsApp, supaya tidak bisa dipakai menebak apakah suatu nomor pernah jadi pelanggan; aturan per nomor dan pelanggan baru hanya diperiksa saat booking.
12. Errcode baru: `BK050` kode tidak ditemukan (termasuk merchant Starter), `BK051` belum berlaku atau sudah berakhir, `BK052` kuota habis, `BK053` nomor sudah memakai voucher ini, `BK054` di bawah minimal transaksi, `BK055` tidak berlaku untuk layanan ini, `BK056` khusus pelanggan baru, `PR001` lebih dari 3 banner tayang bersamaan. `evaluate_voucher` mengembalikan errcode itu sebagai `reason`, jadi route cek dan `create_booking` memakai pesan yang sama lewat `mapBookingError`.
13. Voucher boleh dihapus kapan saja. `bookings.voucher_id` `on delete set null`; `voucher_code` dan `discount_amount` booking tetap. Tidak ada kolom aktif/nonaktif: menghentikan voucher = mengisi tanggal selesai hari ini, atau menghapusnya.
14. Tanggal di form dashboard berupa tanggal WIB. `starts_at` = tanggal mulai 00.00 WIB, `ends_at` = hari setelah tanggal selesai 00.00 WIB (eksklusif). Keduanya opsional ("Tanpa batas").
15. **Batas 3 banner ditegakkan trigger** `enforce_banner_live_limit`: untuk banner yang `published` dan belum berakhir, jumlah banner `published` lain yang tayang di titik mana pun dalam jendelanya (dipotong ke `now()`) harus di bawah 3. Draf dan banner yang sudah berakhir tidak dihitung, jadi banner terjadwal keempat (artboard M5) tetap bisa disimpan. Dikunci `pg_advisory_xact_lock(hashtext('banner:' || merchant_id::text))`.
16. Tujuan tombol banner: `VOUCHER` (voucher publik; tombol memasang voucher itu di alur), `SERVICE` (memilih layanan itu), atau `URL` (wajib `https://`, dibuka di tab baru dengan `rel="noopener noreferrer nofollow"`). Banner boleh tanpa tombol. FK target `on delete set null`; tombol disembunyikan bila targetnya hilang, voucher-nya bukan publik atau tidak hidup, atau layanannya tidak aktif. Voucher rahasia tidak pernah bocor lewat banner karena kodenya hanya diambil dari `public_vouchers`.
17. Warna banner template `ACCENT | DARK | SOFT`, dipetakan ke token tema: `ACCENT` = `--primary`/`--primary-foreground`, `DARK` = `--foreground`/`--background`, `SOFT` = `--card`/`--foreground` dengan garis `--border` dan tombol `--primary`. Kontras ikut terjamin oleh `resolveTheme()`.
18. Gambar banner: dipilih JPG/PNG/WebP (batas `validateImageFile` yang ada, 12 MB mentah), dipotong tengah ke rasio 3:1 dan dikecilkan ke 1200x400 WebP di browser, diunggah ke `{merchant_id}/banner/{acak}.webp`. Constraint path seperti `service_media_path_scoped`. Menghapus banner atau mengganti gambar ikut menghapus berkas lama.
19. **Banner di halaman publik tidak berputar otomatis.** Baris gulir horizontal dengan `scroll-snap` (banner berikutnya mengintip). Tanpa timer, tanpa tombol jeda, tanpa urusan reduced motion.
20. Tidak ada hitungan klik banner ("86 klik" di M5). Belum ada pelacakan, dan angka karangan termasuk anti-goal.
21. Kartu "Kode promo ... Salin" di V1 diganti strip "voucher terpasang" di alur (kode, ringkasan, tombol Lepas). Menyalin kode tidak berguna bila voucher bisa langsung dipasang.
22. Pesan gagal (kode salah, kuota habis) berupa teks netral `role="alert"`, tidak merah (konvensi F2). Merah hanya untuk tombol Hapus di dashboard.
23. Dashboard: item "Promosi" di grup sidebar "Halaman booking" (F3 Keputusan 15), di bawah Tampilan. Rute `ROUTES.promoBanners = "/dashboard/promosi"` dan `ROUTES.promoVouchers = "/dashboard/promosi/voucher"`, di bawah `/dashboard` sehingga tidak masuk `reserved_usernames`. Merchant Starter melihat kartu ajakan ke Langganan, bukan form.
24. Kalimat statistik M6 ("RpX diskon diberikan bulan ini, dari N booking yang memakai voucher") dihitung dari `voucher_stats()`: booking yang memegang slot, dibuat di bulan kalender WIB ini. Kalimat disembunyikan bila N = 0.
25. Diterima sadar: pembayaran webhook yang datang terlambat untuk `PENDING` kedaluwarsa yang belum dibersihkan bisa membuat pemakaian melebihi kuota satu kali. Celah yang sama sudah ada untuk slot sejak F2, dan pembersih `pg_cron` 5 menit memperkecilnya.
26. `src/lib/plans.ts`: fitur Pro bertambah `{ label: "Voucher dan banner promosi" }`.

## Konflik dengan spec atau desain

- Spec F5 menyebut `voucher_redemptions`. Diganti buku besar di `bookings` dengan hitungan di bawah advisory lock (Keputusan 2). Tujuan spec, kuota terkunci atomik, tetap terpenuhi.
- V1 memutar banner tiap 4,5 detik. Diganti baris gulir tanpa gerakan (Keputusan 19).
- M5 menampilkan jumlah klik (Keputusan 20). V1 menampilkan kartu Salin (Keputusan 21). V2 memberi garis merah pada kode salah (Keputusan 22).
- Teks artboard dengan `·` (mis. "Rasio 3:1, minimal 1200 × 400 px · JPG, PNG, WebP · maks 2 MB", "Pakai kode WISUDA20 · sampai 31 Des") ditulis ulang tanpa pemisah itu (`DESIGN.md`). Batas 2 MB diganti batas mentah 12 MB yang ada karena gambar dikecilkan di browser.

## Global Constraints

- Migration baru saja, berurutan: `20261117000100_vouchers.sql`, `20261117000200_create_booking_voucher.sql`, `20261117000300_merchant_banners.sql`. Jangan edit migration lama.
- `create_booking` didefinisikan ulang dari definisi TERAKHIR di `supabase/migrations/` saat eksekusi (`grep -l "function public.create_booking" supabase/migrations/*.sql | tail -1`, saat rencana ini ditulis F3 `20261115000600_manual_booking.sql`), bukan dari berkas tetap. Argumen voucher ditambahkan di atas definisi itu.
- Tabel baru: RLS aktif, `revoke all ... from anon, authenticated`, grant per kolom untuk `insert`/`update`. Fungsi baru: `revoke execute ... from public, anon, authenticated`, lalu `grant execute` eksplisit hanya ke peran pemanggil. Akhiri tiap migration dengan `notify pgrst, 'reload schema';`.
- Uji di `supabase/tests/99_verify.sql`, bagian 45 sampai 48 (49 dicadangkan). Label diawali `t45`..`t48`. Lulus berarti tidak ada baris output diawali `FAIL` di seluruh `npm run docker:test` (Docker harus jalan: `open -a Docker`), termasuk bagian 11, 30, 33, 35, 36 yang memanggil `create_booking` dengan 5 sampai 8 argumen.
- `src/types/database.ts` ikut diperbarui, `type` bukan `interface`.
- Uang tetap langsung ke gateway merchant. Diskon hanya mengurangi `amount_due_now`/`amount_due_on_site`; webhook dan charge tidak berubah.
- `createAdminClient()` selalu difilter `merchant_id` (atau `username` lalu `merchant_id`).
- Halaman publik dan `src/components/booking-page/*` hanya memakai token tema (`var(--...)` dan kelas Tailwind yang memetakannya). Dashboard tetap monokrom.
- Larangan `DESIGN.md`: tanpa em dash, tanpa eyebrow, tanpa label kapital berjarak, tanpa `·`, tanpa panah di teks tombol. Target sentuh minimal 44px (`min-h-11`), fokus terlihat, semua bisa dengan keyboard. Setiap daftar data punya keadaan memuat, kosong, dan gagal.
- Komponen tampilan baru menerima data dan aksi sebagai props dan punya story.
- UI dan komentar berbahasa Indonesia, nama variabel Inggris. Tidak ada langkah deploy.

## Review Focus

1. Dua pelanggan berebut sisa kuota terakhir, atau satu nomor membuka dua tab untuk voucher "satu kali per nomor": hanya satu booking memegang voucher, yang lain mendapat `BK052`/`BK053`. Kuncinya `evaluate_voucher` dipanggil setelah advisory lock dan `reap_expired_bookings_for`. Diuji berurutan t47c dan t47d; urutan kunci diperiksa reviewer.
2. Voucher membuat harga Rp10.000 jadi Rp1.000: harga akhir dinaikkan ke Rp1.500 dan QRIS tetap bisa dibuat. Voucher 100%: booking `CONFIRMED` tanpa QRIS dan tanpa koneksi payment, dan batas per nomor tetap berlaku. Diuji t47f, t47g, dan `computeDiscount` di Task 4.
3. Pelanggan memasang voucher lalu kembali dan mengganti ke layanan di luar cakupan voucher: alur melepas voucher dengan alasannya, dan server tetap menolak `BK055` bila klien terlewat. Diuji `voucherIneligibleReason` (Task 4) dan t47b.
4. Merchant turun ke Starter: banner hilang dari halaman publik, `public_vouchers` kosong, kode lama ditolak `BK050`, dan booking tanpa voucher tetap jalan. Diuji t46b, t47i, t48f.
5. Merchant memperpanjang jadwal banner terjadwal keempat sampai menimpa periode tiga banner tayang: penyimpanan ditolak dengan pesan "Maksimal 3 banner tayang bersamaan", sedangkan banner yang sudah berakhir dan draf tidak ikut dihitung. Diuji t48c dan t48d.

---

### Task 1: Skema voucher, kelayakan, dan pembaca

Model: opus (aturan uang, hak akses anon, rate limit).

**Files:**
- Create: `supabase/migrations/20261117000100_vouchers.sql`
- Modify: `supabase/tests/99_verify.sql` (bagian `-- 45. Voucher: skema dan hak akses (20261117000100)` dan `-- 46. Voucher: kelayakan, daftar publik, cek kode (20261117000100)`), `src/types/database.ts`

**Interfaces:**
- Consumes: `public.booking_holds_slot(booking_status, timestamptz)`, `public.set_updated_at()`, `public.bookings`, `public.services`, `public.merchants(subscription_tier, username)`.
- Produces (SQL):

```sql
create type public.voucher_kind as enum ('PERCENT', 'FIXED');
create type public.voucher_visibility as enum ('PUBLIC', 'PRIVATE');

create table public.vouchers (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  code text not null,              -- check code ~ '^[A-Z0-9]{4,16}$'; unique (merchant_id, code)
  kind public.voucher_kind not null,
  value integer not null,          -- PERCENT 1..100, FIXED 1..100000000
  max_discount integer,            -- null, atau >= 1 dan hanya untuk PERCENT
  min_spend integer,               -- null atau >= 1
  service_ids uuid[],              -- null = semua layanan; bila terisi cardinality 1..50
  quota integer,                   -- null atau 1..100000
  per_phone_limit integer,         -- null atau 1..100
  new_customer_only boolean not null default false,
  visibility public.voucher_visibility not null default 'PUBLIC',
  starts_at timestamptz,
  ends_at timestamptz,             -- null, atau > starts_at bila keduanya terisi
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bookings
  add column voucher_id uuid references public.vouchers (id) on delete set null,
  add column voucher_code text,
  add column discount_amount numeric(12, 2) not null default 0;
-- bookings_amount_split diganti:
--   amount_due_now >= 0 and amount_due_on_site >= 0 and discount_amount >= 0
--   and amount_due_now + amount_due_on_site + discount_amount = service_price
-- bookings_voucher_snapshot: voucher_code is not null or (voucher_id is null and discount_amount = 0)
create index bookings_voucher_idx on public.bookings (voucher_id) where voucher_id is not null;

-- Internal. Satu baris selalu. reason null = layak; selain itu errcode BK050..BK056 / P0005.
public.evaluate_voucher(p_merchant_id uuid, p_code text, p_service_id uuid, p_customer_whatsapp text)
  returns table (voucher_id uuid, code text, discount numeric, reason text)

-- anon, authenticated, service_role
public.public_vouchers(p_merchant_id uuid) returns table (
  id uuid, code text, kind public.voucher_kind, value integer, max_discount integer,
  min_spend integer, service_ids uuid[], ends_at timestamptz,
  per_phone_limit integer, new_customer_only boolean)

-- service_role saja. Kolom syarat hanya terisi bila reason null.
public.check_voucher(p_merchant_id uuid, p_code text, p_service_id uuid) returns table (
  code text, kind public.voucher_kind, value integer, max_discount integer,
  min_spend integer, service_ids uuid[], discount numeric, reason text)

-- authenticated saja; merchant dari auth.uid(), tanpa sesi -> 42501.
public.voucher_stats() returns table (voucher_id uuid, used integer, month_discount numeric, month_bookings integer)

create table public.voucher_attempts (id bigint generated always as identity primary key,
  ip_hash text not null, merchant_id uuid not null references public.merchants (id) on delete cascade,
  created_at timestamptz not null default now());
-- service_role saja. 10 per (ip_hash, merchant) per 15 menit.
public.check_voucher_rate_limit(p_ip_hash text, p_merchant_id uuid) returns boolean

-- Trigger before insert pada vouchers (Task 3 memasangnya juga di merchant_banners).
public.enforce_promo_tier() returns trigger  -- STARTER -> P0001 'Promosi hanya tersedia untuk paket Pro.'
```

- Produces (TS, `src/types/database.ts`):
  - `export type VoucherKind = "PERCENT" | "FIXED"; export type VoucherVisibility = "PUBLIC" | "PRIVATE";`
  - `export type Voucher = { id: string; merchant_id: string; code: string; kind: VoucherKind; value: number; max_discount: number | null; min_spend: number | null; service_ids: string[] | null; quota: number | null; per_phone_limit: number | null; new_customer_only: boolean; visibility: VoucherVisibility; starts_at: string | null; ends_at: string | null; created_at: string; updated_at: string }`
  - Tabel `vouchers`: `Row: Voucher`; `Insert` = `Voucher` tanpa `id`, `created_at`, `updated_at`, dengan kolom nullable/berdefault opsional; `Update: Partial<Omit<Voucher, "id" | "merchant_id" | "created_at" | "updated_at">>`.
  - `export type PublicVoucher = Pick<Voucher, "id" | "code" | "kind" | "value" | "max_discount" | "min_spend" | "service_ids" | "ends_at" | "per_phone_limit" | "new_customer_only">`
  - `Booking` + `voucher_id: string | null; voucher_code: string | null; discount_amount: number`.
  - `Functions.public_vouchers: { Args: { p_merchant_id: string }; Returns: PublicVoucher[] }`
  - `Functions.check_voucher: { Args: { p_merchant_id: string; p_code: string; p_service_id: string }; Returns: { code: string | null; kind: VoucherKind | null; value: number | null; max_discount: number | null; min_spend: number | null; service_ids: string[] | null; discount: number | null; reason: string | null }[] }`
  - `Functions.voucher_stats: { Args: Record<string, never>; Returns: { voucher_id: string; used: number; month_discount: number; month_bookings: number }[] }`
  - `Functions.check_voucher_rate_limit: { Args: { p_ip_hash: string; p_merchant_id: string }; Returns: boolean }`
  - `Enums` + `voucher_kind`, `voucher_visibility`.

Isi migration:

- `evaluate_voucher` (`plpgsql`, `stable`, `set search_path = ''`, bukan definer; pemanggilnya definer). Urutan dan alasan persis:
  1. `v_code := upper(btrim(p_code))`. Cari voucher `merchant_id = p_merchant_id and code = v_code` yang merchant-nya `subscription_tier <> 'STARTER'`. Tidak ada → `BK050`.
  2. `starts_at > now()` atau `ends_at <= now()` → `BK051`.
  3. Harga layanan aktif milik merchant (`services.id = p_service_id and merchant_id = p_merchant_id and is_active`). Tidak ada → `P0005`. `service_ids` terisi dan tidak memuat `p_service_id` → `BK055`.
  4. `min_spend` terisi dan harga `< min_spend` → `BK054`.
  5. `quota` terisi dan pemakaian (Keputusan 2) `>= quota` → `BK052`.
  6. Bila `p_customer_whatsapp` tidak null: `per_phone_limit` terisi dan pemakaian nomor itu `>= per_phone_limit` → `BK053`; `new_customer_only` dan nomor itu punya booking yang memegang slot di merchant ini → `BK056`.
  7. `discount` menurut Keputusan 4:

```sql
v_discount := case when v.kind = 'PERCENT' then round(v_price * v.value / 100.0) else v.value end;
if v.kind = 'PERCENT' and v.max_discount is not null then v_discount := least(v_discount, v.max_discount); end if;
v_discount := least(v_discount, v_price);
-- Harga akhir 1..1499 tidak bisa ditagih QRIS (BK022): diskon dipotong sampai harga akhir 1500.
if v_price >= 1500 and v_price - v_discount between 1 and 1499 then v_discount := v_price - 1500; end if;
```

  Saat `reason` terisi, `voucher_id`, `code`, `discount` null.
- `public_vouchers` (`sql`, `stable`, `security definer`, `set search_path = ''`): voucher `PUBLIC` merchant itu yang merchant-nya punya `username` dan bukan Starter, `(starts_at is null or starts_at <= now())`, `(ends_at is null or ends_at > now())`, `(quota is null or pemakaian < quota)`. Urut `created_at`.
- `check_voucher` (`plpgsql`, `stable`, `security definer`): memanggil `evaluate_voucher(p_merchant_id, p_code, p_service_id, null)`; bila layak, gabungkan syarat voucher-nya.
- `voucher_stats` (`sql`, `stable`, `security definer`): semua voucher merchant `auth.uid()` (tanpa sesi: bungkus `plpgsql` yang melempar `42501`), `left join` booking yang memegang slot; `used` = jumlahnya; `month_discount`/`month_bookings` = jumlah `discount_amount` dan baris dengan `created_at >= (date_trunc('month', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta')`.
- `check_voucher_rate_limit` (`plpgsql`, `security definer`): hapus baris `ip_hash` itu yang lebih tua dari 1 jam, sisipkan satu baris, kembalikan `count(*) <= 10` dalam 15 menit terakhir untuk (ip_hash, merchant). Indeks `(ip_hash, merchant_id, created_at desc)`.
- Hak akses `vouchers`: `revoke all from anon, authenticated`; `grant select, delete to authenticated`; `grant insert (merchant_id, code, kind, value, max_discount, min_spend, service_ids, quota, per_phone_limit, new_customer_only, visibility, starts_at, ends_at)`; `grant update (` kolom yang sama tanpa `merchant_id` `)`. Policy `authenticated` select/insert/update/delete dengan `(select auth.uid()) = merchant_id` (insert dan update juga `with check`). Tidak ada policy anon. Trigger `vouchers_set_updated_at` dan `vouchers_enforce_tier` (before insert). `voucher_attempts`: RLS aktif, `revoke all` dari keduanya. Kolom booking baru tidak butuh grant: `authenticated` sudah punya `select` tingkat tabel, dan `update`-nya per kolom tanpa kolom ini; anon tidak punya hak ke `bookings`.

- [ ] **Step 1: Tulis kasus uji yang gagal.** Merchant PRO `45454545-0000-0000-0000-000000000001` (username `promo-45`, jam 09:00 sampai 17:00 tiap hari), layanan A `FULL 350000` dan B `ON_SITE 450000`, merchant PRO kedua `...0002`, merchant STARTER `...0003`. Booking pemakaian disisipkan langsung dengan `voucher_id`, `voucher_code`, `discount_amount`, dan nominal yang memenuhi constraint baru.
  - Bagian 45: t45a masing-masing `23514`: `code = 'ab12'` (huruf kecil), `code = 'ABC'`, `code` 17 karakter, `PERCENT` 101, `PERCENT` 0, `FIXED` 0, `max_discount` pada `FIXED`, `quota = 0`, `per_phone_limit = 0`, `service_ids = '{}'`, `ends_at <= starts_at`; `23505` untuk kode sama di merchant sama; kode sama di merchant `...0002` diterima. t45b insert voucher untuk merchant STARTER → `P0001`. t45c booking dengan `discount_amount = 70000`, `amount_due_now = 280000`, `amount_due_on_site = 0`, harga 350000, kode terisi diterima; jumlah tidak cocok → `23514`; `discount_amount = 10` tanpa `voucher_code` → `23514`; insert lama tanpa kolom nominal (t32b) tetap mengisi `amount_due_now = service_price`. t45d hapus voucher yang dipakai booking: `voucher_id` booking jadi null, `voucher_code` dan `discount_amount` tetap. t45e menghapus merchant yang punya voucher dan booking bervoucher berhasil (cascade). t45f hak akses: `has_table_privilege('anon', 'public.vouchers', p)` false untuk SELECT, INSERT, UPDATE, DELETE; `has_column_privilege('authenticated', 'public.vouchers', 'merchant_id', 'UPDATE')` false; anon tidak bisa SELECT `voucher_attempts`; anon dan authenticated tidak bisa EXECUTE `evaluate_voucher(uuid, text, uuid, text)`, `check_voucher(uuid, text, uuid)`, `check_voucher_rate_limit(text, uuid)`; anon bisa EXECUTE `public_vouchers(uuid)`; authenticated bisa EXECUTE `voucher_stats()`, anon tidak. t45g sebagai `authenticated` merchant `...0001`: tidak melihat voucher `...0002`, update voucher `...0002` mengubah 0 baris, insert dengan `merchant_id` `...0002` gagal `42501`.
  - Bagian 46 (panggil `evaluate_voucher` langsung sebagai superuser): t46a voucher `PERCENT 20 max 100000` untuk A → `discount = 70000`; `PERCENT 50 max 100000` → 100000; `FIXED 400000` untuk A → 350000; `FIXED 349000` → 348500 (harga akhir 1500); `PERCENT 100` → 350000; kode `'  wisuda20 '` cocok dengan `WISUDA20`. t46b kode tak dikenal `BK050`; voucher milik merchant lain `BK050`; setelah merchant `...0001` diubah ke STARTER semua kodenya `BK050` (kembalikan ke PRO). t46c `starts_at = now() + 1 hari` `BK051`; `ends_at = now() - 1 menit` `BK051`. t46d `service_ids = {B}` untuk A `BK055`; layanan nonaktif `P0005`. t46e `min_spend 500000` untuk A `BK054`. t46f `quota 2` dengan dua booking `CONFIRMED` bervoucher → `BK052`; satu di antaranya diubah `CANCELLED` → layak; satu `PENDING` kedaluwarsa tidak dihitung; `PAID` minggu lalu tetap dihitung. t46g `per_phone_limit 1`: nomor X dengan satu booking `CONFIRMED` bervoucher → `BK053`, nomor Y layak, phone null layak. t46h `new_customer_only`: nomor dengan `CONFIRMED` tanpa voucher bulan lalu `BK056`; nomor yang hanya punya booking `CANCELLED` layak. t46i `public_vouchers` sebagai `anon` (`set local role anon`): memuat voucher publik hidup, tidak memuat voucher `PRIVATE`, voucher yang belum mulai, yang berakhir, dan yang kuotanya habis; kosong untuk merchant STARTER. t46j `check_voucher` untuk kode rahasia yang benar mengembalikan syarat dan `discount`; untuk `BK054` hanya `reason` yang terisi. t46k `check_voucher_rate_limit` dengan hash sama: sepuluh panggilan pertama true, kesebelas false; hash lain true. t46l `voucher_stats()` sebagai merchant: `used`, `month_discount`, `month_bookings` sesuai booking yang disisipkan; tanpa klaim `sub` `42501`.
- [ ] **Step 2: Jalankan** `npm run docker:test`. Harapan: baris `FAIL` di bagian 45 dan 46.
- [ ] **Step 3: Tulis migration** sesuai Interfaces dan Isi migration. Komentar kepala menyebut Keputusan 2, 3, 4, 10, 11.
- [ ] **Step 4: Jalankan** `npm run docker:test`. Harapan: tidak ada `FAIL` di seluruh output.
- [ ] **Step 5: Perbarui tipe** sesuai Interfaces. Tambah `voucher_code, discount_amount` ke `BOOKING_LIST_COLUMNS` dan `BOOKING_LIST_COLUMN_LIST` di `src/app/dashboard/bookings/booking-state.ts` (uji dua arah mewajibkannya) dan ke `src/components/booking-page/fixtures.ts`. Jalankan `npm run typecheck && npm run test:unit`.
- [ ] **Step 6: Commit**: `git add supabase/migrations/20261117000100_vouchers.sql supabase/tests/99_verify.sql src/types/database.ts src/app/dashboard/bookings/booking-state.ts src/components/booking-page/fixtures.ts` lalu `git commit -m "Tambah skema voucher, aturan kelayakan, dan pembaca publik"`.

---

### Task 2: `create_booking` menerima kode voucher

Model: opus (uang dan konkurensi; menulis ulang fungsi inti).

**Files:**
- Create: `supabase/migrations/20261117000200_create_booking_voucher.sql`
- Modify: `supabase/tests/99_verify.sql` (bagian `-- 47. create_booking dengan voucher (20261117000200)`), `src/types/database.ts` (`Args` `create_booking`)

**Interfaces:**
- Consumes: `evaluate_voucher` (Task 1), kolom booking Task 1, `create_booking` delapan argumen terakhir (lihat Global Constraints).
- Produces:

```sql
drop function public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source);
public.create_booking(
  p_merchant_id uuid, p_service_id uuid, p_start_datetime timestamptz,
  p_customer_name text, p_customer_whatsapp text,
  p_staff_id uuid default null, p_can_charge boolean default true,
  p_source public.booking_source default 'ONLINE',
  p_voucher_code text default null
) returns setof public.bookings            -- service_role saja
```

  TS: `Functions.create_booking.Args` + `p_voucher_code?: string | null`.

Perubahan terhadap definisi terakhir (selain itu disalin persis):
1. Deklarasi `v_voucher record; v_discount numeric(12, 2) := 0; v_price numeric(12, 2);`.
2. Di cabang `ONLINE` (bukan `MANUAL`), sesudah cek layanan (`P0005`) dan sebelum menghitung mode efektif: bila `nullif(btrim(p_voucher_code), '') is not null`, `select * into v_voucher from public.evaluate_voucher(p_merchant_id, p_voucher_code, p_service_id, p_customer_whatsapp);`, lalu `if v_voucher.reason is not null then raise exception '%', <pesan sesuai errcode> using errcode = v_voucher.reason; end if; v_discount := v_voucher.discount;`. Lock dan pembersihan kedaluwarsa sudah terjadi di awal fungsi, dan urutan itu wajib tetap (Keputusan 2).
3. `v_price := v_service.price - v_discount;` dan setiap `v_service.price` di rumus nominal (DP persen, DP tetap `least(...)`, lantai `least(harga, 1500)` beserta syarat `harga > 0`, cabang `FULL`) diganti `v_price`. Cek `PENDING` bernilai 0, `BK022`, `BK021`, dan `BK020` tidak diubah; mereka sudah membaca `v_due_now`.
4. Cabang `MANUAL` tetap: `v_discount = 0`, `p_voucher_code` diabaikan (komentar satu baris: Keputusan 6).
5. `insert` menambah `voucher_id, voucher_code, discount_amount` = `v_voucher.voucher_id, v_voucher.code, v_discount` (null, null, 0 tanpa voucher) dan `amount_due_on_site = v_price - v_due_now`.
6. Komentar kepala menambah satu baris: `voucher -> v_price = harga - diskon; semua nominal F2 dari v_price`.
7. Grant: cabut dari `public, anon, authenticated`, `grant execute ... to service_role`. `create_manual_booking` tidak diubah (memanggil dengan delapan argumen posisi, argumen kesembilan memakai default).

- [ ] **Step 1: Tulis kasus uji yang gagal** di bagian 47. Merchant PRO `47474747-0000-0000-0000-000000000001` (username `voucher-47`, jam 09:00 sampai 17:00) dengan layanan: 1 `FULL 350000`, 2 `DEPOSIT PERCENT 30` harga 350000, 3 `DEPOSIT FIXED 100000` harga 350000, 4 `ON_SITE 450000`, 5 `FULL 10000`, 6 `REQUEST` tanpa DP harga 200000; voucher `WISUDA20` (`PERCENT 20 max 100000`), `HEMAT50` (`FIXED 50000`, `min_spend 300000`), `GRATIS` (`PERCENT 100`), `TIPIS` (`FIXED 9000`), `SATU` (`FIXED 10000`, `per_phone_limit 1`), `KUOTA1` (`FIXED 10000`, `quota 1`), `BARU` (`FIXED 10000`, `new_customer_only`), `SVC1` (`FIXED 10000`, `service_ids = {layanan 1}`). Helper `pg_temp.cb47(p_service, p_slot, p_phone, p_code, p_can_charge default true)` dan `pg_temp.check47(label, ..., status, due_now, due_on_site, discount)` meniru `cb35`/`check35`.
  - t47a `FULL` + `WISUDA20` → `PENDING 280000/0`, `discount_amount 70000`, `voucher_code 'WISUDA20'`, `voucher_id` terisi; kode `'wisuda20'` huruf kecil sama hasilnya. Tanpa kode, dan dengan `p_voucher_code = '  '`, → `PENDING 350000/0`, diskon 0, `voucher_code` null.
  - t47b `SVC1` untuk layanan 2 → `BK055`; kode tak dikenal → `BK050`; `HEMAT50` untuk layanan 5 → `BK054`. Tidak ada baris booking baru setelah ketiganya.
  - t47c `KUOTA1`: booking pertama diterima, kedua (nomor lain) `BK052`; booking pertama diubah `CANCELLED` lalu booking ketiga diterima.
  - t47d `SATU`: nomor X diterima, nomor X lagi (jam lain) `BK053`, nomor Y diterima.
  - t47e DP dari harga setelah diskon: layanan 2 + `WISUDA20` → `PENDING 84000/196000`, diskon 70000; layanan 3 + `WISUDA20` → `PENDING 100000/180000`; layanan 4 + `WISUDA20` → `CONFIRMED 0/360000` diskon 90000; layanan 6 + `WISUDA20` → `REQUESTED 160000/0`.
  - t47f `TIPIS` untuk layanan 5 (10000) → `PENDING 1500/0`, diskon 8500.
  - t47g `GRATIS` untuk layanan 1 tanpa koneksi (`p_can_charge false`) → `CONFIRMED 0/0`, diskon 350000; dengan `max_active_per_phone = 1`, booking `GRATIS` kedua nomor sama → `BK020` (kembalikan setelan); `GRATIS` untuk layanan 2 → `CONFIRMED 0/0`.
  - t47h `BARU`: nomor t47a (punya booking `PENDING` yang masih memegang slot) → `BK056`; nomor dengan booking `CONFIRMED` bulan lalu yang disisipkan langsung → `BK056`; nomor baru diterima.
  - t47i merchant diubah ke STARTER: `WISUDA20` → `BK050`; tanpa kode tetap diterima (kuota bulanan Starter belum habis). Kembalikan ke PRO.
  - t47j `create_manual_booking` sebagai `authenticated` pemilik tetap menghasilkan `CONFIRMED`, `amount_due_on_site = service_price`, diskon 0.
  - t47k hak akses: anon dan authenticated tidak bisa EXECUTE `create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source, text)`; `to_regprocedure` signature delapan argumen null.
- [ ] **Step 2: Jalankan** `npm run docker:test`. Harapan: baris `FAIL` di bagian 47.
- [ ] **Step 3: Tulis migration** sesuai perubahan di atas.
- [ ] **Step 4: Jalankan** `npm run docker:test`. Harapan: tidak ada `FAIL` di seluruh output, termasuk bagian 11, 30, 33, 35, 36, 40 sampai 42.
- [ ] **Step 5: Perbarui `Args`** di `database.ts`, jalankan `npm run typecheck`.
- [ ] **Step 6: Commit**: `git add supabase/migrations/20261117000200_create_booking_voucher.sql supabase/tests/99_verify.sql src/types/database.ts` lalu `git commit -m "Validasi voucher dan hitung DP dari harga setelah diskon di create_booking"`.

---

### Task 3: Skema banner dan batas 3 tayang

Model: opus (trigger konkurensi dan policy anon).

**Files:**
- Create: `supabase/migrations/20261117000300_merchant_banners.sql`
- Modify: `supabase/tests/99_verify.sql` (bagian `-- 48. Banner promosi (20261117000300)`), `src/types/database.ts`

**Interfaces:**
- Consumes: `public.enforce_promo_tier()` (Task 1), `public.vouchers`, `public.services`, `public.set_updated_at()`.
- Produces (SQL):

```sql
create type public.banner_source as enum ('TEMPLATE', 'IMAGE');
create type public.banner_color as enum ('ACCENT', 'DARK', 'SOFT');
create type public.banner_target as enum ('VOUCHER', 'SERVICE', 'URL');

create table public.merchant_banners (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  source public.banner_source not null,
  tag_text text,                   -- <= 24
  title text,                      -- <= 60; wajib bila TEMPLATE
  body text,                       -- <= 90
  color public.banner_color not null default 'ACCENT',
  image_path text,                 -- wajib bila IMAGE; '^<merchant_id>/banner/[A-Za-z0-9._-]+$', tanpa '..'
  alt_text text,                   -- 1..140; wajib bila IMAGE
  cta_text text,                   -- 1..20; terisi tepat bila target_kind terisi
  target_kind public.banner_target,
  target_voucher_id uuid references public.vouchers (id) on delete set null,   -- hanya bila VOUCHER
  target_service_id uuid references public.services (id) on delete set null,   -- hanya bila SERVICE
  target_url text,                 -- terisi tepat bila URL; <= 500; '^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[^[:space:]]*)?$'
  starts_at timestamptz,
  ends_at timestamptz,             -- > starts_at bila keduanya terisi
  sort_order integer not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- TEMPLATE: title not null, image_path dan alt_text null.
-- IMAGE: image_path dan alt_text not null, tag_text/title/body null.

public.enforce_banner_live_limit() returns trigger   -- internal, PR001
```

- Produces (TS): `BannerSource`, `BannerColor`, `BannerTarget` (union string), `MerchantBanner` (semua kolom di atas, nullable sebagai `| null`), tabel `merchant_banners` dengan `Insert`/`Update` seperti `vouchers`, `export type PublicBanner = Omit<MerchantBanner, "published" | "created_at" | "updated_at">`, `Enums` + tiga enum.

Isi migration:

- Trigger `merchant_banners_live_limit` `before insert or update of published, starts_at, ends_at`. Fungsinya harus VOLATILE (bawaan) supaya query sesudah lock melihat baris yang baru di-commit sesi lain. Algoritmanya (Keputusan 15):

```sql
if not new.published or (new.ends_at is not null and new.ends_at <= now()) then return new; end if;
perform pg_advisory_xact_lock(hashtext('banner:' || new.merchant_id::text));
v_new := tstzrange(greatest(coalesce(new.starts_at, '-infinity'), now()), coalesce(new.ends_at, 'infinity'), '[)');
-- Puncak tumpang tindih selalu terjadi di awal salah satu jendela di dalam v_new.
with others as (
  select tstzrange(coalesce(b.starts_at, '-infinity'), coalesce(b.ends_at, 'infinity'), '[)') r
  from public.merchant_banners b
  where b.merchant_id = new.merchant_id and b.published and b.id <> new.id
), points as (
  select lower(v_new) p
  union select lower(o.r) from others o where v_new @> lower(o.r)
)
select max((select count(*) from others o where o.r @> pt.p)) into v_peak from points pt;
if coalesce(v_peak, 0) >= 3 then
  raise exception 'Maksimal 3 banner tayang bersamaan' using errcode = 'PR001';
end if;
return new;
```

- Trigger `merchant_banners_enforce_tier` (before insert, `enforce_promo_tier()`), `merchant_banners_set_updated_at`.
- Hak akses: `revoke all from anon, authenticated`. `grant select (id, merchant_id, source, tag_text, title, body, color, image_path, alt_text, cta_text, target_kind, target_voucher_id, target_service_id, target_url, starts_at, ends_at, sort_order) to anon`. `authenticated`: `select`, `delete` tingkat tabel; `insert` per kolom (semua kolom isi termasuk `merchant_id` dan `published`); `update` per kolom yang sama tanpa `merchant_id`. Policy anon: `published and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())` dan merchant punya `username` dan bukan Starter. Policy `authenticated` select/insert/update/delete milik sendiri (`with check` untuk insert dan update).

- [ ] **Step 1: Tulis kasus uji yang gagal** di bagian 48. Merchant PRO `48484848-0000-0000-0000-000000000001` (username `banner-48`) dengan satu layanan dan satu voucher, merchant STARTER `...0002`.
  - t48a constraint, masing-masing `23514`: `TEMPLATE` tanpa `title`; `IMAGE` tanpa `alt_text`; `IMAGE` dengan `title`; `image_path = '<merchant lain>/banner/a.webp'`; `image_path = '<id>/banner/../x.webp'`; `target_kind = 'URL'` dengan `target_url = 'http://contoh.test'`, `'javascript:alert(1)'`, `'https://a.test/x y'`; `target_url` tanpa `target_kind`; `target_kind` tanpa `cta_text`; `target_service_id` dengan `target_kind = 'VOUCHER'`; `ends_at <= starts_at`; `title` 61 karakter. `expect_ok`: template minimal, image dengan path dan alt, URL `https://instagram.com/riasbysekar`.
  - t48b tiga banner `published` tanpa jendela diterima; banner keempat `published` tanpa jendela `PR001`; keempat sebagai draf diterima; mengubah draf itu jadi `published` `PR001`.
  - t48c dengan tiga banner tayang tanpa batas akhir dihapus satu dan diganti satu yang `ends_at = now() + 7 hari`: banner terjadwal `starts_at = now() + 8 hari` diterima; mengubah `starts_at`-nya ke `now() + 6 hari` `PR001`.
  - t48d banner yang `ends_at = now() - 1 hari` tidak dihitung: dengan tiga tayang, insert banner yang sudah berakhir diterima, dan banner baru tetap `PR001`. Jendela A `[+1, +10)`, B `[+1, +3)`, C `[+5, +8)` hari plus satu banner tanpa batas yang tayang sekarang: D `[+1, +10)` ditolak `PR001` (puncak 4 di hari +1); tanpa banner tanpa batas itu D diterima (puncak 3).
  - t48e insert banner merchant STARTER `P0001`.
  - t48f `anon` (`set local role anon`) melihat hanya banner tayang merchant PRO: tidak melihat draf, yang terjadwal, yang berakhir; setelah merchant diubah ke STARTER tidak melihat apa pun (kembalikan ke PRO). `has_column_privilege('anon', 'public.merchant_banners', 'published', 'SELECT')` false. Sebagai `authenticated` merchant lain: update banner `...0001` mengubah 0 baris.
  - t48g menghapus voucher dan layanan target membuat `target_voucher_id`/`target_service_id` null, baris banner tetap.
- [ ] **Step 2: Jalankan** `npm run docker:test`. Harapan: baris `FAIL` di bagian 48.
- [ ] **Step 3: Tulis migration** sesuai Interfaces dan Isi migration.
- [ ] **Step 4: Jalankan** `npm run docker:test`. Harapan: tidak ada `FAIL`.
- [ ] **Step 5: Perbarui tipe**, `npm run typecheck`.
- [ ] **Step 6: Commit**: `git add supabase/migrations/20261117000300_merchant_banners.sql supabase/tests/99_verify.sql src/types/database.ts` lalu `git commit -m "Tambah banner promosi dengan batas 3 tayang bersamaan"`.

---

### Task 4: Modul murni voucher dan banner, kode error

Model: haiku (tes lengkap di rencana, badan fungsi pendek).

**Files:**
- Create: `src/lib/booking/voucher.ts`, `src/lib/booking/voucher.test.ts`, `src/lib/promo/banner.ts`, `src/lib/promo/banner.test.ts`
- Modify: `src/lib/booking/payment-mode.ts`, `src/lib/booking/payment-mode.test.ts`, `src/lib/booking/errors.ts`, `src/lib/booking/errors.test.ts`

**Interfaces:**
- Consumes: tipe Task 1 dan 3, `MIN_ONLINE_CHARGE`, `formatRupiah`.
- Produces:

```ts
// src/lib/booking/voucher.ts  (komentar kepala: harus sama dengan evaluate_voucher di 20261117000100)
export type VoucherTerms = Pick<Voucher, "code" | "kind" | "value" | "max_discount" | "min_spend" | "service_ids">;
export const VOUCHER_CODE_PATTERN = /^[A-Z0-9]{4,16}$/;
export function normalizeVoucherCode(input: string): string;          // trim + toUpperCase
export function computeDiscount(voucher: VoucherTerms, price: number): number;   // Keputusan 4
/** Alasan voucher publik belum bisa dipakai untuk layanan ini, atau null. Hanya syarat yang terlihat anon. */
export function voucherIneligibleReason(
  voucher: VoucherTerms, service: Pick<Service, "id" | "price">, serviceNames: Record<string, string>,
): string | null;
/** "Diskon 20%, maks Rp100.000" | "Diskon 15%" | "Potongan Rp50.000" | "Potongan Rp50.000, min Rp500.000" */
export function voucherSummary(voucher: Pick<Voucher, "kind" | "value" | "max_discount" | "min_spend">): string;
export function randomVoucherCode(random?: () => number): string;     // 8 karakter dari "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
export type VoucherStatus = "Aktif" | "Terjadwal" | "Berakhir" | "Habis";
export function voucherStatus(voucher: Pick<Voucher, "starts_at" | "ends_at" | "quota">, used: number, nowMs: number): VoucherStatus;

// src/lib/promo/banner.ts  (harus sama dengan constraint merchant_banners di 20261117000300)
export const BANNER_URL_PATTERN = /^https:\/\/[A-Za-z0-9.-]+(:[0-9]+)?(\/\S*)?$/;
export function isSafeBannerUrl(url: string): boolean;               // pola di atas dan panjang <= 500
export type BannerStatus = "Tayang" | "Terjadwal" | "Selesai" | "Draf";
export function bannerStatus(banner: Pick<MerchantBanner, "published" | "starts_at" | "ends_at">, nowMs: number): BannerStatus;
export const MAX_LIVE_BANNERS = 3;

// src/lib/booking/payment-mode.ts
export function computeAmounts(service: ServicePayment, mode: PaymentMode, discount?: number): { dueNow: number; dueOnSite: number };
// price efektif = Number(service.price) - (discount ?? 0); komentar kepala menunjuk 20261117000200.
```

`errors.ts`: `BK050` 404 `"Kode voucher tidak ditemukan atau sudah tidak berlaku."`, `BK051` 409 `"Voucher ini belum berlaku atau sudah berakhir."`, `BK052` 409 `"Kuota voucher ini sudah habis."`, `BK053` 409 `"Nomor WhatsApp ini sudah memakai voucher ini."`, `BK054` 409 `"Harga layanan belum memenuhi minimal transaksi voucher ini."`, `BK055` 409 `"Voucher ini tidak berlaku untuk layanan yang dipilih."`, `BK056` 409 `"Voucher ini khusus pelanggan baru."`.

- [ ] **Step 1: Tulis tes yang gagal.**

```ts
// voucher.test.ts
const v = (o: Partial<VoucherTerms>): VoucherTerms =>
  ({ code: "WISUDA20", kind: "PERCENT", value: 20, max_discount: null, min_spend: null, service_ids: null, ...o });

test("computeDiscount sama dengan evaluate_voucher (t46a)", () => {
  assert.equal(computeDiscount(v({ max_discount: 100000 }), 350000), 70000);
  assert.equal(computeDiscount(v({ value: 50, max_discount: 100000 }), 350000), 100000);
  assert.equal(computeDiscount(v({ kind: "FIXED", value: 400000 }), 350000), 350000);
  assert.equal(computeDiscount(v({ kind: "FIXED", value: 349000 }), 350000), 348500);
  assert.equal(computeDiscount(v({ value: 100 }), 350000), 350000);
  assert.equal(computeDiscount(v({ kind: "FIXED", value: 9000 }), 10000), 8500);
  assert.equal(computeDiscount(v({ kind: "FIXED", value: 500 }), 1000), 500); // harga lama < 1500 tidak dipotong
  assert.equal(computeDiscount(v({ value: 15 }), 99999), 15000);              // setengah ke atas
});

test("voucherIneligibleReason", () => {
  const names = { a: "Makeup Wisuda", b: "Makeup Pesta" };
  assert.equal(voucherIneligibleReason(v({}), { id: "a", price: 350000 }, names), null);
  assert.equal(voucherIneligibleReason(v({ service_ids: ["b"] }), { id: "a", price: 350000 }, names), "Hanya untuk Makeup Pesta");
  assert.equal(voucherIneligibleReason(v({ min_spend: 500000 }), { id: "a", price: 350000 }, names), "Belum bisa dipakai: minimal Rp500.000");
});

test("normalizeVoucherCode dan pola", () => {
  assert.equal(normalizeVoucherCode("  wisuda20 "), "WISUDA20");
  assert.ok(VOUCHER_CODE_PATTERN.test("AB12"));
  assert.ok(!VOUCHER_CODE_PATTERN.test("AB1"));
  assert.ok(!VOUCHER_CODE_PATTERN.test("AB-12"));
});

test("voucherSummary", () => {
  assert.equal(voucherSummary({ kind: "PERCENT", value: 20, max_discount: 100000, min_spend: null }), "Diskon 20%, maks Rp100.000");
  assert.equal(voucherSummary({ kind: "FIXED", value: 50000, max_discount: null, min_spend: 500000 }), "Potongan Rp50.000, min Rp500.000");
});

test("randomVoucherCode", () => {
  const code = randomVoucherCode(() => 0);
  assert.equal(code, "AAAAAAAA");
  assert.ok(VOUCHER_CODE_PATTERN.test(randomVoucherCode()));
});

test("voucherStatus", () => {
  const now = Date.parse("2026-12-10T00:00:00Z");
  assert.equal(voucherStatus({ starts_at: null, ends_at: null, quota: null }, 5, now), "Aktif");
  assert.equal(voucherStatus({ starts_at: "2027-03-20T00:00:00Z", ends_at: null, quota: null }, 0, now), "Terjadwal");
  assert.equal(voucherStatus({ starts_at: null, ends_at: "2026-11-01T00:00:00Z", quota: null }, 0, now), "Berakhir");
  assert.equal(voucherStatus({ starts_at: null, ends_at: null, quota: 30 }, 30, now), "Habis");
});
```

```ts
// banner.test.ts
test("isSafeBannerUrl sama dengan constraint (t48a)", () => {
  assert.ok(isSafeBannerUrl("https://instagram.com/riasbysekar"));
  for (const bad of ["http://contoh.test", "javascript:alert(1)", "https://a.test/x y", "//a.test", "https://"])
    assert.ok(!isSafeBannerUrl(bad), bad);
  assert.ok(!isSafeBannerUrl("https://a.test/" + "x".repeat(500)));
});

test("bannerStatus", () => {
  const now = Date.parse("2026-12-10T00:00:00Z");
  assert.equal(bannerStatus({ published: false, starts_at: null, ends_at: null }, now), "Draf");
  assert.equal(bannerStatus({ published: true, starts_at: null, ends_at: null }, now), "Tayang");
  assert.equal(bannerStatus({ published: true, starts_at: "2027-03-20T00:00:00Z", ends_at: null }, now), "Terjadwal");
  assert.equal(bannerStatus({ published: true, starts_at: null, ends_at: "2026-12-01T00:00:00Z" }, now), "Selesai");
});
```

  Di `payment-mode.test.ts`: `computeAmounts(layanan DEPOSIT PERCENT 30 harga 350000, "DEPOSIT", 70000)` → `{ dueNow: 84000, dueOnSite: 196000 }`; `computeAmounts(FULL 350000, "FULL", 350000)` → `{ dueNow: 0, dueOnSite: 0 }`; tanpa argumen ketiga hasil lama tidak berubah. Di `errors.test.ts`: `mapBookingError("BK050").status === 404`, `mapBookingError("BK055").message === "Voucher ini tidak berlaku untuk layanan yang dipilih."`.
- [ ] **Step 2: Jalankan** `npm run test:unit`. Harapan: gagal karena modul belum ada.
- [ ] **Step 3: Implementasikan** sesuai Interfaces.
- [ ] **Step 4: Jalankan** `npm run test:unit && npm run typecheck`. Harapan: lulus.
- [ ] **Step 5: Commit**: `git add src/lib/booking/voucher.ts src/lib/booking/voucher.test.ts src/lib/promo src/lib/booking/payment-mode.ts src/lib/booking/payment-mode.test.ts src/lib/booking/errors.ts src/lib/booking/errors.test.ts` lalu `git commit -m "Tambah modul murni voucher dan banner"`.

---

### Task 5: Route cek kode dan voucher di `POST /api/bookings`

Model: sonnet.

**Files:**
- Create: `src/app/api/vouchers/check/route.ts`
- Modify: `src/lib/validations/booking.ts`, `src/lib/validations/booking.test.ts` (atau berkas uji validasi yang ada), `src/app/api/bookings/route.ts`

**Interfaces:**
- Consumes: `check_voucher`, `check_voucher_rate_limit` (Task 1), `create_booking` dengan `p_voucher_code` (Task 2), `mapBookingError`, `normalizeVoucherCode`, `VOUCHER_CODE_PATTERN` (Task 4), `extractClientIp`, `hashClientIp`.
- Produces:
  - `voucherCodeSchema = z.string().transform(normalizeVoucherCode).pipe(z.string().regex(VOUCHER_CODE_PATTERN, "Kode voucher 4 sampai 16 huruf atau angka"))`.
  - `createBookingRequestSchema` + `voucherCode: voucherCodeSchema.nullable().default(null)`.
  - `checkVoucherRequestSchema = z.object({ username: usernameSchema, serviceId: z.uuid(), code: voucherCodeSchema })`.
  - `POST /api/vouchers/check` → 200 `CheckVoucherResult = { code: string; kind: VoucherKind; value: number; max_discount: number | null; min_spend: number | null; service_ids: string[] | null; discount: number }`; 400 body tidak valid; 404 merchant tidak ada; 409/404 `{ error }` dari `mapBookingError(reason)`; 429 `"Terlalu banyak percobaan kode. Coba lagi beberapa menit lagi."`; 503 `"Pemeriksaan kode sedang gangguan. Coba lagi sebentar."` bila RPC rate limit gagal (Keputusan 11, gagal tertutup). Tipe `CheckVoucherResult` diekspor dari `src/lib/booking/voucher.ts`.

Ketentuan:
- Route cek: Zod, `createAdminClient()`, resolve merchant lewat `username` (pola `POST /api/bookings`), lalu rate limit, lalu `check_voucher`. Error Postgres mentah tidak diteruskan. Tidak menerima nomor WhatsApp (Keputusan 11).
- `POST /api/bookings`: teruskan `p_voucher_code: voucherCode` ke `create_booking`. Komentar urutan di kepala berkas ditambah satu baris tentang voucher. Charge tetap `amount_due_now`.
- Uji Zod: `"  wisuda20 "` jadi `"WISUDA20"`; `"AB-1"` gagal; `voucherCode` hilang jadi `null`.

- [ ] **Step 1: Tulis uji skema yang gagal**, jalankan `npm run test:unit`, harapan gagal.
- [ ] **Step 2: Implementasikan** skema, route cek, dan perubahan `POST /api/bookings`.
- [ ] **Step 3: Verifikasi** `npm run test:unit && npm run typecheck && npm run lint`. Dengan `npm run dev` dan data lokal (lewati bila Supabase lokal tidak tersedia, catat): `curl -s -X POST localhost:3000/api/vouchers/check -H 'content-type: application/json' -d '{"username":"<u>","serviceId":"<id>","code":"salah1"}'` sebelas kali; sepuluh pertama 404, kesebelas 429.
- [ ] **Step 4: Commit**: `git add src/app/api/vouchers src/app/api/bookings/route.ts src/lib/validations src/lib/booking/voucher.ts` lalu `git commit -m "Tambah cek kode voucher dan teruskan kode ke create_booking"`.

---

### Task 6: Halaman publik: banner, harga promo, dan pemilih voucher (V1, V2)

Model: sonnet.

**Files:**
- Create: `src/components/booking-page/promo-banners.tsx`, `src/components/booking-page/promo-banners.stories.tsx`, `src/components/booking-page/voucher-picker.tsx`, `src/components/booking-page/voucher-picker.stories.tsx`
- Modify: `src/app/[username]/page.tsx`, `src/app/[username]/booking-page-view.tsx`, `src/app/[username]/booking-flow.tsx`, `src/app/[username]/booking-page-view.stories.tsx`, `src/components/booking-page/service-option-card.tsx`, `src/components/booking-page/booking-summary.tsx`, `src/components/booking-page/booking-steps.stories.tsx`, `src/components/booking-page/fixtures.ts`

**Interfaces:**
- Consumes: `public_vouchers`, `PublicBanner`, `PublicVoucher` (Task 1, 3), `computeDiscount`, `voucherIneligibleReason`, `voucherSummary`, `CheckVoucherResult` (Task 4, 5), `computeAmounts(service, mode, discount)`, `publicMediaUrl`.
- Produces:

```ts
// Diekspor dari src/lib/booking/voucher.ts (tambahan kecil ke modul Task 4).
export type AppliedVoucher = VoucherTerms & { source: "PUBLIC" | "PRIVATE" };

export function PromoBanners(props: {
  banners: PublicBanner[];
  /** Kode voucher publik per id; tombol VOUCHER hanya tampil bila id-nya ada di sini. */
  voucherCodeById: Record<string, string>;
  activeServiceIds: string[];
  onApplyVoucher: (voucherId: string) => void;
  onSelectService: (serviceId: string) => void;
}): JSX.Element | null;   // null bila banners kosong

export function VoucherPicker(props: {
  vouchers: PublicVoucher[];
  service: Pick<Service, "id" | "price">;
  serviceNames: Record<string, string>;
  merchantName: string;
  applied: AppliedVoucher | null;
  onApply: (voucher: AppliedVoucher) => void;
  onRemove: () => void;
  /** Memanggil POST /api/vouchers/check; melempar Error berisi pesan Indonesia. */
  checkCode: (code: string) => Promise<CheckVoucherResult>;
}): JSX.Element;

// BookingPageViewProps + banners: PublicBanner[]; vouchers: PublicVoucher[]
// BookingFlowProps + banners: PublicBanner[]; vouchers: PublicVoucher[]
// ServiceOptionCard + promoPrice?: number   (harga setelah diskon; tampil bila < harga)
// BookingSummary: tidak berubah tanda tangannya; baris voucher lewat `rows`.
```

Ketentuan:
- `page.tsx` (klien `anon` tetap): tambah dua query paralel. `merchant_banners` kolom `PublicBanner`, `.eq("merchant_id", id)`, urut `sort_order` lalu `created_at`, `.limit(3)` (policy sudah menyaring yang tayang). `rpc("public_vouchers", { p_merchant_id: id })`. Gagal baca keduanya tidak melempar: dicatat `console.error` dan diperlakukan kosong, karena promo bukan isi wajib halaman (beda dengan layanan). Merchant Starter tidak memicu kedua query.
- `PromoBanners` di langkah 1 di atas daftar layanan: `<section aria-label="Promo">` dengan daftar horizontal `overflow-x-auto snap-x snap-mandatory`, tiap kartu `snap-start` selebar `85%` (100% bila hanya satu), rasio 3:1, sudut `var(--radius)`. Template: label kecil, judul, keterangan, tombol; warna per Keputusan 17 lewat `style` berisi `var(--...)` saja. Gambar: `<img>` dengan `alt` dari `alt_text`, `loading="lazy"`, `width={1200} height={400}`, tombol di bawah gambar. Tombol: `VOUCHER` memanggil `onApplyVoucher`, `SERVICE` memanggil `onSelectService` (disembunyikan bila layanan tidak aktif), `URL` berupa `<a target="_blank" rel="noopener noreferrer nofollow">` dan hanya bila `isSafeBannerUrl`. Semua tombol `min-h-11`.
- `BookingFlow` memegang `appliedVoucher: AppliedVoucher | null`. Memasang voucher dari banner memilihnya dan menggulir ke daftar layanan. Kartu layanan menerima `promoPrice = price - computeDiscount(...)` hanya bila `voucherIneligibleReason` null; kartu menampilkan harga promo tebal, harga normal dicoret (`<s>` dengan teks sr-only "harga normal"), dan "Hemat RpX". Strip voucher terpasang (Keputusan 21) tampil di atas daftar: kode, `voucherSummary`, tombol "Lepas".
- Saat layanan terpilih berubah dan voucher terpasang tidak lagi memenuhi syarat, voucher dilepas dan pesan netral `role="status"` menyebut alasannya (Review Focus 3).
- Langkah 3: `VoucherPicker` di atas ringkasan. Pemicu yang bisa dibuka-tutup ("Pilih voucher" atau "<KODE> dipilih", subjudul "N voucher bisa dipakai di booking ini") hanya tampil bila ada voucher publik; isinya radio "Tanpa voucher" plus voucher publik. Yang belum memenuhi syarat dinonaktifkan dengan alasannya; `new_customer_only` dan `per_phone_limit` diberi catatan "Khusus pelanggan baru" / "Satu kali per nomor WhatsApp" tetapi tetap bisa dipilih. Kolom "Punya kode dari <merchant>?" dengan tombol "Pakai" selalu tampil; gagal menampilkan pesan dari server sebagai `role="alert"` netral; masukan kosong menampilkan "Ketik kode dulu." tanpa memanggil server.
- Ringkasan: bila ada voucher, baris "Harga layanan" (harga normal) dan "Voucher <KODE>" bernilai `−RpX` (tanda minus U+2212) ditambahkan; nominal dari `computeAmounts(service, mode, discount)`. Tombol aksi memakai nominal setelah diskon.
- `submitCheckout` mengirim `voucherCode: appliedVoucher?.code ?? null`. Error voucher dari server tampil lewat toast yang ada; voucher tetap terpasang supaya pelanggan bisa melepasnya.
- Story: `PromoBanners` (satu template tiap warna di tema Hangat, Malam, Berani; satu gambar; tanpa tombol), `VoucherPicker` (tanpa voucher publik, satu layak dan satu belum memenuhi syarat, kode rahasia terpasang, error kode), dan `booking-steps.stories.tsx` langkah 3 dengan voucher. Data contoh di `fixtures.ts` diberi nama jelas sebagai contoh.

- [ ] **Step 1:** Implementasikan sesuai Ketentuan.
- [ ] **Step 2: Verifikasi** `npm run typecheck && npm run lint && npm run test:unit`, lalu `npm run storybook`: semua story baru di 390px dan 1280px, tiga tema, target sentuh 44px, fokus terlihat, tidak ada warna tertulis di `src/components/booking-page/*` (`grep -nE "#[0-9a-fA-F]{3,6}|rgb\(" src/components/booking-page/promo-banners.tsx src/components/booking-page/voucher-picker.tsx` kosong).
- [ ] **Step 3: Commit**: `git add src/components/booking-page src/app/[username]` lalu `git commit -m "Tampilkan banner promo dan pemilih voucher di halaman booking"`.

---

### Task 7: Dashboard voucher (M6)

Model: sonnet.

**Files:**
- Create: `src/app/dashboard/promosi/layout.tsx` (judul "Promosi" dan tab Banner/Voucher sebagai tautan), `src/app/dashboard/promosi/voucher/page.tsx`, `src/app/dashboard/promosi/voucher/actions.ts`, `src/app/dashboard/promosi/voucher/voucher-state.ts`, `src/app/dashboard/promosi/voucher/voucher-list.tsx`, `src/app/dashboard/promosi/voucher/voucher-form.tsx`, `src/app/dashboard/promosi/voucher/voucher-form.stories.tsx`, `src/app/dashboard/promosi/voucher/voucher-list.stories.tsx`, `src/app/dashboard/promosi/promo-upsell.tsx`, `src/lib/validations/voucher.ts`, `src/lib/validations/voucher.test.ts`
- Modify: `src/lib/routes.ts`, `src/components/layout/app-sidebar.tsx`, `src/lib/plans.ts`

**Interfaces:**
- Consumes: tabel `vouchers`, `voucher_stats()` (Task 1), `voucherSummary`, `voucherStatus`, `randomVoucherCode`, `computeDiscount`, `VOUCHER_CODE_PATTERN` (Task 4), `requireMerchant()`, `jakartaWallClockToUtc`, `jakartaDateISO`.
- Produces:
  - `ROUTES.promoBanners = "/dashboard/promosi"`, `ROUTES.promoVouchers = "/dashboard/promosi/voucher"`.
  - `voucherFormSchema` (Zod) dengan field form: `code`, `kind`, `value`, `max_discount`, `min_spend`, `service_ids` (kosong = semua), `quota`, `starts_on`, `ends_on` (tanggal `YYYY-MM-DD`, opsional), `one_per_phone` (boolean → `per_phone_limit` 1 atau null), `new_customer_only`, `is_public`; batas sama dengan constraint Task 1 dan `ends_on >= starts_on`.
  - `export function voucherFormToRow(input: VoucherFormInput): Omit<Database["public"]["Tables"]["vouchers"]["Insert"], "merchant_id">` (tanggal ke `starts_at`/`ends_at` per Keputusan 14).
  - Server action `saveVoucher(prev: VoucherFormState, formData: FormData): Promise<VoucherFormState>` (id kosong = buat, terisi = ubah) dan `deleteVoucher(id: string): Promise<{ ok: boolean; message?: string }>`. `VoucherFormState = { status: "idle" | "success" | "error"; message?: string; fieldErrors?: Partial<Record<keyof VoucherFormInput, string>> }`. `23505` → fieldErrors.code `"Kode ini sudah dipakai voucher lain."`, `P0001` → pesan paket. Keduanya `revalidatePath(ROUTES.promoVouchers)`.

Ketentuan:
- Sidebar: item "Promosi" (ikon `Megaphone`) di grup "Halaman booking" setelah Tampilan, aktif untuk semua path di bawah `/dashboard/promosi` (Keputusan 23). `PLANS` Pro + `"Voucher dan banner promosi"` (Keputusan 26).
- Halaman: Starter melihat `PromoUpsell` (satu kalimat dan tautan ke `ROUTES.billing`). Pro/Studio: kalimat statistik (Keputusan 24) bila ada pemakaian bulan ini; tabel "Semua voucher" mulai 768px dan daftar bertumpuk di bawahnya, kolom Kode (dengan "Tampil di halaman"/"Kode rahasia"), Potongan (`voucherSummary`), Terpakai ("12 dari 50" dengan bar hitam, atau "12" tanpa kuota), Berlaku ("1 sampai 31 Des" atau "Tanpa batas"), Status (`voucherStatus`; Aktif berlatar hitam, lainnya bergaris). Keadaan kosong: teks dan tombol "Buat voucher". Gagal memuat: teks netral `role="alert"`.
- Form "Buat voucher"/"Ubah voucher" di `Sheet` kanan (bawah di HP): field sesuai teks M6. Tombol "Acak" mengisi `randomVoucherCode()`. Segmen Persen/Nominal; "Maks potongan" hanya untuk Persen. "Berlaku untuk": Semua layanan atau pilih beberapa (checkbox). Sakelar "Tampilkan di halaman booking" dengan petunjuk M6 per keadaan. Baris contoh "Contoh: <layanan pertama> RpX menjadi RpY (hemat RpZ)." dari `computeDiscount`. Catatan DP/bayar di tempat dari M6. Tombol "Simpan voucher", "Batal", dan "Hapus voucher" (merah, dialog konfirmasi yang menyebut booking lama tetap menyimpan diskonnya) saat mengubah.
- Uji `voucher.test.ts` validasi: `code: "wisuda20"` jadi `WISUDA20`; `kind PERCENT, value 101` gagal; `max_discount` dengan `FIXED` gagal; `ends_on < starts_on` gagal; `voucherFormToRow` dengan `starts_on "2026-12-01"`, `ends_on "2026-12-31"` menghasilkan `starts_at "2026-11-30T17:00:00.000Z"` dan `ends_at "2026-12-31T17:00:00.000Z"`; `one_per_phone true` menghasilkan `per_phone_limit 1`.

- [ ] **Step 1: Tulis uji validasi yang gagal**, jalankan `npm run test:unit`, harapan gagal.
- [ ] **Step 2: Implementasikan** skema, aksi, halaman, komponen, dan story (daftar: kosong, empat contoh M6 dengan nama contoh, gagal; form: buat, ubah, error kode ganda).
- [ ] **Step 3: Verifikasi** `npm run test:unit && npm run typecheck && npm run lint`, story di 390px dan 1280px.
- [ ] **Step 4: Commit**: `git add src/app/dashboard/promosi src/lib/validations/voucher.ts src/lib/validations/voucher.test.ts src/lib/routes.ts src/components/layout/app-sidebar.tsx src/lib/plans.ts` lalu `git commit -m "Tambah halaman kelola voucher di dashboard"`.

---

### Task 8: Dashboard banner (M5)

Model: sonnet.

**Files:**
- Create: `src/app/dashboard/promosi/page.tsx`, `src/app/dashboard/promosi/banner-actions.ts`, `src/app/dashboard/promosi/banner-list.tsx`, `src/app/dashboard/promosi/banner-form.tsx`, `src/app/dashboard/promosi/banner-form.stories.tsx`, `src/app/dashboard/promosi/banner-list.stories.tsx`, `src/lib/validations/banner.ts`, `src/lib/validations/banner.test.ts`
- Modify: `src/lib/media/compress.ts` (opsi `aspect`), `src/lib/media/path.ts` (komentar menyebut constraint banner)

**Interfaces:**
- Consumes: tabel `merchant_banners` (Task 3), `vouchers` (Task 1, hanya `PUBLIC` untuk pilihan target), `PromoBanners` (Task 6, untuk pratinjau dengan tema merchant lewat `resolveTheme`/`themeToCssVars` seperti `preview-frame.tsx`), `bannerStatus`, `isSafeBannerUrl`, `MAX_LIVE_BANNERS` (Task 4), `uploadMedia`, `removeMedia`, `mediaFileName`, `validateImageFile`, `isScopedMediaPath`, `PromoUpsell` (Task 7).
- Produces:
  - `compressImage(file, { maxSide, square, aspect }: { maxSide: number; square: boolean; aspect?: number })`: `aspect` memotong tengah ke rasio lebar/tinggi itu sebelum dikecilkan; `square: true` tetap sama dengan `aspect: 1`.
  - `bannerFormSchema` (Zod): `source`, `tag_text`, `title`, `body`, `color`, `image_path`, `alt_text`, `cta_text`, `target_kind` (atau kosong), `target_voucher_id`, `target_service_id`, `target_url` (`isSafeBannerUrl`), `starts_on`, `ends_on`, `published`; aturan sama dengan constraint Task 3; field milik sumber lain dikosongkan sebelum disimpan.
  - Server action `saveBanner(prev: BannerFormState, formData: FormData): Promise<BannerFormState>`, `deleteBanner(id: string): Promise<{ ok: boolean; message?: string; imagePath?: string | null }>`, `moveBanner(id: string, direction: "up" | "down"): Promise<{ ok: boolean }>` (menukar `sort_order` dengan tetangga). `BannerFormState` berbentuk sama dengan `VoucherFormState`. `PR001` → `"Maksimal 3 banner tayang bersamaan. Atur jadwalnya, simpan sebagai draf, atau selesaikan banner lain dulu."`; `P0001` → pesan paket; path tidak valid → `PESAN_PATH_TIDAK_VALID`. Target voucher yang bukan milik merchant atau bukan `PUBLIC` ditolak di aksi (Keputusan 16).

Ketentuan:
- Halaman `/dashboard/promosi` (tab Banner dari layout Task 7): Starter melihat `PromoUpsell`. Daftar "Urutan tayang" dengan thumbnail, judul (atau `alt_text` untuk gambar), periode, status (`bannerStatus`; Tayang berlatar hitam, lainnya bergaris), tombol naik/turun (`aria-label` berisi judul), dan catatan "Banner selesai otomatis disembunyikan setelah tanggal berakhir." Tombol "Banner baru". Keadaan kosong dan gagal.
- Form di `Sheet`: pilihan "Dari template" / "Unggah gambar" (teks M5). Template: Label kecil, Judul, Keterangan, Warna (tiga lingkaran berlabel Aksen tema, Gelap, Lembut; warna lingkaran diambil dari tema merchant yang sudah di-resolve). Gambar: pemilih berkas (`validateImageFile`, lalu `compressImage(file, { maxSide: 1200, square: false, aspect: 3 })`, unggah ke `${merchantId}/banner/${mediaFileName("banner", "webp")}`), teks petunjuk "Rasio 3:1, minimal 1200 x 400 px. JPG, PNG, atau WebP.", dan Teks alternatif wajib dengan petunjuk M5. Lalu Teks tombol dan "Tombol menuju" (Tanpa tombol, Voucher publik, Layanan, Tautan lain), Mulai tayang, Selesai, pratinjau di HP. Tombol "Simpan dan jadwalkan" (`published = true`), "Simpan draf", "Hapus" (merah, konfirmasi).
- Berkas: gambar baru diunggah sebelum aksi; bila aksi gagal, berkas yang baru diunggah dihapus `removeMedia` (pola `service-media-field.tsx`). Mengganti gambar atau menghapus banner menghapus berkas lama setelah aksi berhasil.
- Uji `banner.test.ts`: template tanpa judul gagal; gambar tanpa alt gagal; `target_url "http://a.test"` gagal; `target_kind` tanpa `cta_text` gagal; `ends_on < starts_on` gagal; input gambar dengan `title` terisi menghasilkan `title: null` setelah parse.

- [ ] **Step 1: Tulis uji validasi yang gagal**, jalankan `npm run test:unit`, harapan gagal.
- [ ] **Step 2: Implementasikan** `aspect`, skema, aksi, halaman, komponen, dan story (daftar: empat contoh M5 dengan nama contoh, kosong, gagal; form: template, gambar, error `PR001`).
- [ ] **Step 3: Verifikasi** `npm run test:unit && npm run typecheck && npm run lint`, story di 390px dan 1280px.
- [ ] **Step 4: Commit**: `git add src/app/dashboard/promosi src/lib/validations/banner.ts src/lib/validations/banner.test.ts src/lib/media` lalu `git commit -m "Tambah halaman kelola banner promosi"`.

---

### Task 9: Pembaca booking menampilkan voucher

Model: sonnet.

**Files:**
- Modify: `src/app/pesanan/[token]/page.tsx`, `src/app/pesanan/[token]/booking-status-view.tsx` dan story-nya, `src/app/dashboard/bookings/booking-detail-panel.tsx` dan story-nya, `src/app/dashboard/settings/ekspor/route.ts`

**Interfaces:**
- Consumes: kolom `voucher_code`, `discount_amount` (Task 1).
- Produces: tidak ada antarmuka baru.

Ketentuan:
- `/pesanan/[token]`: tambah `voucher_code, discount_amount` ke kolom yang dibaca. Bila `discount_amount > 0`, baris "Harga layanan" (`service_price`) dan "Voucher <KODE>" `−RpX` muncul sebelum baris nominal yang sudah ada. Story baru: booking `PENDING` DP dengan voucher, dan `CONFIRMED` gratis karena voucher 100%.
- Panel detail dashboard: baris "Voucher" berisi kode dan `−RpX` bila ada diskon. Story dengan voucher.
- Ekspor: tambah `voucher_code, discount_amount` ke kolom booking, plus berkas/tabel voucher merchant (semua kolom `vouchers`) dan banner (semua kolom `merchant_banners`) mengikuti pola tabel lain di route itu.
- Notifikasi tidak berubah: nominal di pesan sudah dari `amount_due_now`/`amount_due_on_site`.

- [ ] **Step 1:** Implementasikan sesuai Ketentuan.
- [ ] **Step 2: Verifikasi** `npm run typecheck && npm run lint && npm run test:unit`, story di 390px dan 1280px.
- [ ] **Step 3: Commit**: `git add src/app/pesanan src/app/dashboard/bookings src/app/dashboard/settings/ekspor` lalu `git commit -m "Tampilkan voucher di halaman booking saya, panel detail, dan ekspor"`.

---

### Task 10: Verifikasi akhir dan dokumentasi

Dikerjakan controller, bukan subagen.

- [ ] **Step 1:** `open -a Docker`, lalu `npm run docker:test`. Tidak ada baris `FAIL` di seluruh output, termasuk bagian 11, 30 sampai 48.
- [ ] **Step 2:** `npm run check` dan `npm run build-storybook` lulus.
- [ ] **Step 3:** Pemeriksaan browser dengan `npm run dev` dan data lokal (atau Storybook bila Supabase lokal tidak tersedia; catat yang tidak terverifikasi) pada 390px dan 1280px:
  - `/dashboard/promosi`: buat tiga banner tayang (template tiga warna dan satu gambar), banner keempat tayang ditolak dengan pesan, sebagai draf tersimpan, urutan naik/turun berubah di halaman publik. Starter melihat ajakan.
  - `/dashboard/promosi/voucher`: buat voucher publik persen dengan maks potongan, voucher rahasia nominal dengan minimal transaksi, kode ganda ditolak, Acak, contoh harga, hapus voucher yang pernah dipakai (booking lama tetap menampilkan kodenya).
  - `/<username>`: banner bergulir tanpa gerakan otomatis, tombol Voucher memasang voucher dan kartu layanan menampilkan harga promo, tombol Layanan memilih layanan, tautan https membuka tab baru. Langkah 3: pemilih menampilkan voucher yang belum memenuhi syarat dengan alasan, kode rahasia benar terpasang, kode salah memberi pesan netral, ringkasan menampilkan baris voucher dan DP dari harga setelah diskon. Bayar dengan voucher: halaman QRIS nominal benar. Voucher 100%: langsung terkonfirmasi.
  - `/pesanan/<token>` dan panel detail dashboard menampilkan baris voucher.
  - Di semua halaman: target sentuh 44px atau lebih, fokus terlihat dengan Tab, tidak ada em dash atau `·`, merah hanya pada Hapus, tidak ada warna tertulis di komponen publik.
- [ ] **Step 4:** Tambah `## 34. Promosi: banner dan voucher` di `docs/DECISIONS.md` (Keputusan 1, 2, 3, 4, 11, 15, 19 dengan alasannya; sesuaikan nomor bila F3/F4 memakai nomor lain). Perbarui bagian Status di `AGENTS.md` dengan satu paragraf F5: voucher publik dan rahasia (`vouchers`, divalidasi `evaluate_voucher` di dalam `create_booking`, DP dari harga setelah diskon, anon hanya lewat `public_vouchers`, cek kode lewat `/api/vouchers/check` dengan rate limit) dan banner promosi (`merchant_banners`, maksimal 3 tayang ditegakkan trigger, gambar di `{merchant_id}/banner/`), keduanya Pro dan Studio, editor di `/dashboard/promosi`. Perbarui baris F5 di `docs/superpowers/plans/2026-11-14-marky-roadmap.md` (rencana `2026-11-15-marky-f5-promosi.md`, status selesai di cabang F5). Jalankan `graphify update .`.
- [ ] **Step 5: Commit**: `git add docs/DECISIONS.md AGENTS.md docs/superpowers/plans/2026-11-14-marky-roadmap.md` lalu `git commit -m "Catat F5 selesai di keputusan, status, dan roadmap"`. Jangan stage `graphify-out/` kecuali proyek memang meng-commit-nya di cabang ini.

## Urutan eksekusi

1, 2, 3 (migration berurutan), 4, 5, 6, 7, 8, 9, 10. Task 7 sebelum 8 karena layout tab Promosi dan `PromoUpsell` dibuat di Task 7. Task 6 sebelum 8 karena pratinjau banner memakai `PromoBanners`.
