# F1 Halaman pelanggan baru: rencana implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ganti alur booking publik (`/[username]`) dan halaman status (`/pesanan/[token]`) dengan desain baru kanvas 01, 02, 03, 04, 05, P1 dan P5, tanpa mengubah alur uang, API, atau skema.

**Architecture:** Logika tanggal, slot, dan kalender jadi fungsi murni di `src/lib/booking/` yang diuji `node:test`. Tampilan dipecah jadi komponen murni di `src/components/booking-page/` (punya story, bisa dirender tanpa jaringan). Satu komponen klien `BookingFlow` memegang state tiga langkah, memanggil `GET /api/slots` dan `POST /api/bookings` yang sudah ada, lalu menggantikan `booking-picker.tsx`. Halaman `/pesanan/[token]` memakai tema merchant lewat `resolveTheme()` dan `BookingPageShell`.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui, `qrcode` (sudah terpasang), Storybook 10, `node:test` lewat tsx.

**Spec:** `docs/superpowers/specs/2026-11-14-marky-redesign-design.md` bagian 5, F1. Arah visual: `DESIGN.md` bagian 2. Desain: kanvas https://claude.ai/artifact/RSGQtRjX4RQivoVekkfgeo, artboard 01, 02, 03, 04, 05, P1, P5.

## Global Constraints

- Tidak ada migration, tidak ada perubahan `src/app/api/**`, tidak ada perubahan `src/types/database.ts`.
- Semua warna, huruf, sudut di `src/components/booking-page/*` lewat CSS custom property dari `themeToCssVars()`. Tidak ada nilai warna tertulis langsung. Kelas Tailwind token (`bg-primary`, `text-muted-foreground`, `border-border`) boleh.
- `src/lib/theme/fonts.ts` tidak boleh diimpor oleh file yang diuji `npm run test:unit`.
- Lebar kolom halaman publik maksimal `440px` (`max-w-[440px]`), di tengah, di semua lebar layar. Tidak ada tata letak desktop terpisah.
- Satu aksi utama menempel di bawah layar (bar lengket), target sentuh minimal 44px, fokus selalu terlihat, semua bisa dipakai keyboard.
- Larangan `DESIGN.md`: tanpa em dash, tanpa eyebrow, tanpa label huruf kapital berjarak (hapus pola `font-mono uppercase tracking-[0.18em]` yang ada), tanpa titik tengah `·` sebagai pemisah, tanpa panah di teks tombol.
- Tanpa klaim yang tidak dijamin sistem. Contoh: jangan tulis "pengingat H-1 dikirim" (bergantung konfigurasi notifikasi merchant), jangan tampilkan kode booking yang tidak bisa dicari merchant.
- Label cara bayar per kartu layanan untuk F1 selalu `Bayar saat booking`.
- Teks UI dan komentar berbahasa Indonesia, nama variabel Inggris.
- Setiap daftar data punya keadaan memuat, kosong, dan gagal.
- Pemanggilan `/api/slots` dan `/api/bookings` tetap sama persis dengan `booking-picker.tsx` sekarang (parameter, penanganan error, penjaga urutan respons `requestIdRef`).

## Review Focus

1. Tombol Back browser di langkah 2 atau 3 harus kembali ke langkah sebelumnya, bukan meninggalkan halaman. Memuat ulang di `?langkah=data` mulai dari langkah 1 tanpa error.
2. Merchant yang tutup di seluruh 14 hari ke depan, atau hanya staf yang punya jam: strip tanggal tetap tampil dengan hari nonaktif dan pesan yang jelas.
3. Pelanggan mengganti tanggal cepat-cepat: respons lama tidak boleh menimpa jam tanggal terbaru.
4. Tema gelap (MALAM) dan BERANI: kartu layanan terpilih dan jam terpilih tetap terbedakan tanpa bergantung warna saja (ikon centang atau garis tepi tebal plus `aria-checked`).
5. `/pesanan/[token]` untuk merchant tanpa baris `merchant_themes` jatuh ke preset default, dan PENDING yang sudah lewat tenggat tetap tampil sebagai kedaluwarsa.

---

### Task 1: Fungsi murni jadwal dan kalender

Model: haiku (rencana memuat tes lengkap).

**Files:**
- Create: `src/lib/booking/schedule.ts`, `src/lib/booking/schedule.test.ts`
- Create: `src/lib/booking/calendar.ts`, `src/lib/booking/calendar.test.ts`

