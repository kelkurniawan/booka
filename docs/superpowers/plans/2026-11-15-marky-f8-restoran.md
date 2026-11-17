# F8 Restoran: jumlah tamu, kapasitas, denah dan meja: rencana implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merchant restoran bisa menerima reservasi meja: pelanggan memilih jumlah tamu, tanggal, jam, dan (bila merchant memakai denah) meja atau "Pilihkan untuk saya". Kapasitas dihitung per slot (total kursi) atau per meja, tanpa mengubah perilaku merchant yang tidak menyalakannya.

**Architecture:** Tiga migration. Yang pertama menambah kolom dan tabel (`dining_areas`, `dining_tables`) beserta hak akses. Yang kedua memecah eksklusi: `bookings_no_overlap` hanya berlaku untuk booking slot eksklusif (`capacity_mode = 'NONE'`), meja dijaga dua eksklusi per meja, dan kursi dihitung di dalam `create_booking` dan `move_booking_slot` di bawah advisory lock merchant yang sama, lewat helper SQL bersama. Yang ketiga menambah dua RPC baca untuk `anon` (ketersediaan slot dan status meja, tanpa data pelanggan) dan satu RPC tulis denah yang atomik. Di TypeScript, modul murni `src/lib/booking/reservation.ts` memegang konstanta grid, label, dan aturan layanan reservasi; `/api/slots` mendapat cabang kapasitas; `BookingFlow` mendapat langkah Meja; dashboard mendapat halaman Denah meja dengan editor yang bisa dipakai dengan keyboard dan punya tampilan daftar.

**Tech Stack:** Postgres 17 (migration Supabase, `btree_gist`, uji `npm run docker:test`), Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui, Zod, `node:test` lewat tsx, Storybook 10.

**Spec:** `docs/superpowers/specs/2026-11-14-marky-redesign-design.md` bagian 1, 2, 5 (F8), 7. Arah visual: `DESIGN.md`. Aturan proyek: `AGENTS.md`. Artboard (teks: `python3 .superpowers/design/extract.py .superpowers/design/app/<file>`, tata letak dan data contoh: baca HTML mentahnya, terutama blok `<script type="text/x-dc">`): R1 `Resto.dc.html`, R2 `ResJadwal.dc.html`, R2b `ResMeja.dc.html`, R3 `ResData.dc.html`, R4 `ResSelesai.dc.html`, M3 `DenahMeja.dc.html`. Rencana sebelumnya: F2 `2026-11-15-marky-f2-cara-bayar.md`, F3 `...-f3-dashboard.md`, F4 `...-f4-kelola-booking.md`, F5 `...-f5-promosi.md`, F6, F7.

## Prasyarat

F8 dimulai setelah F2 sampai F7 selesai dan di-commit. F8 memakai: `public.booking_holds_slot(booking_status, timestamptz)`, `public.slot_within_hours(uuid, uuid, integer, time, time)`, `merchant_settings` dan `PaymentSettings`/`paymentLabel` (F2); `create_booking` dengan `p_source`, `reap_expired_bookings_for(uuid)`, `create_manual_booking`, panel detail, `slot-field.tsx`, grup sidebar (F3); `move_booking_slot` dan UI ubah jadwal pelanggan di `/pesanan/[token]` (F4); `create_booking` dengan `p_voucher_code` (F5). Bila salah satu belum ada di cabang, berhenti dan lapor.

## Keputusan (spec diam atau bentrok, diputuskan di sini)

1. **Arti `table_mode`.** Nama enum dari spec, artinya cara menghitung kapasitas layanan reservasi:
   - `NONE` (default): fitur restoran mati. Perilaku lama persis: setiap booking memegang slot eksklusif per kalender staf.
   - `AREA`: "Total kursi per jam" (M3 dengan sakelar denah mati). Semua booking reservasi berbagi `seats_per_slot` kursi. Pelanggan tidak memilih area atau meja. Nama `AREA` dipertahankan dari spec walau artinya "kapasitas per slot".
   - `TABLE`: "Pakai denah meja". Setiap booking reservasi mendapat satu meja (atau dua yang digabung).
2. **Layanan reservasi = `services.seat_duration_minutes` terisi.** Hanya layanan reservasi yang memakai kapasitas, dan hanya saat `table_mode <> 'NONE'`. Layanan lain milik restoran (Paket Ulang Tahun, Sewa Rooftop) tetap slot eksklusif seperti sekarang, walau punya `party_min`/`party_max`, karena ruangannya sendiri. Rentang booking reservasi = `start + seat_duration_minutes`, dan `bookings.duration_minutes` menyimpan nilai itu sebagai snapshot.
3. `party_min`/`party_max` boleh diisi di layanan apa pun (keduanya atau tidak sama sekali, 1 sampai 200). Bila terisi, jumlah tamu wajib dan harus dalam rentang (`BK063`). Bila kosong, argumen jumlah tamu diabaikan (disimpan null). `seat_duration_minutes` 15 sampai 480 dan mewajibkan `party_max`.
4. **Kolom tambahan di luar daftar spec.** `bookings.capacity_mode table_mode` (snapshot cara booking itu memakai tempat; penentu eksklusi mana yang berlaku), `bookings.joined_table_id` (meja kedua bila digabung), `bookings.table_label` (snapshot "D5" atau "D5 + D6", seperti `service_name`/`staff_name`, tetap terbaca setelah meja diganti nama atau dihapus), `dining_tables.note` ("Catatan untuk pelanggan" dari M3), `dining_tables.sort_order`, `dining_areas.sort_order`.
5. **Desain eksklusi.**
   - `bookings_no_overlap` dibuat ulang dengan tambahan `and capacity_mode = 'NONE'` di predikatnya. Semua baris lama dan semua booking merchant non-restoran ber-`capacity_mode = 'NONE'` (default kolom), jadi bagi mereka constraint ini identik dengan sebelumnya, termasuk dimensi staf (`coalesce(staff_id, uuid nol)`). Eksklusi staf tidak disentuh.
   - Booking reservasi (`AREA`/`TABLE`) keluar dari `bookings_no_overlap`, jadi banyak reservasi boleh di jendela waktu yang sama. Booking slot eksklusif dan reservasi tidak saling menghalangi (ruangan berbeda).
   - Dua eksklusi baru per meja: `bookings_table_no_overlap (table_id =, rentang &&)` dan `bookings_joined_table_no_overlap (joined_table_id =, rentang &&)`, keduanya untuk status pemegang slot. Satu meja tidak bisa dipegang dua kali di kolom yang sama, bahkan oleh penulis yang lupa mengambil kunci.
   - Yang TIDAK dijaga constraint: meja utama satu booking bertabrakan dengan meja gabungan booking lain, dan jumlah kursi `AREA`. Keduanya dijaga fungsi di bawah kunci (Keputusan 6) dan diuji berurutan.
6. **Konkurensi.** Semua penulis yang menambah beban kapasitas memegang `pg_advisory_xact_lock(hashtext(merchant_id::text))` lebih dulu, lalu `reap_expired_bookings_for`, lalu memeriksa kapasitas, lalu insert/update dalam transaksi yang sama: `create_booking`, `move_booking_slot` (lewat pemanggilnya `reschedule_booking_by_merchant` dan `reschedule_booking`), dan `save_dining_layout` (supaya hapus meja tidak balapan dengan booking baru). Di READ COMMITTED tiap pernyataan PL/pgSQL mengambil snapshot baru, jadi pemeriksaan sesudah kunci melihat semua baris yang di-commit pemegang kunci sebelumnya. Helper kapasitas bertanda `stable` (bukan `immutable`) dan tidak pernah dipanggil sebelum kunci. Penulis tanpa kunci hanya mengurangi beban (webhook `PENDING -> PAID` tidak mengubah rentang; batal dan reap melepas slot). Pembaca slot (`get_seat_availability`, `get_table_status`) tidak mengunci; `create_booking` yang memutuskan.
7. **Kursi `AREA` dihitung beban puncak, bukan jumlah irisan.** Beban di titik t = jumlah `party_size` booking kapasitas pemegang slot yang `start <= t < end`. Beban hanya naik di titik mulai, jadi puncak dalam `[s, e)` dicari di titik `s` dan setiap `start` booking lain di `(s, e)`. Syarat: `party + puncak <= seats_per_slot`. Booking `TABLE` sisa pergantian mode ikut dihitung (semua `capacity_mode <> 'NONE'`).
8. **Pemilihan meja** (`pick_dining_tables`), urutan:
   1. `p_table_id` diisi: meja itu milik merchant, (bila online) `bookable_online`, `min_seats <= party <= max_seats`, area cocok bila `p_area_id` diisi, dan tidak sibuk. Gagal → tidak ada baris (pemanggil `BK061`).
   2. Satu meja: kandidat yang lolos syarat di atas (dan di area `p_area_id` bila diisi), urut `max_seats`, `sort_order`, `name`. Ambil yang pertama (paling pas).
   3. Bila `auto_join_tables`: pasangan `(a, b)` dengan `a.id < b.id`, area sama, `b.id = any(a.joinable_with) or a.id = any(b.joinable_with)`, keduanya lolos syarat online dan tidak sibuk, `a.max_seats + b.max_seats >= party`. Urut jumlah `max_seats`, lalu `a.sort_order`. Gabung maksimal dua meja; `min_seats` diabaikan untuk gabungan.
   4. Tidak ada → tidak ada baris (pemanggil `BK060`).
   "Sibuk" = ada booking pemegang slot (selain `p_exclude`) dengan `table_id` atau `joined_table_id` = meja itu dan rentang beririsan. Online = booking `ONLINE`; booking `MANUAL` boleh memakai meja yang tidak `bookable_online`.
