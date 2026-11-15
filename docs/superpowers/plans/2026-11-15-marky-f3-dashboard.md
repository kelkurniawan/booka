# F3 Dashboard: Hari ini, Booking + panel detail, booking manual, nav HP: rencana implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dashboard merchant dibuka di "Hari ini" (perlu tindakan, agenda dengan tombol Hadir, tagihan di tempat, ringkasan 7 hari). Halaman Booking punya tab, pencarian, dan panel detail dengan semua aksi F2 plus Jadwal ulang. Merchant bisa mencatat booking manual (telepon atau datang langsung), dan di HP ada nav bawah dengan tombol tambah booking.

**Architecture:** Dua migration. Yang pertama menambah `bookings.source` dan membuat `create_booking` menerima `p_source`. Pembungkus `create_manual_booking` (authenticated, merchant dari `auth.uid()`) memanggilnya, jadi aturan slot tetap satu sumber. Migration ini juga menambah RPC jadwal ulang milik merchant. Yang kedua menambah fungsi baca dashboard: `booking_tab(bookings)` sebagai satu definisi tab, lalu `bookings_in_tab`, `dashboard_tab_counts`, dan `dashboard_week_summary`. Di TypeScript, modul murni `src/lib/booking/dashboard.ts` memegang tab, pengelompokan hari WIB, total tagihan di tempat, dan tautan WhatsApp. Komponen tampilan menerima data dan aksi sebagai props, jadi bisa dibuat story-nya.

**Tech Stack:** Postgres (migration Supabase, uji `npm run docker:test`), Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui (`Sheet`, `Sidebar`), Zod, `node:test` lewat tsx, Storybook 10.

**Spec:** `docs/superpowers/specs/2026-11-14-marky-redesign-design.md` bagian 1, 2, 5 (F3), 6, 7. Arah visual: `DESIGN.md` bagian 1 dan "Larangan". Artboard: D1 `DashHariIni.dc.html`, D2 `DashBooking.dc.html`, D3 `DashMobile.dc.html`. Teks artboard: `python3 .superpowers/design/extract.py .superpowers/design/app/<file>`. Keputusan cara bayar yang ditampilkan: `docs/superpowers/plans/2026-11-15-marky-f2-cara-bayar.md`.

## Prasyarat

F3 dimulai setelah F2 selesai, termasuk Task 10 (pembaca status: `upcoming-bookings.tsx`, analitik, ekspor) dan Task 11, dan semuanya sudah di-commit. Cabang F3 dibuat dari ujung `fitur/marky-f2`. Saat rencana ini ditulis, perubahan Task 10 F2 masih belum di-commit di working tree (`src/app/dashboard/upcoming-bookings.tsx`, `src/lib/analytics/aggregate.ts`, `src/app/dashboard/analitik/page.tsx`, `src/app/dashboard/settings/ekspor/route.ts`, `src/app/dashboard/settings/account-actions.ts`). F3 Task 5 menghapus `upcoming-bookings.tsx` dan `overview-stats.tsx`, jadi jangan mulai sebelum Task 10 F2 masuk.

## Keputusan (spec diam, diputuskan di sini)

1. Booking manual selalu `CONFIRMED`, `payment_mode = 'ON_SITE'`, `amount_due_now = 0`, `amount_due_on_site = service_price`, `source = 'MANUAL'`. Ini berlaku apa pun cara bayar layanannya, dan tanpa memandang `allow_pay_on_site`, `max_active_per_phone`, atau koneksi payment. Alasan: merchant sedang berhadapan dengan pelanggan. Tagihan online butuh tautan `/pesanan/[token]`, padahal dashboard tidak boleh membaca `access_token`. Merchant menandai lunas lewat panel bila pelanggan sudah bayar.
2. Booking manual mengikuti aturan slot yang sama dengan booking online: hanya jam yang belum lewat (`P0006`), di dalam jam buka merchant atau staf (`BK001`), constraint eksklusi (`23P01`), trigger kuota (`P0002`), dan penugasan staf "siapa saja" (`BK002`/`BK003`). Pelanggan yang datang langsung dicatat di slot kosong terdekat. Daftar jam diambil dari `/api/slots`, endpoint yang sama dengan halaman publik.
3. Aturan slot tetap satu sumber. `create_booking` mendapat argumen kedelapan `p_source public.booking_source default 'ONLINE'`. Pembungkus `create_manual_booking` (authenticated) memanggilnya dengan `auth.uid()`. Pembersihan inline booking kedaluwarsa dipindah ke `reap_expired_bookings_for(uuid)` dan dipakai `create_booking` serta jadwal ulang.
4. Booking manual mengirim konfirmasi ke pelanggan (`BOOKING_CONFIRMED_CUSTOMER`, lewat `notifyBookingCreated`). Merchant tidak diberi notifikasi atas booking yang ia catat sendiri.
5. Definisi tab ada di satu fungsi SQL `booking_tab` (lihat Task 2). Perlu tindakan: `REQUESTED` dan `PENDING` yang masih memegang slot, ditambah `PAID`/`CONFIRMED` yang jadwalnya sudah mulai dalam 7 hari terakhir dan belum ditandai hadir/tidak datang, atau sudah hadir tetapi tagihan di tempat belum lunas. Yang lebih lama dari 7 hari masuk Riwayat. `PENDING`/`REQUESTED` kedaluwarsa yang belum dibersihkan cron masuk Dibatalkan.
6. Tab di URL: `?tab=tindakan|mendatang|riwayat|batal`, default `mendatang`. "Lihat semua" di Hari ini menuju `?tab=tindakan`.
7. Booking terpilih lewat `?b=<id>`. Mulai lebar 1024px (`lg`) panel tampil sebagai kolom di kanan daftar. Di bawah itu panel tampil di `Sheet`. `BookingDetailDialog` diganti panel ini.
8. Jadwal ulang oleh merchant hanya untuk `PAID`/`CONFIRMED` yang belum ditandai hadir/tidak datang, ke jam yang belum lewat. Staf dan durasi tetap sama, dan aturan jam buka serta eksklusi berlaku. Baris `REMINDER_CUSTOMER` di `notification_log` booking itu dihapus supaya pengingat H-1 terkirim lagi untuk tanggal baru. Tidak ada pesan otomatis. Setelah berhasil, panel menawarkan tautan wa.me "Kabari pelanggan" berisi jadwal baru. Jadwal ulang oleh pelanggan dan notifikasinya milik F4.
9. Tidak dibuat di F3: kode booking (F4), tempat/meja dan jumlah tamu (F8), Catatan (tidak ada kolomnya), tampilan Kalender, chip filter Layanan/Pembayaran, dan "Kunjungan halaman" (belum ada pelacakan, dan angka karangan termasuk anti-goal). Kotak keempat "7 hari terakhir" adalah "Dibayar di tempat".
10. "Ingatkan via WhatsApp" adalah tautan wa.me berisi teks pengingat tanpa tautan bayar (dashboard tidak membaca `access_token`).
11. Di Hari ini, booking lampau yang belum ditandai digabung jadi satu baris "N booking belum ditandai hadir" dengan tombol "Tandai sekarang" ke `?tab=tindakan`.
12. Tombol Hadir di agenda hanya muncul mulai `start_datetime - 1 jam` (F2 Keputusan 11). Hadir bukan toggle karena tidak ada RPC untuk membatalkannya. Sesudah ditandai, baris menampilkan keadaan "Hadir" yang statis. Tidak datang hanya ada di panel.
13. Hari ini menggantikan Ringkasan di `/dashboard`. `OverviewStats` dan `UpcomingBookings` dihapus. `SetupAlerts` (termasuk peringatan kuota habis) dan `ProfileNudge` tetap di atas.
14. Tanggal di Hari ini ditaruh sebagai deskripsi di bawah judul, bukan di atasnya (`DESIGN.md`: tanpa eyebrow). Jumlah ditulis sebagai teks abu terpisah, tanpa `·`. Tanda centang memakai ikon `Check` dari lucide, bukan karakter.
15. Grup sidebar: tanpa label (Hari ini, Booking dengan badge jumlah perlu tindakan, Analitik); "Atur usaha" (Layanan, Jam buka, Staf, Pembayaran); "Halaman booking" (Tampilan, Domain); "Akun" (Langganan, Pengaturan). Denah meja menunggu F8.
16. HP (di bawah 768px, sama dengan `useIsMobile`): nav bawah lima slot: Hari ini, Booking, tombol bulat tambah (tautan ke `/dashboard/bookings/baru`), Halaman (`ROUTES.appearance`), dan Lainnya (membuka sheet sidebar). Bar header atas disembunyikan di HP.
17. Booking manual adalah halaman `/dashboard/bookings/baru`. Halaman ini di bawah `/dashboard`, jadi tidak perlu entri `reserved_usernames`.
18. Kartu `BookingsSummary` dihapus dari halaman Booking karena D2 tidak memilikinya. RPC `dashboard_booking_summary` dibiarkan; menghapusnya butuh migration tanpa manfaat.
19. Pesan gagal tidak berwarna merah (konvensi F2). Merah hanya untuk Batalkan.
20. Daftar booking tampil sebagai tabel mulai 768px dan sebagai daftar bertumpuk di bawahnya. Filter status dihapus dan digantikan tab. Pencarian hanya nama atau WhatsApp.

## Konflik dengan spec atau desain

- Spec F3 berbunyi "memakai `create_booking` dengan sumber `MANUAL`", padahal `create_booking` hanya untuk `service_role`. Jalan keluarnya pembungkus authenticated (Keputusan 3), jadi isi spec tetap terpenuhi.
- D1 menaruh tanggal di atas judul dan memakai `·` serta `✓`. `DESIGN.md` melarang ketiganya, dan `DESIGN.md` yang menang (Keputusan 14).
- D1 dan D2 menampilkan kode booking, Kalender, filter, kunjungan, tamu, dan meja. Spec F3 tidak memintanya atau menaruhnya di fase lain (Keputusan 9).

## Global Constraints