**Interfaces:**
- Consumes: `jakartaDateISO`, `isoDayOfWeek`, `FreeSlot` dari `src/lib/booking/slots.ts`; `DayOfWeek` dari `src/types/database.ts`.
- Produces:
  - `type DateStripDay = { dateISO: string; open: boolean }`
  - `buildDateStrip(openDays: ReadonlySet<DayOfWeek>, todayISO: string, count?: number): DateStripDay[]` (default `count` 14, mulai dari `todayISO`)
  - `nextOpenDate(strip: DateStripDay[], afterISO: string): string | null` (hari buka pertama setelah `afterISO`)
  - `type SlotPeriod = "PAGI" | "SIANG" | "SORE" | "MALAM"`
  - `SLOT_PERIOD_LABEL: Record<SlotPeriod, string>` = `{ PAGI: "Pagi", SIANG: "Siang", SORE: "Sore", MALAM: "Malam" }`
  - `groupSlotsByPeriod(slots: FreeSlot[]): { period: SlotPeriod; slots: FreeSlot[] }[]` (urut, kelompok kosong dibuang; batas dari `label` jam Jakarta: PAGI < 11:00, SIANG < 15:00, SORE < 18:00, sisanya MALAM)
  - `monthLabel(dateISO: string): string` mis. `"November 2026"` (format `id-ID`, `timeZone: "UTC"` seperti `dateLabel` di `booking-picker.tsx`)
  - `buildBookingIcs(input: { uid: string; title: string; startUtc: string; endUtc: string; location?: string; description?: string }): string`

- [ ] **Step 1: Tulis tes yang gagal** di `schedule.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDateStrip, groupSlotsByPeriod, monthLabel, nextOpenDate } from "./schedule";

test("buildDateStrip menandai hari tutup tanpa membuangnya", () => {
  // 2026-11-16 adalah Senin. Buka Senin sampai Jumat.
  const strip = buildDateStrip(new Set([1, 2, 3, 4, 5]), "2026-11-16", 7);
  assert.equal(strip.length, 7);
  assert.deepEqual(strip.map((d) => d.open), [true, true, true, true, true, false, false]);
  assert.equal(strip[6].dateISO, "2026-11-22");
});

test("buildDateStrip melewati akhir bulan", () => {
  const strip = buildDateStrip(new Set([1, 2, 3, 4, 5, 6, 7]), "2026-11-29", 3);
  assert.deepEqual(strip.map((d) => d.dateISO), ["2026-11-29", "2026-11-30", "2026-12-01"]);
});

test("buildDateStrip tanpa hari buka mengembalikan semua tutup", () => {
  const strip = buildDateStrip(new Set(), "2026-11-16");
  assert.equal(strip.length, 14);
  assert.ok(strip.every((d) => !d.open));
});

test("nextOpenDate mencari hari buka setelah tanggal tertentu", () => {
  const strip = buildDateStrip(new Set([1]), "2026-11-16", 14);
  assert.equal(nextOpenDate(strip, "2026-11-16"), "2026-11-23");
  assert.equal(nextOpenDate(strip, "2026-11-23"), null);
});

test("groupSlotsByPeriod mengelompokkan dan membuang kelompok kosong", () => {
  const slot = (label: string) => ({ startUtc: label, endUtc: label, label });
  const groups = groupSlotsByPeriod(["09:00", "10:30", "11:00", "18:00"].map(slot));
  assert.deepEqual(
    groups.map((g) => [g.period, g.slots.map((s) => s.label)]),
    [["PAGI", ["09:00", "10:30"]], ["SIANG", ["11:00"]], ["MALAM", ["18:00"]]],
  );
  assert.deepEqual(groupSlotsByPeriod([]), []);
});

test("monthLabel memakai bahasa Indonesia", () => {
  assert.equal(monthLabel("2026-11-21"), "November 2026");
});
```