9. **Pergantian mode** tidak mengubah booking lama: tiap booking menyimpan `capacity_mode`-nya. `TABLE` mengabaikan sisa booking `AREA` (tidak punya meja); `AREA` menghitung sisa booking `TABLE` sebagai kursi terpakai. Kembali ke `NONE` membuat layanan reservasi jadi slot eksklusif lagi di antara booking `NONE` saja. Halaman M3 menampilkan satu kalimat peringatan saat mode diganti.
10. Reservasi tidak memakai staf: `staff_id` null, jam kerja = jam usaha (`slot_within_hours(merchant, null, ...)`), langkah staf tidak tampil untuk layanan reservasi.
11. Jam mulai layanan reservasi tiap 30 menit (`SEAT_SLOT_STEP_MINUTES`), bukan tiap durasi seperti layanan biasa. Akhir duduk harus masih di jam buka.
12. `table_hold_minutes` (default 15, 0 sampai 120) hanya teks untuk pelanggan ("Meja ditahan 15 menit dari jam datang."), 0 = kalimat tidak tampil. Tidak mengubah aturan Tidak datang F2.
13. **Grid denah 24 kolom x 22 baris.** Meja minimal 3x3 sel, maksimal 12x12, seluruhnya di dalam kanvas. Bentuk `ROUND` atau `RECT`. Dirender dengan persentase supaya kanvas yang sama muat di 390px (sel sekitar 15px, meja minimal sekitar 45px, lolos target sentuh 44px) dan 1280px. Penanda (Jendela, Pintu, Kasir) tidak dibangun.
14. **Denah ditulis hanya lewat RPC `save_dining_layout`** (satu transaksi, kunci merchant). `authenticated` tidak diberi INSERT/UPDATE/DELETE pada `dining_areas`/`dining_tables`. RPC mengganti seluruh denah: yang tidak ada di payload dihapus. Meja atau area yang masih dipakai booking pemegang slot yang `end_datetime > now()` tidak boleh dihapus (`BK062`); merchant mematikan "Bisa dipesan online" saja. Booking lama yang mejanya terhapus tetap punya `table_label`. Nama meja dan area unik per merchant diperiksa di payload (`BK064`), bukan dengan unique index, supaya tukar nama D1/D2 dalam satu simpan tidak gagal di tengah upsert. Batas 10 area dan 100 meja per merchant (`BK064`).
15. **Hak akses `anon`.** Membaca `dining_areas` (`id, merchant_id, name, sort_order`) dan `dining_tables` (kolom tata letak saja: `id, merchant_id, area_id, name, min_seats, max_seats, shape, grid_x, grid_y, grid_w, grid_h, note, sort_order`) hanya untuk merchant ber-username dengan `table_mode = 'TABLE'`, dan meja hanya yang `bookable_online`. `joinable_with`, `bookable_online`, `seats_per_slot`, `auto_join_tables` tidak terbaca `anon`. `merchant_settings` menambah grant `anon` untuk `table_mode` dan `table_hold_minutes` saja. Status meja dan sisa slot hanya lewat RPC yang mengembalikan id meja, status, dan angka, tanpa data pelanggan. Kolom `bookings` baru tidak di-grant ke `anon`.
16. **Langkah pelanggan.** Layanan reservasi: Jadwal (jumlah tamu, tanggal, jam; plus chip "Area (opsional)" di mode `TABLE` bila ada 2 area atau lebih) lalu, di mode `TABLE` saja, Meja (opsional: "Pilihkan untuk saya" terpilih sejak awal, atau "Pilih meja sendiri" lewat denah atau daftar yang setara), lalu Data diri dengan Catatan opsional. Pilihan "Pelanggan boleh memilih" di M3 (Tidak memilih / Area saja / Area dan nomor meja) tidak dibangun: `TABLE` selalu menawarkan langkah Meja dengan "Pilihkan untuk saya" sebagai default (spec F8).
17. Slot penuh tidak ditampilkan (pemilih jam yang ada hanya berisi slot kosong). Di mode `TABLE` slot dengan sisa 1 sampai 3 meja yang cocok diberi catatan "Sisa N meja".
18. Nav "Denah meja" di grup "Atur usaha" setelah "Jam buka", untuk semua merchant dan semua paket. Rute `/dashboard/denah` (di bawah `/dashboard`, tidak perlu `reserved_usernames`).
19. Errcode baru: `BK060` kapasitas habis untuk jumlah tamu itu di jam itu, `BK061` meja pilihan tidak tersedia atau tidak cocok, `BK062` meja/area masih punya reservasi mendatang, `BK063` jumlah tamu di luar rentang layanan, `BK064` denah tidak valid (batas jumlah, nama ganda, area atau gabungan tidak cocok).
20. `customer_note` 1 sampai 300 karakter (spasi di tepi dibuang, kosong jadi null). Kolomnya tampil di Data diri untuk layanan ber-`party_max`; disimpan untuk layanan apa pun bila dikirim.
21. Daftar jam di form booking manual dashboard memakai `/api/slots` (peran `anon`), jadi hanya menghitung meja online, sedangkan `create_manual_booking` boleh memakai meja offline. Ditandai `shortcut:` di kode; naik kelas bila merchant mengeluh slot manual terlihat penuh.
22. Teks artboard yang menjanjikan hal di luar F8 tidak dipakai: "pengingat 2 jam sebelumnya" (F4 Keputusan 1), "Batalkan lewat tautan di WhatsApp", "biasanya dalam 1 jam", "Lihat menu", "Petunjuk arah", "Buka sekarang". "1–12 orang" ditulis "1 sampai 12 orang" (`DESIGN.md`).

## Konflik dengan spec, artboard, atau arahan

- Arahan meminta `get_booked_ranges` "menghitung kapasitas per meja atau per slot". Di sini `get_booked_ranges` tetap mengembalikan rentang slot eksklusif (sekarang hanya baris `capacity_mode = 'NONE'`, bentuk kembalian sama), dan kapasitas reservasi dihitung RPC baru `get_seat_availability` dengan helper yang sama persis dengan `create_booking`. Alasan: bentuk kembalian `get_booked_ranges` dipakai `/api/slots`, F7 `/api/slots/nearest`, dan `slot-field`; mencampur beban kursi ke rentang eksklusif akan membuat layanan biasa ikut terhalang reservasi.
- M3 punya sakelar "Pakai denah meja" plus radio "Pelanggan boleh memilih"; spec punya satu enum tiga nilai. Dipetakan ke satu radio tiga pilihan (Mati / Total kursi per jam / Pakai denah meja), Keputusan 1 dan 16.
- M3 menaruh "Lama duduk" di pengaturan merchant; spec menaruh `seat_duration_minutes` di layanan. Mengikuti spec: field di form layanan (Keputusan 2).
- M3 punya satu tombol Simpan untuk seluruh halaman; di sini dua form (Kapasitas, Denah) dengan tombol Simpan masing-masing, karena denah ditulis lewat RPC tersendiri.
- R2 menampilkan slot "Penuh" dicoret; tidak dibangun (Keputusan 17). R2b dan M3 menampilkan penanda ruangan; tidak dibangun (Keputusan 13).

## Global Constraints

- Migration baru saja, berurutan: `20261120000100_dining_schema.sql`, `20261120000200_seat_capacity.sql`, `20261120000300_dining_reads_and_layout.sql`. Jangan edit migration lama.
- **Fungsi yang didefinisikan ulang disalin dari definisi TERAKHIR di `supabase/migrations/` saat eksekusi, bukan dari berkas tetap**: `grep -l "function public.create_booking(" supabase/migrations/*.sql | sort | tail -1`, sama untuk `get_booked_ranges`, `move_booking_slot`, `create_manual_booking`, dan definisi terakhir `bookings_no_overlap` (`grep -l "bookings_no_overlap" ... | tail -1`). Saat rencana ini ditulis, yang terakhir diharapkan: `create_booking` sembilan argumen dari F5 `20261117000200_create_booking_voucher.sql`, `move_booking_slot` dari F4 `20261116000200_customer_manage_booking.sql`, `get_booked_ranges` dan `bookings_no_overlap` dari F2 `20261115000200_payment_modes.sql`, `create_manual_booking` dari F3 `20261115000600_manual_booking.sql`. Bila fase lain mengubahnya, perubahan itu ikut terbawa. Signature lama di-`drop` dengan mencocokkan `select oid::regprocedure from pg_proc where proname = '<nama>'`.
- Tabel baru: RLS aktif, `revoke all ... from anon, authenticated`, grant per kolom. Fungsi baru: `revoke execute ... from public, anon, authenticated`, lalu `grant execute` eksplisit hanya ke peran pemanggil. Akhiri tiap migration dengan `notify pgrst, 'reload schema';`.
- Uji di `supabase/tests/99_verify.sql` bagian 60 sampai 64, label `t60`..`t64`, ditambahkan setelah bagian terakhir yang ada. Lulus berarti tidak ada baris output diawali `FAIL` di seluruh `npm run docker:test` (Docker harus jalan: `open -a Docker`), termasuk bagian lama yang memanggil `create_booking` dengan 5 sampai 9 argumen.
- `src/types/database.ts` ikut diperbarui, `type` bukan `interface`.
- `createAdminClient()` selalu difilter `merchant_id`. `/api/*` tidak dicakup matcher proxy. Rute publik baru memakai `createPublicClient()`.
- Komponen `src/components/booking-page/*` hanya memakai token tema (kelas Tailwind bertoken seperti komponen tetangganya, CSS custom property dari `themeToCssVars()`); tanpa warna, ukuran font, atau font tertulis. Dashboard tetap monokrom.
- Larangan `DESIGN.md`: tanpa em dash, tanpa en dash sebagai rentang, tanpa eyebrow, tanpa label kapital berjarak, tanpa `·` sebagai pemisah, tanpa panah di teks tombol. Target sentuh 44px (`min-h-11`) di layar sentuh, fokus terlihat, semua bisa dengan keyboard. Setiap daftar data punya keadaan memuat, kosong, dan gagal.
- Jam di zona `Asia/Jakarta` lewat `src/lib/booking/slots.ts` dan `src/lib/format.ts`.
- Komponen tampilan baru menerima data dan aksi lewat props dan punya story (390, 768, 1280).
- UI dan komentar berbahasa Indonesia, nama variabel Inggris. Tidak ada langkah deploy.

## Review Focus

1. **Dua pelanggan mengirim reservasi untuk meja atau kursi terakhir bersamaan**: tepat satu tersimpan, yang lain mendapat `BK060` ("sudah penuh"), bukan dua booking di satu meja. Kuncinya: kunci advisory diambil sebelum helper kapasitas mana pun, dan helper tidak `immutable`. Diuji berurutan di t61c dan t61e (dan t61f untuk cadangan constraint); reviewer memeriksa urutan pernyataan di `create_booking` dan `move_booking_slot`.
2. **Merchant salon/barbershop yang tidak pernah membuka Denah meja**: booking beririsan tetap `23P01`, `get_booked_ranges` mengembalikan baris yang sama, staf "siapa saja" tetap jatuh ke staf kosong. Diuji t61a (regresi) dan seluruh bagian lama.
3. **Pelanggan memilih meja D5 di denah, lalu orang lain mengambilnya sebelum ia menekan Kirim**: server `BK061`, pelanggan melihat "Meja yang dipilih sudah terisi..." dan dikembalikan ke langkah Meja dengan status yang dimuat ulang, pilihan "Pilihkan untuk saya" tetap tersedia. Diuji t61e (SQL), `bookingErrorStep` (Task 4), dan kode error di respons `POST /api/bookings` (Task 5).
4. **Merchant menghapus meja yang masih punya reservasi minggu depan**: simpan denah ditolak `BK062` dengan pesan jelas, tidak ada perubahan sebagian (meja lain yang diubah di simpan yang sama juga tidak tersimpan). Diuji t64c.
5. **Reservasi beririsan sebagian di mode Total kursi** (18:00 sampai 19:30 enam orang, 19:30 sampai 21:00 enam orang, kapasitas 10): reservasi baru 19:00 sampai 20:30 empat orang diterima karena puncaknya 10, bukan ditolak karena jumlah irisan 12. Diuji t61d.

---

## Peta berkas

| Berkas | Tanggung jawab | Task |
|---|---|---|
| `supabase/migrations/20261120000100_dining_schema.sql` | Enum, kolom, tabel denah, RLS, grant | 1 |
| `supabase/migrations/20261120000200_seat_capacity.sql` | Eksklusi, helper kapasitas, `create_booking`, `create_manual_booking`, `move_booking_slot`, `get_booked_ranges` | 2 |
| `supabase/migrations/20261120000300_dining_reads_and_layout.sql` | `get_seat_availability`, `get_table_status`, `save_dining_layout` | 3 |
| `src/lib/booking/reservation.ts` (+ test) | Konstanta grid, aturan layanan reservasi, label | 4 |
| `src/lib/booking/errors.ts` | `BK060`, `BK061`, `BK063` | 4 |
| `src/lib/booking/slots.ts`, `src/app/api/slots/route.ts`, `src/app/api/tables/route.ts`, `src/app/api/bookings/route.ts`, `src/lib/validations/booking.ts` | API reservasi | 5 |
| `src/components/booking-page/{guest-stepper,table-picker,reservation-card}.tsx`, `step-indicator.tsx`, `time-slot-picker.tsx` | Komponen publik | 6 |
| `src/app/[username]/*`, `src/app/pesanan/[token]/*` | Alur R1 sampai R4, halaman booking saya | 7 |
| `src/app/dashboard/denah/*`, nav, form layanan | M3 bagian kapasitas, field layanan | 8 |
| `src/app/dashboard/denah/floor-plan-editor.tsx`, `src/lib/validations/dining.ts` | Editor denah dan simpan | 9 |
| Dashboard booking, booking manual, notifikasi, ekspor | Pembaca kolom baru | 10 |

---

### Task 1: Skema denah, kolom reservasi, dan hak akses

Model: sonnet.