- Migration baru saja, setelah `20261115000400`: `20261115000600_manual_booking.sql`, `20261115000700_dashboard_reads.sql`. Jangan edit migration lama.
- Fungsi baru: `revoke execute ... from public, anon, authenticated`, lalu `grant execute` eksplisit hanya ke peran yang memanggil. Tipe baru di `src/types/database.ts` memakai `type`, bukan `interface`.
- Setiap task migration menambah kasus ke `supabase/tests/99_verify.sql` (bagian 36 dan 37) dan lulus `npm run docker:test` (Docker harus jalan: `open -a Docker`). Lulus berarti tidak ada baris output yang diawali `FAIL`, termasuk bagian 11, 30, 33, 34.
- Query dashboard memakai `createClient()` dari `src/lib/supabase/server.ts` dan selalu `.eq("merchant_id", user.id)` pada query tabel. Kolom booking yang dibaca hanya `BOOKING_LIST_COLUMNS`. Jangan pernah membaca `access_token` atau `payment_url`.
- Dashboard monokrom: hitam `#0a0a0a` (token `primary`) untuk aksi utama, abu `#71717a` (`muted-foreground`), garis `#e4e4e7` (`border`). Merah (`destructive`) hanya untuk Batalkan. Pakai token Tailwind/shadcn yang ada, bukan hex tertulis.
- Larangan `DESIGN.md`: tanpa em dash, tanpa eyebrow, tanpa label kapital berjarak, tanpa `·` sebagai pemisah, tanpa panah di teks tombol. Target sentuh minimal 44px (`min-h-11`/`size-11`) di semua tombol dan tautan baris. Fokus selalu terlihat dan semua bisa dipakai dengan keyboard.
- Setiap daftar data punya keadaan memuat (skeleton dalam `<Suspense>`), kosong (teks dan, bila ada, aksi berikutnya), dan gagal (teks netral `role="alert"`, tidak merah).
- Komponen tampilan baru menerima data dan server action sebagai props (pola `booking-settings-form.stories.tsx`), supaya story bisa memberi aksi palsu. Komponen baru punya story.
- Semua tanggal dan jam dihitung di zona `Asia/Jakarta` lewat `src/lib/format.ts` dan `src/lib/booking/slots.ts`. "Sekarang" (`nowMs`) dihitung sekali di Server Component lalu diteruskan, tidak dibaca dengan `Date.now()` saat render klien.
- Setiap aksi booking memanggil `revalidatePath(ROUTES.dashboard, "layout")` supaya Hari ini, Booking, dan badge sidebar ikut segar.
- UI dan komentar berbahasa Indonesia, nama variabel Inggris. Tidak ada langkah deploy.

## Review Focus

1. Merchant mencatat booking manual di slot yang sedang dipegang booking online `PENDING` yang belum kedaluwarsa, atau keduanya terjadi bersamaan: hanya satu yang tersimpan, dan merchant mendapat pesan "jam itu sudah terisi", bukan error mentah. Kuncinya kunci advisory yang sama di `create_booking` dan constraint eksklusi. Diuji t36d.
2. Booking jam 23.30 dan 00.30 WIB: masing-masing masuk grup hari WIB yang benar di daftar, dan hanya yang hari ini masuk agenda Hari ini. Diuji `groupByJakartaDay` di Task 3, dan batas agenda Task 5 memakai `jakartaWallClockToUtc`.
3. `?b=` berisi id booking merchant lain, id acak, atau bukan uuid: halaman tetap tampil tanpa panel dan tanpa pesan yang membocorkan keberadaan booking itu. Diuji langkah `loadSelectedBooking` di Task 8.
4. Booking dijadwal ulang setelah pengingat H-1 untuk tanggal lama terkirim: pengingat untuk tanggal baru tetap terkirim. Diuji t36i (baris `REMINDER_CUSTOMER` terhapus, baris lain tetap).
5. Merchant Starter yang kuotanya habis mencoba booking manual: form menampilkan pesan kuota dengan arahan upgrade, isian form tidak hilang. Diuji t36g dan uji `manualBookingErrorMessage` di Task 6.

---

### Task 1: Sumber booking, booking manual, dan jadwal ulang merchant

Model: opus (konkurensi slot, menulis ulang `create_booking`).

**Files:**
- Create: `supabase/migrations/20261115000600_manual_booking.sql`
- Modify: `supabase/tests/99_verify.sql` (bagian baru `-- 36. Booking manual dan jadwal ulang merchant (20261115000600)`)
- Modify: `src/types/database.ts`

**Interfaces:**
- Consumes (sudah ada dari F2): `public.booking_holds_slot(booking_status, timestamptz)`, `public.slot_within_hours(uuid, uuid, integer, time, time)`, `create_booking` tujuh argumen versi terakhir di `20261115000500_payment_mode_minimums.sql` (F2: aturan minimum Rp1.500, PENDING bernilai 0 jadi CONFIRMED, BK022), enum `notification_kind` dengan nilai `'REMINDER_CUSTOMER'`, tabel `notification_log(booking_id, kind, channel, ...)`.
- Produces (SQL):

```sql
create type public.booking_source as enum ('ONLINE', 'MANUAL');
alter table public.bookings add column source public.booking_source not null default 'ONLINE';

-- Internal: hanya dipanggil fungsi security definer lain.
public.reap_expired_bookings_for(p_merchant_id uuid) returns void

drop function public.create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean);
public.create_booking(
  p_merchant_id uuid, p_service_id uuid, p_start_datetime timestamptz,
  p_customer_name text, p_customer_whatsapp text,
  p_staff_id uuid default null, p_can_charge boolean default true,
  p_source public.booking_source default 'ONLINE'
) returns setof public.bookings            -- service_role saja

public.create_manual_booking(
  p_service_id uuid, p_start_datetime timestamptz,
  p_customer_name text, p_customer_whatsapp text, p_staff_id uuid default null
) returns table (id uuid)                  -- authenticated saja

public.reschedule_booking_by_merchant(p_booking_id uuid, p_new_start timestamptz)
  returns void                             -- authenticated saja
```

  - errcode baru `BK034`: booking tidak bisa dijadwal ulang (tidak ditemukan, bukan milik merchant, status bukan `PAID`/`CONFIRMED`, atau kehadiran sudah dicatat).
  - `create_manual_booking` tanpa `auth.uid()` melempar `42501`.
- Produces (TS, `src/types/database.ts`):
  - `export type BookingSource = "ONLINE" | "MANUAL";`
  - `Booking` + `source: BookingSource`; `bookings.Insert` + `source?: BookingSource`; `Enums` + `booking_source`.
  - `Functions.create_booking.Args` + `p_source?: BookingSource`.
  - `Functions.create_manual_booking: { Args: { p_service_id: string; p_start_datetime: string; p_customer_name: string; p_customer_whatsapp: string; p_staff_id?: string | null }; Returns: { id: string }[] }`
  - `Functions.reschedule_booking_by_merchant: { Args: { p_booking_id: string; p_new_start: string }; Returns: undefined }`

Isi migration:

- `reap_expired_bookings_for` adalah pernyataan `update` yang sekarang ada di awal `create_booking` (`20261115000500`), dengan filter `merchant_id = p_merchant_id`. Bahasanya `sql`, `set search_path = ''`, dan bukan `security definer` karena pemanggilnya sudah definer.
- `create_booking` disalin dari `20261115000500` (versi terakhir, bukan 000300) dengan tiga perubahan:
  1. Blok `update` pembersih diganti `perform public.reap_expired_bookings_for(p_merchant_id);`.
  2. Sesudah cek layanan (`P0005`), semua langkah dari membaca `merchant_settings` sampai cek `BK020` dibungkus `if p_source = 'MANUAL' then ... else <blok lama tanpa perubahan> end if;`. Cabang `MANUAL` mengisi `v_mode := 'ON_SITE'; v_due_now := 0; v_status := 'CONFIRMED'; v_expires_at := now() + interval '15 minutes';`.
  3. `insert` menyimpan kolom `source` dari `p_source`.
  Komentar kepala menambah satu baris tabel keputusan: `MANUAL -> ON_SITE -> CONFIRMED 0 / harga, tanpa BK020/BK021`.
- `create_manual_booking` (`plpgsql`, `security definer`, `set search_path = ''`): `v_merchant := (select auth.uid())`. Bila null, `raise ... using errcode = '42501'`. Lalu `return query select b.id from public.create_booking(v_merchant, p_service_id, p_start_datetime, p_customer_name, p_customer_whatsapp, p_staff_id, false, 'MANUAL') b;`.
- `reschedule_booking_by_merchant`, urutan penting:

```sql
v_merchant := (select auth.uid());
if v_merchant is null then raise exception 'Perlu login' using errcode = '42501'; end if;
-- Kunci yang sama dengan create_booking: jadwal ulang dan booking baru tidak bisa balapan.
perform pg_advisory_xact_lock(hashtext(v_merchant::text));
perform public.reap_expired_bookings_for(v_merchant);
select * into b from public.bookings x
  where x.id = p_booking_id and x.merchant_id = v_merchant
    and x.status in ('PAID', 'CONFIRMED')
    and x.attended_at is null and x.no_show_at is null
  for update;
if not found then raise exception 'Booking tidak bisa dijadwal ulang' using errcode = 'BK034'; end if;
if p_new_start <= now() then raise exception 'Jam tersebut sudah lewat' using errcode = 'P0006'; end if;
v_end := p_new_start + (b.duration_minutes || ' minutes')::interval;
-- v_uses_staff: ekspresi yang sama persis dengan create_booking (STUDIO dan punya staf aktif).
if not public.slot_within_hours(
     v_merchant,
     case when coalesce(v_uses_staff, false) then b.staff_id end,
     extract(isodow from (p_new_start at time zone 'Asia/Jakarta'))::integer,
     (p_new_start at time zone 'Asia/Jakarta')::time,
     (v_end at time zone 'Asia/Jakarta')::time) then
  raise exception 'Slot di luar jam kerja' using errcode = 'BK001';
end if;
update public.bookings set start_datetime = p_new_start, end_datetime = v_end where id = b.id;
-- Pengingat H-1 idempoten per (booking, kind, channel); hapus supaya terkirim lagi untuk tanggal baru.
delete from public.notification_log where booking_id = b.id and kind = 'REMINDER_CUSTOMER';
```

  Bentrok dengan booking lain ditangkap `bookings_no_overlap` (`23P01`). Baris yang sedang diubah tidak bentrok dengan dirinya sendiri.