Dan `calendar.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBookingIcs } from "./calendar";

test("buildBookingIcs menghasilkan VEVENT UTC dengan CRLF", () => {
  const ics = buildBookingIcs({
    uid: "abc",
    title: "Makeup Wisuda, Rias; by Sekar",
    startUtc: "2026-11-21T03:00:00.000Z",
    endUtc: "2026-11-21T04:30:00.000Z",
  });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.includes("UID:abc@marky.id\r\n"));
  assert.ok(ics.includes("DTSTART:20261121T030000Z\r\n"));
  assert.ok(ics.includes("DTEND:20261121T043000Z\r\n"));
  // Koma dan titik koma wajib di-escape (RFC 5545 bagian 3.3.11).
  assert.ok(ics.includes("SUMMARY:Makeup Wisuda\\, Rias\\; by Sekar\r\n"));
  assert.ok(ics.trimEnd().endsWith("END:VCALENDAR"));
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**: `npx tsx --test src/lib/booking/schedule.test.ts src/lib/booking/calendar.test.ts` → FAIL karena modul belum ada.
- [ ] **Step 3: Implementasikan** kedua modul sesuai Interfaces. `buildDateStrip` maju per 24 jam dari tengah hari UTC `todayISO` (WIB tanpa DST, sama alasannya dengan `nextAvailableDates`). `buildBookingIcs` memakai `PRODID:-//Marky//Booking//ID`, `DTSTAMP` dari `startUtc` agar keluaran deterministik, escape `\`, `,`, `;`, dan baris baru.
- [ ] **Step 4: Jalankan lagi**: perintah yang sama → PASS. Lalu `npm run typecheck`.
- [ ] **Step 5: Commit**: `git add src/lib/booking/schedule* src/lib/booking/calendar*` lalu `git commit -m "Tambah fungsi murni strip tanggal, kelompok jam, dan file kalender"`.

---

### Task 2: Komponen tampilan langkah booking

Model: sonnet.

**Files:**
- Create di `src/components/booking-page/`: `step-indicator.tsx`, `service-option-card.tsx`, `sticky-action-bar.tsx`, `date-strip.tsx`, `time-slot-picker.tsx`, `booking-summary.tsx`, plus satu `booking-steps.stories.tsx` berisi story tiap komponen.
- Modify: `src/components/booking-page/fixtures.ts` (tambah `sampleSlots: FreeSlot[]` contoh pagi sampai malam)

**Interfaces:**
- Consumes: Task 1 (`DateStripDay`, `groupSlotsByPeriod`, `SLOT_PERIOD_LABEL`, `monthLabel`); `BookingServiceGallery`; `formatRupiah`, `formatDuration`.
- Produces (semua komponen murni, tanpa `fetch`, tanpa state global):
  - `BookingStepIndicator({ current }: { current: 1 | 2 | 3 })`: tiga langkah `Layanan`, `Jadwal`, `Data diri`, `aria-current="step"` di langkah aktif.
  - `ServiceOptionCard({ service, media, checked, onSelect, eager, paymentLabel })`: kartu radio. `<input type="radio" name="layanan">` asli di dalam `<label>`; galeri di luar `<label>` agar kontrol galeri tidak bersarang di kontrol radio. Menampilkan nama, harga, durasi, deskripsi, dan `paymentLabel`. Keadaan terpilih memakai garis tepi tebal plus ikon centang.
  - `StickyActionBar({ summary, actionLabel, disabled, busy, onAction, type })`: `sticky bottom-0`, selebar kolom, ringkasan satu baris di kiri, tombol utama di kanan. `type` `"button" | "submit"`.
  - `DateStrip({ days, selected, onSelect })`: judul bulan dari `monthLabel(selected ?? days[0])`, gulir horizontal, hari tutup `disabled` dengan teks `Tutup`. Pola `role="radiogroup"`.
  - `TimeSlotPicker({ state, selected, onSelect, onRetry, onPickDate })` dengan `state` union: `{ kind: "idle" } | { kind: "loading" } | { kind: "error" } | { kind: "empty"; nextDate: string | null } | { kind: "ready"; slots: FreeSlot[] }`. Teks keadaan dari kanvas 02: `Memuat jam kosong...`, `Jam kosong gagal dimuat` / `Periksa koneksi, lalu coba lagi.` / tombol `Coba lagi`, `Jam di tanggal ini sudah penuh` lalu tombol `Lihat <tanggal>` ke `nextDate` (teks penjelas `Hari buka berikutnya: <tanggal>`; jangan klaim ada jam kosong). Jam dikelompokkan `groupSlotsByPeriod` dengan subjudul `Pagi`/`Siang`/`Sore`/`Malam`. Catatan zona `Waktu Indonesia Barat`.
  - `BookingSummary({ rows, total })`: daftar `dl` Layanan, Jadwal, Dengan, lalu `Dibayar sekarang` dengan total.
- Story: tiap komponen di tema HANGAT, plus `TimeSlotPicker` di kelima keadaan dan `ServiceOptionCard` terpilih di tema MALAM.

- [ ] **Step 1: Baca** `node_modules/next/dist/docs/` hanya bila memakai API Next. Komponen ini React murni.
- [ ] **Step 2: Tulis komponen dan story.** Hapus pola label mono kapital; pakai `text-sm font-medium` untuk subjudul.
- [ ] **Step 3: Verifikasi**: `npm run typecheck && npm run lint` lulus, `npm run build-storybook` lulus.
- [ ] **Step 4: Commit**: `git commit -m "Tambah komponen langkah booking dengan story"`.