**Files:**
- Create: `supabase/migrations/20261120000100_dining_schema.sql`
- Modify: `supabase/tests/99_verify.sql` (bagian `-- 60. Restoran: skema (20261120000100)`), `src/types/database.ts`, `src/components/booking-page/fixtures.ts` (kolom baru di pembuat `Service`)

**Interfaces:**
- Produces (SQL):

```sql
create type public.table_mode as enum ('NONE', 'AREA', 'TABLE');
create type public.dining_table_shape as enum ('ROUND', 'RECT');

alter table public.services
  add column party_min smallint,
  add column party_max smallint,
  add column seat_duration_minutes smallint,
  add constraint services_party_pair check ((party_min is null) = (party_max is null)),
  add constraint services_party_range check (party_min is null or (party_min >= 1 and party_min <= party_max and party_max <= 200)),
  add constraint services_seat_duration_range check (seat_duration_minutes is null or seat_duration_minutes between 15 and 480),
  add constraint services_seat_needs_party check (seat_duration_minutes is null or party_max is not null);

alter table public.merchant_settings
  add column table_mode public.table_mode not null default 'NONE',
  add column seats_per_slot integer,
  add column table_hold_minutes smallint not null default 15,
  add column auto_join_tables boolean not null default true,
  add constraint merchant_settings_seats_per_slot_check check (seats_per_slot is null or seats_per_slot between 1 and 1000),
  add constraint merchant_settings_area_needs_seats_check check (table_mode <> 'AREA' or seats_per_slot is not null),
  add constraint merchant_settings_table_hold_minutes_check check (table_hold_minutes between 0 and 120);

create table public.dining_areas (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, merchant_id)
);

create table public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  area_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 20),
  min_seats smallint not null default 1,
  max_seats smallint not null,
  shape public.dining_table_shape not null default 'RECT',
  grid_x smallint not null,
  grid_y smallint not null,
  grid_w smallint not null default 3,
  grid_h smallint not null default 3,
  note text check (note is null or char_length(note) between 1 and 60),
  bookable_online boolean not null default true,
  joinable_with uuid[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Area wajib milik merchant yang sama.
  foreign key (area_id, merchant_id) references public.dining_areas (id, merchant_id) on delete cascade,
  constraint dining_tables_seats check (min_seats >= 1 and min_seats <= max_seats and max_seats <= 50),
  constraint dining_tables_grid check (
    grid_x >= 0 and grid_y >= 0 and grid_w between 3 and 12 and grid_h between 3 and 12
    and grid_x + grid_w <= 24 and grid_y + grid_h <= 22),
  constraint dining_tables_not_self_join check (not (id = any (joinable_with))),
  constraint dining_tables_join_count check (cardinality(joinable_with) <= 8)
);

alter table public.bookings
  add column party_size smallint,
  add column area_id uuid references public.dining_areas (id) on delete set null,
  add column table_id uuid references public.dining_tables (id) on delete set null,
  add column joined_table_id uuid references public.dining_tables (id) on delete set null,
  add column table_label text,
  add column customer_note text,
  add column capacity_mode public.table_mode not null default 'NONE',
  add constraint bookings_party_size_range check (party_size is null or party_size between 1 and 200),
  add constraint bookings_customer_note_length check (customer_note is null or char_length(customer_note) between 1 and 300),
  add constraint bookings_capacity_party check (capacity_mode = 'NONE' or party_size is not null),
  add constraint bookings_tables_only_table_mode check (capacity_mode = 'TABLE' or (table_id is null and joined_table_id is null)),
  add constraint bookings_joined_table_distinct check (joined_table_id is null or joined_table_id is distinct from table_id);
```

  Sisa isi file: index `dining_areas (merchant_id)`, `dining_tables (merchant_id, area_id)`, `bookings (joined_table_id) where joined_table_id is not null`, `bookings (merchant_id, start_datetime) where capacity_mode <> 'NONE'`; trigger `set_updated_at` pada `dining_tables`; RLS aktif di kedua tabel; `revoke all ... from anon, authenticated`; grant dan policy persis Keputusan 15: `dining_areas_public_read` dan `dining_tables_public_read` (`to anon`, merchant punya `username` dan `exists (select 1 from public.merchant_settings ms where ms.merchant_id = <tabel>.merchant_id and ms.table_mode = 'TABLE')`, ditambah `bookable_online` untuk meja), `dining_areas_read_own` dan `dining_tables_read_own` (`to authenticated`, `(select auth.uid()) = merchant_id`); `grant select (table_mode, table_hold_minutes) on public.merchant_settings to anon`; `grant update (table_mode, seats_per_slot, table_hold_minutes, auto_join_tables) on public.merchant_settings to authenticated`. Kolom `services` dan `bookings` baru tidak perlu grant baru (grant tingkat tabel yang ada untuk `services`; `bookings` hanya `authenticated` select).
- Produces (TS, `src/types/database.ts`):
  - `TableMode = "NONE" | "AREA" | "TABLE"`, `DiningTableShape = "ROUND" | "RECT"`.
  - `Service` + `party_min: number | null; party_max: number | null; seat_duration_minutes: number | null` (Insert/Update opsional).
  - `MerchantSettings` + `table_mode: TableMode; seats_per_slot: number | null; table_hold_minutes: number; auto_join_tables: boolean`; `merchant_settings.Update` + keempatnya.
  - `DiningArea = { id: string; merchant_id: string; name: string; sort_order: number; created_at: string }`.
  - `DiningTable = { id: string; merchant_id: string; area_id: string; name: string; min_seats: number; max_seats: number; shape: DiningTableShape; grid_x: number; grid_y: number; grid_w: number; grid_h: number; note: string | null; bookable_online: boolean; joinable_with: string[]; sort_order: number; created_at: string; updated_at: string }`. Tabel `dining_areas` dan `dining_tables` dengan `Row` tipe di atas dan `Insert: Record<string, never>; Update: Record<string, never>` (penulisan hanya lewat RPC Task 3).
  - `Booking` + `party_size: number | null; area_id: string | null; table_id: string | null; joined_table_id: string | null; table_label: string | null; customer_note: string | null; capacity_mode: TableMode`.
  - `Enums` + `table_mode`, `dining_table_shape`.

- [ ] **Step 1: Tulis kasus uji yang gagal** di bagian 60. Merchant PRO `60606060-0000-0000-0000-000000000001` (username `resto-60`) dan `...0002` (username `resto-60b`). Kasus:
  - t60a `services`, masing-masing `23514`: `party_min` tanpa `party_max`; `party_min = 5, party_max = 4`; `party_max = 201`; `seat_duration_minutes = 10`; `seat_duration_minutes = 90` tanpa rentang tamu. `expect_ok`: rentang 1 sampai 12 dengan `seat_duration_minutes = 90`.
  - t60b `merchant_settings`: baris lama `table_mode = 'NONE'`, `table_hold_minutes = 15`, `auto_join_tables = true`, `seats_per_slot` null; `table_mode = 'AREA'` tanpa `seats_per_slot` `23514`; `seats_per_slot = 0` `23514`; `table_hold_minutes = 121` `23514`.
  - t60c `dining_tables`, masing-masing `23514`: `min_seats = 5, max_seats = 4`; `max_seats = 51`; `grid_x = 22, grid_w = 3`; `grid_w = 2`; `joinable_with` berisi id sendiri. Area milik `...0002` untuk meja `...0001` gagal `23503`.
  - t60d `bookings`, masing-masing `23514`: `capacity_mode = 'AREA'` tanpa `party_size`; `capacity_mode = 'NONE'` dengan `table_id`; `party_size = 0`; `customer_note = ''`; `joined_table_id = table_id`. Booking tanpa kolom baru: `capacity_mode = 'NONE'`, semua kolom baru null.
  - t60e hak akses (pola t32h): anon bisa SELECT `dining_tables.name`, `grid_x`, `note`, tidak bisa SELECT `bookable_online`, `joinable_with`; tidak bisa INSERT/UPDATE/DELETE kedua tabel; authenticated tidak bisa INSERT/UPDATE/DELETE kedua tabel; anon bisa SELECT `merchant_settings.table_mode`, `table_hold_minutes`, tidak bisa `seats_per_slot`, `auto_join_tables`; authenticated bisa UPDATE `merchant_settings.table_mode`; anon tidak bisa SELECT `bookings.party_size`, `customer_note`.
  - t60f RLS sebagai `anon` (`set local role anon`): merchant `...0001` `table_mode = 'NONE'` dengan satu area dan dua meja (satu offline): 0 baris; setelah `table_mode = 'TABLE'`: 1 area, 1 meja (yang online). Sebagai `authenticated` merchant `...0002`: 0 baris meja `...0001`.
- [ ] **Step 2: Jalankan** `npm run docker:test`. Harapan: baris `FAIL` di bagian 60.
- [ ] **Step 3: Tulis migration** sesuai Interfaces. Komentar kepala: arti `table_mode` (Keputusan 1), layanan reservasi (Keputusan 2), kenapa `capacity_mode` disimpan per booking (Keputusan 4), dan bahwa penulisan denah hanya lewat RPC (Keputusan 14).
- [ ] **Step 4: Jalankan** `npm run docker:test`. Harapan: tidak ada `FAIL`.
- [ ] **Step 5: Perbarui tipe** dan `fixtures.ts` (`party_min: null, party_max: null, seat_duration_minutes: null`; pembuat `MerchantSettings` contoh bila ada: `table_mode: "NONE", seats_per_slot: null, table_hold_minutes: 15, auto_join_tables: true`). `npm run typecheck && npm run test:unit` lulus.
- [ ] **Step 6: Commit**: `git add supabase/migrations/20261120000100_dining_schema.sql supabase/tests/99_verify.sql src/types/database.ts src/components/booking-page/fixtures.ts` lalu `git commit -m "Tambah skema denah meja, kolom reservasi, dan hak aksesnya"`.

---

### Task 2: Kapasitas di `create_booking` dan `move_booking_slot`, eksklusi per meja

Model: opus (kapasitas dan konkurensi).

**Files:**
- Create: `supabase/migrations/20261120000200_seat_capacity.sql`
- Modify: `supabase/tests/99_verify.sql` (bagian `-- 61. Restoran: create_booking kapasitas (20261120000200)` dan `-- 62. Restoran: pindah jadwal reservasi (20261120000200)`), `src/types/database.ts` (`Args` `create_booking`, `create_manual_booking`)

**Interfaces:**
- Consumes: Task 1; definisi terakhir fungsi (Global Constraints).
- Produces (SQL):

```sql
-- Eksklusi (Keputusan 5). Salin definisi bookings_no_overlap terakhir, hanya tambah capacity_mode.
alter table public.bookings drop constraint bookings_no_overlap;
alter table public.bookings add constraint bookings_no_overlap exclude using gist (
  merchant_id with =,
  (coalesce(staff_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
  tstzrange(start_datetime, end_datetime, '[)') with &&
) where (status in ('PENDING', 'PAID', 'CONFIRMED', 'REQUESTED') and capacity_mode = 'NONE');
alter table public.bookings add constraint bookings_table_no_overlap exclude using gist (
  table_id with =,
  tstzrange(start_datetime, end_datetime, '[)') with &&
) where (table_id is not null and status in ('PENDING', 'PAID', 'CONFIRMED', 'REQUESTED'));
alter table public.bookings add constraint bookings_joined_table_no_overlap exclude using gist (
  joined_table_id with =,
  tstzrange(start_datetime, end_datetime, '[)') with &&
) where (joined_table_id is not null and status in ('PENDING', 'PAID', 'CONFIRMED', 'REQUESTED'));

-- Helper internal: language sql, stable, set search_path = '', bukan definer, tanpa grant.
public.seats_in_use(p_merchant_id uuid, p_start timestamptz, p_end timestamptz, p_exclude uuid) returns integer
public.dining_table_busy(p_table_id uuid, p_start timestamptz, p_end timestamptz, p_exclude uuid) returns boolean
public.pick_dining_tables(
  p_merchant_id uuid, p_start timestamptz, p_end timestamptz, p_party integer,
  p_area_id uuid, p_table_id uuid, p_online boolean, p_exclude uuid
) returns table (table_id uuid, joined_table_id uuid, area_id uuid, table_label text)  -- 0 atau 1 baris

-- create_booking: argumen lama apa adanya (diharapkan sembilan, sampai p_voucher_code), ditambah:
  p_party_size integer default null,
  p_area_id uuid default null,
  p_table_id uuid default null,
  p_customer_note text default null
-- Hanya service_role yang boleh EXECUTE.

-- create_manual_booking: argumen lama ditambah
  p_party_size integer default null,
  p_table_id uuid default null,
  p_customer_note text default null
-- authenticated. Meneruskan ketiganya ke create_booking (p_area_id null).

-- move_booking_slot dan get_booked_ranges: signature dan kembalian sama.
```

  `seats_in_use` (algoritma Keputusan 7, tulis persis):