- Grant: `reap_expired_bookings_for` dicabut dari `public, anon, authenticated`. `create_booking` delapan argumen: cabut dari `public, anon, authenticated`, lalu `grant execute ... to service_role`. Dua RPC merchant: cabut dari `public, anon`, lalu `grant execute ... to authenticated`. Kolom `source` tidak perlu grant baru: `authenticated` sudah punya `select` tingkat tabel di `bookings`, dan grant `update`-nya per kolom tanpa `source`. Akhiri dengan `notify pgrst, 'reload schema';`.

- [ ] **Step 1: Tulis kasus uji yang gagal** di bagian 36. Siapkan merchant PRO `36363636-0000-0000-0000-000000000001` (username `manual-36`, jam 09:00 sampai 17:00 tiap hari, tanpa baris `payment_connections`) dengan layanan `FULL 350000` 30 menit, `REQUEST FIXED 100000` harga 1000000, dan satu layanan nonaktif. Siapkan juga merchant STUDIO `...0002` dengan staf A (09:00 sampai 12:00) dan B (09:00 sampai 17:00), serta merchant STARTER `...0003`. Panggilan merchant memakai pola `begin; set local role authenticated; set local request.jwt.claim.sub = '...'; ... commit;`. Jam memakai `pg_temp.jakarta_future`. Label diawali `t36`:
  - t36a manual untuk layanan `FULL` menghasilkan `CONFIRMED`, `payment_mode = 'ON_SITE'`, `amount_due_now = 0`, `amount_due_on_site = 350000`, `source = 'MANUAL'`. Hal yang sama untuk layanan `REQUEST`, dengan `amount_due_on_site = 1000000`.
  - t36b merchant tanpa koneksi payment tetap bisa (tersirat t36a, cetak OK eksplisit). Dengan `allow_pay_on_site = false` dan `max_active_per_phone = 1`, dua booking manual nomor yang sama di jam berbeda keduanya diterima.
  - t36c baris `notification_log` tidak dibuat oleh RPC (notifikasi dikirim dari TS).
  - t36d bentrok: manual di slot yang dipegang `CONFIRMED` gagal `23P01`. Manual di slot yang dipegang `PENDING` dengan `expires_at = now() + 10 menit` gagal `23P01`. Jam 20:00 WIB gagal `BK001`. `now() - interval '1 hour'` gagal `P0006`. Layanan nonaktif gagal `P0005`. Layanan milik merchant `...0002` gagal `P0005`.
  - t36e `REQUESTED` kedaluwarsa (disisipkan langsung) di slot yang sama tidak menghalangi manual, dan baris lamanya jadi `CANCELLED` dengan `'Permintaan tidak dijawab dalam batas waktu'`.
  - t36f STUDIO: staf A punya `CONFIRMED` di jam X (10:00). Manual "siapa saja" di X mendapat staf B. Manual dengan `p_staff_id` = A di X gagal `23P01`.
  - t36g merchant STARTER dengan 10 booking `CONFIRMED` bulan ini (disisipkan langsung) gagal `P0002`.
  - t36h `create_booking` lewat `service_role` tanpa `p_source` menyimpan `source = 'ONLINE'`.
  - t36i jadwal ulang `CONFIRMED` milik sendiri dari X ke Y: `start_datetime = Y`, durasi tetap. Baris `notification_log` `REMINDER_CUSTOMER` booking itu terhapus, sedangkan baris `BOOKING_CONFIRMED_CUSTOMER` tetap. Hasil lain: ke slot yang dipegang booking lain `23P01`; ke 20:00 WIB `BK001`; ke masa lalu `P0006`; booking dengan `attended_at` terisi, `CANCELLED`, `PENDING`, dan milik merchant lain masing-masing `BK034`.
  - t36j jadwal ulang booking 30 menit dari 10:00 ke 10:15 di hari yang sama berhasil (tidak bentrok dengan dirinya sendiri).
  - t36k STUDIO: booking staf A dijadwal ulang ke 14:00 gagal `BK001` (di luar jam A), ke 11:00 berhasil.
  - t36l hak akses: anon tidak bisa EXECUTE `create_manual_booking(uuid, timestamptz, text, text, uuid)` dan `reschedule_booking_by_merchant(uuid, timestamptz)`, tetapi authenticated bisa. Anon dan authenticated tidak bisa EXECUTE `create_booking(uuid, uuid, timestamptz, text, text, uuid, boolean, public.booking_source)` maupun `reap_expired_bookings_for(uuid)`. `to_regprocedure` signature tujuh argumen bernilai null. `has_column_privilege('authenticated', 'public.bookings', 'source', 'UPDATE')` false, dan `has_column_privilege('anon', 'public.bookings', 'source', 'SELECT')` false.
  - t36m `create_manual_booking` sebagai `authenticated` tanpa klaim `sub` gagal `42501`.
- [ ] **Step 2: Jalankan** `npm run docker:test`. Harapan: baris `FAIL` di bagian 36.
- [ ] **Step 3: Tulis migration** sesuai Interfaces dan Isi migration.
- [ ] **Step 4: Jalankan** `npm run docker:test`. Harapan: tidak ada `FAIL` di seluruh output. Bagian 11, 30, dan 33 memanggil `create_booking` dengan 5 sampai 7 argumen dan harus tetap lulus.
- [ ] **Step 5: Perbarui tipe** sesuai Interfaces. Tambah `"source"` ke `BOOKING_LIST_COLUMNS` dan `BOOKING_LIST_COLUMN_LIST` di `src/app/dashboard/bookings/booking-state.ts` (uji dua arah di `booking-state.test.ts` mewajibkannya). Tambah `source` ke `BOOKING_COLUMNS` di `src/lib/notify/dispatch.ts`. Jalankan `npm run typecheck && npm run test:unit`.
- [ ] **Step 6: Commit**: `git add supabase/migrations/20261115000600_manual_booking.sql supabase/tests/99_verify.sql src/types/database.ts src/app/dashboard/bookings/booking-state.ts src/lib/notify/dispatch.ts` lalu `git commit -m "Tambah sumber booking, booking manual, dan jadwal ulang oleh merchant"`.

---

### Task 2: Fungsi baca dashboard

Model: sonnet.

**Files:**
- Create: `supabase/migrations/20261115000700_dashboard_reads.sql`
- Modify: `supabase/tests/99_verify.sql` (bagian `-- 37. Fungsi baca dashboard (20261115000700)`), `src/types/database.ts`

**Interfaces:**
- Consumes: Task 1 (kolom `source` ikut di `public.bookings`), `public.booking_holds_slot`.
- Produces (SQL, semua `stable`, `set search_path = ''`):

```sql
-- Satu-satunya definisi tab. Internal.
create or replace function public.booking_tab(b public.bookings)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when b.status = 'CANCELLED' or not public.booking_holds_slot(b.status, b.expires_at) then 'CANCELLED'
    when b.status in ('PENDING', 'REQUESTED') then 'ACTION'
    when b.start_datetime >= now() then 'UPCOMING'
    when b.start_datetime >= now() - interval '7 days'
         and ((b.attended_at is null and b.no_show_at is null)
              or (b.amount_due_on_site > 0 and b.paid_on_site_at is null and b.no_show_at is null))
      then 'ACTION'
    else 'HISTORY'
  end;
$$;

-- security definer, merchant = auth.uid(); p_tab di luar empat nilai (termasuk null) -> errcode 22023.
public.bookings_in_tab(p_tab text) returns setof public.bookings

-- security definer, merchant = auth.uid().
public.dashboard_tab_counts() returns table (action_count integer, upcoming_count integer)

-- security definer, merchant = auth.uid(); jendela [now() - 7 hari, now()).
public.dashboard_week_summary() returns table (
  bookings integer,          -- PAID/CONFIRMED, start_datetime di jendela
  online_revenue numeric,    -- sum amount_due_now, status PAID, paid_at >= now() - 7 hari
  on_site_revenue numeric,   -- sum amount_due_on_site, PAID/CONFIRMED, paid_on_site_at >= now() - 7 hari
  no_show integer,           -- PAID/CONFIRMED, no_show_at terisi, start_datetime di jendela
  attendance_marked integer  -- PAID/CONFIRMED, attended_at atau no_show_at terisi, start_datetime di jendela
)
```

  - `booking_tab` bukan `security definer`, tetapi dicabut dari `public, anon, authenticated`. Pemanggilnya definer.
  - `dashboard_tab_counts` memprafilter `b.status in ('PENDING', 'REQUESTED') or b.start_datetime >= now() - interval '7 days'` sebelum menghitung `count(*) filter (where public.booking_tab(b) = ...)`, karena hanya baris itu yang bisa masuk ACTION atau UPCOMING.
  - `dashboard_week_summary` memprafilter baris yang `start_datetime`, `paid_at`, atau `paid_on_site_at`-nya `>= now() - interval '7 days'`. Jumlah uang memakai `coalesce(..., 0)`.
  - Ketiga RPC: cabut dari `public, anon`, lalu `grant execute ... to authenticated`.
- Produces (TS, `Functions`):
  - `bookings_in_tab: { Args: { p_tab: "ACTION" | "UPCOMING" | "HISTORY" | "CANCELLED" }; Returns: Booking[] }`
  - `dashboard_tab_counts: { Args: Record<string, never>; Returns: { action_count: number; upcoming_count: number }[] }`
  - `dashboard_week_summary: { Args: Record<string, never>; Returns: { bookings: number; online_revenue: number; on_site_revenue: number; no_show: number; attendance_marked: number }[] }`
  - Pemakaian di TS (Task 5 dan 7): `supabase.rpc("bookings_in_tab", { p_tab }, { count: "exact" }).select(BOOKING_LIST_COLUMNS).eq("merchant_id", user.id)` lalu `.or(...)`, `.order(...)`, dan `.range(...)` seperti query tabel biasa. Bila postgrest-js menolak urutan pemanggilan itu, ikuti dokumentasi supabase-js untuk `rpc` dengan `count`. Kolom yang dibaca tetap `BOOKING_LIST_COLUMNS`.

