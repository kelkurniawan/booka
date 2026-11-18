# Booking Lapangan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merchant olahraga (padel, futsal, mini soccer, badminton, tenis) bisa mendaftarkan lapangan, menjual sewa per jam dengan harga jam ramai, dan pelanggan memilih tanggal, lama main, jam, dan lapangan di halaman publik tanpa pernah terpesan ganda.

**Architecture:** Tabel `courts` (+ `service_courts`, `court_price_rules`, `court_media`, `venue_areas`, `venue_markers`) dengan RLS per merchant dan akses `anon` hanya lewat RPC definer. Fungsi SQL `court_price` adalah sumber kebenaran harga, dipakai `create_booking`; TypeScript `courtPrice()` dan `computeCourtSlots()` mencerminkannya dan diuji dengan kasus yang sama. Booking lapangan tetap `capacity_mode = 'NONE'` dan dilindungi constraint eksklusi `bookings_court_no_overlap` per `court_id`. UI publik memperluas langkah Jadwal di `BookingFlow`; dashboard mendapat `/dashboard/lapangan`.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase Postgres + RLS, Zod, node:test (`npm run test:unit`), harness `npm run docker:test`, Supabase Storage.

**Spec:** `docs/superpowers/specs/2026-11-18-court-booking-design.md`. Papan desain: `docs/design/booking-flow/Lap*.dc.html` (`LapJadwal` = L1, `LapDenah` = L1b, `LapData` = L2, `LapDashboard` = L3, `LapHP` = L4, `LapLayanan` = L5, `LapDenahEditor` = L6), kanvas https://claude.ai/artifact/RSGQtRjX4RQivoVekkfgeo.

**Branch:** lanjutan `fitur/funnel-iklan` setelah rencana funnel selesai (atau cabang baru dari hasilnya). Rencana funnel dikerjakan LEBIH DULU: ia membuat ulang `create_booking` di `20261125000300` dengan parameter `p_session_id`, `p_ad_link_id`, `p_utm_source`, `p_utm_medium`, `p_utm_campaign`, `p_referrer_host`. Rencana ini memakai versi itu sebagai titik awal.

## Global Constraints