```sql
  with r as (
    select b.start_datetime as s, b.end_datetime as e, b.party_size as p
    from public.bookings b
    where b.merchant_id = p_merchant_id
      and b.capacity_mode <> 'NONE'
      and b.id is distinct from p_exclude
      and public.booking_holds_slot(b.status, b.expires_at)
      and tstzrange(b.start_datetime, b.end_datetime, '[)') && tstzrange(p_start, p_end, '[)')
  ), pts as (
    select p_start as t
    union
    select r.s from r where r.s > p_start
  )
  select coalesce(max((select coalesce(sum(r.p), 0) from r where r.s <= pts.t and r.e > pts.t)), 0)::integer
  from pts;
```

  - `dining_table_busy`: `exists` booking pemegang slot (`booking_holds_slot`), `id is distinct from p_exclude`, `(table_id = p_table_id or joined_table_id = p_table_id)`, rentang beririsan `[)`.
  - `pick_dining_tables`: aturan Keputusan 8, membaca `auto_join_tables` dari `merchant_settings` (tidak ada baris = `true`). `table_label` = nama meja, atau `a.name || ' + ' || b.name` untuk gabungan. `area_id` = area meja (pertama).
  - TS `Functions.create_booking.Args` + `p_party_size?: number | null; p_area_id?: string | null; p_table_id?: string | null; p_customer_note?: string | null`. `Functions.create_manual_booking.Args` + `p_party_size?: number | null; p_table_id?: string | null; p_customer_note?: string | null`.

Perubahan `create_booking` (di atas salinan terakhir; urutan penting, semua sesudah `pg_advisory_xact_lock` dan `reap_expired_bookings_for` yang sudah ada):
1. `select` layanan menambah `party_min, party_max, seat_duration_minutes`. Baca `table_mode, seats_per_slot` dari `merchant_settings` di kedua cabang (`ONLINE` dan `MANUAL`); tidak ada baris = `'NONE'`, null.
2. Jumlah tamu: bila `party_max` tidak null, `p_party_size` wajib dan `between party_min and party_max`, selain itu `raise ... using errcode = 'BK063'`; bila null, `v_party := null`.
3. `v_note := nullif(btrim(p_customer_note), '')`; lebih dari 300 karakter → `23514` dari constraint (tidak perlu cek sendiri).
4. `v_seat := v_table_mode <> 'NONE' and v_service.seat_duration_minutes is not null`.
5. Bila `v_seat`: `v_duration := seat_duration_minutes`; `v_end := start + v_duration`; staf dilewati seluruhnya (`v_staff_id := null`, `v_staff_name := null`); `slot_within_hours(p_merchant_id, null, ...)` gagal → `BK001`; lalu kapasitas:
   - `AREA`: `if v_party + public.seats_in_use(p_merchant_id, start, v_end, null) > v_seats_per_slot then raise ... 'BK060'`.
   - `TABLE`: `select * into v_pick from public.pick_dining_tables(p_merchant_id, start, v_end, v_party, p_area_id, p_table_id, p_source = 'ONLINE', null)`; tidak ada baris → `BK061` bila `p_table_id` diisi, selain itu `BK060`.
   - `v_capacity_mode := v_table_mode`.
6. Bila tidak `v_seat`: jalur staf dan jam kerja lama tidak berubah; `v_duration := duration_minutes`; `capacity_mode 'NONE'`; `p_area_id`, `p_table_id` diabaikan.
7. Insert menambah `duration_minutes = v_duration`, `end_datetime = v_end`, `party_size`, `area_id`, `table_id`, `joined_table_id`, `table_label`, `customer_note`, `capacity_mode`. Aturan cara bayar, voucher, batas per nomor, `BK035` manual tetap seperti salinan.

Perubahan `move_booking_slot` (salinan terakhir F4; pemanggil sudah memegang kunci): baca juga `capacity_mode, party_size, table_id, joined_table_id, area_id, source`. Setelah cek jam kerja:
- `AREA`: `party_size + seats_in_use(merchant, new_start, v_end, p_booking_id) > seats_per_slot` → `BK060` (seats_per_slot dibaca sekarang; null karena mode sudah berganti = tidak dibatasi).
- `TABLE`: bila `table_id` tidak null, meja itu dan `joined_table_id` (bila ada) tidak sibuk (dengan `p_exclude = p_booking_id`) → pertahankan. Selain itu `pick_dining_tables(merchant, new_start, v_end, party_size, area_id, null, source = 'ONLINE', p_booking_id)`; tidak ada → `BK060`; ada → update `table_id`, `joined_table_id`, `area_id`, `table_label` di update yang sama dengan jam.
- `NONE`: tidak berubah (`bookings_no_overlap` menangkap bentrok).

`get_booked_ranges`: salinan terakhir dengan tambahan `and b.capacity_mode = 'NONE'`. Komentar: rentang reservasi tidak menghalangi slot eksklusif, sama dengan predikat `bookings_no_overlap`.

- [ ] **Step 1: Tulis kasus uji yang gagal.** Merchant PRO `61616161-0000-0000-0000-000000000001` (username `resto-61`, jam 10:00 sampai 23:00 tiap hari, layanan "Reservasi meja" `ON_SITE` harga 0, rentang 1 sampai 12, `seat_duration_minutes = 90`; layanan "Paket" `ON_SITE` 120 menit rentang 15 sampai 25 tanpa `seat_duration`; layanan biasa 60 menit). Area "Dalam" dengan meja `T1` (2 sampai 4, online), `T2` (2 sampai 4, online, `joinable_with = {T1}`), `T3` (4 sampai 6, offline). Merchant kedua `...0002` (username `resto-61b`, STUDIO, staf A dan B, `table_mode` tetap `NONE`) untuk regresi. Panggilan lewat `service_role`, jam dari `pg_temp.jakarta_future`. Bagian 61:
  - t61a regresi `...0002`: dua booking beririsan untuk staf A → yang kedua `23P01`; "siapa saja" jatuh ke B; `get_booked_ranges('resto-61b', ...)` mengembalikan baris yang sama seperti sebelum migration (bandingkan jumlah dan staf); `capacity_mode = 'NONE'`.
  - t61b `NONE` di `...0001` (layanan "Reservasi meja" punya `duration_minutes = 60`): dua kali di jam sama → yang kedua `23P01`; `party_size` tersimpan, `capacity_mode = 'NONE'`, `end - start = 60 menit` (di `NONE` durasi tetap `duration_minutes`, Keputusan 2). Tanpa `p_party_size` → `BK063`; `p_party_size = 13` → `BK063`.
  - t61c `AREA`, `seats_per_slot = 10`: dua reservasi 4 orang di 19:00 diterima (`capacity_mode = 'AREA'`, `end - start = 90 menit`, `staff_id` null); reservasi 4 orang ketiga di 19:00 → `BK060`; 2 orang diterima; "Paket" di 19:00 diterima (slot eksklusif tidak memakai kursi); layanan biasa di 19:00 diterima.
  - t61d beban puncak (Review Focus 5): reset, `seats_per_slot = 10`, reservasi 6 orang 18:00 dan 6 orang 19:30, lalu 4 orang 19:00 diterima; 5 orang 19:00 → `BK060`.
  - t61e `TABLE`, `auto_join_tables = true`: 4 orang 19:00 tanpa pilihan → `T1`, `table_label = 'T1'`, `area_id` = Dalam; kedua → `T2`; ketiga online → `BK060` (`T3` offline); `MANUAL` lewat `create_manual_booking` sebagai `authenticated` → `T3`. Di 21:00: `p_table_id = T1` diterima; `p_table_id = T1` lagi → `BK061`; 1 orang `p_table_id = T3` (min 4) → `BK061`. Di 12:00: 7 orang → `T1 + T2`, `joined_table_id = T2`, `table_label = 'T1 + T2'`; setelah `auto_join_tables = false`, 7 orang di 14:00 → `BK060`.
  - t61f cadangan constraint: insert langsung dua baris `TABLE` dengan `table_id = T1` beririsan → `23P01`; dua baris `joined_table_id = T2` beririsan → `23P01`; dua baris `AREA` beririsan → keduanya `expect_ok`.
  - t61g `get_booked_ranges('resto-61', ...)` di hari t61c memuat booking "Paket" dan layanan biasa, tidak memuat booking `AREA` atau `TABLE`.
  - t61h hak akses: anon dan authenticated tidak bisa EXECUTE `create_booking` signature baru (13 argumen), signature lama `to_regprocedure(...) is null`; authenticated bisa EXECUTE `create_manual_booking` baru, signature lamanya hilang; anon/authenticated tidak bisa EXECUTE `seats_in_use`, `dining_table_busy`, `pick_dining_tables`.
  Bagian 62 (pindah jadwal; panggil `reschedule_booking_by_merchant` sebagai `authenticated` merchant `...0001`):
  - t62a `TABLE` 4 orang di `T1` 19:00 dipindah ke 20:00 saat `T1` kosong → tetap `T1`.
  - t62b dipindah ke jam yang `T1` sudah dipegang booking lain dan `T2` kosong → `table_id = T2`, `table_label = 'T2'`.
  - t62c dipindah ke jam yang semua meja online cocok terisi (booking ONLINE) → `BK060`, jam dan meja lama tidak berubah.
  - t62d dipindah 30 menit (beririsan dengan dirinya sendiri) → diterima, meja tetap.
  - t62e `AREA` (`seats_per_slot = 8`): pindah ke jam berisi 6 kursi lain dengan 4 orang → `BK060`; ke jam kosong → diterima.
- [ ] **Step 2: Jalankan** `npm run docker:test`. Harapan: `FAIL` di bagian 61 dan 62.
- [ ] **Step 3: Tulis migration** sesuai Interfaces. Komentar kepala menjelaskan Keputusan 5, 6, 7 dan bahwa semua penulis kapasitas memegang kunci merchant. Grant: tiga helper dicabut dari `public, anon, authenticated`; `create_booking` baru dicabut lalu `grant execute ... to service_role`; `create_manual_booking` baru dicabut dari `public, anon` lalu `grant ... to authenticated`; `move_booking_slot` tetap tanpa grant; `get_booked_ranges` ulangi `grant execute ... to anon, authenticated`.
- [ ] **Step 4: Jalankan** `npm run docker:test`. Harapan: tidak ada `FAIL` di seluruh output.
- [ ] **Step 5: Perbarui `Args`** di `database.ts`; `npm run typecheck`.
- [ ] **Step 6: Commit**: `git add supabase/migrations/20261120000200_seat_capacity.sql supabase/tests/99_verify.sql src/types/database.ts` lalu `git commit -m "Hitung kapasitas kursi dan meja di create_booking dan pindah jadwal"`.

---

### Task 3: RPC baca untuk pelanggan dan RPC simpan denah

Model: opus (kapasitas dan kunci denah).

**Files:**
- Create: `supabase/migrations/20261120000300_dining_reads_and_layout.sql`
- Modify: `supabase/tests/99_verify.sql` (bagian `-- 63. Restoran: ketersediaan publik (20261120000300)` dan `-- 64. Restoran: simpan denah (20261120000300)`), `src/types/database.ts` (`Functions`)