- [ ] **Step 1: Tulis kasus uji yang gagal** di bagian 37. Merchant PRO `37373737-0000-0000-0000-000000000001` (username `dash-37`) dengan booking yang disisipkan langsung (jadwal relatif terhadap `now()`), lalu merchant PRO `...0002` khusus ringkasan minggu. Label diawali `t37`:
  - t37a `booking_tab` tiap baris merchant `...0001`, dibandingkan dengan harapan:
    - ACTION: `REQUESTED` `expires_at` +1 jam; `PENDING` `expires_at` +10 menit; `CONFIRMED` mulai 2 hari lalu tanpa tanda kehadiran; `PAID` mulai 1 hari lalu dengan `attended_at` terisi dan `amount_due_on_site = 245000` belum lunas.
    - UPCOMING: `CONFIRMED` besok; `PAID` 2 jam lagi.
    - HISTORY: `CONFIRMED` mulai 2 hari lalu, hadir dan lunas di tempat; `CONFIRMED` mulai 10 hari lalu tanpa tanda; `CONFIRMED` mulai 1 hari lalu dengan `no_show_at` terisi dan tagihan di tempat belum lunas.
    - CANCELLED: `CANCELLED`; `PENDING` dengan `expires_at` lewat yang belum dibersihkan.
  - t37b sebagai merchant `...0001`, `bookings_in_tab('ACTION')` mengembalikan tepat empat id ACTION, dan tidak satu pun booking `...0002`.
  - t37c `bookings_in_tab('SEMUA')` dan `bookings_in_tab(null)` gagal `22023`.
  - t37d `dashboard_tab_counts()` sebagai `...0001` = `(4, 2)`.
  - t37e `dashboard_week_summary()` sebagai `...0002`. Fixture: B1 `PAID` mulai −1 hari, 105000/245000, `paid_at` −1 hari, hadir, `paid_on_site_at` −1 hari (`CASH`); B2 `CONFIRMED` mulai −2 hari, 0/450000, hadir, `paid_on_site_at` −2 hari; B3 `CONFIRMED` mulai −1 hari, 0/200000, `no_show_at` terisi; B4 `PAID` mulai −10 hari, `paid_at` −10 hari, 350000/0; B5 `CANCELLED` mulai −1 hari. Harapan `bookings = 3`, `online_revenue = 105000`, `on_site_revenue = 695000`, `no_show = 1`, `attendance_marked = 3`.
  - t37f sebagai `authenticated` tanpa klaim `sub`: `bookings_in_tab('ACTION')` 0 baris, `dashboard_tab_counts()` = `(0, 0)`.
  - t37g hak akses: anon dan authenticated tidak bisa EXECUTE `booking_tab(public.bookings)`. Ketiga RPC bisa dipakai authenticated, tidak bisa dipakai anon.
- [ ] **Step 2: Jalankan** `npm run docker:test`. Harapan: `FAIL` di bagian 37.
- [ ] **Step 3: Tulis migration**, lalu jalankan lagi. Harapan: tidak ada `FAIL`.
- [ ] **Step 4: Perbarui `Functions`** di `database.ts`, lalu `npm run typecheck`.
- [ ] **Step 5: Commit**: `git commit -m "Tambah fungsi tab booking dan ringkasan dashboard"` (stage migration, `99_verify.sql`, `database.ts`).

---

### Task 3: Modul murni dashboard

Model: haiku (tes lengkap di rencana, badan fungsi pendek).

**Files:**
- Create: `src/lib/booking/dashboard.ts`, `src/lib/booking/dashboard.test.ts`
- Modify: `src/lib/format.ts` (tambah `formatLongDate`; ekspor `toJakartaWallClock`, `WEEKDAYS_ID`, `MONTHS_ID_SHORT` bila belum diekspor)

**Interfaces:**
- Consumes: `BookingListItem` dari `src/app/dashboard/bookings/booking-state.ts` (hanya tipe, lewat `Pick`), `jakartaDateISO` dari `src/lib/booking/slots.ts`, `formatDateTime` dan `formatTime` dari `src/lib/format.ts`.
- Produces:

```ts
// src/lib/format.ts
/** "Sabtu, 14 November 2026" */
export function formatLongDate(value: string | Date): string;

// src/lib/booking/dashboard.ts
export type BookingTab = "ACTION" | "UPCOMING" | "HISTORY" | "CANCELLED";
export const BOOKING_TABS: readonly { tab: BookingTab; param: string; label: string }[] = [
  { tab: "ACTION", param: "tindakan", label: "Perlu tindakan" },
  { tab: "UPCOMING", param: "mendatang", label: "Akan datang" },
  { tab: "HISTORY", param: "riwayat", label: "Riwayat" },
  { tab: "CANCELLED", param: "batal", label: "Dibatalkan" },
];
/** Param tak dikenal atau kosong -> "UPCOMING". */
export function parseTab(param: string | undefined): BookingTab;
export function tabParam(tab: BookingTab): string;

export type ActionKind = "REQUEST" | "UNPAID" | "ATTENDANCE" | "ON_SITE_UNPAID";
/** Untuk baris yang SUDAH berada di tab ACTION. */
export function actionKind(b: Pick<BookingListItem, "status" | "attended_at" | "no_show_at">): ActionKind;

/** "Hari ini, Sabtu 14 Nov", "Besok, Minggu 15 Nov", "Kemarin, Jumat 13 Nov", "Senin 16 Nov", beda tahun: "Senin 4 Jan 2027". */
export function dayLabel(dateISO: string, todayISO: string): string;
/** Kelompok berurutan per tanggal WIB; urutan baris dipertahankan. */
export function groupByJakartaDay<T extends { start_datetime: string }>(rows: T[]): { dateISO: string; rows: T[] }[];

/** Indeks tempat garis "Sekarang" disisipkan (sebelum baris pertama yang mulai >= now); null bila semua baris di satu sisi. */
export function nowLineIndex(rows: { start_datetime: string }[], nowMs: number): number | null;
/** Aturan F2 Keputusan 11. */
export function attendanceWindow(startISO: string, nowMs: number): { canAttend: boolean; canNoShow: boolean };

export function onSiteTotals(
  rows: Pick<BookingListItem, "amount_due_on_site" | "paid_on_site_at" | "no_show_at">[],
): { count: number; total: number; paid: number };

export function whatsappLink(e164: string, text?: string): string;
export function unpaidReminderLink(
  b: Pick<BookingListItem, "customer_whatsapp" | "customer_name" | "service_name" | "start_datetime" | "expires_at">,
): string;
export function rescheduleNoticeLink(
  b: Pick<BookingListItem, "customer_whatsapp" | "customer_name" | "service_name">,
  newStartISO: string,
): string;
```

Teks pesan WhatsApp (persis):
- Pengingat: `Halo ${customer_name}, booking ${service_name} untuk ${formatDateTime(start_datetime)} menunggu pembayaran sampai pukul ${formatTime(expires_at)} WIB. Abaikan pesan ini bila sudah membayar.`
- Jadwal ulang: `Halo ${customer_name}, jadwal ${service_name} Anda sudah kami ubah ke ${formatDateTime(newStartISO)}. Terima kasih.`

`whatsappLink` membuang semua karakter bukan digit dari nomor E.164, dan menambahkan `?text=` + `encodeURIComponent(text)` bila `text` ada. `toWhatsappLink` di `booking-detail-dialog.tsx` diganti fungsi ini di Task 8.

- [ ] **Step 1: Tulis tes yang gagal** di `src/lib/booking/dashboard.test.ts` (gaya `node:test` + `node:assert/strict` seperti `staff-slots.test.ts`):

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { formatLongDate } from "../format";
import {
  actionKind, attendanceWindow, dayLabel, groupByJakartaDay, nowLineIndex,
  onSiteTotals, parseTab, rescheduleNoticeLink, tabParam, unpaidReminderLink, whatsappLink,
} from "./dashboard";

test("parseTab: param dikenal dan default", () => {
  assert.equal(parseTab("tindakan"), "ACTION");
  assert.equal(parseTab("batal"), "CANCELLED");
  assert.equal(parseTab(undefined), "UPCOMING");
  assert.equal(parseTab("PAID"), "UPCOMING");
  assert.equal(tabParam("HISTORY"), "riwayat");
});

test("actionKind", () => {
  const base = { attended_at: null, no_show_at: null };
  assert.equal(actionKind({ ...base, status: "REQUESTED" }), "REQUEST");
  assert.equal(actionKind({ ...base, status: "PENDING" }), "UNPAID");
  assert.equal(actionKind({ ...base, status: "CONFIRMED" }), "ATTENDANCE");
  assert.equal(actionKind({ status: "PAID", attended_at: "2026-11-13T03:00:00Z", no_show_at: null }), "ON_SITE_UNPAID");
});

test("dayLabel: hari ini, besok, kemarin, hari lain, beda tahun", () => {
  assert.equal(dayLabel("2026-11-14", "2026-11-14"), "Hari ini, Sabtu 14 Nov");
  assert.equal(dayLabel("2026-11-15", "2026-11-14"), "Besok, Minggu 15 Nov");
  assert.equal(dayLabel("2026-11-13", "2026-11-14"), "Kemarin, Jumat 13 Nov");
  assert.equal(dayLabel("2026-11-16", "2026-11-14"), "Senin 16 Nov");
  assert.equal(dayLabel("2027-01-04", "2026-11-14"), "Senin 4 Jan 2027");
});

test("groupByJakartaDay memisah 23.30 dan 00.30 WIB", () => {
  const a = { id: "a", start_datetime: "2026-11-14T16:30:00Z" }; // 23.30 WIB 14 Nov
  const b = { id: "b", start_datetime: "2026-11-14T17:30:00Z" }; // 00.30 WIB 15 Nov
  const c = { id: "c", start_datetime: "2026-11-15T02:00:00Z" }; // 09.00 WIB 15 Nov
  assert.deepEqual(groupByJakartaDay([a, b, c]), [
    { dateISO: "2026-11-14", rows: [a] },
    { dateISO: "2026-11-15", rows: [b, c] },
  ]);
  assert.deepEqual(groupByJakartaDay([]), []);
});