---

### Task 3: `BookingFlow` tiga langkah menggantikan picker

Model: sonnet.

**Files:**
- Create: `src/app/[username]/booking-flow.tsx` (client), `src/components/booking-page/desktop-handoff.tsx`
- Modify: `src/app/[username]/booking-page-view.tsx`, `src/app/[username]/booking-page-view.stories.tsx`, `src/components/booking-page/page-shell.tsx` (lebar kolom jadi `max-w-[440px]`)
- Modify: `src/app/dashboard/halaman/preview-frame.tsx` (pemakai lain `BookingServiceCard`): ganti dengan `ServiceOptionCard`, layanan pertama `checked`, `onSelect` no-op, supaya preview dan halaman publik tetap sama
- Delete: `src/app/[username]/booking-picker.tsx`, `src/app/[username]/booking-seam.tsx`, `src/components/booking-page/service-card.tsx`

**Interfaces:**
- Consumes: Task 1 dan 2; `checkoutSchema` dari `src/lib/validations/booking.ts`; `BookingPickerProps` lama sebagai bentuk props awal.
- Produces:
  - `BookingFlow(props: { username: string; merchantName: string; services: Service[]; mediaByService: Record<string, ServiceMedia[]>; availability: Pick<Availability, "day_of_week">[]; staff: { id: string; name: string; days: DayOfWeek[] }[] })`
  - `DesktopHandoff({ url }: { url: string })`: kartu `Lebih nyaman di HP` / `Pindai untuk lanjut booking di HP Anda.` dengan QR dari `qrcode` (`toDataURL`, sama seperti `QrisCode`). Hanya tampil `lg:` ke atas, diposisikan `fixed` di kanan bawah di luar kolom 440px, `aria-hidden` tidak dipakai (punya teks alternatif).

Perilaku `BookingFlow`:
- Langkah 1: daftar `ServiceOptionCard` (`paymentLabel="Bayar saat booking"`); layanan tunggal sudah terpilih. Bar lengket `Pilih jadwal`, nonaktif sampai layanan dipilih.
- Langkah 2: kartu layanan terpilih ringkas dengan tombol `Ganti` (kembali ke langkah 1), `Dengan siapa?` bila ada staf (pilihan `Siapa saja` + nama staf), `DateStrip` 14 hari dari `jakartaDateISO(new Date())`, `TimeSlotPicker`. Bar lengket `Lanjut`, nonaktif sampai jam dipilih. Hari buka dihitung persis seperti `openDays` di `booking-picker.tsx` sekarang.
- Langkah 3: `BookingSummary`, form Nama lengkap dan Nomor WhatsApp (prefiks tampilan `+62`, teks bantu `Dipakai merchant untuk menghubungi Anda soal booking ini.`), catatan `Pembayaran masuk langsung ke <merchantName> lewat QRIS. Jadwal ditahan 15 menit selama Anda membayar.`, tautan Kebijakan Privasi seperti sekarang. Bar lengket `type="submit"` berlabel `Bayar <harga>`.
- Riwayat browser: setiap maju langkah memanggil `window.history.pushState` dengan `?langkah=jadwal` atau `?langkah=data`; listener `popstate` (di `useEffect`, karena menyinkronkan sistem eksternal) memundurkan langkah. Saat dimuat, abaikan parameter dan mulai di langkah 1. Baca panduan Next 16 tentang `window.history.pushState` di `node_modules/next/dist/docs/` sebelum menulis ini.
- Fokus pindah ke judul langkah (`tabIndex={-1}`) setiap ganti langkah; gulir ke atas.
- `BookingPageView` merender `BookingFlow` di bawah header profil (menggantikan daftar `BookingServiceCard` plus `BookingSeam`), dan `DesktopHandoff` dengan `url` = `new URL(ROUTES.merchantPage(username), siteUrl()).toString()`. FAQ, JSON-LD, dan tautan `Dibuat dengan Marky` tetap.
- Story `BookingPageView` yang lama tetap lulus; tambah story `SatuLayanan` dan `DenganStaf`.

- [ ] **Step 1: Cari pemakai** `BookingServiceCard`, `BookingSeam`, `BookingPicker` (`graphify query` lalu `grep`).
- [ ] **Step 2: Tulis `BookingFlow` dan `DesktopHandoff`, sambungkan ke `BookingPageView`, hapus file lama.**
- [ ] **Step 3: Verifikasi**: `npm run check` lulus, `npm run build-storybook` lulus.
- [ ] **Step 4: Commit**: `git commit -m "Ganti picker booking dengan alur tiga langkah mobile-first"`.