**Interfaces:**
- Consumes: helper Task 2.
- Produces:

```sql
-- security definer, stable, set search_path = '', grant execute to anon, authenticated.
public.get_seat_availability(
  p_username text, p_service_id uuid, p_party_size integer, p_area_id uuid, p_starts timestamptz[]
) returns table (start_datetime timestamptz, available boolean, tables_left integer)

public.get_table_status(
  p_username text, p_service_id uuid, p_start timestamptz, p_party_size integer
) returns table (table_id uuid, status text)  -- 'FREE' | 'TAKEN' | 'TOO_SMALL' | 'TOO_LARGE'

-- security definer, volatile, set search_path = '', grant execute to authenticated saja.
public.save_dining_layout(p_areas jsonb, p_tables jsonb) returns void
```

  - `get_seat_availability`: `cardinality(p_starts) > 96` atau `p_party_size` di luar 1 sampai 200 → `raise ... using errcode = '22023'`. Merchant (ber-username), layanan aktif miliknya, layanan reservasi, dan `table_mode <> 'NONE'`; selain itu kembalian kosong. Jumlah tamu di luar rentang layanan → semua `available = false`. Per `start` (`end = start + seat_duration_minutes`; `start <= now()` → `false`): `AREA` → `available = party + seats_in_use(...) <= seats_per_slot`, `tables_left` null. `TABLE` → `available = exists pick_dining_tables(..., p_area_id, null, true, null)`, `tables_left` = jumlah meja online (di area bila diisi) dengan `min_seats <= party <= max_seats` dan tidak sibuk. Tidak memeriksa jam buka (pemanggil membuat kandidat dari jam buka).
  - `get_table_status`: hanya mode `TABLE` dan layanan reservasi, selain itu kosong. Semua meja online merchant: `TAKEN` bila sibuk di `[p_start, p_start + seat_duration)`, lain `TOO_SMALL` bila `max_seats < party`, `TOO_LARGE` bila `min_seats > party`, lain `FREE`.
  - `save_dining_layout`: payload `p_areas = [{ "id", "name", "sort_order" }]`, `p_tables = [{ "id", "area_id", "name", "min_seats", "max_seats", "shape", "grid_x", "grid_y", "grid_w", "grid_h", "note", "bookable_online", "joinable_with": [uuid], "sort_order" }]` (id dibuat klien, `crypto.randomUUID()`). Urutan: `auth.uid()` null → `42501`; `pg_advisory_xact_lock(hashtext(merchant::text))`; lebih dari 10 area atau 100 meja, nama area/meja ganda (`lower(btrim(name))`), `area_id` meja tidak ada di payload area, `joinable_with` berisi id yang bukan meja payload di area yang sama → `BK064`; id area/meja yang sudah ada milik merchant lain → `42501`; meja yang akan hilang (tidak di payload) dengan booking pemegang slot `end_datetime > now()` lewat `table_id` atau `joined_table_id` → `BK062`; lalu hapus meja dan area yang tidak di payload, upsert area, upsert meja (`on conflict (id) do update`), semuanya dalam satu panggilan. Pelanggaran check → `23514` apa adanya; json salah tipe → `22P02` apa adanya.
  - TS `Functions`: `get_seat_availability: { Args: { p_username: string; p_service_id: string; p_party_size: number; p_area_id?: string | null; p_starts: string[] }; Returns: { start_datetime: string; available: boolean; tables_left: number | null }[] }`, `get_table_status: { Args: { p_username: string; p_service_id: string; p_start: string; p_party_size: number }; Returns: { table_id: string; status: "FREE" | "TAKEN" | "TOO_SMALL" | "TOO_LARGE" }[] }`, `save_dining_layout: { Args: { p_areas: Json; p_tables: Json }; Returns: undefined }`.

- [ ] **Step 1: Tulis kasus uji yang gagal** (pakai ulang data bagian 61 atau buat merchant `63636363-...` dan `64646464-...` dengan pola sama):
  - t63a `AREA` kapasitas 10 dengan 8 kursi terpakai di 19:00: `get_seat_availability(..., 2, null, array[19:00, 21:00])` dua-duanya `true`; dengan 3 orang 19:00 `false`, 21:00 `true`.
  - t63b `TABLE`: setelah T1 dan T2 terisi di 19:00, 4 orang di 19:00 `available = false` (T3 offline), di 21:00 `true` dengan `tables_left = 2`.
  - t63c `get_table_status` di 19:00 untuk 4 orang: T1 dan T2 `TAKEN`, T3 tidak muncul (offline); meja 1 sampai 2 kursi `TOO_SMALL`; meja 6 sampai 8 `TOO_LARGE`.
  - t63d `cardinality = 97` → `22023`; username tidak dikenal → 0 baris; layanan bukan reservasi → 0 baris; `table_mode = 'NONE'` → 0 baris.
  - t63e anon dan authenticated bisa EXECUTE kedua RPC baca; kolom kembalian persis `start_datetime, available, tables_left` dan `table_id, status` (cek `pg_get_function_result`).
  - t64a sebagai `authenticated` merchant `...0001`: simpan 2 area dan 3 meja, lalu simpan lagi dengan satu meja diganti nama, satu dihapus, satu baru → isi tabel persis payload kedua; tukar nama dua meja dalam satu simpan berhasil.
  - t64b `BK064`: 11 area; nama meja ganda beda huruf besar; `joinable_with` ke meja area lain. `42501`: id meja milik `...0002`; tanpa klaim sub.
  - t64c meja dengan booking `CONFIRMED` minggu depan dihapus dari payload → `BK062`, dan perubahan lain di payload yang sama tidak tersimpan; meja yang hanya punya booking lampau terhapus, booking lama `table_id` null dan `table_label` tetap.
  - t64d anon tidak bisa EXECUTE `save_dining_layout`, authenticated bisa.
- [ ] **Step 2: Jalankan** `npm run docker:test`, harapan `FAIL` di bagian 63 dan 64.
- [ ] **Step 3: Tulis migration**, lalu jalankan lagi: tidak ada `FAIL`.
- [ ] **Step 4: Perbarui `Functions`** di `database.ts`, `npm run typecheck`.
- [ ] **Step 5: Commit**: `git add supabase/migrations/20261120000300_dining_reads_and_layout.sql supabase/tests/99_verify.sql src/types/database.ts` lalu `git commit -m "Tambah RPC ketersediaan meja publik dan simpan denah atomik"`.

---

### Task 4: Modul murni reservasi dan kode error

Model: haiku (kode lengkap di rencana).

**Files:**
- Create: `src/lib/booking/reservation.ts`, `src/lib/booking/reservation.test.ts`
- Modify: `src/lib/booking/errors.ts`, `src/lib/booking/errors.test.ts`

**Interfaces:**
- Consumes: tipe Task 1.
- Produces: semua ekspor di kode di bawah, plus tiga entri `errors.ts`.

- [ ] **Step 1: Tulis tes yang gagal** `src/lib/booking/reservation.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  holdSentence,
  isSeatService,
  moveTableByKey,
  partyRangeLabel,
  remainingLabel,
  seatRangeLabel,
  tableAriaLabel,
} from "./reservation";

const seat = { party_min: 1, party_max: 12, seat_duration_minutes: 90 };
const plain = { party_min: null, party_max: null, seat_duration_minutes: null };

test("isSeatService hanya bila mode menyala dan lama duduk terisi", () => {
  assert.equal(isSeatService(seat, "TABLE"), true);
  assert.equal(isSeatService(seat, "AREA"), true);
  assert.equal(isSeatService(seat, "NONE"), false);
  assert.equal(isSeatService(plain, "TABLE"), false);
});

test("label rentang tamu dan kursi tanpa tanda pisah", () => {
  assert.equal(partyRangeLabel(seat), "Untuk 1 sampai 12 orang");
  assert.equal(partyRangeLabel({ party_min: 4, party_max: 4 }), "Untuk 4 orang");
  assert.equal(partyRangeLabel(plain), null);
  assert.equal(seatRangeLabel(4, 6), "4 sampai 6 kursi");
  assert.equal(seatRangeLabel(2, 2), "2 kursi");
});

test("remainingLabel hanya untuk sisa 1 sampai 3", () => {
  assert.equal(remainingLabel(null), null);
  assert.equal(remainingLabel(4), null);
  assert.equal(remainingLabel(2), "Sisa 2 meja");
  assert.equal(remainingLabel(0), null);
});

test("holdSentence", () => {
  assert.equal(holdSentence(15), "Meja ditahan 15 menit dari jam datang.");
  assert.equal(holdSentence(0), null);
});

test("tableAriaLabel memuat nama, kursi, catatan, dan status", () => {
  assert.equal(
    tableAriaLabel({ name: "D5", min_seats: 4, max_seats: 6, note: "tengah ruangan" }, "FREE", true),
    "Meja D5, 4 sampai 6 kursi, tengah ruangan, dipilih",
  );
  assert.equal(
    tableAriaLabel({ name: "D2", min_seats: 2, max_seats: 2, note: null }, "TAKEN", false),
    "Meja D2, 2 kursi, terisi",
  );
});

test("moveTableByKey bergeser satu sel dan tidak keluar kanvas", () => {
  const t = { grid_x: 0, grid_y: 5, grid_w: 3, grid_h: 3 };
  assert.deepEqual(moveTableByKey(t, "ArrowRight"), { ...t, grid_x: 1 });
  assert.deepEqual(moveTableByKey(t, "ArrowLeft"), t);
  assert.deepEqual(moveTableByKey({ ...t, grid_x: 21 }, "ArrowRight"), { ...t, grid_x: 21 });
  assert.deepEqual(moveTableByKey({ ...t, grid_y: 19 }, "ArrowDown"), { ...t, grid_y: 19 });
  assert.equal(moveTableByKey(t, "Enter"), null);
});
```

  Tambahkan juga (impor `bookingErrorStep`):

```ts
test("bookingErrorStep mengarahkan pelanggan ke langkah yang bisa memperbaiki", () => {
  assert.equal(bookingErrorStep("BK061"), "meja");
  assert.equal(bookingErrorStep("BK060"), "jadwal");
  assert.equal(bookingErrorStep("23P01"), "jadwal");
  assert.equal(bookingErrorStep("P0006"), "jadwal");
  assert.equal(bookingErrorStep("BK063"), null);
  assert.equal(bookingErrorStep(undefined), null);
});
```

  Di `errors.test.ts` tambahkan: `mapBookingError("BK060").status === 409`, `mapBookingError("BK061").status === 409`, `mapBookingError("BK063").status === 422`.
- [ ] **Step 2: Jalankan** `npx tsx --test src/lib/booking/reservation.test.ts src/lib/booking/errors.test.ts` → FAIL.
- [ ] **Step 3: Tulis `src/lib/booking/reservation.ts`**:

```ts
import type { DiningTableShape, Service, TableMode } from "@/types/database";

/** Jarak antar jam mulai layanan reservasi (menit). Keputusan 11 F8. */
export const SEAT_SLOT_STEP_MINUTES = 30;
/** Ukuran kanvas denah dalam sel; wajib sama dengan constraint dining_tables_grid. */
export const FLOOR_COLS = 24;
export const FLOOR_ROWS = 22;
export const TABLE_MIN_CELLS = 3;
export const TABLE_MAX_CELLS = 12;
export const MAX_CUSTOMER_NOTE = 300;

export type TableStatus = "FREE" | "TAKEN" | "TOO_SMALL" | "TOO_LARGE";

export const TABLE_STATUS_LABEL: Record<TableStatus, string> = {
  FREE: "Tersedia",
  TAKEN: "Terisi",
  TOO_SMALL: "Kurang kursi",
  TOO_LARGE: "Untuk rombongan lebih besar",
};

/** Satu meja di pemilih pelanggan (respons GET /api/tables). */
export type PickerTable = {
  id: string;
  areaId: string;
  name: string;
  minSeats: number;
  maxSeats: number;
  shape: DiningTableShape;
  x: number;
  y: number;
  w: number;
  h: number;
  note: string | null;
  status: TableStatus;
};

export type TablePickerData = { areas: { id: string; name: string }[]; tables: PickerTable[] };

type GridBox = { grid_x: number; grid_y: number; grid_w: number; grid_h: number };

/** Layanan memakai kursi/meja bila mode restoran menyala dan lama duduk terisi (Keputusan 2). */
export function isSeatService(
  service: Pick<Service, "seat_duration_minutes">,
  tableMode: TableMode,
): boolean {
  return tableMode !== "NONE" && service.seat_duration_minutes !== null;
}

export function partyRangeLabel(service: Pick<Service, "party_min" | "party_max">): string | null {
  if (service.party_min === null || service.party_max === null) return null;
  return service.party_min === service.party_max
    ? `Untuk ${service.party_max} orang`
    : `Untuk ${service.party_min} sampai ${service.party_max} orang`;
}

export function seatRangeLabel(min: number, max: number): string {
  return min === max ? `${max} kursi` : `${min} sampai ${max} kursi`;
}

export function remainingLabel(remaining: number | null): string | null {
  return remaining !== null && remaining >= 1 && remaining <= 3 ? `Sisa ${remaining} meja` : null;
}

export function holdSentence(minutes: number): string | null {
  return minutes > 0 ? `Meja ditahan ${minutes} menit dari jam datang.` : null;
}

export function tableAriaLabel(
  table: { name: string; min_seats: number; max_seats: number; note: string | null },
  status: TableStatus,
  selected: boolean,
): string {
  const parts = [`Meja ${table.name}`, seatRangeLabel(table.min_seats, table.max_seats)];
  if (table.note) parts.push(table.note);
  parts.push(selected && status === "FREE" ? "dipilih" : TABLE_STATUS_LABEL[status].toLowerCase());
  return parts.join(", ");
}

const KEY_DELTA: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** Geser satu sel dengan tombol panah; null bila tombol lain. Tidak pernah keluar kanvas. */
export function moveTableByKey<T extends GridBox>(table: T, key: string): T | null {
  const delta = KEY_DELTA[key];
  if (!delta) return null;
  const grid_x = Math.min(Math.max(table.grid_x + delta[0], 0), FLOOR_COLS - table.grid_w);
  const grid_y = Math.min(Math.max(table.grid_y + delta[1], 0), FLOOR_ROWS - table.grid_h);
  return { ...table, grid_x, grid_y };
}

/** Langkah alur reservasi yang dibuka lagi setelah POST /api/bookings gagal dengan `code` ini. */
export function bookingErrorStep(code: string | undefined): "meja" | "jadwal" | null {
  if (code === "BK061") return "meja";
  if (code === "BK060" || code === "23P01" || code === "P0006") return "jadwal";
  return null;
}
```

  Di `errors.ts` tambahkan ke `ERROR_MAP` (dengan komentar satu baris sumbernya seperti entri lain):
  - `BK060`: `{ status: 409, message: "Tempat untuk jumlah tamu ini sudah penuh di jam tersebut, silakan pilih jam lain." }`
  - `BK061`: `{ status: 409, message: "Meja yang dipilih sudah terisi atau tidak cocok untuk jumlah tamu ini. Pilih meja lain atau Pilihkan untuk saya." }`
  - `BK063`: `{ status: 422, message: "Jumlah tamu di luar batas layanan ini." }`
- [ ] **Step 4: Jalankan lagi** → PASS, lalu `npm run typecheck`.
- [ ] **Step 5: Commit**: `git add src/lib/booking/reservation.ts src/lib/booking/reservation.test.ts src/lib/booking/errors.ts src/lib/booking/errors.test.ts` lalu `git commit -m "Tambah aturan murni reservasi meja dan kode error kapasitas"`.

---

### Task 5: API slot reservasi, status meja, dan booking

Model: sonnet.

**Files:**
- Modify: `src/lib/booking/slots.ts`, `src/lib/booking/slots.test.ts`, `src/app/api/slots/route.ts`, `src/app/api/bookings/route.ts`, `src/lib/validations/booking.ts`, `src/lib/validations/booking.test.ts`
- Create: `src/app/api/tables/route.ts`

**Interfaces:**
- Consumes: RPC Task 2 dan 3, `isSeatService`, `SEAT_SLOT_STEP_MINUTES`, `TablePickerData`, `TableStatus` (Task 4).
- Produces:
  - `computeFreeSlots` param baru `stepMinutes?: number` (default `durationMinutes`, perilaku lama).
  - `export type SeatSlot = FreeSlot & { remaining: number | null }` di `slots.ts`.
  - `GET /api/slots?username=&serviceId=&date=&staffId=&party=&areaId=`: `party` (int 1 sampai 200) wajib bila layanan punya `party_max`, selain itu diabaikan (400 bila wajib tapi kosong). Layanan reservasi (`isSeatService` dengan `merchant_settings.table_mode`): kandidat dari `computeFreeSlots({ durationMinutes: seat_duration_minutes, stepMinutes: SEAT_SLOT_STEP_MINUTES, availability, bookedRanges: [] })`, lalu satu `rpc("get_seat_availability", { p_username, p_service_id, p_party_size, p_area_id, p_starts })`, kembalikan `{ slots: SeatSlot[] }` hanya yang `available`. Jalur lama tidak berubah selain `remaining: null` tidak ditambahkan (bentuk respons lama tetap `FreeSlot[]`).
  - `GET /api/tables?username=&serviceId=&start=&party=` (`createPublicClient`): 200 `TablePickerData` dari `dining_areas`, `dining_tables` (urut `sort_order, name`), dan `rpc("get_table_status")`; meja tanpa baris status dibuang. 400 untuk parameter salah, 404 merchant/layanan tidak ada, 500 gagal muat (log `[api/tables]`).
  - `checkoutSchema` dan `createBookingRequestSchema` + `partySize: z.number().int().min(1).max(200).nullable().default(null)`, `areaId: z.uuid().nullable().default(null)`, `tableId: z.uuid().nullable().default(null)`, `customerNote: z.string().trim().max(300, "Catatan maksimal 300 karakter").transform((v) => v || null).nullable().default(null)`.
  - `POST /api/bookings` meneruskan `p_party_size`, `p_area_id`, `p_table_id`, `p_customer_note`. Respons sukses tidak berubah. Respons galat yang berasal dari `mapBookingError` menambah `code` (errcode yang dipetakan, mis. `"BK061"`) di samping `error`; galat lain tanpa `code`. Pesan Postgres mentah tetap tidak pernah dikirim.

- [ ] **Step 1: Tulis tes yang gagal.** `slots.test.ts`: `computeFreeSlots` jam 17:00 sampai 22:00, durasi 90, `stepMinutes: 30` menghasilkan label pertama `17:00`, kedua `17:30`, terakhir `20:30`; tanpa `stepMinutes` hasilnya sama dengan sebelumnya (`17:00`, `18:30`, `20:00`). `booking.test.ts`: `createBookingRequestSchema` menerima body lama tanpa field baru (keempatnya null), mengubah `customerNote: "  "` jadi null, menolak `partySize: 0` dan `customerNote` 301 karakter.
- [ ] **Step 2: Jalankan** `npm run test:unit` → FAIL.
- [ ] **Step 3: Implementasikan** sesuai Interfaces. `/api/slots` membaca `merchant_settings.table_mode` lewat klien publik (grant Task 1); tidak ada baris = `NONE`. Komentar kepala `/api/slots` ditambah satu paragraf: layanan reservasi tidak memakai `get_booked_ranges` (Keputusan 5 F8).
- [ ] **Step 4: Jalankan** `npm run test:unit && npm run typecheck && npm run lint` → lulus.
- [ ] **Step 5: Commit**: `git add src/lib/booking/slots.ts src/lib/booking/slots.test.ts src/app/api/slots/route.ts src/app/api/tables/route.ts src/app/api/bookings/route.ts src/lib/validations/booking.ts src/lib/validations/booking.test.ts` lalu `git commit -m "Tambah jalur slot reservasi, status meja, dan field reservasi di booking"`.

---

### Task 6: Komponen publik reservasi

Model: sonnet.

**Files:**
- Create: `src/components/booking-page/guest-stepper.tsx`, `table-picker.tsx`, `reservation-card.tsx`, dan story masing-masing
- Modify: `src/components/booking-page/step-indicator.tsx`, `time-slot-picker.tsx`, `fixtures.ts`, `booking-steps.stories.tsx`

**Interfaces:**
- Consumes: Task 4 (`TablePickerData`, `PickerTable`, `TableStatus`, `TABLE_STATUS_LABEL`, `tableAriaLabel`, `seatRangeLabel`, `partyRangeLabel`, `holdSentence`, `remainingLabel`, `FLOOR_COLS`, `FLOOR_ROWS`), `SeatSlot` (Task 5).
- Produces:
  - `BookingStepIndicator({ current, labels }: { current: number; labels?: readonly string[] })`; default `labels` tetap `["Layanan", "Jadwal", "Data diri"]`.
  - `TimeSlotPicker` menerima slot dengan `remaining?: number | null` dan menampilkan `remainingLabel` di bawah jam (tetap satu radio per slot; label aksesibel "19.00, sisa 2 meja").
  - `GuestStepper({ value, min, max, onChange, hint }: { value: number; min: number; max: number; onChange: (n: number) => void; hint?: string | null })`: label "Jumlah tamu", tombol kurang/tambah `aria-label` "Kurangi tamu"/"Tambah tamu" dinonaktifkan di batas, `<output aria-live="polite">`.
  - `ReservationCard({ title, partyLabel, holdText, paymentLabel, onStart }: { title: string; partyLabel: string | null; holdText: string | null; paymentLabel: string; onStart: () => void })`: R1, tombol "Pilih tanggal dan jam".
  - `TablePicker({ data, state, mode, selectedTableId, guests, onModeChange, onSelect, onRetry }: { data: TablePickerData | null; state: "loading" | "ready" | "error"; mode: "auto" | "pick"; selectedTableId: string | null; guests: number; onModeChange: (m: "auto" | "pick") => void; onSelect: (tableId: string) => void; onRetry: () => void })`.

Ketentuan `TablePicker` (R2b):
- `role="radiogroup"` "Cara memilih meja": "Pilihkan untuk saya" / "Restoran memberi meja terbaik untuk {guests} orang." dan "Pilih meja sendiri" / "Lihat denah dan pilih posisi favorit.".
- Mode `pick`: tab area (`role="tablist"`, hanya bila 2 area atau lebih), tombol "Lihat daftar"/"Lihat denah" (`aria-pressed`), keterangan (Tersedia, Dipilih, Terisi, Kurang kursi) dengan pola selain warna (garis putus untuk tidak cocok, arsir untuk terisi).
- Denah: kanvas `aspect-ratio: 24 / 22`, meja `position: absolute` dengan `left/top/width/height` persen dari `FLOOR_COLS`/`FLOOR_ROWS`, `ROUND` = `rounded-full`. Setiap meja `<button aria-pressed aria-label={tableAriaLabel(...)}>` berisi nama dan kursi; status selain `FREE` → `aria-disabled="true"` (tetap bisa difokus dan dibaca, klik diabaikan).
- Daftar: `<ul>` dengan satu tombol per meja (nama, kursi, catatan, status teks), isi dan urutannya sama dengan denah. Ini alternatif setara untuk pembaca layar dan layar kecil.
- Ringkasan `aria-live="polite"`: "Dipilihkan restoran", "{nama}, {kursi}", atau "Pilih satu meja".
- Keadaan memuat, gagal (tombol "Coba lagi"), dan kosong ("Belum ada meja yang bisa dipesan online. Pilihkan untuk saya tetap bisa dipakai.").
- Semua warna dari token tema; tidak ada hex di komponen.