test("nowLineIndex", () => {
  const rows = ["2026-11-14T04:00:00Z", "2026-11-14T10:00:00Z", "2026-11-14T12:00:00Z"].map((s) => ({ start_datetime: s }));
  assert.equal(nowLineIndex(rows, Date.parse("2026-11-14T11:40:00Z")), 2);
  assert.equal(nowLineIndex(rows, Date.parse("2026-11-14T01:00:00Z")), null);
  assert.equal(nowLineIndex(rows, Date.parse("2026-11-14T13:00:00Z")), null);
});

test("attendanceWindow: hadir mulai 1 jam sebelum, tidak datang mulai jam mulai", () => {
  const start = "2026-11-14T10:00:00Z";
  assert.deepEqual(attendanceWindow(start, Date.parse("2026-11-14T08:59:00Z")), { canAttend: false, canNoShow: false });
  assert.deepEqual(attendanceWindow(start, Date.parse("2026-11-14T09:00:00Z")), { canAttend: true, canNoShow: false });
  assert.deepEqual(attendanceWindow(start, Date.parse("2026-11-14T10:00:00Z")), { canAttend: true, canNoShow: true });
});

test("onSiteTotals mengabaikan tidak datang dan tagihan nol", () => {
  assert.deepEqual(
    onSiteTotals([
      { amount_due_on_site: 450000, paid_on_site_at: "2026-11-14T05:00:00Z", no_show_at: null },
      { amount_due_on_site: 900000, paid_on_site_at: null, no_show_at: null },
      { amount_due_on_site: 0, paid_on_site_at: null, no_show_at: null },
      { amount_due_on_site: 300000, paid_on_site_at: null, no_show_at: "2026-11-14T06:00:00Z" },
    ]),
    { count: 2, total: 1350000, paid: 450000 },
  );
});

test("tautan WhatsApp", () => {
  assert.equal(whatsappLink("+62 812-3456"), "https://wa.me/628123456");
  const reminder = new URL(unpaidReminderLink({
    customer_whatsapp: "+6281234567890", customer_name: "Rina", service_name: "Potong rambut",
    start_datetime: "2026-11-14T12:30:00Z", expires_at: "2026-11-14T05:15:00Z",
  }));
  assert.equal(reminder.pathname, "/6281234567890");
  const text = reminder.searchParams.get("text") ?? "";
  assert.ok(text.startsWith("Halo Rina, booking Potong rambut untuk "));
  assert.ok(text.includes("menunggu pembayaran sampai pukul 12:15 WIB"));
  assert.ok(!text.includes("—")); // tanpa em dash
  const notice = new URL(rescheduleNoticeLink(
    { customer_whatsapp: "+6281234567890", customer_name: "Rina", service_name: "Potong rambut" },
    "2026-11-16T03:00:00Z",
  ));
  assert.ok((notice.searchParams.get("text") ?? "").includes("sudah kami ubah ke Senin, 16 November 2026 pukul 10:00"));
});

test("formatLongDate", () => {
  assert.equal(formatLongDate("2026-11-14T05:00:00Z"), "Sabtu, 14 November 2026");
});
```

- [ ] **Step 2: Jalankan** `npm run test:unit`. Harapan: gagal, modul belum ada.
- [ ] **Step 3: Implementasikan** `formatLongDate` (pola `formatDateTime` tanpa jam) dan semua fungsi di `dashboard.ts`. `dayLabel` memakai nama hari dan bulan singkat dari `format.ts`, tidak memakai `Intl`.
- [ ] **Step 4: Jalankan** `npm run test:unit && npm run typecheck`. Harapan: lulus.
- [ ] **Step 5: Commit**: `git commit -m "Tambah modul murni tab, hari WIB, dan tautan WhatsApp dashboard"`.

---

### Task 4: Navigasi: sidebar berkelompok, badge, dan nav bawah HP

Model: sonnet.

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`, `src/app/dashboard/layout.tsx`, `src/app/dashboard/queries.ts`, `src/lib/routes.ts`
- Create: `src/components/layout/mobile-nav.tsx`, `src/components/layout/mobile-nav.stories.tsx`, `src/components/layout/app-sidebar.stories.tsx`

**Interfaces:**
- Consumes: `dashboard_tab_counts()` (Task 2).
- Produces:
  - `ROUTES.newBooking = "/dashboard/bookings/baru"` (di bawah `/dashboard`, tidak masuk `reserved_usernames`).
  - `queries.ts`: `export const getTabCounts = cache(async (): Promise<{ action: number; upcoming: number } | null> => ...)`. Bila RPC gagal, hasilnya `null` (badge disembunyikan, halaman tetap jalan) dan error di-`console.error`.
  - `AppSidebar` prop baru `actionCount: number | null`.
  - `export function MobileNav({ actionCount }: { actionCount: number | null })`, komponen klien.

Ketentuan:
- Grup dan label persis Keputusan 15. Item Hari ini aktif hanya bila `pathname === ROUTES.dashboard`, item lain memakai aturan `startsWith` yang ada. Badge Booking: angka `actionCount` dalam lingkaran hitam, `aria-label="${n} perlu tindakan"`, tidak tampil bila 0 atau null. Kartu Starter, tautan `/username`, dan `NavUser` tetap.
- `MobileNav`: `md:hidden`, `fixed inset-x-0 bottom-0`, grid lima kolom, `pb-[env(safe-area-inset-bottom)]`, latar `background`, garis atas `border`. Isinya: Hari ini (`ROUTES.dashboard`), Booking (`ROUTES.bookings`, dengan badge yang sama), tombol bulat 48px hitam `aria-label="Tambah booking manual"` sebagai `Link` ke `ROUTES.newBooking`, Halaman (`ROUTES.appearance`), dan Lainnya (`button` yang memanggil `useSidebar().setOpenMobile(true)`). Tiap item minimal 48px tinggi, ikon lucide plus label 11px, dan `aria-current="page"` pada yang aktif.
- `layout.tsx`: memanggil `getTabCounts()` (bersama `requireMerchant()` lewat `Promise.all`), meneruskan hasilnya ke `AppSidebar` dan `MobileNav`. Bar header atas jadi `hidden md:flex`. Wadah konten mendapat ruang bawah di HP (`pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6`) supaya nav tidak menutup isi.
- Story: `AppSidebar` dengan `actionCount` 3, 0, dan null; `MobileNav` di viewport 390px pada `/dashboard` dan `/dashboard/bookings`. Keduanya dibungkus `SidebarProvider` dan `parameters.nextjs.navigation.pathname`.

- [ ] **Step 1:** Implementasikan sesuai Ketentuan.
- [ ] **Step 2: Verifikasi** `npm run typecheck && npm run lint`, lalu `npm run storybook` dan periksa kedua story di 390px dan 1280px: target sentuh 44px atau lebih, fokus terlihat, Lainnya membuka sheet.
- [ ] **Step 3: Commit**: `git commit -m "Kelompokkan sidebar dashboard dan tambah nav bawah HP"`.

---

### Task 5: Halaman Hari ini

Model: sonnet.

**Files:**
- Modify: `src/app/dashboard/page.tsx`, `src/app/dashboard/loading.tsx`
- Create: `src/app/dashboard/_today/action-list.tsx`, `src/app/dashboard/_today/agenda.tsx`, `src/app/dashboard/_today/side-cards.tsx`, `src/app/dashboard/_today/sections.tsx` (komponen async pengambil data), `src/app/dashboard/_today/today.stories.tsx`, `src/app/dashboard/_today/fixtures.ts`
- Delete: `src/app/dashboard/overview-stats.tsx`, `src/app/dashboard/upcoming-bookings.tsx` (sesudah `grep` memastikan tidak ada pemakai lain). Cek juga `StatCardsSkeleton` dan fungsi di `queries.ts`; hapus hanya yang benar-benar tidak terpakai lagi.

**Interfaces:**
- Consumes: Task 2 (`bookings_in_tab`, `dashboard_week_summary`), Task 3 (`actionKind`, `nowLineIndex`, `attendanceWindow`, `onSiteTotals`, `unpaidReminderLink`, `formatLongDate`, `tabParam`), F2 server action `decideRequest(id, approve)` dan `markAttendance(id, attended)` di `src/app/dashboard/bookings/actions.ts` (keduanya `Promise<{ ok: boolean; message?: string }>`), `ROUTES.newBooking` (Task 4), `formatRupiah`, `formatTime`, `formatDateTime`, `jakartaDateISO`, `jakartaWallClockToUtc`.
- Produces (komponen tampilan, props saja):

```ts
type ActionResult = { ok: boolean; message?: string };
export function ActionList(props: {
  items: BookingListItem[];   // isi tab ACTION, paling banyak 5 yang bukan ATTENDANCE/ON_SITE_UNPAID
  total: number;              // jumlah seluruh baris tab ACTION
  pastUnmarked: number;       // jumlah baris ACTION berjenis ATTENDANCE atau ON_SITE_UNPAID
  nowMs: number;
  onDecide: (id: string, approve: boolean) => Promise<ActionResult>;
}): JSX.Element;
export function Agenda(props: {
  rows: BookingListItem[]; nowMs: number;
  onAttend: (id: string) => Promise<ActionResult>;
}): JSX.Element;
export function OnSiteCard(props: { totals: { count: number; total: number; paid: number } }): JSX.Element;
export function WeekSummary(props: {
  summary: { bookings: number; online_revenue: number; on_site_revenue: number; no_show: number; attendance_marked: number };
}): JSX.Element;
```

Data (di `sections.tsx`, tiap bagian dalam `<Suspense>` sendiri dengan skeleton yang meniru bentuknya):
- Perlu tindakan: `bookings_in_tab('ACTION')` urut `start_datetime` naik. Baris `ATTENDANCE` dan `ON_SITE_UNPAID` dihitung jadi `pastUnmarked`. `REQUEST` dan `UNPAID` ditampilkan (maksimal 5).
- Agenda: tabel `bookings`, `status in ('PAID','CONFIRMED')`, `start_datetime` di `[jakartaWallClockToUtc(todayISO, "00:00"), jakartaWallClockToUtc(besokISO, "00:00"))`, urut naik. `OnSiteCard` dihitung dari baris yang sama (`onSiteTotals`), tanpa query tambahan. Agenda dan kartu berbagi satu fungsi `cache()`.
- 7 hari: `dashboard_week_summary()`.