- AGENTS.md mengikat: migration baru saja (mulai `20261126000100`), setiap tabel baru `REVOKE ALL` dari `anon` dan `authenticated` lalu grant per kolom, fungsi baru tertutup kecuali `GRANT EXECUTE` eksplisit, definer memakai `set search_path = ''`, `createAdminClient()` wajib memfilter `merchant_id`, tidak ada `getSession()`, tipe di `src/types/database.ts` berupa `type`.
- UI dan komentar kode berbahasa Indonesia; nama variabel, tabel, kolom berbahasa Inggris. Teks UI disalin dari papan L1 sampai L6. Tanpa em dash, tanpa titik tengah sebagai pemisah, tanpa panah di teks tombol.
- Komponen di `src/components/booking-page/*` hanya memakai token dari `themeToCssVars()`. `src/lib/theme/fonts.ts` tidak diimpor dari kode murni.
- Layanan sewa: `court_unit_minutes` 30 atau 60; `duration_minutes` = lama main minimum; `court_max_minutes` kelipatan unit, maksimum 480, `>= duration_minutes`; `duration_minutes` juga kelipatan unit. `price` = harga per jam dasar. CHECK `court_unit_minutes is null or seat_duration_minutes is null`.
- `courts`: nama 1 sampai 40, unik `(merchant_id, name)`, `sport` PADEL/FUTSAL/MINI_SOCCER/BADMINTON/TENIS, `environment` INDOOR/OUTDOOR/OUTDOOR_BERATAP, `surface` maks 60, `description` maks 280, `features` maks 5 butir (tiap butir maks 40), `rotation` 0 atau 90. Foto maks 5 per lapangan, alt text wajib (foto tanpa alt tidak ditampilkan), berkas di `{merchant_id}/court/`.
- Aturan harga: `day_of_week` 1 sampai 7, `start_time < end_time` (tanpa lewat tengah malam), eksklusi `(service_id, day_of_week, rentang jam)`. Harga per unit memakai aturan pada jam mulai unit itu (Jakarta), di luar aturan memakai `price`. Total = jumlah `harga_per_jam * unit / 60`, dibulatkan ke rupiah.
- Kode error baru: BK070 lapangan tidak tersedia, BK071 lama main tidak valid, BK072 tidak ada lapangan kosong. Cek ulang bahwa ketiganya belum dipakai (`grep -rn "BK07" supabase/migrations src`); bila bentrok, geser ketiganya bersama-sama dan catat di DECISIONS.
- Layanan sewa melewati penugasan staf (`staff_id` null). Cabang lapangan dicek sebelum cabang kursi di `create_booking`. Layanan non-sewa: `p_court_id` dan `p_duration_minutes` diabaikan, perilaku lama utuh.
- Parameter baru `create_booking` ber-default null. `create_booking` lama di-drop lalu dibuat ulang dalam satu migration (tanpa overload ganda).
- Harga di halaman publik harus sama dengan `bookings.service_price` dan `amount_due_now`. Jadwal ulang tidak menghitung ulang harga.
- Tanpa kunci paket (seperti restoran, DECISIONS #37).
- Nilai enum baru dipasang di migration terpisah sebelum dipakai. Setiap perubahan skema diuji `npm run docker:test`; kasus baru di `supabase/tests/99_verify.sql` mulai bagian 75 (funnel memakai 73 dan 74).
- Setiap task diakhiri `npm run check` (typecheck, lint, build) dan `npm run test:unit` hijau, lalu commit.

## Review Focus

1. **Lapangan terpesan ganda:** dua `create_booking` serentak untuk slot terakhir, "Mana saja" yang berebut, dan pindah jadwal ke jam yang beririsan harus menghasilkan tepat satu pemenang. Uji di Task 3 (SQL, termasuk dua sesi) dan konstraint `bookings_no_overlap` tidak boleh menangkap booking lapangan (predikat `court_id is null`).
2. **Harga tampil berbeda dari harga ditagih:** `courtPrice()` (TS) dan `court_price` (SQL) wajib menghasilkan angka sama untuk tabel kasus yang sama, termasuk lintas batas jam ramai dan pembulatan. Uji di Task 3 dan Task 4.
3. **Kebocoran data pelanggan ke anon:** `get_court_availability`, `get_court_profiles`, dan RPC denah hanya mengembalikan rentang waktu dan kolom tampilan, tanpa nama, nomor, atau `booking_id`. Uji di Task 2 dan Task 3.
4. **Regresi salon, klinik, restoran:** semua kasus `99_verify.sql` lama (voucher, kursi, batas QRIS, staf) tetap lulus setelah `create_booking` dibuat ulang; layanan non-sewa tidak berubah. Uji di Task 3.
5. **Lintas merchant:** `service_courts`, `court_media`, dan `court_price_rules` tidak boleh menautkan lapangan atau layanan merchant lain (FK gabungan dengan `merchant_id`), dan path Storage dibatasi folder merchant. Uji di Task 2 dan Task 9.
6. **Foto tanpa alt atau data dari merchant lain tampil di publik.** Uji di Task 6 dan Task 9.

---

### Task 1: Nilai enum `OLAHRAGA`

Model: sonnet implementer; sonnet reviewer.

**Files:**
- Create: `supabase/migrations/20261126000100_court_enums.sql` (hanya `alter type public.business_category add value if not exists 'OLAHRAGA'`; migration terpisah karena nilai enum baru tidak boleh dipakai di transaksi yang sama)
- Modify: `src/types/database.ts` (union `business_category`), `src/lib/validations/onboarding.ts` bila enum Zod ditulis ulang di sana
- Test: `supabase/tests/99_verify.sql` (bagian 75, kasus 75.0)

**Interfaces:**
- Produces nilai `OLAHRAGA`. Periksa ulang CHECK di `20260830171027_nullable_business_category.sql`: ia hanya menuntut `business_category is not null` bila profil terisi, jadi tidak perlu diubah; tulis hasil pemeriksaan sebagai komentar di migration.

- [ ] **Step 1: Kasus uji 75.0** (gagal): `insert into merchant_profiles ... business_category = 'OLAHRAGA'` berhasil, nilai di luar enum ditolak.
- [ ] **Step 2: `npm run docker:test`**, kasus gagal.
- [ ] **Step 3: Migration dan `database.ts`.**
- [ ] **Step 4: `npm run docker:test`** hijau, `npm run check`, commit `Nilai enum OLAHRAGA`.

### Task 2: Skema lapangan, RLS, denah, dan harga jam ramai

Model: sonnet implementer; **opus** reviewer (keamanan SQL dan RLS).

**Files:**
- Create: `supabase/migrations/20261126000200_courts_schema.sql`
- Create: `supabase/migrations/20261126000300_courts_reads_and_saves.sql`
- Modify: `src/types/database.ts`
- Test: `supabase/tests/99_verify.sql` (bagian 75, kasus 75.1 dan seterusnya)

**Interfaces:**
- Produces tabel `courts` (kolom persis spec: profil, `pos_x`, `pos_y`, `rotation`), `service_courts (service_id, court_id, merchant_id)`, `court_price_rules`, `court_media` (pola `service_media`: `width`, `height`, `alt_text`, `sort_order`, FK gabungan), `venue_areas`, `venue_markers` (posisi dan ukuran), dan kolom `services.court_unit_minutes`, `court_max_minutes` dengan CHECK dari Global Constraints. Semua `REVOKE ALL` dari `anon`/`authenticated`; merchant authenticated mendapat grant per kolom dan RLS `merchant_id = auth.uid()`; `anon` tidak punya hak langsung. Kolom publik layanan (`court_unit_minutes`, `court_max_minutes`) ditambahkan ke grant `select` anon pada `services` bersama kolom lain yang sudah dibuka.
- Storage: kebijakan folder `{merchant_id}/court/` pada bucket media layanan yang ada (cek nama bucket di migration `service_media`/DECISIONS #24), plus pembersihan objek saat lapangan atau foto dihapus (pola yang sama dengan media layanan).
- RPC `save_court_pricing(p_service_id uuid, p_rules jsonb) returns void` (authenticated, definer, kunci merchant; ganti seluruh aturan layanan secara atomik; tolak aturan tumpang tindih lewat eksklusi dengan pesan jelas).
- RPC `save_venue_layout(p_courts jsonb, p_areas jsonb, p_markers jsonb) returns void` (authenticated, definer, kunci merchant; meniru `save_dining_layout` di `20261120000300_dining_reads_and_layout.sql`; menulis posisi lapangan, area, penanda secara atomik, hapus yang hilang dari payload untuk area/penanda saja, tidak membuat atau menghapus lapangan).
- RPC `get_court_profiles(p_merchant_id uuid) returns table(...)` (anon, definer): lapangan aktif dengan kolom tampilan, `service_ids uuid[]`, foto beralt-teks (urut `sort_order`), area, dan penanda sebagai satu jsonb per baris atau tiga set; tanpa data booking.
- Types: `Court`, `ServiceCourt`, `CourtPriceRule`, `CourtMedia`, `VenueArea`, `VenueMarker`, `CourtSport`, `CourtEnvironment`.

- [ ] **Step 1: Kasus uji 75.1 sampai 75.9** (gagal): `court_unit_minutes = 45` ditolak; `duration_minutes` bukan kelipatan unit ditolak; `court_max_minutes = 500` ditolak; layanan dengan `seat_duration_minutes` dan `court_unit_minutes` sekaligus ditolak; `service_courts` ke lapangan merchant lain ditolak FK; dua aturan harga tumpang tindih di hari sama ditolak, hari berbeda lolos; `start_time >= end_time` ditolak; foto ke-6 ditolak; anon `select` langsung dari `courts`, `court_media`, `court_price_rules` ditolak; `get_court_profiles` tidak memuat foto tanpa alt dan tidak memuat lapangan nonaktif; `save_court_pricing` merchant A pada layanan merchant B ditolak; `save_venue_layout` atomik (payload dengan satu baris tak valid tidak mengubah apa pun).
- [ ] **Step 2: `npm run docker:test`**, kasus baru gagal.
- [ ] **Step 3: Tulis kedua migration** sesuai Interfaces dan Global Constraints.
- [ ] **Step 4: `npm run docker:test`** sampai hanya baris footer yang gagal.
- [ ] **Step 5: `database.ts`**, `npm run check`, commit `Skema lapangan, denah, dan harga jam ramai`.

### Task 3: Mesin booking lapangan (harga, bentrok, create/move/reschedule)

Model: **opus** implementer dan reviewer (mendefinisikan ulang `create_booking`, uang dan konkurensi).

**Files:**
- Create: `supabase/migrations/20261126000400_court_booking_engine.sql`
- Modify: `src/types/database.ts`
- Test: `supabase/tests/99_verify.sql` (bagian 76 dan 77)

**Interfaces:**
- Consumes Task 2 dan `create_booking` versi funnel. **Titik awal badan fungsi:** `grep -l "function public.create_booking" supabase/migrations/*` dan ambil file terakhir menurut nama (seharusnya `20261125000300_funnel_events_attribution.sql`). Lakukan yang sama untuk `create_manual_booking`, `move_booking_slot`, `reschedule_booking_by_merchant`, `reschedule_booking`. Jangan ubah urutan kunci, aturan voucher, DP, minimum Rp1.500, batas QRIS, atau penulisan `funnel_events`.
- Produces `court_price(p_service_id uuid, p_start timestamptz, p_duration_minutes int) returns numeric` (stable, definer, `search_path = ''`; tidak di-grant ke anon/authenticated; hanya dipanggil fungsi lain).
- Produces `bookings.court_id uuid references courts(id)` (NO ACTION, FK gabungan dengan `merchant_id`), `bookings.court_name text`; `bookings_no_overlap` dibuat ulang dengan predikat tambahan `and court_id is null`; constraint baru `bookings_court_no_overlap` (exclude using gist `court_id with =, tstzrange(start_datetime, end_datetime) with &&` untuk status aktif yang sama dengan constraint lama, `where court_id is not null`).
- `create_booking(... , p_court_id uuid default null, p_duration_minutes int default null)` (drop lalu create; semua parameter funnel dipertahankan): untuk layanan sewa validasi lama main (BK071), jam mulai di grid unit dan seluruh rentang di dalam jam kerja (`slot_within_hours` dengan jam mulai dan selesai), di bawah advisory lock merchant pilih lapangan diminta (BK070 bila terisi atau tidak terkait/nonaktif) atau lapangan aktif terkait pertama yang kosong menurut `sort_order` lalu nama (BK072 bila tak ada); `service_price = court_price(...)`, `end_datetime = start + durasi`, `staff_id` null, simpan `court_id`/`court_name`.
- `create_manual_booking` mendapat dua parameter yang sama; harga dihitung `court_price`.
- `move_booking_slot`, `reschedule_booking_by_merchant`, `reschedule_booking`: untuk booking berlapangan pertahankan `court_id` dan durasi; bila bentrok pindah ke lapangan terkait kosong lain (perbarui `court_name`), bila tak ada tolak BK072; harga tidak dihitung ulang.
- `get_court_availability(p_merchant_id uuid, p_service_id uuid, p_date date) returns table(court_id uuid, court_name text, start_datetime timestamptz, end_datetime timestamptz)` (anon, definer; hanya lapangan aktif terkait layanan itu, hanya booking aktif; tanpa data pelanggan).
- Grant: `create_booking` dan `get_court_availability` sama seperti sebelumnya (service_role dan anon sesuai pola yang ada); `court_price` tertutup.

- [ ] **Step 1: Kasus uji 76 (pelanggan)** (gagal): padel dasar 150000, ramai Senin sampai Jumat 17.00 sampai 22.00 250000, unit 30: main 16.30 sampai 18.00 = `court_price` 325000 dan `bookings.service_price` 325000; 16.00 sampai 17.00 = 150000; 17.00 sampai 18.00 = 250000; hari tanpa aturan = harga dasar; lama main 45 menit (bukan kelipatan) BK071; di bawah minimum atau di atas maksimum BK071; jam mulai 16.15 (di luar grid) ditolak; rentang melewati jam tutup ditolak; lapangan diminta terisi BK070; "Mana saja" memilih Lapangan 1 lalu Lapangan 2 menurut `sort_order`; semua terisi BK072; dua booking beririsan pada lapangan sama ditolak `bookings_court_no_overlap` bila lewat INSERT langsung; booking salon tanpa staf tidak bentrok dengan booking lapangan; lapangan serbaguna terkunci untuk layanan kedua pada jam sama; DP persen, voucher (`min_amount` dibanding total), dan minimum Rp1.500 memakai total `court_price`; layanan non-sewa mengabaikan `p_court_id`; dua sesi paralel (dua koneksi psql, harness mendukung `\!` atau dua file) memperebutkan slot terakhir menghasilkan satu sukses dan satu BK072; `get_court_availability` oleh anon tidak punya kolom pelanggan dan tidak menampilkan booking CANCELLED.
- [ ] **Step 2: Kasus uji 77 (merchant)**: `create_manual_booking` memilih lapangan dan durasi dengan harga otomatis; `move_booking_slot` ke jam beririsan di lapangan sama pindah ke lapangan lain dan `court_name` berubah, `service_price` tetap; tanpa lapangan lain BK072; `reschedule_booking` oleh pelanggan pada booking berlapangan mempertahankan durasi; merchant A tidak bisa memakai `court_id` merchant B.
- [ ] **Step 3: `npm run docker:test`**, kasus baru gagal dan kasus lama (voucher, kursi, batas QRIS, staf, funnel) tetap lulus.
- [ ] **Step 4: Tulis migration** (drop `create_booking` berdasarkan signature funnel, buat ulang; `create or replace` untuk fungsi lain bila signature berubah gunakan drop).
- [ ] **Step 5: `npm run docker:test`** hijau.
- [ ] **Step 6: `database.ts`**, `npm run check`, commit `Mesin booking lapangan`.

### Task 4: Modul murni harga dan slot lapangan

Model: sonnet implementer; reviewer sonnet.

**Files:**
- Create: `src/lib/booking/court.ts`, `src/lib/booking/court.test.ts`
- Modify: `src/lib/booking/errors.ts` (+ `errors.test.ts`: BK070, BK071, BK072 ke pesan Indonesia; BK072 memakai teks "Semua lapangan penuh untuk ... di tanggal ini" dari L1)
- Modify: `src/lib/validations/booking.ts` (body `/api/bookings` menerima `courtId` dan `durationMinutes`)

**Interfaces:**
- `type CourtPriceRule = { dayOfWeek: DayOfWeek; start: string; end: string; pricePerHour: number }`
- `courtPrice(params: { basePerHour: number; rules: CourtPriceRule[]; dateISO: string; startHHMM: string; durationMinutes: number; unitMinutes: 30 | 60 }): { total: number; segments: { fromHHMM: string; toHHMM: string; pricePerHour: number; minutes: number; peak: boolean }[] }` (segmen berurutan yang digabung bila harga sama, dipakai rincian L2: "16.30 sampai 17.00, harga biasa" dan "17.00 sampai 18.00, jam ramai")
- `durationOptions(params: { minMinutes: number; maxMinutes: number; unitMinutes: number }): number[]` dan `formatDuration(minutes: number): string` ("1 jam", "1,5 jam", "2 jam")
- `computeCourtSlots(params: { dateISO: string; availability: AvailabilityWindow[]; courts: { id: string; name: string; sortOrder: number }[]; booked: { courtId: string; start_datetime: string; end_datetime: string }[]; unitMinutes: 30 | 60; durationMinutes: number; now: Date }): { time: string; start: string; free: { courtId: string; name: string }[]; full: boolean }[]` (slot penuh tetap dikembalikan dengan `full: true`; jam lewat dan di luar jam kerja tidak dikembalikan; seluruh durasi harus muat di jam kerja)
- `pickCourt(free: { courtId: string; name: string; sortOrder: number }[], requested: string | null): string | null` ("Mana saja" = `sort_order` lalu nama)
- `startingPrice(basePerHour: number, rules: CourtPriceRule[]): number` untuk "mulai Rp150.000/jam"

- [ ] **Step 1: Tulis tes `court.test.ts`** dengan tabel kasus yang IDENTIK dengan bagian 76: 16.30 sampai 18.00 pada Senin = 325000, 16.00 sampai 17.00 = 150000, 17.00 sampai 18.00 = 250000, Sabtu tanpa aturan = 225000 untuk 1,5 jam, unit 60 dengan jam mulai 16.00 durasi 120 lintas batas, pembulatan (`basePerHour` 100000, 30 menit = 50000; harga 99999 per jam 30 menit = 50000 dibulatkan); `segments` Senin 16.30 sampai 18.00 berisi dua segmen (biasa 30 menit, ramai 60 menit); `computeCourtSlots`: satu dari tiga lapangan terisi tetap menyisakan dua `free`, semua terisi `full: true`, rentang tidak muat sebelum jam tutup tidak muncul, booking beririsan sebagian memblokir, grid 30 menit dari jam buka; `pickCourt` urut `sort_order`; `durationOptions` 60/120/30 = `[60, 90, 120]`; `formatDuration(90) === "1,5 jam"`.
- [ ] **Step 2: `npm run test:unit`**, gagal.
- [ ] **Step 3: Implementasi** (reuse `jakartaWallClockToUtc`, `isoDayOfWeek` dari `slots.ts`).
- [ ] **Step 4: Tes lulus**, `npm run check`, commit `Modul murni harga dan slot lapangan`.

### Task 5: API slots dan booking untuk layanan sewa

Model: sonnet implementer; sonnet reviewer.

**Files:**
- Modify: `src/app/api/slots/route.ts` (cabang layanan sewa), `src/app/api/slots/route.test.ts` bila ada (bila belum ada, buat dengan pola `src/app/api/webhooks/[provider]/route.test.ts`)
- Create: `src/lib/booking/court-loader.ts` (muat lapangan terkait, aturan harga, dan rentang terpakai dari `get_court_availability` lewat `createPublicClient()`)
- Modify: `src/app/api/bookings/route.ts` (teruskan `p_court_id` dan `p_duration_minutes`; `mapBookingError` untuk BK070 sampai BK072)

**Interfaces:**
- `GET /api/slots?...&durationMinutes=` untuk layanan sewa (parameter baru opsional, wajib bila layanan sewa; `staffId` dan `party` diabaikan) mengembalikan `{ courtService: true, slots: { time, start, full, freeCount, price, courts: { id, name }[] }[], courts: ..., durations: number[] }`; `price` dari `courtPrice` TS untuk durasi itu. Layanan non-sewa: respons lama tidak berubah.
- Tidak ada `/api/slots/nearest` untuk sewa (keputusan 8 spec): rute itu mengembalikan 400 `court_service_not_supported` untuk layanan sewa.

- [ ] **Step 1: Tes route** (dependensi disuntikkan): layanan sewa tanpa `durationMinutes` 400; durasi tidak valid 400; slot penuh `full: true` dan `freeCount: 0`; respons layanan salon identik dengan snapshot lama; `nearest` untuk sewa 400.
- [ ] **Step 2: Gagal, implementasi, tes lulus**, `npm run check`.
- [ ] **Step 3: Verifikasi** dengan `curl` ke dev server (`marky-local`, port 3100): sewa padel mengembalikan harga jam ramai yang sama dengan hitungan manual.
- [ ] **Step 4: Commit** `API slots dan booking untuk sewa lapangan`.

### Task 6: Halaman publik: jadwal sewa (L1), denah dan profil (L1b), rincian harga (L2)

Model: sonnet implementer; **opus** reviewer (harga tampil harus sama dengan harga ditagih).

**Files:**
- Create: `src/components/booking-page/court-picker.tsx` (lama main, jam mulai dengan harga dan jumlah lapangan kosong, kartu lapangan berfoto, "Mana saja"), `court-venue-map.tsx` (denah, galeri foto, profil), `court-price-breakdown.tsx` (rincian L2)
- Modify: `src/app/[username]/page.tsx` (muat `get_court_profiles`, layanan sewa), `src/app/[username]/booking-flow.tsx` (langkah Jadwal dan Data diri bercabang untuk layanan sewa; langkah Data diri memakai `court-price-breakdown`; keadaan "Lapangan 2 baru saja dipesan orang lain" dengan tombol "Pakai Lapangan 3" dan "Pilih jam lain" saat BK070; kosong dan gagal dari L1)
- Test: `src/components/booking-page/court-picker.test.ts` untuk fungsi murni `buildCourtSlotRows(...)` (label, harga, status penuh, aria)

**Interfaces:**
- `CourtPicker({ service, durations, selectedDuration, onDuration, slots, selectedSlot, onSlot, courts, selectedCourt, onCourt, state }: ...)` dengan `state: "ready" | "loading" | "empty" | "error"`; jam penuh dicoret tetapi tetap tampil (spec) dan `disabled`; harga di tiap jam = total untuk durasi terpilih.
- `CourtVenueMap({ areas, markers, courts, busyCourtIds, selectedCourtId, onSelect })` dengan status "Kosong", "Dipilih", "Terisi di jam ini"; tautan "Lihat denah dan foto lapangan" hanya bila setidaknya satu lapangan punya posisi; tanpa denah hanya kartu lapangan. Foto tanpa alt tidak dirender. Setiap lapangan di denah adalah `<button>` dengan `aria-label` berisi nama, status, dan ciri pertama.
- Teks dari `LapJadwal.dc.html`, `LapDenah.dc.html`, `LapData.dc.html` ("Waktu Indonesia Barat", "Semua lapangan penuh untuk 1,5 jam di tanggal ini", "Lapangan ditahan 15 menit selama menunggu pembayaran.").

- [ ] **Step 1: Tes `buildCourtSlotRows`**: label harga memakai `courtPrice`, penuh = tidak bisa dipilih, `aria` "16.30, Rp325.000, 3 lapangan kosong" atau "17.30, penuh".
- [ ] **Step 2: Implementasi** komponen (hanya token tema) dan cabang di `BookingFlow`.
- [ ] **Step 3: `npm run test:unit`, `npm run check`.**
- [ ] **Step 4: Verifikasi browser** (HP 390px dan desktop, merchant uji dengan 3 lapangan): pilih 1,5 jam, jam ramai menampilkan total yang sama dengan rincian L2 dan dengan nilai `amount_due_now` setelah booking; reduced motion dihormati; salon tetap memakai alur lama.
- [ ] **Step 5: Commit** `Jadwal sewa, denah, dan rincian harga di halaman publik`.

### Task 7: Dashboard jadwal harian (L3, L4) dan booking manual

Model: sonnet implementer; sonnet reviewer.

**Files:**
- Create: `src/app/dashboard/lapangan/page.tsx` (tab `?tab=jadwal|lapangan`), `schedule-grid.tsx`, `schedule-grid.test.ts`, `actions.ts`
- Modify: `src/lib/routes.ts` (`ROUTES.courts = "/dashboard/lapangan"`; hanya di bawah `/dashboard`, tidak perlu `reserved_usernames`), `src/components/layout/app-sidebar.tsx` (item "Jadwal lapangan" untuk merchant yang punya layanan sewa), `src/app/dashboard/bookings/baru/manual-booking-form.tsx` dan `page.tsx` + `actions.ts` (pilih lapangan dan lama main, harga otomatis), daftar dan detail booking (`bookings-list.tsx`, panel detail) menampilkan `court_name` seperti nama staf; templat notifikasi dan pengingat (`src/lib/notify/*`) menyisipkan nama lapangan bila ada

**Interfaces:**
- `buildScheduleGrid(params: { courts: { id: string; name: string; note: string }[]; bookings: ScheduleBooking[]; startHour: number; endHour: number; rowMinutes: 30 | 60 }): { hours: { label: string; peak: boolean }[]; columns: { court: ...; blocks: { bookingId: string; rowStart: number; rowSpan: number; status: ...; label: string; aria: string }[] }[]; counts: { total: number; unpaid: number } }`. Rentang jam dari `availability` merchant; blok mengisi baris sesuai `court_unit_minutes`.
- Grid dengan CSS grid, kolom bisa digeser horizontal di HP (L4), blok membuka panel detail `?b=` yang ada. Empat keadaan L3: memuat, gagal ("Jadwal gagal dimuat. Periksa koneksi, lalu coba lagi."), belum ada lapangan ("Tambahkan lapangan dulu, ..."), normal. Legenda status dari L3. Ketuk sel kosong membuka booking manual dengan lapangan dan jam terisi.
- Aksi detail dari L3: "Tandai sisa sudah dibayar", "Pindah jam atau lapangan" (memakai `move_booking_slot`), "Kirim WhatsApp", "Batalkan booking" memakai server action yang sudah ada.

- [ ] **Step 1: Tes `buildScheduleGrid`**: blok 16.30 sampai 18.00 pada unit 30 mengisi 3 baris di kolom benar; dua booking di lapangan berbeda pada jam sama berada di kolom berbeda; booking CANCELLED tidak muncul; hitungan "8 booking, 4 belum lunas" (angka L4).
- [ ] **Step 2: Gagal, implementasi** grid, halaman, dan perubahan form manual.
- [ ] **Step 3: `npm run test:unit`, `npm run check`.**
- [ ] **Step 4: Verifikasi browser** (desktop dan HP): geser horizontal, buka panel detail, booking manual 1,5 jam di Lapangan 2 menampilkan harga jam ramai otomatis dan muncul di grid.
- [ ] **Step 5: Commit** `Jadwal lapangan harian dan booking manual`.

### Task 8: Form layanan sewa dan editor jam ramai (L5)

Model: sonnet implementer; sonnet reviewer.

**Files:**
- Create: `src/app/dashboard/services/court-fields.tsx` (toggle "Sewa lapangan", harga per jam, jam mulai tiap, lama main minimum dan maksimum, lapangan yang dipakai, "Tambah lapangan" inline), `peak-pricing-editor.tsx` (chip hari + jam + harga, tambah dan hapus aturan, error tumpang tindih), `price-checker.tsx` ("Cek harga" memakai `courtPrice` TS)
- Modify: `service-form-dialog.tsx`, `actions.ts` (menyimpan kolom sewa, `service_courts`, lalu `save_court_pricing`), `services-table.tsx` (harga dengan akhiran "/jam" untuk layanan sewa), `service-state.ts`
- Modify: `src/lib/validations/service.ts` (+ tes) untuk kolom sewa dan aturan harga

**Interfaces:**
- Zod `courtServiceSchema`: unit 30 atau 60, minimum dan maksimum kelipatan unit, maksimum 480, `courtIds` minimal 1, aturan `start < end`, `pricePerHour` bilangan bulat positif, tanpa tumpang tindih per hari (fungsi murni `findRuleOverlap(rules): { ruleIndex: number; day: number } | null` di `src/lib/booking/court.ts`).
- Pesan error tumpang tindih dari L5: "Sabtu dan Minggu 17.00 sampai 18.00 sudah masuk aturan 1. Ubah jam selesainya atau lepas harinya."
- Mengaktifkan sewa mematikan field restoran (`seat_duration_minutes`, rentang tamu) dan sebaliknya (CHECK database).

- [ ] **Step 1: Tes** `courtServiceSchema` dan `findRuleOverlap` (Sabtu dan Minggu 17.00 sampai 18.00 vs 16.30 sampai 17.30 tumpang tindih; hari berbeda lolos; batas bersentuhan 17.00 sampai 18.00 dan 18.00 sampai 19.00 lolos).
- [ ] **Step 2: Gagal, implementasi.**
- [ ] **Step 3: `npm run test:unit`, `npm run check`.**
- [ ] **Step 4: Verifikasi browser**: simpan layanan padel dengan dua aturan jam ramai, buka halaman publik, harga sama dengan "Cek harga"; kondisi error tumpang tindih tampil.
- [ ] **Step 5: Commit** `Form layanan sewa dan editor jam ramai`.

### Task 9: Lapangan, denah, profil, dan foto di dashboard (L6)

Model: sonnet implementer; **opus** reviewer (upload Storage dan isolasi merchant).

**Files:**
- Create: `src/app/dashboard/lapangan/courts-manager.tsx` (tab "Lapangan dan denah": tambah, ganti nama, urutkan, nonaktifkan), `venue-editor.tsx` (denah: seret lapangan, area, penanda, tombol Putar), `court-profile-form.tsx` (nama, olahraga, tempat, permukaan, deskripsi, ciri maks 5), `court-photos.tsx` (unggah maks 5, alt text wajib, hapus, foto pertama = sampul), `court-media-actions.ts`
- Create: `src/lib/validations/court.ts` (+ `court.test.ts`)
- Modify: `src/app/dashboard/lapangan/actions.ts` (CRUD lapangan, `saveVenueLayout` memanggil `save_venue_layout`)

**Interfaces:**
- Actions `createCourt`, `renameCourt`, `reorderCourts`, `setCourtActive`, `deleteCourt` (hanya bila tanpa riwayat booking, jika ada kembalikan pesan "Lapangan yang punya riwayat booking dinonaktifkan, bukan dihapus."), `saveCourtProfile`, `uploadCourtPhoto`, `deleteCourtPhoto`, `saveVenueLayout`.
- Upload: JPG/PNG/WebP maks 5 MB (pesan L6 "Foto terlalu besar. Pakai JPG, PNG, atau WebP maksimal 5 MB."), path `{merchant_id}/court/{court_id}/{uuid}.{ext}`, `width`/`height` dibaca saat unggah (pola `service-media-field.tsx` dan `halaman/actions.ts`), pesan "Teks alternatif wajib diisi sebelum foto tampil." selama alt kosong dan foto tidak dikirim ke publik, hapus foto menghapus objek Storage, hapus lapangan membersihkan semua fotonya.
- Zod `courtProfileSchema`: batas dari Global Constraints; `venueLayoutSchema` memvalidasi posisi dalam kanvas, `rotation` 0 atau 90, label area dan penanda 1 sampai 40.
- Denah memakai `DndContext`/pointer events yang sudah dipakai `floor-plan-editor.tsx` (cek dulu dengan `graphify query "floor plan editor drag"`), dapat dioperasikan dengan keyboard (panah menggeser, tombol Putar), `aria-label` dari L6 ("Putar {nama} 90 derajat").

- [ ] **Step 1: Tes Zod**: nama 41 karakter ditolak, 6 ciri ditolak, `rotation = 45` ditolak, alt kosong ditandai tidak terbit, layout dengan posisi negatif ditolak.
- [ ] **Step 2: Gagal, implementasi.**
- [ ] **Step 3: `npm run test:unit`, `npm run check`.**
- [ ] **Step 4: Verifikasi browser**: tambah 3 lapangan, atur denah, unggah foto dengan dan tanpa alt, buka halaman publik (L1b) dan pastikan foto tanpa alt tidak tampil; coba path Storage merchant lain lewat Supabase client, ditolak.
- [ ] **Step 5: Commit** `Editor lapangan, denah, profil, dan foto`.

### Task 10: Onboarding kategori Olahraga

Model: sonnet implementer; sonnet reviewer.

**Files:**
- Modify: `src/lib/business/catalog.ts` (+ `catalog.test.ts`): kategori `OLAHRAGA` dengan jenis Padel, Futsal, Mini soccer, Badminton, Tenis; `labels.ts`
- Modify: `src/app/onboarding/steps/step-usaha.tsx`, `step-layanan.tsx` (template layanan sewa dengan `priceHint`, harga tetap keputusan merchant), `wizard-payload.ts` (+ tes), `actions.ts`, `src/lib/validations/onboarding.ts`
- Modify: `src/app/dashboard/profile-nudge*.tsx` bila daftar kategori ditulis di sana

**Interfaces:**
- Template per jenis: nama "Sewa lapangan {jenis}", `court_unit_minutes` 30 (futsal, mini soccer, badminton, tenis) atau 30 (padel), minimum 60, maksimum 120, `priceHint` string. Payload wizard membawa `court: { unitMinutes; minMinutes; maxMinutes } | null`.
- Aksi onboarding menyelesaikan: membuat layanan sewa, dua lapangan contoh ("Lapangan 1", "Lapangan 2", `sport` sesuai jenis, `environment` INDOOR) di `courts`, dan dua baris `service_courts`, semuanya lewat klien bersesi (RLS), kegagalan di tengah tidak meninggalkan layanan tanpa lapangan (jalankan lewat satu RPC atau rollback manual yang diuji). Panduan memulai (`onboarding_state`) tidak berubah.

- [ ] **Step 1: Tes** katalog (lima jenis, kategori `OLAHRAGA` ada) dan `wizard-payload` (jenis padel menghasilkan payload sewa dengan dua lapangan; jenis salon tanpa `court`).
- [ ] **Step 2: Gagal, implementasi.**
- [ ] **Step 3: `npm run test:unit`, `npm run check`, `npm run docker:test`** bila RPC ditambahkan (kasus 77.x).
- [ ] **Step 4: Verifikasi browser**: wizard sebagai merchant baru memilih Olahraga lalu Padel menghasilkan halaman booking dengan dua lapangan contoh.
- [ ] **Step 5: Commit** `Onboarding kategori Olahraga`.

### Task 11: Halaman `/untuk/lapangan`

Model: haiku implementer (teks); controller memeriksa.

**Files:**
- Modify: `src/lib/marketing/industries.ts` (+ `industries.test.ts`): slug `lapangan` dengan judul, subjudul, tiga manfaat (jadwal per jam semua lapangan, harga jam ramai, tanpa bentrok), FAQ, dan CTA; `src/lib/marketing/json-ld.ts` bila daftar industri ditulis di sana; sitemap membaca data yang sama

**Interfaces:**
- Mengikuti bentuk entri industri yang ada (`IndustrySlug` bertambah `"lapangan"`); segmen `untuk` sudah dicadangkan jadi tidak perlu `ROUTES`/`reserved_usernames` baru.

- [ ] **Step 1: Tes** `industries.test.ts` (slug `lapangan` ada, tidak mengandung em dash, semua field wajib terisi) dan sitemap memuatnya.
- [ ] **Step 2: Implementasi, `npm run test:unit`, `npm run check`.**
- [ ] **Step 3: Verifikasi browser** `/untuk/lapangan` di HP dan desktop, OG dan JSON-LD valid.
- [ ] **Step 4: Commit** `Landing /untuk/lapangan`.

### Task 12: Panduan, keputusan, dan dokumentasi

Model: haiku implementer (teks); controller memeriksa.

**Files:**
- Modify: `src/lib/guide/content.ts` (+ `content.test.ts` hijau): panduan halaman Lapangan (target `data-tour` ditambahkan di Task 7 dan Task 9 bila belum ada), panduan form layanan sewa, dan butir checklist hanya bila aturan `guide.ts` perlu (jangan mengubah `onboarding_state()` tanpa migration)
- Modify: `docs/DECISIONS.md` (#43 Booking lapangan: pendekatan B ditolak/diterima alasan A dan B', 9 keputusan pembuat spec, kode BK070 sampai BK072 dan bila digeser, urutan migration `20261126000100` sampai `000400`), `CLAUDE.md` bagian Status (satu paragraf F12 booking lapangan), `docs/SETUP.md` bila ada bucket atau env baru

- [ ] **Step 1: Perbarui teks.**
- [ ] **Step 2: `npm run test:unit`, `npm run check`.**
- [ ] **Step 3: `graphify update .`**
- [ ] **Step 4: Commit** `Panduan, keputusan, dan dokumentasi booking lapangan`.

### Penutup (controller)

- [ ] Review akhir seluruh cabang (opus), dengan Review Focus 1 sampai 6 sebagai daftar periksa; jalankan `npm run docker:test`, `npm run test:unit`, `npm run check` sekali lagi dari awal.
- [ ] Terapkan migration `20261126000100` sampai `20261126000400` ke produksi lewat Supabase MCP dengan pola md5 (periksa md5 isi tiap migration terhadap file lokal sebelum dan sesudah, lihat memori `marky-rollout`), SEBELUM merge kode. Migration `20261125000100` sampai `000300` (funnel) harus sudah terpasang lebih dulu. Karena parameter baru `create_booking` ber-default null, kode lama tetap jalan di antara migration dan deploy.
- [ ] PR ke `main`, cek Vercel, verifikasi read-only di produksi (tanpa booking atau pembayaran nyata): halaman `/untuk/lapangan` dan `/[username]` merchant uji muncul tanpa error.