- [ ] **Step 1: Tulis story** untuk tiap komponen: `GuestStepper` (di batas min, di tengah, di batas max), `ReservationCard` (dengan dan tanpa kalimat tahan meja), `TablePicker` (auto, pilih di denah dengan meja terpilih, daftar, satu area, memuat, gagal, kosong) memakai data contoh dari `fixtures.ts` (`fixtureTablePicker: TablePickerData` diadaptasi dari data `ResMeja.dc.html`: Dalam D1 sampai D8, Teras T1 sampai T4), `TimeSlotPicker` dengan catatan sisa, `BookingStepIndicator` dengan label `["Jadwal", "Meja", "Data diri"]`. Tiga tema (Hangat, Malam, Berani) seperti story tetangga.
- [ ] **Step 2: Implementasikan** komponen sesuai Interfaces dan Ketentuan.
- [ ] **Step 3: Verifikasi** `npm run typecheck && npm run lint`, buka Storybook (`npm run storybook`) di 390px dan 1280px: addon a11y tanpa pelanggaran, Tab mencapai setiap meja di denah dan daftar, meja terisi diumumkan "terisi".
- [ ] **Step 4: Commit**: `git add src/components/booking-page` lalu `git commit -m "Tambah komponen jumlah tamu, kartu reservasi, dan pemilih meja"`.

---

### Task 7: Alur reservasi pelanggan dan halaman booking saya

Model: sonnet.

**Files:**
- Modify: `src/app/[username]/page.tsx`, `booking-page-view.tsx` dan story-nya, `booking-flow.tsx`, `src/app/dashboard/halaman/preview-frame.tsx`, `src/app/pesanan/[token]/page.tsx`, `booking-status-view.tsx` dan story-nya, komponen ubah jadwal pelanggan F4 di `src/app/pesanan/[token]/` (yang memanggil `/api/slots`)

**Interfaces:**
- Consumes: Task 4, 5, 6.
- Produces: `BookingFlowProps` dan `BookingPageViewProps` + `restaurant: { tableMode: TableMode; holdMinutes: number; areas: { id: string; name: string }[] }` (default `{ tableMode: "NONE", holdMinutes: 15, areas: [] }` dari `page.tsx`; `areas` hanya dimuat bila `TABLE`).

Ketentuan:
- R1: layanan reservasi (`isSeatService`) tampil sebagai `ReservationCard` di atas daftar layanan lain; `onStart` memilih layanan itu dan masuk langkah Jadwal. Layanan lain tidak berubah.
- `Step` di `BookingFlow` bertambah `"meja"` (`STEP_PARAM` `"meja"`), hanya untuk layanan reservasi di mode `TABLE`. Indikator untuk layanan reservasi memakai label `["Jadwal", "Meja", "Data diri"]` (`TABLE`) atau `["Jadwal", "Data diri"]` (`AREA`). Penanganan `popstate`/batas langkah maksimum yang ada diperluas, bukan diganti.
- Jadwal (R2): `GuestStepper` muncul untuk layanan apa pun yang punya `party_max` (awal = `party_min`, `hint` "Lebih dari {max}? Lihat layanan lain." hanya bila ada layanan lain). Layanan reservasi: tanpa pemilih staf, chip "Area (opsional)" (Bebas + nama area) di `TABLE` bila 2 area atau lebih, `/api/slots` dengan `party` dan `areaId`. Ganti jumlah tamu, tanggal, atau area mengosongkan jam terpilih dan memuat ulang slot.
- Meja (R2b): `GET /api/tables` untuk jam terpilih; default mode `auto`. Lanjut tanpa meja di mode `pick` dinonaktifkan dengan ringkasan "Pilih satu meja".
- Data diri (R3): baris ringkasan "{n} orang" plus "Meja {nama}" bila dipilih sendiri, tombol "Ubah" kembali ke Jadwal; field "Catatan (opsional)" `maxLength` 300 untuk layanan ber-`party_max`; bila `amount_due_now` 0: "Tidak perlu bayar sekarang." dan `holdSentence(holdMinutes)` untuk layanan reservasi. Kirim mengirim `partySize`, `areaId`, `tableId` (hanya mode `pick`), `customerNote`. Tombol "Kirim reservasi" untuk layanan reservasi.
- Galat kirim: `submitCheckout` membawa `code` dari respons; toast pesan server, lalu `bookingErrorStep(code)`: `"meja"` → kembali ke langkah Meja, muat ulang status meja, pilihan meja dikosongkan; `"jadwal"` → kembali ke Jadwal dan muat ulang slot; `null` → tetap di Data diri.
- R4 dan `/pesanan/[token]`: baca `party_size, table_label, customer_note, capacity_mode`. Bila `party_size`: baris "Meja untuk {n} orang" (`capacity_mode <> 'NONE'`) atau "{n} orang"; "Meja {table_label}" bila ada; "Catatan" bila ada. Judul `CONFIRMED` dengan `capacity_mode <> 'NONE'` jadi "Meja sudah dipesan". Story baru: reservasi `CONFIRMED` dengan meja dan catatan, `REQUESTED` tanpa meja.
- Ubah jadwal pelanggan F4: panggilan `/api/slots` menambah `party=<party_size>` bila booking punya `party_size`.
- `preview-frame.tsx` meneruskan `restaurant` default supaya pratinjau `/dashboard/halaman` tetap jalan.

- [ ] **Step 1: Tulis story** `booking-page-view.stories.tsx`: restoran mode `TABLE` (R1 dengan kartu reservasi dan paket), mode `AREA`. `booking-status-view.stories.tsx`: dua story di Ketentuan.
- [ ] **Step 2: Implementasikan** sesuai Ketentuan.
- [ ] **Step 3: Verifikasi** `npm run typecheck && npm run lint && npm run test:unit`, story di 390px dan 1280px; alur lama (layanan biasa, Studio dengan staf) tidak berubah di story yang ada.
- [ ] **Step 4: Commit**: `git add "src/app/[username]" src/app/dashboard/halaman/preview-frame.tsx src/app/pesanan` lalu `git commit -m "Tambah alur reservasi meja di halaman publik dan halaman booking saya"`.

---

### Task 8: Halaman Denah meja (kapasitas), nav, dan field layanan

Model: sonnet.

**Files:**
- Create: `src/app/dashboard/denah/page.tsx`, `capacity-settings-form.tsx` (+ story), `actions.ts`, `src/lib/validations/dining.ts`, `src/lib/validations/dining.test.ts`
- Modify: `src/lib/routes.ts` (`floorPlan: "/dashboard/denah"`), `src/components/layout/app-sidebar.tsx`, `src/components/layout/mobile-nav.tsx` (bila punya daftar menu lengkap), story sidebar, `src/lib/validations/service.ts`, `src/lib/validations/service.test.ts`, `src/app/dashboard/services/actions.ts`, `service-form-dialog.tsx`, `services/page.tsx`

**Interfaces:**
- Consumes: Task 1 kolom dan grant; `requireMerchant()` dari `src/lib/auth/session.ts`.
- Produces:
  - `capacitySettingsSchema` di `dining.ts`: `{ tableMode: z.enum(["NONE", "AREA", "TABLE"]), seatsPerSlot: z.coerce.number().int().min(1).max(1000).nullable(), tableHoldMinutes: z.coerce.number().int().min(0).max(120), autoJoinTables: z.boolean() }` dengan `refine`: `AREA` mewajibkan `seatsPerSlot` (pesan "Isi kapasitas kursi per jam").
  - `saveCapacitySettings(input: z.input<typeof capacitySettingsSchema>): Promise<{ ok: true } | { ok: false; error: string }>` di `src/app/dashboard/denah/actions.ts` (klien `createClient`, update `merchant_settings` milik sendiri, `revalidatePath` halaman ini dan halaman publik merchant).
  - `serviceSchema` + `partyMin`, `partyMax` (int 1 sampai 200, keduanya atau tidak sama sekali, min <= max), `seatDurationMinutes` (int 15 sampai 480, mewajibkan rentang tamu), pesan Indonesia per field.

Ketentuan:
- Nav: "Denah meja" di grup "Atur usaha" setelah "Jam buka", ikon `LayoutGrid` dari `lucide-react` (Keputusan 18).
- Halaman: judul "Denah meja", deskripsi "Atur area dan meja agar reservasi tidak melebihi tempat yang ada.". Form Kapasitas: radio "Cara menghitung reservasi": "Mati" ("Setiap jam hanya untuk satu booking, seperti layanan biasa."), "Total kursi per jam" ("Reservasi dibatasi jumlah kursi, tanpa denah."; input "Kapasitas per jam" kursi), "Pakai denah meja" ("Marky menghitung per meja. Pelanggan bisa memilih meja atau dipilihkan."). Untuk `AREA` dan `TABLE`: "Meja ditahan jika telat" (menit); untuk `TABLE`: centang "Gabung meja otomatis untuk rombongan". Saat mode diubah dari nilai tersimpan, satu kalimat: "Reservasi yang sudah ada tetap memakai cara lama." Tombol "Simpan". Editor denah (Task 9) di bawahnya hanya bila mode tersimpan `TABLE`; `TABLE` tanpa meja menampilkan ajakan menambah meja. Bila belum ada layanan reservasi dan mode bukan `NONE`: kalimat dengan tautan ke Layanan "Tandai layanan sebagai reservasi meja agar kapasitas ini dipakai."
- Form layanan: bagian "Jumlah tamu (opsional)" (min, maks) dan centang "Reservasi meja" yang membuka "Lama duduk" (menit), tampil hanya bila `table_mode <> 'NONE'` atau layanan sudah punya nilai di kolom itu (supaya data tidak hilang diam-diam). Tabel layanan menampilkan "1 sampai 12 orang" di bawah nama bila ada.

- [ ] **Step 1: Tulis uji validasi yang gagal** di `dining.test.ts` (AREA tanpa kursi ditolak, NONE dengan kursi null diterima, hold 121 ditolak) dan `service.test.ts` (min tanpa max ditolak, min > max ditolak, lama duduk tanpa rentang ditolak, rentang 1 sampai 12 dengan lama duduk 90 diterima). `npm run test:unit` → FAIL.
- [ ] **Step 2: Implementasikan** sesuai Interfaces dan Ketentuan, plus story `capacity-settings-form.stories.tsx` (tiga mode, galat simpan).
- [ ] **Step 3: Verifikasi** `npm run test:unit && npm run typecheck && npm run lint`, story di 390px dan 1280px.
- [ ] **Step 4: Commit**: `git add src/app/dashboard/denah src/lib/validations/dining.ts src/lib/validations/dining.test.ts src/lib/routes.ts src/components/layout src/lib/validations/service.ts src/lib/validations/service.test.ts src/app/dashboard/services` lalu `git commit -m "Tambah halaman Denah meja untuk kapasitas dan field reservasi di layanan"`.

---

### Task 9: Editor denah meja

Model: sonnet.

**Files:**
- Create: `src/app/dashboard/denah/floor-plan-editor.tsx` (+ story)
- Modify: `src/lib/validations/dining.ts`, `src/lib/validations/dining.test.ts`, `src/app/dashboard/denah/actions.ts`, `src/app/dashboard/denah/page.tsx`