Tampilan:
- `PageHeader` dengan `title="Hari ini"` dan `description={formatLongDate(now)}`. `action` berisi "Lihat halaman" (outline, tab baru) dan "Booking manual" (hitam, `Link` ke `ROUTES.newBooking`), keduanya `hidden md:inline-flex`. Di HP diganti satu tombol ikon 44px "Salin tautan halaman booking". Pakai komponen salin yang sudah ada bila `grep "Salin tautan"` menemukannya. Bila tidak ada, buat `navigator.clipboard.writeText` dengan toast `sonner` "Tautan disalin".
- Tata letak D1: kolom utama (Perlu tindakan, lalu Agenda) dan kolom samping (`OnSiteCard`, lalu `WeekSummary`) mulai `lg`. Di HP semuanya satu kolom dengan urutan sama (D3).
- `ActionList`: judul "Perlu tindakan" dengan jumlah abu terpisah, plus tautan "Lihat semua" ke `?tab=tindakan`. Baris `REQUEST`: badge garis "Permintaan", `layanan` dan nama di baris tebal, `formatDateTime(start)` plus "otomatis ditolak pukul HH:MM" (dari `expires_at`) di baris abu. Tombolnya "Tolak" (outline, minta konfirmasi sekali tekan lagi seperti F2) dan "Setujui dan kirim tagihan" bila `amount_due_now > 0`, selain itu "Setujui". Baris `UNPAID`: badge isi abu "Belum bayar", lalu "Bayar sekarang Rp... sampai pukul HH:MM", dan tautan "Ingatkan lewat WhatsApp" (`unpaidReminderLink`, tab baru). Baris gabungan bila `pastUnmarked > 0`: "N booking belum ditandai hadir", abu "Tandai agar laporan tidak datang dan pendapatan akurat", tombol tautan "Tandai sekarang" ke `?tab=tindakan`. Di HP tombol penuh lebar dua kolom, tinggi 44px (D3). Kosong: "Tidak ada yang perlu ditindaklanjuti." Pesan gagal dari aksi tampil di bawah baris, `role="alert"`, tidak merah.
- `Agenda`: judul "Agenda hari ini" dengan "N booking" abu. Baris berisi jam (`tabular-nums`), nama pelanggan, dan baris abu "layanan" (plus staf bila ada, dipisah koma). Kolom bayar: F2 `paymentLabel` atau ringkasan nominal (`Bayar di tempat` / `DP Rp... lunas`, baris abu `Sisa Rp... di tempat` / `Lunas Rp... tunai`, memakai `ON_SITE_METHOD_LABEL`). Tombol kanan: bila `attended_at` terisi, keadaan statis ikon `Check` + "Hadir". Bila `no_show_at` terisi, teks abu "Tidak datang". Bila `attendanceWindow(...).canAttend`, tombol "Tandai hadir" (outline hitam, 44px) yang memanggil `onAttend`. Selain itu tidak ada tombol. Garis "Sekarang HH:MM" disisipkan di `nowLineIndex` sebagai `li` dengan `aria-label`. Kosong: "Belum ada booking hari ini." dan tautan "Catat booking manual".
- `OnSiteCard`: judul "Ditagih di tempat hari ini", nominal besar `formatRupiah(total)`, baris abu "N booking, Rp... sudah ditandai lunas". Bila `count = 0`: "Tidak ada tagihan di tempat hari ini."
- `WeekSummary`: judul "7 hari terakhir" dan `dl` 2x2 berisi Booking, Masuk via QRIS (`online_revenue`), Dibayar di tempat (`on_site_revenue`), Tidak datang (`no_show`). Persentase `(x%)` hanya bila `attendance_marked > 0`. Tautan "Buka analitik".
- Gagal muat (query error): tiap bagian menampilkan teks netral "Gagal memuat <nama bagian>. Muat ulang halaman." dengan `role="alert"`, dan error di-`console.error` dengan `merchantId`.
- `SetupAlerts` dan `ProfileNudge` tetap di atas grid, tanpa perubahan.
- Story (`today.stories.tsx`, fixture di `fixtures.ts` dengan nama contoh yang jelas): `ActionList` berisi, kosong, dan dengan `pastUnmarked`; `Agenda` dengan garis sekarang dan campuran Hadir/Tandai hadir/Tidak datang, plus versi kosong; `OnSiteCard` nol dan berisi; `WeekSummary`. Aksi palsu `async () => ({ ok: true })`.

- [ ] **Step 1:** Buat fixture dan story lebih dulu, lalu komponen tampilan sampai story tampil benar di 390px dan 1280px.
- [ ] **Step 2:** Buat `sections.tsx` dan `page.tsx` (metadata `title: "Hari ini"`), hapus berkas lama, dan sesuaikan `loading.tsx` dengan bentuk baru.
- [ ] **Step 3: Verifikasi** `npm run typecheck && npm run lint && npm run test:unit`.
- [ ] **Step 4: Commit**: `git commit -m "Ganti Ringkasan dengan halaman Hari ini"`.

---

### Task 6: Booking manual

Model: sonnet.

**Files:**
- Create: `src/app/dashboard/bookings/baru/page.tsx`, `src/app/dashboard/bookings/baru/manual-booking-form.tsx`, `src/app/dashboard/bookings/baru/manual-booking-form.stories.tsx`, `src/app/dashboard/bookings/slot-field.tsx`, `src/app/dashboard/bookings/manual-booking.ts` (bukan `"use server"`: skema dan pemetaan error), `src/app/dashboard/bookings/manual-booking.test.ts`
- Modify: `src/app/dashboard/bookings/actions.ts`, `src/lib/notify/dispatch.ts`

**Interfaces:**
- Consumes: `create_manual_booking` (Task 1), `ROUTES.newBooking` (Task 4), `customerNameSchema` dan `customerWhatsappSchema` dari `src/lib/validations/booking.ts`, `mapBookingError` dari `src/lib/booking/errors.ts`, `/api/slots` (`GET ?username=&serviceId=&date=&staffId=`, balasan `{ slots: { label: string; start: string; ... }[] }`; baca bentuk persis `FreeSlot` di `src/lib/booking/slots.ts`), `jakartaDateISO`.
- Produces:

```ts
// manual-booking.ts
export const manualBookingSchema = z.object({
  serviceId: z.uuid(),
  staffId: z.uuid().nullable(),
  startISO: z.iso.datetime({ offset: true }),
  customerName: customerNameSchema,
  customerWhatsapp: customerWhatsappSchema,
});
export type ManualBookingInput = z.input<typeof manualBookingSchema>;
export type ManualBookingResult = { ok: true; id: string } | { ok: false; message: string };
/** Pesan untuk merchant; kode lain jatuh ke mapBookingError(code).message. */
export function manualBookingErrorMessage(code: string | null | undefined): string;

// actions.ts
export async function createManualBooking(input: ManualBookingInput): Promise<ManualBookingResult>;

// slot-field.tsx (klien), dipakai juga Task 8
export function SlotField(props: {
  username: string; serviceId: string | null; staffId: string | null;
  dateISO: string; value: string | null;          // ISO mulai slot terpilih
  onChange: (startISO: string | null) => void;
}): JSX.Element;
```

Pesan `manualBookingErrorMessage` (persis):
- `P0002`: "Kuota transaksi bulan ini sudah habis. Upgrade paket di menu Langganan untuk menambah booking."
- `23P01`: "Jam itu sudah terisi. Pilih jam lain."
- `BK001`: "Jam itu di luar jam buka. Pilih jam lain."
- `P0006`: "Jam itu sudah lewat. Pilih jam lain."

Ketentuan:
- `createManualBooking`: validasi Zod (gagal: "Periksa lagi isian form."), `requireUser()` yang ada, `supabase.rpc("create_manual_booking", ...)`, error menjadi `manualBookingErrorMessage(error.code)`. Bila sukses: `after(() => notifyBookingCreated(id))`, `revalidatePath(ROUTES.dashboard, "layout")`, lalu kembalikan `{ ok: true, id }`. Form mengarahkan ke `${ROUTES.bookings}?tab=mendatang&b=${id}`.
- `notifyBookingCreated`: bila `ctx.booking.source === "MANUAL"`, lewati pesan ke merchant dan kirim hanya `BOOKING_CONFIRMED_CUSTOMER` (Keputusan 4).
- `page.tsx` (Server Component): `requireMerchant()`, layanan aktif merchant (`id, name, duration_minutes, price`), dan staf aktif bila paket STUDIO (pakai `loadPublicStaff` dengan klien server). `PageHeader title="Booking manual"` dengan deskripsi "Catat booking dari telepon atau pelanggan yang datang langsung." Bila tidak ada layanan aktif: keadaan kosong "Tambahkan layanan dulu" dengan tautan ke `ROUTES.services`.
- Form: Layanan (`select`), Staf (hanya bila ada staf; opsi pertama "Siapa saja"), Tanggal (`input type="date"`, `min` = hari ini WIB, default hari ini), Jam (`SlotField`), Nama pelanggan, dan WhatsApp (`placeholder` contoh `0812...`, dinormalkan skema yang ada). Ada catatan abu "Dicatat sebagai bayar di tempat. Tandai lunas di detail booking setelah pelanggan membayar." Tombolnya "Simpan booking" (hitam, penuh lebar di HP, 44px, `Spinner` saat menyimpan). Pesan gagal tampil di atas tombol, `role="alert"`, tidak merah, dan isian tetap.
- `SlotField`: ambil ulang setiap `serviceId`/`staffId`/`dateISO` berubah, dengan `AbortController` untuk permintaan lama. Memuat: tiga baris chip skeleton. Kosong: "Tidak ada jam kosong di tanggal ini." Gagal: "Gagal memuat jam." plus tombol "Coba lagi". Belum memilih layanan: "Pilih layanan dulu." Chip berupa `role="radiogroup"` dengan tombol `role="radio"` minimal 44px, dikelompokkan dengan `groupSlotsByPeriod` dari `src/lib/booking/schedule.ts` bila cocok dengan bentuk slot. Pilihan direset ke null saat daftar dimuat ulang dan nilai lama tidak ada lagi.
- Story form: terisi, gagal kuota (aksi palsu mengembalikan pesan `P0002`), tanpa staf, dan dengan staf. Story `SlotField` memakai `fetch` tiruan lewat dekorator, dengan keadaan memuat, kosong, dan gagal.