---

### Task 4: Halaman booking saya `/pesanan/[token]` bertema merchant

Model: sonnet.

**Files:**
- Modify: `src/app/pesanan/[token]/page.tsx`
- Create: `src/app/pesanan/[token]/booking-status-view.tsx` (tampilan murni) dan `booking-status-view.stories.tsx`
- Create: `src/components/booking-page/add-to-calendar-button.tsx` (client)

**Interfaces:**
- Consumes: `resolveTheme`, `BookingPageShell`, `buildBookingIcs` (Task 1), `BookingLiveStatus` dan `QrisCode` (tidak diubah).
- Produces:
  - `BookingStatusView(props: { booking: BookingPageRow; merchantName: string; merchantUsername: string | null; theme: ResolvedTheme; isExpiredPending: boolean })`, dengan `BookingPageRow` dipindah ke file ini dan diekspor.
  - `AddToCalendarButton({ ics, fileName }: { ics: string; fileName: string })`: unduh lewat `Blob` + `URL.createObjectURL`, label `Tambah ke kalender`.

Perilaku:
- Loader menambah `end_datetime` ke `BOOKING_COLUMNS`, mengambil `subscription_tier` dan `merchant_themes(*)` merchant lewat admin client yang tetap difilter `id = booking.merchant_id`, lalu `resolveTheme(tier, themeRow)` (normalisasi objek atau array seperti `src/app/[username]/page.tsx`). `access_token` tetap tidak pernah di-select.
- Seluruh halaman dibungkus `BookingPageShell` dengan tema itu. Judul `Booking Anda`, nama merchant di bawahnya.
- PAID (artboard 05 dan P1): blok tanggal (bulan singkat dan tanggal besar), nama layanan, `Sabtu, 21 Nov 2026, 10.00 sampai 11.30 WIB` dari `start_datetime`/`end_datetime`, baris `Atas nama`, `Dibayar` (nominal dan `QRIS`), status `Terkonfirmasi` sebagai teks plus ikon. Aksi: `AddToCalendarButton`, tautan `Kembali ke halaman <merchant>`. Catatan `Simpan halaman ini. Tautannya bisa dibuka lagi kapan saja.` Tanpa Ubah jadwal, Hubungi, Pengingat, kode booking (fase F4).
- PENDING (artboard 04): pertahankan `BookingLiveStatus` dan `QrisCode` persis. Tampilkan `Total dibayar`, `Bayar sebelum <jam> WIB`, langkah `Cara bayar` bernomor 1 sampai 3 dari kanvas 04 (langkah 3: `Halaman ini berubah otomatis setelah pembayaran diterima.`), lalu ringkasan Layanan, Jadwal, Atas nama.
- CANCELLED atau kedaluwarsa: perilaku dan teks sekarang, dalam shell bertema.
- `dynamic = "force-dynamic"`, `robots: noindex`, judul netral tetap.
- Story: Lunas, MenungguBayar, Kedaluwarsa, Dibatalkan, di tema HANGAT dan MALAM.

- [ ] **Step 1: Pindahkan JSX ke `BookingStatusView`, tambahkan tema di loader.**
- [ ] **Step 2: Terapkan tata letak baru dan `AddToCalendarButton`.**
- [ ] **Step 3: Verifikasi**: `npm run check` lulus, `npm run build-storybook` lulus.
- [ ] **Step 4: Commit**: `git commit -m "Tampilkan halaman booking saya dengan tema merchant"`.

---

### Task 5: Verifikasi di browser dan dokumentasi

Dikerjakan controller (bukan subagen), memakai server pratinjau.

- [ ] **Step 1:** `npm run storybook`, periksa panel a11y tiap story baru di viewport `hp` tanpa pelanggaran.
- [ ] **Step 2:** Jalankan app dengan Supabase lokal, buka satu merchant contoh di 390px dan 1280px: pilih layanan, jadwal, isi data, sampai `/pesanan/[token]` PENDING. Uji tombol Back di langkah 2 dan 3, muat ulang di `?langkah=data`, dan ganti tanggal cepat (Review Focus 1 sampai 3). Bila Supabase lokal tidak tersedia, catat bagian yang tidak terverifikasi di PR.
- [ ] **Step 3:** Perbarui `AGENTS.md` bagian Status (satu kalimat F1) dan status F1 di `docs/superpowers/plans/2026-11-14-marky-roadmap.md`. Jalankan `graphify update .`.
- [ ] **Step 4: Commit**: `git commit -m "Catat F1 selesai di status dan roadmap"`.