**Interfaces:**
- Consumes: `save_dining_layout` (Task 3), Task 4 (`FLOOR_COLS`, `FLOOR_ROWS`, `TABLE_MIN_CELLS`, `TABLE_MAX_CELLS`, `moveTableByKey`, `seatRangeLabel`), `DiningArea`, `DiningTable`.
- Produces:
  - `diningLayoutSchema` di `dining.ts`: `{ areas: { id: uuid; name: string 1..30; sort_order: int }[] max 10; tables: { id: uuid; area_id: uuid; name: string 1..20; min_seats; max_seats; shape: "ROUND" | "RECT"; grid_x; grid_y; grid_w; grid_h; note: string 1..60 | null; bookable_online: boolean; joinable_with: uuid[] max 8; sort_order: int }[] max 100 }`, cermin constraint Task 1 dan aturan `BK064` Task 3 (nama unik tanpa beda huruf besar, `area_id` ada, `joinable_with` di area sama dan bukan diri sendiri).
  - `export type DiningLayoutInput = z.input<typeof diningLayoutSchema>`.
  - `saveDiningLayout(input: DiningLayoutInput): Promise<{ ok: true } | { ok: false; error: string }>`: validasi Zod, lalu `rpc("save_dining_layout", { p_areas, p_tables })`. Peta error: `BK062` "Ada meja yang masih punya reservasi mendatang. Matikan Bisa dipesan online saja untuk meja itu.", `BK064` "Denah tidak valid: periksa nama ganda, jumlah area atau meja, dan meja yang boleh digabung.", `23514`/`22P02` "Data meja tidak valid.", lain "Gagal menyimpan denah, coba lagi." (log error asli di server).
  - `FloorPlanEditor({ initialAreas, initialTables, save }: { initialAreas: DiningArea[]; initialTables: DiningTable[]; save: (input: DiningLayoutInput) => Promise<{ ok: true } | { ok: false; error: string }> })`.

Ketentuan editor (M3):
- Tab area (`role="tablist"`) dengan jumlah meja ("Dalam, 8 meja"), "Tambah area" (dialog nama), ganti nama dan hapus area di menu tab.
- Toolbar: "Tambah meja bulat", "Tambah meja kotak" (3x3 sel di posisi kosong pertama, nama berikutnya: huruf awal area + nomor), "Lihat daftar"/"Lihat denah" (`aria-pressed`).
- Kanvas: kisi titik, `aspect-ratio: 24 / 22`, meja `<button aria-pressed aria-label="Meja D5, 4 sampai 6 kursi, kolom 4, baris 8">`. Seret dengan pointer (`setPointerCapture`, dibulatkan ke sel). Meja terpilih: tombol panah memanggil `moveTableByKey` (`preventDefault`), pengumuman `aria-live="polite"` "Meja D5 di kolom 5, baris 8". Teks bantuan: "Seret meja, atau pilih lalu geser dengan tombol panah."
- Daftar (alternatif setara): tabel Nama, Area, Kursi, Online, tombol "Ubah" yang memilih meja ke panel.
- Panel meja terpilih: Nama atau nomor, Jumlah tamu min/maks (stepper seperti artboard, `aria-label` "Kurangi minimum" dst.), Kolom dan Baris (input angka), Lebar dan Tinggi (sel), Bentuk, Catatan untuk pelanggan, "Bisa dipesan online", "Boleh digabung dengan" (daftar centang meja lain di area sama), "Hapus meja" (merah satu-satunya).
- Ringkasan bawah: "{n} meja, {kursi} kursi di area {nama}".
- Tombol "Simpan denah" mengirim seluruh denah; galat ditampilkan `role="alert"` di atas editor; perubahan belum tersimpan diberi tanda dan `beforeunload` peringatan.
- Monokrom, target sentuh 44px di layar sentuh, fokus terlihat.

- [ ] **Step 1: Tulis uji yang gagal** di `dining.test.ts`: payload contoh (2 area, 4 meja) lolos; nama meja "d1" dan "D1" ditolak; `joinable_with` ke meja area lain ditolak; `grid_x: 22, grid_w: 3` ditolak; 101 meja ditolak. `npm run test:unit` → FAIL.
- [ ] **Step 2: Implementasikan** skema, aksi, editor, dan sambungkan di `page.tsx` (muat `dining_areas` dan `dining_tables` milik merchant lewat `createClient`, urut `sort_order, name`).
- [ ] **Step 3: Story** `floor-plan-editor.stories.tsx`: data contoh dari `DenahMeja.dc.html` (Dalam D1 sampai D8, Teras T1 sampai T4), kosong, tampilan daftar, galat `BK062`. Verifikasi di 390px dan 1280px: semua aksi bisa dengan keyboard saja (Tab, Enter, Spasi, panah), addon a11y tanpa pelanggaran.
- [ ] **Step 4: Verifikasi** `npm run test:unit && npm run typecheck && npm run lint`.
- [ ] **Step 5: Commit**: `git add src/app/dashboard/denah src/lib/validations/dining.ts src/lib/validations/dining.test.ts` lalu `git commit -m "Tambah editor denah meja dengan keyboard dan tampilan daftar"`.

---

### Task 10: Pembaca reservasi di dashboard, booking manual, notifikasi, ekspor

Model: sonnet.

**Files:**
- Modify: `src/app/dashboard/bookings/baru/manual-booking-form.tsx` (+ story), `src/app/dashboard/bookings/baru/page.tsx`, aksi booking manual F3 (berkas yang memanggil `create_manual_booking`), `src/app/dashboard/bookings/slot-field.tsx`, `booking-detail-panel.tsx` (+ story), baris daftar booking dan agenda Hari ini (`src/app/dashboard/bookings/bookings-list.tsx`, `src/app/dashboard/_today/sections.tsx`), `src/lib/notify/templates.ts`, `templates.test.ts`, `src/lib/notify/dispatch.ts`, `src/app/dashboard/settings/ekspor/route.ts`

**Interfaces:**
- Consumes: kolom Task 1, `create_manual_booking` baru (Task 2), `isSeatService`, `partyRangeLabel` (Task 4), `/api/slots` dengan `party` (Task 5).
- Produces: `SlotField` props + `partySize?: number | null` (diteruskan sebagai `party`); input aksi manual + `partySize: number | null; tableId: string | null; customerNote: string | null`.

Ketentuan:
- Booking manual: layanan ber-`party_max` menampilkan "Jumlah tamu"; layanan reservasi di mode `TABLE` menampilkan pilihan meja (`<select>` semua meja merchant termasuk offline, opsi pertama "Pilihkan otomatis"); "Catatan" opsional. Error `BK060`, `BK061`, `BK063` memakai `mapBookingError`. Komentar `shortcut:` di `SlotField` tentang Keputusan 21.
- Panel detail: "Tamu: {n} orang", "Meja: {table_label}", "Catatan pelanggan" bila ada. Daftar booking dan agenda Hari ini: teks kecil "{n} orang, Meja D5" di bawah nama layanan bila ada `party_size`.
- Jadwal ulang merchant dari panel: `SlotField` diberi `partySize` booking.
- Notifikasi: templat pemberitahuan ke merchant dan konfirmasi ke pelanggan menambah satu baris "{n} orang" dan "Meja {label}" bila ada, dan catatan pelanggan hanya di pesan ke merchant. Uji templat: booking dengan `party_size 4, table_label "D5", customer_note "Ulang tahun"` memuat ketiganya di pesan merchant, dan pesan pelanggan tidak memuat catatan.
- Ekspor: kolom booking baru, plus `dining_areas` dan `dining_tables` merchant mengikuti pola tabel lain di route itu; `merchant_settings` kolom baru ikut.

- [ ] **Step 1: Tulis uji templat yang gagal**, `npm run test:unit` → FAIL.
- [ ] **Step 2: Implementasikan** sesuai Ketentuan, dengan story panel detail (reservasi bermeja dengan catatan) dan form manual (layanan reservasi mode `TABLE`).
- [ ] **Step 3: Verifikasi** `npm run test:unit && npm run typecheck && npm run lint`, story di 390px dan 1280px.
- [ ] **Step 4: Commit**: `git add src/app/dashboard src/lib/notify` lalu `git commit -m "Tampilkan jumlah tamu, meja, dan catatan di dashboard, notifikasi, dan ekspor"`.

---

### Task 11: Verifikasi akhir dan dokumentasi

Dikerjakan controller, bukan subagen.

- [ ] **Step 1:** `open -a Docker`, lalu `npm run docker:test`. Tidak ada baris `FAIL` di seluruh output, termasuk semua bagian lama dan 60 sampai 64.
- [ ] **Step 2:** `npm run check` dan `npm run build-storybook` lulus.
- [ ] **Step 3: Pemeriksaan browser di aplikasi sungguhan dengan stack Supabase lokal** (bukan hanya Storybook). Jalankan stack lokal dengan Supabase CLI (`npx supabase start`; bila `supabase/config.toml` belum ada, `npx supabase init` dulu dan jangan commit berkas itu kecuali memang diinginkan), terapkan migration (`npx supabase db reset`), arahkan `.env.local` ke URL dan kunci lokal, lalu `npm run dev`. Di 390px dan 1280px:
  - Merchant salon tanpa denah: alur booking lama (layanan, staf, jam, data diri, bayar) dan booking manual tidak berubah; Denah meja menampilkan "Mati".
  - Merchant restoran: layanan "Reservasi meja" (`ON_SITE`, gratis, 1 sampai 12 orang, lama duduk 90) dan paket. Mode Total kursi 10: dua reservasi 4 orang di jam sama lolos, yang ketiga tidak mendapat jam itu di daftar.
  - Mode Pakai denah meja: buat 2 area dan 6 meja dengan editor memakai mouse, lalu ulangi satu meja hanya dengan keyboard (pilih, geser panah, ubah kursi, simpan), cek tampilan daftar. Hapus meja yang punya reservasi mendatang ditolak dengan pesan.
  - `/<username>` sebagai pelanggan: R1 kartu reservasi, R2 jumlah tamu, chip area, jam dengan "Sisa N meja", R2b "Pilihkan untuk saya" dan pilih sendiri lewat denah dan daftar (pembaca layar: meja terisi diumumkan), R3 catatan dan teks tanpa bayar, R4 / `/pesanan/<token>` menampilkan tamu, meja, catatan. Dua tab memilih meja yang sama: yang kedua mendapat pesan dan kembali ke langkah Meja.
  - Dashboard: panel detail, daftar, Hari ini, booking manual dengan meja offline, jadwal ulang reservasi ke jam yang mejanya terisi (dipindah ke meja lain).
  - Di semua halaman: target sentuh 44px, fokus terlihat dengan Tab, tidak ada em dash, en dash, atau `·`, tidak ada warna tertulis di komponen publik.
  Hentikan stack lokal setelah selesai (`npx supabase stop`).
- [ ] **Step 4:** Tambah `## 37. Restoran: kapasitas kursi dan meja` di `docs/DECISIONS.md` (Keputusan 1, 2, 5, 6, 7, 8, 14, 15 dengan alasannya; sesuaikan nomor bila fase lain memakai 37). Perbarui bagian Status di `AGENTS.md` dengan satu paragraf F8: `table_mode` di `merchant_settings` (default `NONE`), layanan reservasi lewat `seat_duration_minutes`, kursi per slot atau per meja dihitung di `create_booking`/`move_booking_slot` di bawah kunci merchant, `bookings_no_overlap` hanya untuk `capacity_mode = 'NONE'` plus eksklusi per meja, denah ditulis hanya lewat `save_dining_layout`, `anon` membaca denah dan status lewat `get_seat_availability`/`get_table_status`, editor di `/dashboard/denah`. Perbarui baris F8 di `docs/superpowers/plans/2026-11-14-marky-roadmap.md` (rencana `2026-11-15-marky-f8-restoran.md`, status selesai). Jalankan `graphify update .`.
- [ ] **Step 5: Commit**: `git add docs/DECISIONS.md AGENTS.md docs/superpowers/plans/2026-11-14-marky-roadmap.md` lalu `git commit -m "Catat F8 selesai di keputusan, status, dan roadmap"`. `graphify-out/` ikut di-stage bila cabang ini memang meng-commit-nya.

## Urutan eksekusi

1, 2, 3 (migration berurutan), 4, 5, 6, 7, 8, 9, 10, 11. Task 4 sebelum 5 karena API memakai konstanta dan tipe pemilih meja. Task 8 sebelum 9 karena editor dipasang di halaman Task 8. Task 7 dan Task 8 tidak saling bergantung dan boleh ditukar.