- [ ] **Step 1: Tulis tes yang gagal** `manual-booking.test.ts`: tiap kode di daftar pesan menghasilkan teks persisnya; `BK002` sama dengan `mapBookingError("BK002").message`; `undefined` sama dengan `mapBookingError(undefined).message`; `manualBookingSchema` menolak `startISO` tanpa offset dan `serviceId` bukan uuid, serta menerima `staffId: null`.
- [ ] **Step 2: Jalankan** `npm run test:unit`. Harapan: gagal.
- [ ] **Step 3: Implementasikan** `manual-booking.ts`, lalu jalankan tes sampai lulus.
- [ ] **Step 4: Implementasikan** aksi, perubahan `dispatch.ts`, `SlotField`, halaman, form, dan story.
- [ ] **Step 5: Verifikasi** `npm run typecheck && npm run lint && npm run test:unit`.
- [ ] **Step 6: Commit**: `git commit -m "Tambah booking manual dari dashboard"`.

---

### Task 7: Halaman Booking: tab, pencarian, daftar per hari

Model: sonnet.

**Files:**
- Modify: `src/app/dashboard/bookings/page.tsx`, `src/app/dashboard/bookings/bookings-list.tsx`, `src/app/dashboard/bookings/bookings-table.tsx`, `src/app/dashboard/bookings/bookings-filters.tsx`, `src/app/dashboard/bookings/booking-state.ts` (`buildBookingsHref`), `src/app/dashboard/bookings/loading.tsx`, `src/lib/validations/booking.ts` (hapus `bookingStatusFilterSchema` bila tidak terpakai lagi)
- Create: `src/app/dashboard/bookings/booking-tabs.tsx`, `src/app/dashboard/bookings/bookings-table.stories.tsx`
- Delete: `src/app/dashboard/bookings/bookings-summary.tsx` (Keputusan 18)

**Interfaces:**
- Consumes: Task 2 (`bookings_in_tab`), Task 3 (`BOOKING_TABS`, `parseTab`, `tabParam`, `groupByJakartaDay`, `dayLabel`), Task 4 (`getTabCounts`), F2 `getDisplayStatus`, `STATUS_META`, `paymentLabel`/`ON_SITE_METHOD_LABEL`.
- Produces:

```ts
// booking-state.ts (menggantikan parameter status)
export function buildBookingsHref(params: { tab: BookingTab; q: string; page: number; size: number; b?: string | null }): string;
// Param: tab (dihilangkan bila UPCOMING), q, page (>1), size (bila bukan default), b.

// booking-tabs.tsx (server, tautan biasa)
export function BookingTabs(props: { active: BookingTab; counts: { action: number; upcoming: number } | null; q: string; size: number }): JSX.Element;

// bookings-table.tsx (klien, tampilan)
export function BookingsTable(props: {
  rows: BookingListItem[]; nowMs: number; todayISO: string;
  selectedId: string | null;
  hrefFor: (id: string) => string;   // URL halaman ini dengan b=id
}): JSX.Element;
```

Ketentuan:
- `page.tsx`: `PageHeader title="Booking"` (metadata juga). `action` berisi tombol hitam "Booking manual" (`Link` ke `ROUTES.newBooking`, `hidden md:inline-flex`, karena HP sudah punya tombol tambah di nav). Di bawahnya `BookingTabs`, lalu kotak pencarian (`BookingsFilters` tanpa pemilih status, `placeholder="Cari nama atau WhatsApp"`, `aria-label="Cari booking"`, validasi dan pesan `bookingSearchSchema` tetap). Daftarnya di `<Suspense key={tab|q|page|size}>`.
- `BookingTabs`: `nav aria-label="Kelompok booking"` dengan empat `Link`. Yang aktif `aria-current="page"` dengan garis bawah hitam 2px. Tinggi 44px. Jumlah abu hanya untuk Perlu tindakan dan Akan datang (dari `counts`, disembunyikan bila null). Menggulir horizontal di HP. Pindah tab mereset `page` dan `b`, tetapi mempertahankan `q` dan `size`.
- `BookingsList`: `supabase.rpc("bookings_in_tab", { p_tab: tab }, { count: "exact" }).select(BOOKING_LIST_COLUMNS)...` dengan pencarian `.or()` yang ada dan paginasi yang ada. Urutan: ACTION dan UPCOMING `start_datetime` naik, HISTORY dan CANCELLED turun. Logika redirect halaman di luar jangkauan, pembedaan gagal/kosong, dan `DataTablePagination` tetap, dengan `buildBookingsHref` baru.
- Kosong per tab (tanpa pencarian): Perlu tindakan "Semua beres. Tidak ada yang perlu ditindaklanjuti."; Akan datang "Belum ada booking mendatang." dengan tombol "Catat booking manual"; Riwayat "Belum ada riwayat booking."; Dibatalkan "Tidak ada booking yang dibatalkan." Dengan pencarian: "Tidak ada booking yang cocok dengan pencarian." Gagal: pola gagal yang ada, tanpa merah.
- `BookingsTable` mulai `md`: tabel D2 dengan kolom Waktu, Pelanggan, Layanan, Pembayaran, Status. Baris judul grup per hari (`th colSpan={5} scope="colgroup"`, `dayLabel`). Nama pelanggan adalah `Link` ke `hrefFor(id)` dengan `scroll={false}`, `aria-current` pada baris terpilih, dan latar `muted` pada baris terpilih. Kolom Waktu hanya `HH:MM` karena tanggal sudah di judul grup. Pelanggan: nama tebal, nomor abu. Layanan: nama, abu staf bila ada, ditambah teks abu "Manual" bila `source = 'MANUAL'`. Pembayaran: ringkasan seperti Agenda Task 5. Status: badge isi hitam untuk Hadir dan Lunas di tempat, garis tepi untuk yang lain, label dari `STATUS_META` (ditambah "Hadir" dan "Tidak datang" bila kehadiran tercatat). Di bawah `md`: daftar bertumpuk per grup hari, tiap item satu `Link` minimal 56px berisi jam, nama, layanan, dan badge status.
- Tabel tidak lagi membuka `BookingDetailDialog`: baris menjadi `Link` ke `?b=`, dan pemanggilan dialog serta tombol batal di baris dihapus. Berkas dialog sendiri dihapus di Task 8, yang juga memindahkan aksi batal ke panel. Di antara Task 7 dan 8 detail booking sementara tidak bisa dibuka; keduanya dikerjakan berurutan di cabang yang sama.
- Story `BookingsTable`: tab Akan datang dengan dua grup hari dan satu baris terpilih, tab Perlu tindakan, dan HP 390px.

- [ ] **Step 1:** Tulis tes `buildBookingsHref` di `booking-state.test.ts`: `{ tab: "UPCOMING", q: "", page: 1, size: 20 }` menghasilkan `/dashboard/bookings`; `{ tab: "ACTION", q: "ayu", page: 2, size: 50, b: "x" }` menghasilkan `/dashboard/bookings?tab=tindakan&q=ayu&page=2&size=50&b=x`. Jalankan, harus gagal.
- [ ] **Step 2:** Implementasikan `buildBookingsHref`, lalu jalankan tes sampai lulus.
- [ ] **Step 3:** Implementasikan tab, daftar, tabel, dan story. Hapus `bookings-summary.tsx` dan pemakaiannya, serta `bookingStatusFilterSchema` bila `grep` tidak menemukan pemakai lain.
- [ ] **Step 4: Verifikasi** `npm run typecheck && npm run lint && npm run test:unit`.
- [ ] **Step 5: Commit**: `git commit -m "Susun halaman Booking dengan tab, pencarian, dan grup per hari"`.

---

### Task 8: Panel detail booking dan jadwal ulang

Model: sonnet.

**Files:**
- Create: `src/app/dashboard/bookings/booking-detail-panel.tsx`, `src/app/dashboard/bookings/booking-detail-shell.tsx` (klien: `aside` di `lg`, `Sheet` di bawahnya), `src/app/dashboard/bookings/booking-timeline.tsx`, `src/app/dashboard/bookings/booking-detail-panel.stories.tsx`
- Modify: `src/app/dashboard/bookings/page.tsx`, `src/app/dashboard/bookings/actions.ts`, `src/app/dashboard/bookings/bookings-table.tsx`, `src/app/dashboard/bookings/notification-history.tsx` (bila perlu, untuk dipakai di dalam timeline)
- Delete: `src/app/dashboard/bookings/booking-detail-dialog.tsx`

**Interfaces:**
- Consumes: Task 1 (`reschedule_booking_by_merchant`, errcode `BK034`), Task 3 (`attendanceWindow`, `whatsappLink`, `rescheduleNoticeLink`), Task 6 (`SlotField`), Task 7 (`buildBookingsHref`, `BookingsTable` prop `selectedId`), F2 aksi `cancelBooking(id)`, `decideRequest(id, approve)`, `markPaidOnSite(id, method)`, `markAttendance(id, attended)`, `ON_SITE_METHOD_LABEL`, dan perilaku konfirmasi batal dan peringatan refund `PAID` di dialog F2 yang dihapus.
- Produces:

```ts
// actions.ts
export async function rescheduleBooking(id: string, newStartISO: string): Promise<{ ok: boolean; message?: string }>;
// Pesan: BK034 "Booking ini tidak bisa dijadwal ulang.", 23P01 "Jam itu sudah terisi. Pilih jam lain.",
// BK001 "Jam itu di luar jam buka. Pilih jam lain.", P0006 "Jam itu sudah lewat. Pilih jam lain.", lainnya "Gagal menyimpan. Coba lagi."
// Validasi: cancelBookingSchema untuk id, z.iso.datetime({ offset: true }) untuk newStartISO.

// page.tsx (server)
async function loadSelectedBooking(rawId: string | undefined, merchantId: string): Promise<BookingListItem | null>;
// null bila rawId bukan uuid, tidak ditemukan, atau milik merchant lain (filter .eq("merchant_id")); error query di-console.error lalu null.

type ActionResult = { ok: boolean; message?: string };
export function BookingDetailPanel(props: {
  booking: BookingListItem; nowMs: number; username: string;
  notifications: { kind: NotificationKind; channel: string; status: string; created_at: string }[] | null; // null = gagal muat
  actions: {
    cancel: (id: string) => Promise<ActionResult>;
    decide: (id: string, approve: boolean) => Promise<ActionResult>;
    markPaid: (id: string, method: OnSitePaymentMethod) => Promise<ActionResult>;
    attend: (id: string, attended: boolean) => Promise<ActionResult>;
    reschedule: (id: string, startISO: string) => Promise<ActionResult>;
  };
}): JSX.Element;
export function BookingDetailShell(props: { closeHref: string; children: React.ReactNode }): JSX.Element;
```

Ketentuan:
- `page.tsx`: bila `?b=` ada, `loadSelectedBooking` dan riwayat notifikasinya diambil (query yang dipakai `NotificationHistory` sekarang). Tata letak `lg`: kolom daftar dan kolom panel 320 sampai 360px dengan garis kiri. `closeHref` = `buildBookingsHref` tanpa `b`. Bila `b` tidak valid, tidak ada panel dan tidak ada pesan.
- `BookingDetailShell`: di `lg` ke atas merender `aside aria-labelledby` biasa dengan tombol tutup 44px (`Link` ke `closeHref`). Di bawah `lg` merender `Sheet` `side="right"` lebar penuh di HP, `open` selama komponen terpasang. `onOpenChange(false)` memanggil `router.replace(closeHref, { scroll: false })`. Fokus berpindah ke judul panel saat dibuka.
- `BookingDetailPanel` (urutan D2): judul nama pelanggan dengan nomor abu, tautan "Chat WhatsApp" 44px (`whatsappLink`), lalu `dl` berisi Jadwal (`formatSchedule`), Layanan, Staf (bila ada), dan Dibuat (`Halaman booking` atau `Manual`). Kotak Pembayaran: label cara bayar, nominal besar. Bila tagihan di tempat terbuka (aturan `onSiteOpen` F2), tampil radiogroup Tunai/QRIS/Transfer 44px (default Tunai) dan tombol hitam "Tandai lunas". Bila sudah lunas, ikon `Check` + "Lunas di tempat, <metode>" dengan `role="status"`. Untuk `REQUESTED`: Tolak/Setujui dengan label Task 5. Grid aksi 2 kolom, tombol 44px: "Tandai hadir" (garis hitam, bila `canAttend` dan belum dicatat), "Jadwal ulang" (bila `PAID`/`CONFIRMED`, belum dicatat, dan belum mulai), "Tidak datang" (bila `canNoShow` dan belum dicatat), dan "Batalkan" (teks merah, bila status bisa dibatalkan menurut `cancelBooking`, dengan konfirmasi dan peringatan refund `PAID` dari F2). Aksi yang tidak berlaku tidak dirender. Bila kehadiran sudah dicatat, tampil keadaan "Hadir" atau "Tidak datang", dan tombol pasangannya tetap ada untuk menukar (F2: bisa ditukar).
- Jadwal ulang: menekan tombol membuka bagian di dalam panel berisi tanggal (`input type="date"`, `min` hari ini) dan `SlotField` dengan `serviceId = booking.service_id` dan `staffId = booking.staff_id`. Tombolnya "Simpan jadwal" dan "Batal". Bila sukses, bagian itu diganti `role="status"` "Jadwal diubah ke <formatDateTime>" dengan tautan "Kabari pelanggan lewat WhatsApp" (`rescheduleNoticeLink`, tab baru). Daftar jam memperlakukan slot lama booking ini sebagai terisi. Itu batas yang diterima: jadwal ulang ke jam yang beririsan dengan jadwal lamanya tidak bisa dipilih dari UI.
- `BookingTimeline` "Riwayat": daftar berurutan waktu dari kolom booking (`created_at` dengan "Dibuat lewat halaman booking" atau "Dicatat manual", `paid_at` "DP dibayar" atau "Dibayar online", `paid_on_site_at` "Lunas di tempat, <metode>", `attended_at` "Ditandai hadir", `no_show_at` "Ditandai tidak datang", `cancelled_at` "Dibatalkan: <cancel_reason>"), digabung dengan baris notifikasi (label dari `notification-history.tsx`). Format tiap baris: teks, lalu waktu abu di baris kedua (`formatDateTime`), tanpa `·`. `notifications === null` menampilkan "Riwayat pesan gagal dimuat." tanpa merah.
- Setiap aksi sukses memanggil `router.refresh()` dan panel tetap terbuka. Aksi batal juga tetap terbuka, sehingga panel menampilkan keadaan Dibatalkan. Pesan gagal di bawah tombol, `role="alert"`, tidak merah. Tombol menampilkan `Spinner` dan dinonaktifkan selama transisi.
- Semua aksi di `actions.ts`, termasuk yang lama, memanggil `revalidatePath(ROUTES.dashboard, "layout")` menggantikan `revalidatePath(ROUTES.bookings)`.
- Story: `REQUESTED` berbayar, `CONFIRMED` bayar di tempat belum lunas (jam sudah lewat 1 jam, semua aksi kehadiran tampil), `PAID` DP dengan sisa lunas, `CANCELLED`, manual, riwayat notifikasi gagal, dan HP 390px di dalam `Sheet`.

- [ ] **Step 1:** Tulis tes untuk pemeta pesan `rescheduleBooking`. Taruh pemetanya sebagai fungsi murni `rescheduleErrorMessage(code)` di `src/app/dashboard/bookings/manual-booking.ts` bersama `manualBookingErrorMessage`. Tiap kode di daftar menghasilkan teks persisnya, dan kode lain menghasilkan "Gagal menyimpan. Coba lagi." Jalankan, harus gagal, lalu implementasikan sampai lulus.
- [ ] **Step 2:** Implementasikan `rescheduleBooking`, `loadSelectedBooking`, shell, panel, dan timeline. Hapus `booking-detail-dialog.tsx` dan pemakaiannya.
- [ ] **Step 3:** Verifikasi manual `loadSelectedBooking` lewat `npm run dev`: `?b=bukan-uuid`, `?b=<uuid acak>`, dan `?b=<id booking merchant lain>` (buat lewat SQL di DB lokal bila tersedia). Ketiganya menampilkan halaman tanpa panel. Bila DB lokal tidak tersedia, tulis di laporan task bahwa langkah ini belum diverifikasi.
- [ ] **Step 4: Verifikasi** `npm run typecheck && npm run lint && npm run test:unit`.
- [ ] **Step 5: Commit**: `git commit -m "Ganti dialog booking dengan panel detail dan tambah jadwal ulang"`.

---

### Task 9: Verifikasi akhir dan dokumentasi

Dikerjakan controller, bukan subagen.

- [ ] **Step 1:** `open -a Docker`, lalu `npm run docker:test`. Tidak ada baris `FAIL` di seluruh output, termasuk bagian 36 dan 37.
- [ ] **Step 2:** `npm run check` dan `npm run build-storybook` lulus.
- [ ] **Step 3:** Pemeriksaan browser dengan `npm run dev` dan data lokal (atau Storybook bila Supabase lokal tidak tersedia; catat yang tidak terverifikasi) pada 390px dan 1280px:
  - `/dashboard`: Perlu tindakan (Setujui dan Tolak berjalan), agenda dengan garis Sekarang dan tombol Tandai hadir, Ditagih di tempat, 7 hari terakhir, serta keadaan kosong pada merchant baru.
  - `/dashboard/bookings`: empat tab dengan jumlah, pencarian, grup per hari, panel di kanan (1280) dan sheet (390), tandai lunas dengan metode, hadir/tidak datang, jadwal ulang beserta tautan kabari, dan batal (merah, dengan konfirmasi).
  - `/dashboard/bookings/baru`: simpan booking manual, mendarat di panel booking itu, dan bentrok jam memberi pesan.
  - Nav: sidebar berkelompok dan badge di 1280, nav bawah di 390 (tombol tambah, Lainnya membuka sheet), dan konten tidak tertutup nav.
  - Di semua halaman: target sentuh 44px atau lebih, fokus terlihat dengan Tab, tidak ada em dash atau `·` di teks, dan merah hanya pada Batalkan.
- [ ] **Step 4:** Tambah `## 32. Dashboard Hari ini dan booking manual` di `docs/DECISIONS.md` (Keputusan 1, 3, 5, 8, 9 dengan alasannya; sesuaikan nomor bila F2 memakai nomor lain). Perbarui bagian Status di `AGENTS.md` dengan satu kalimat F3: halaman pertama dashboard kini Hari ini, Booking punya tab dan panel detail dengan jadwal ulang, booking manual lewat `create_manual_booking` (`bookings.source`), dan nav bawah di HP. Perbarui baris F3 di `docs/superpowers/plans/2026-11-14-marky-roadmap.md` (rencana `2026-11-15-marky-f3-dashboard.md`, status selesai di cabang F3). Jalankan `graphify update .`.
- [ ] **Step 5: Commit**: `git add docs/DECISIONS.md AGENTS.md docs/superpowers/plans/2026-11-14-marky-roadmap.md` lalu `git commit -m "Catat F3 selesai di keputusan, status, dan roadmap"`. Jangan stage `graphify-out/` kecuali proyek memang meng-commit-nya di cabang ini.

## Urutan eksekusi

1, 2 (migration berurutan), 3, 4, 5, 6, 7, 8, 9. Task 6 sebelum 8 karena panel memakai `SlotField`. Task 7 sebelum 8 karena panel membutuhkan `selectedId` dan `buildBookingsHref` baru.
