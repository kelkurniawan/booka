# F4 Kelola booking pelanggan: ubah jadwal, batal, kontak, pengingat: rencana implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pelanggan mengelola booking-nya sendiri dari `/pesanan/[token]`: ubah jadwal dan batal sesuai kebijakan merchant, menghubungi merchant lewat kanal yang merchant tampilkan, dan memilih pengingat lewat WhatsApp, email, atau notifikasi HP (web push). Merchant mengatur kebijakan, kontak, dan pengingat di Pengaturan (M4).

**Architecture:** Tiga migration. Yang pertama hanya menambah nilai enum (harus terpisah transaksi). Yang kedua menambah kolom kebijakan, kontak, dan pengingat ke `merchant_settings`, `bookings.reschedule_count`, satu helper internal `move_booking_slot` yang dipakai jadwal ulang merchant (F3) dan pelanggan, serta dua RPC pelanggan `reschedule_booking(token, new_start)` dan `cancel_booking_by_customer(token)` khusus `service_role`. Yang ketiga menambah `booking_reminder_prefs` dan `push_subscriptions` (langganan terenkripsi, terikat booking). Rute pelanggan baru semuanya di bawah `/api/pesanan/[token]/*`, pola `bayar`: token 48 hex sebagai kunci, query admin difilter `access_token` lalu `merchant_id`, token tidak pernah dikembalikan. Cron pengingat harian yang ada diperluas ke dua offset dan tiga kanal, tetap idempoten lewat `notification_log`.

**Tech Stack:** Postgres (migration Supabase, uji `npm run docker:test`), Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui (`Sheet`, `Dialog`, `Switch`), Zod, `node:test` lewat tsx, Storybook 10, library `web-push` (baru).

**Spec:** `docs/superpowers/specs/2026-11-14-marky-redesign-design.md` bagian 1, 2, 5 (F4), 6 (butir 6: VAPID sendiri), 7. Arah visual: `DESIGN.md`. Artboard: P1 `Pesanan.dc.html`, P2 `UbahJadwal.dc.html`, P3 `Kontak.dc.html`, P4 `Pengingat.dc.html`, M4 `Pengaturan.dc.html`. Teks artboard: `python3 .superpowers/design/extract.py .superpowers/design/app/<file>` (daftar kanal dan offset ada di blok `<script type="text/x-dc">` berkasnya). Pengingat dan idempotensi sekarang: `docs/NOTIFIKASI.md`. Rencana sebelumnya: F2 `2026-11-15-marky-f2-cara-bayar.md`, F3 `2026-11-15-marky-f3-dashboard.md`.

## Prasyarat

F4 dimulai setelah F3 selesai dan di-commit. F4 memakai dari F3: `public.reap_expired_bookings_for(uuid)`, `public.reschedule_booking_by_merchant(uuid, timestamptz)` (didefinisikan ulang di sini), `whatsappLink` di `src/lib/booking/dashboard.ts`, dan panel detail `src/app/dashboard/bookings/booking-detail-panel.tsx`. Bila F3 belum ada di cabang, berhenti dan lapor.

## Keputusan (spec diam atau bentrok, diputuskan di sini)

1. **Pengingat hanya dua offset: H-1 dan pagi hari jadwal.** Cron Vercel Hobby jalan sekali sehari (`0 1 * * *`, 08:00 WIB, dan Hobby boleh menembak kapan saja di jam itu). Offset "3 jam", "2 jam", "1 jam", "30 menit sebelum", dan "H-1 pukul 10.00" dari artboard tidak bisa ditepati, jadi tidak dipakai di teks mana pun. "Pagi hari jadwal" dikirim run yang sama untuk booking hari ini yang mulai paling cepat 30 menit setelah cron jalan. Jalan naik kelas kelak: pg_cron (sudah dipakai `reap-expired-bookings`) ditambah pg_net yang memanggil `/api/cron/reminders` tiap 15 menit, dengan `CRON_SECRET` di Supabase Vault. Tidak dibuat sekarang karena butuh rahasia di database dan tidak bisa diuji di harness.
2. **Default kebijakan mempertahankan perilaku lama** (spec bagian 3): `allow_customer_reschedule = false`, `allow_customer_cancel = false`. Merchant menyalakannya di M4. Nilai lain: `reschedule_min_hours = 24`, `max_reschedules = 1`, `cancel_min_hours = 24`.
3. Batas jam ubah jadwal berlaku dua arah: jadwal lama harus masih `>= reschedule_min_hours` jam lagi, dan jadwal baru juga minimal sejauh itu dari sekarang (`BK046`). Tanpa yang kedua, pelanggan bisa memindah ke 1 jam lagi dan merchant kehilangan waktu siap.
4. Pelanggan boleh mengubah jadwal hanya booking `PAID`/`CONFIRMED` yang belum ditandai hadir/tidak datang. Batal: `PAID`/`CONFIRMED` mengikuti kebijakan; `REQUESTED` yang belum mulai selalu boleh dibatalkan (belum ada uang dan belum ada janji slot dari merchant). `PENDING` tidak bisa dibatalkan pelanggan; tenggatnya yang melepas slot.
5. **Refund DP tidak diotomasi.** Uang ada di gateway merchant. Halaman hanya menampilkan baris kebijakan: aturan yang dihitung dari setelan, lalu `policy_text` merchant. Bila booking punya pembayaran online dan `policy_text` kosong, baris terakhirnya `Soal pengembalian pembayaran, hubungi <merchant>.`
6. Jadwal ulang tidak mengubah staf, durasi, harga, atau pembayaran. Helper `move_booking_slot` menghapus baris `notification_log` berjenis `REMINDER_CUSTOMER`, `REMINDER_CUSTOMER_SAME_DAY`, dan `BOOKING_RESCHEDULED_MERCHANT` milik booking itu, supaya pengingat dan pemberitahuan berikutnya bisa terkirim lagi. Konsekuensinya riwayat pemberitahuan jadwal ulang sebelumnya hilang dari timeline; itu diterima.
7. Setelah pelanggan mengubah jadwal atau membatalkan, merchant diberi tahu (email + WhatsApp, best effort lewat `after()`). Pelanggan tidak dikirimi pesan atas tindakannya sendiri; halaman langsung menampilkan hasilnya. Kalimat artboard P2 "sudah dikabari lewat WhatsApp" dibuang karena pengiriman bisa `SKIPPED`.
8. Kontak: WhatsApp memakai `merchants.whatsapp_number` yang sudah ada (diubah di form Profil). Kanal lain kolom baru. Sembunyikan per kanal lewat `contact_hidden contact_channel[]`. Kanal tampil bila nilainya terisi dan tidak ada di `contact_hidden`. Kontak hanya tampil di sheet Hubungi di `/pesanan`, tidak di halaman publik `/[username]`; tidak ada grant `anon` untuk kolom baru.
9. Kode booking adalah `BK-` + 6 karakter hex pertama id booking, huruf besar. Hanya untuk dibaca manusia (pesan WhatsApp ke merchant dan panel dashboard), tidak dijamin unik dan tidak dipakai untuk mencari.
10. **Library web push: `web-push`** (npm, MPL-2.0, implementasi VAPID RFC 8292 dan enkripsi RFC 8291). Menulis enkripsi payload sendiri dengan `node:crypto` terlalu berisiko untuk dihemat. Dipakai hanya di server (`runtime` Node bawaan route handler).
11. Kanal push tidak punya kolom preferensi: push aktif untuk booking itu bila ada baris `push_subscriptions`. Mematikan push di P4 menghapus semua langganan booking itu (semua perangkat), tanpa memanggil `PushSubscription.unsubscribe()` karena endpoint yang sama bisa dipakai booking lain di browser itu.
12. Endpoint push wajib `https` dan host-nya berakhiran `fcm.googleapis.com`, `push.services.mozilla.com`, `push.apple.com`, atau `notify.windows.com`. Tanpa daftar ini, siapa pun pemegang token bisa menyuruh server mengirim POST ke alamat bebas (SSRF).
13. Langganan push disimpan terenkripsi dengan `src/lib/crypto/secret-box.ts` (kunci `TOKEN_ENCRYPTION_KEY` yang sudah ada), AAD `merchantId:bookingId:push_subscription`, plus `endpoint_hash` sha256 untuk unik per booking. Langganan untuk booking yang dibatalkan atau selesai lebih dari sehari dihapus `prune_push_subscriptions()` di awal cron; endpoint yang dijawab 404/410 dihapus saat kirim.
14. Service worker statis di `public/sw.js`. Matcher `src/proxy.ts` mengecualikan `sw\.js` supaya berkas itu dilayani apa adanya di domain Marky dan domain merchant (tanpa pengecualian, domain merchant mengalihkannya ke domain Marky dan registrasi gagal). `ROUTES.serviceWorker = "/sw.js"` dan `sw` masuk `reserved_usernames` (nama ber-titik sudah ditolak `merchants_username_format`, pola sama dengan `sitemap`).
15. iPhone hanya menerima web push dari web app di Layar Utama, dan itu butuh manifest `display: "standalone"`. `/pesanan/[token]` memberi manifest per booking lewat `GET /api/pesanan/[token]/manifest` (tanpa query database) dengan `start_url` halaman itu, supaya ikon Layar Utama membuka booking yang benar.
16. Pengingat tetap fitur Pro dan Studio (`REMINDER_TIERS`, perilaku sekarang) untuk ketiga kanal. Booking merchant Starter tidak menampilkan bagian Pengingat, dan kartu Pengingat di M4 menampilkan ajakan ke Langganan. Ubah jadwal, batal, dan kontak berlaku untuk semua paket.
17. Kanal pengingat efektif = kanal dinyalakan merchant DAN dipilih pelanggan. Tanpa baris preferensi: WhatsApp aktif, email mati (belum ada alamat), push aktif bila ada langganan, offset mengikuti default merchant (`reminder_day_before = true`, `reminder_same_day = false`). Kolom offset di preferensi `null` berarti ikut default merchant.
18. Email pengingat melampirkan `.ics` dari `buildBookingIcs` (Resend `attachments`, base64).
19. Pesan gagal di halaman pelanggan memakai teks netral `role="alert"`, tidak merah (konvensi F2). Merah (`destructive`) hanya pada tombol "Batalkan booking".
20. Teks artboard yang memakai `·` atau `–` sebagai pemisah ditulis ulang tanpa keduanya (`DESIGN.md`): mis. "Kode BK-7F3A" dan "Lunas Rp350.000" jadi dua baris, "09.00 sampai 20.00 WIB".

## Konflik dengan spec atau desain

- Spec F4 menyebut offset bebas, artboard P1/P4/M4 menjanjikan "2 jam sebelum" dan lainnya. Cron harian tidak bisa menepatinya (Keputusan 1).
- Artboard M4 menampilkan sakelar kebijakan menyala; default di sini mati (Keputusan 2).
- Artboard M4 berkata kontak "Tampil di halaman booking"; di F4 kontak hanya di sheet Hubungi (Keputusan 8).
- Spec menyebut `booking_reminder_prefs (kanal + offset)`; kanal push diturunkan dari `push_subscriptions` (Keputusan 11).
- F3 Keputusan 8 menghapus hanya `REMINDER_CUSTOMER`. F4 mendefinisikan ulang `reschedule_booking_by_merchant` supaya memakai helper bersama (Keputusan 6).

## Global Constraints

- (Ditambah controller) F3 memasang batas anti-spam di `create_booking` cabang MANUAL (`BK035`, 50 booking manual per merchant per 24 jam) dan `reschedule_booking_by_merchant` (`BK036`, kolom `bookings.merchant_reschedule_count`, maks 3). Saat F4 memindah jadwal ulang merchant ke `move_booking_slot`, kedua batas dan kolom itu wajib tetap berlaku. `reschedule_count` F4 adalah penghitung pelanggan yang terpisah.

- Migration baru saja, berurutan: `20261116000100_f4_enum_values.sql`, `20261116000200_customer_manage_booking.sql`, `20261116000300_reminder_prefs_push.sql`. Jangan edit migration lama.
- Fungsi yang didefinisikan ulang (`reschedule_booking_by_merchant`) disalin dari definisi TERAKHIR di `supabase/migrations/` saat eksekusi (`grep -l "reschedule_booking_by_merchant" supabase/migrations/*.sql | tail -1`), bukan dari berkas tetap. Ekspresi `v_uses_staff` disalin dari `create_booking` versi terakhir dengan cara yang sama.
- Tabel baru: RLS aktif, `revoke all ... from anon, authenticated`. Fungsi baru: `revoke execute ... from public, anon, authenticated`, lalu `grant execute` eksplisit hanya ke peran pemanggil. Grant kolom per kolom. Akhiri migration yang menyentuh API dengan `notify pgrst, 'reload schema';`.
- Uji di `supabase/tests/99_verify.sql`, bagian 40 sampai 43 (44 dicadangkan, tidak dipakai). Label diawali `t40`..`t43`. Lulus berarti tidak ada baris output diawali `FAIL` di seluruh `npm run docker:test` (Docker harus jalan: `open -a Docker`), termasuk bagian 36 F3.
- `src/types/database.ts` ikut diperbarui, `type` bukan `interface`.
- Rute pelanggan: `/^[0-9a-f]{48}$/` dicek dulu (404 bila gagal), `createAdminClient()`, filter `.eq("access_token", token)` lalu setiap query lanjutan `.eq("merchant_id", row.merchant_id)`. Jangan pernah `select` kolom `access_token`, dan jangan pernah mengembalikannya di respons. `/api/*` tidak dicakup matcher proxy.
- Halaman `/pesanan/*` memakai token tema lewat kelas Tailwind yang ada (`text-muted-foreground`, `bg-card`, `border-border`, `rounded-[var(--radius)]`) seperti `booking-status-view.tsx`; tanpa warna tertulis. Dashboard tetap monokrom.
- Larangan `DESIGN.md`: tanpa em dash, tanpa eyebrow, tanpa label kapital berjarak, tanpa `·`, tanpa panah di teks tombol. Target sentuh minimal 44px (`min-h-11`), fokus terlihat, semua bisa dengan keyboard. Setiap daftar data punya keadaan memuat, kosong, dan gagal.
- Semua jam di zona `Asia/Jakarta` lewat `src/lib/format.ts` dan `src/lib/booking/slots.ts`. `Date.now()` hanya di Server Component atau fungsi pengambil data, lalu diteruskan sebagai `nowMs`.
- Komponen tampilan baru menerima data dan aksi sebagai props dan punya story.
- UI dan komentar berbahasa Indonesia, nama variabel Inggris. Tidak ada langkah deploy.

## Review Focus

1. Pelanggan menekan "Simpan jadwal baru" dua kali, atau membuka dua tab, dengan `max_reschedules = 1`: hanya satu perubahan tersimpan, yang kedua mendapat "Anda sudah memakai semua kesempatan ubah jadwal." Kuncinya advisory lock merchant plus `for update` sebelum cek `reschedule_count`. Diuji t41b (berurutan); urutan kunci diperiksa reviewer.
2. Pelanggan memindah booking 10:00 ke 10:30 di hari yang sama (beririsan dengan dirinya sendiri): RPC menerima. Diuji t41l. Daftar jam dari `/api/slots` menandai slot lamanya terisi, batas yang sama dengan F3.
3. Endpoint push palsu (`https://169.254.169.254/...`, `http://fcm.googleapis.com/...`, `https://fcm.googleapis.com.evil.test/...`): ditolak 400 sebelum disimpan. Diuji `isAllowedPushEndpoint` di Task 8.
4. Cron Hobby menembak 08:50 WIB, booking hari ini 09:30 dengan "pagi hari jadwal": masih terkirim (ambang 30 menit), booking 09:10 tidak (sudah dapat H-1). Diuji `sameDayRange` di Task 10.
5. Merchant mematikan "boleh batal sendiri" saat halaman pelanggan masih terbuka dengan tombol Batalkan: RPC menolak dengan `BK044`, pelanggan melihat "Merchant tidak mengizinkan pembatalan lewat halaman ini." lalu halaman menyegarkan diri. Diuji t42b dan `customerManageErrorMessage` di Task 3.

---

### Task 1: Kebijakan, kontak, dan RPC ubah jadwal serta batal oleh pelanggan

Model: opus (kunci konkurensi slot, kebijakan uang, mendefinisikan ulang fungsi F3).

**Files:**
- Create: `supabase/migrations/20261116000100_f4_enum_values.sql`, `supabase/migrations/20261116000200_customer_manage_booking.sql`
- Modify: `supabase/tests/99_verify.sql` (bagian `-- 40. Kebijakan dan kontak merchant (20261116000200)`, `-- 41. Ubah jadwal oleh pelanggan (20261116000200)`, `-- 42. Batal oleh pelanggan (20261116000200)`)
- Modify: `src/types/database.ts`, `src/app/dashboard/bookings/notification-history.tsx` (label kind dan kanal baru, dipaksa `Record`)

**Interfaces:**
- Consumes (F2/F3): `public.slot_within_hours(uuid, uuid, integer, time, time)`, `public.reap_expired_bookings_for(uuid)`, ekspresi `v_uses_staff` dari `create_booking` terakhir, tabel `notification_log`, `reserved_usernames`, kunci `pg_advisory_xact_lock(hashtext(merchant_id::text))`.
- Produces (SQL):

```sql
-- 20261116000100 (berkas sendiri: nilai enum baru tidak boleh dipakai di transaksi yang sama)
alter type public.notification_kind add value if not exists 'REMINDER_CUSTOMER_SAME_DAY';
alter type public.notification_kind add value if not exists 'BOOKING_RESCHEDULED_MERCHANT';
alter type public.notification_kind add value if not exists 'BOOKING_CANCELLED_MERCHANT';
alter type public.notification_channel add value if not exists 'PUSH';

-- 20261116000200
create type public.contact_channel as enum ('WHATSAPP', 'PHONE', 'EMAIL', 'INSTAGRAM', 'THREADS', 'X', 'TIKTOK');

alter table public.merchant_settings
  add column allow_customer_reschedule boolean not null default false,
  add column reschedule_min_hours integer not null default 24,   -- check 0..168
  add column max_reschedules integer not null default 1,         -- check 1..5
  add column allow_customer_cancel boolean not null default false,
  add column cancel_min_hours integer not null default 24,       -- check 0..168
  add column policy_text text,                                   -- check char_length <= 500
  add column contact_phone text,                                 -- check ~ '^\+[1-9][0-9]{7,14}$'
  add column contact_email text,                                 -- check char_length <= 254 and ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  add column contact_instagram text, add column contact_threads text,
  add column contact_x text, add column contact_tiktok text,     -- masing-masing check ~ '^[A-Za-z0-9._]{1,30}$'
  add column contact_hidden public.contact_channel[] not null default '{}',
  add column reply_from time, add column reply_until time,       -- keduanya null, atau keduanya terisi dan from < until
  add column reminder_whatsapp boolean not null default true,
  add column reminder_email boolean not null default true,
  add column reminder_push boolean not null default true,
  add column reminder_day_before boolean not null default true,
  add column reminder_same_day boolean not null default false;

alter table public.bookings add column reschedule_count integer not null default 0
  constraint bookings_reschedule_count_nonneg check (reschedule_count >= 0);

-- Internal (tanpa grant). Pemanggil sudah memegang advisory lock merchant dan
-- baris booking FOR UPDATE.
public.move_booking_slot(p_booking_id uuid, p_merchant_id uuid, p_new_start timestamptz) returns void

-- Didefinisikan ulang: badan F3 sampai `for update` + cek BK034 tetap, sisanya
-- diganti `perform public.move_booking_slot(b.id, v_merchant, p_new_start);`.
public.reschedule_booking_by_merchant(p_booking_id uuid, p_new_start timestamptz) returns void  -- authenticated

public.reschedule_booking(p_token text, p_new_start timestamptz)
  returns table (booking_id uuid, old_start timestamptz)       -- service_role saja
public.cancel_booking_by_customer(p_token text)
  returns table (booking_id uuid)                               -- service_role saja
```

  Errcode baru: `BK040` booking tidak bisa dikelola pelanggan (token tidak dikenal, status tidak sesuai, kehadiran sudah dicatat), `BK041` ubah jadwal tidak diizinkan merchant, `BK042` batas waktu ubah jadwal lewat, `BK043` kesempatan ubah jadwal habis, `BK044` batal tidak diizinkan merchant, `BK045` batas waktu batal lewat, `BK046` jadwal baru kurang dari `reschedule_min_hours` jam dari sekarang. Dipakai ulang: `P0006` (jam sudah lewat), `BK001` (di luar jam kerja), `23P01` (bentrok).
- Produces (TS, `src/types/database.ts`):
  - `export type ContactChannel = "WHATSAPP" | "PHONE" | "EMAIL" | "INSTAGRAM" | "THREADS" | "X" | "TIKTOK";`
  - `NotificationKind` + `"REMINDER_CUSTOMER_SAME_DAY" | "BOOKING_RESCHEDULED_MERCHANT" | "BOOKING_CANCELLED_MERCHANT"`; `NotificationChannel = "EMAIL" | "WHATSAPP" | "PUSH"`.
  - `MerchantSettings` + semua kolom di atas (`time` sebagai `string | null` format `HH:MM:SS`, `contact_hidden: ContactChannel[]`); `merchant_settings.Update` + semua kolom baru.
  - `Booking` + `reschedule_count: number`.
  - `Functions.reschedule_booking: { Args: { p_token: string; p_new_start: string }; Returns: { booking_id: string; old_start: string }[] }`
  - `Functions.cancel_booking_by_customer: { Args: { p_token: string }; Returns: { booking_id: string }[] }`
  - `Enums` + `contact_channel: ContactChannel`.

Isi migration 000200:

- Setiap check punya nama `merchant_settings_<kolom>_check` atau `merchant_settings_reply_hours_check`. `grant update (<semua kolom baru merchant_settings>) on public.merchant_settings to authenticated`. Tidak ada grant `anon` (Keputusan 8). `authenticated` sudah punya `select` tingkat tabel.
- `insert into public.reserved_usernames (name) values ('sw') on conflict (name) do nothing;`
- `move_booking_slot` (`plpgsql`, `set search_path = ''`, bukan definer): `p_new_start <= now()` → `P0006`; baca `duration_minutes, staff_id` booking (`id` dan `merchant_id`); hitung `v_end`; `v_uses_staff` seperti `create_booking`; `slot_within_hours(p_merchant_id, case when coalesce(v_uses_staff,false) then staff_id end, isodow WIB, jam mulai WIB, jam selesai WIB)` gagal → `BK001`; `update ... set start_datetime, end_datetime`; `delete from public.notification_log where booking_id = p_booking_id and kind in ('REMINDER_CUSTOMER', 'REMINDER_CUSTOMER_SAME_DAY', 'BOOKING_RESCHEDULED_MERCHANT')`.
- `reschedule_booking` (`plpgsql`, `security definer`, `set search_path = ''`). Urutan penting:

```sql
select x.merchant_id into v_merchant from public.bookings x where x.access_token = p_token;
if not found then raise exception 'Booking tidak ditemukan' using errcode = 'BK040'; end if;
perform pg_advisory_xact_lock(hashtext(v_merchant::text));
perform public.reap_expired_bookings_for(v_merchant);
select * into b from public.bookings x
  where x.access_token = p_token and x.merchant_id = v_merchant for update;
select * into s from public.merchant_settings where merchant_id = v_merchant;
if b.status not in ('PAID', 'CONFIRMED') or b.attended_at is not null or b.no_show_at is not null
  then raise exception 'Booking tidak bisa diubah' using errcode = 'BK040'; end if;
if not coalesce(s.allow_customer_reschedule, false) then raise ... errcode = 'BK041'; end if;
if now() > b.start_datetime - make_interval(hours => s.reschedule_min_hours) then raise ... 'BK042'; end if;
if b.reschedule_count >= s.max_reschedules then raise ... 'BK043'; end if;
if s.reschedule_min_hours > 0 and p_new_start < now() + make_interval(hours => s.reschedule_min_hours)
  then raise ... 'BK046'; end if;
perform public.move_booking_slot(b.id, v_merchant, p_new_start);
update public.bookings set reschedule_count = reschedule_count + 1 where id = b.id;
return query select b.id, b.start_datetime;
```

- `cancel_booking_by_customer`: lookup, kunci, dan `for update` sama. Lalu: `REQUESTED` dengan `start_datetime > now()` lolos tanpa cek kebijakan; `PAID`/`CONFIRMED` tanpa catatan kehadiran wajib `allow_customer_cancel` (`BK044`) dan `now() <= start_datetime - cancel_min_hours jam` (`BK045`); selain itu `BK040`. `update ... set status = 'CANCELLED', cancelled_at = now(), cancel_reason = 'Dibatalkan pelanggan'`. Kembalikan `b.id`.
- Grant: `move_booking_slot` dicabut dari `public, anon, authenticated`. Dua RPC pelanggan: cabut dari `public, anon, authenticated`, `grant execute ... to service_role`. `reschedule_booking_by_merchant` tetap `authenticated` (ulangi revoke/grant setelah `create or replace`).

- [ ] **Step 1: Tulis kasus uji yang gagal.** Siapkan merchant PRO `40404040-0000-0000-0000-000000000001` (username `kelola-40`, jam 09:00 sampai 17:00 tiap hari) dengan layanan 60 menit, dan merchant kedua `...0002`. Booking disisipkan langsung dengan `access_token` tetap (`repeat('a', 48)`, `repeat('b', 48)`, dst.) dan jam dari `pg_temp.jakarta_future`. RPC pelanggan dipanggil sebagai `service_role` (`set local role service_role`).
  - Bagian 40: t40a baris lama punya default Keputusan 2 dan `reminder_*` (`true, true, true, true, false`), `contact_hidden = '{}'`. t40b masing-masing gagal `23514`: `max_reschedules = 0`, `reschedule_min_hours = 169`, `contact_instagram = 'a b'`, `contact_phone = '0812'`, `contact_email = 'bukan'`, `reply_from` tanpa `reply_until`, `reply_from = '20:00', reply_until = '09:00'`, `policy_text` 501 karakter. t40c sebagai `authenticated` merchant `...0001`: update `allow_customer_cancel, contact_instagram, reminder_same_day` miliknya berhasil; update milik `...0002` mengubah 0 baris. t40d `has_column_privilege('anon', 'public.merchant_settings', c, 'SELECT')` false untuk `policy_text`, `contact_email`, `contact_phone`; `has_column_privilege('anon', 'public.bookings', 'reschedule_count', 'SELECT')` false; `has_column_privilege('authenticated', 'public.bookings', 'reschedule_count', 'UPDATE')` false. t40e `'sw'` ada di `reserved_usernames`.
  - Bagian 41 (`allow_customer_reschedule = true`, min 24, max 1): t41a `CONFIRMED` jam X (hari +3 10:00) ke Y (hari +4 11:00): kembalian `(id, X)`, `start_datetime = Y`, durasi tetap, `reschedule_count = 1`; baris log `REMINDER_CUSTOMER`, `REMINDER_CUSTOMER_SAME_DAY`, `BOOKING_RESCHEDULED_MERCHANT` terhapus, `BOOKING_CONFIRMED_CUSTOMER` tetap. t41b panggilan kedua `BK043`. t41c `allow_customer_reschedule = false` → `BK041`. t41d booking yang mulai `now() + 5 jam` → `BK042`. t41e jadwal baru `now() + 2 jam` → `BK046`; dengan min 0, jadwal baru di masa lalu → `P0006`. t41f ke slot yang dipegang booking `CONFIRMED` lain → `23P01`; ke 20:00 WIB → `BK001`. t41g `PENDING`, `REQUESTED`, `CANCELLED`, `attended_at` terisi, dan token `repeat('f', 48)` → masing-masing `BK040`. t41h `PAID` berhasil sama seperti `CONFIRMED`. t41i `reschedule_booking_by_merchant` (sebagai `authenticated` pemilik) menghapus baris `REMINDER_CUSTOMER_SAME_DAY` dan tidak mengubah `reschedule_count`. t41j hak akses: `anon` dan `authenticated` tidak bisa EXECUTE `reschedule_booking(text, timestamptz)`, `cancel_booking_by_customer(text)`, `move_booking_slot(uuid, uuid, timestamptz)`; `service_role` bisa EXECUTE dua yang pertama. t41l booking 10:00 sampai 11:00 dipindah ke 10:30 hari yang sama berhasil.
  - Bagian 42 (`allow_customer_cancel = true`, min 24): t42a `CONFIRMED` hari +3 → `CANCELLED`, `cancelled_at` terisi, `cancel_reason = 'Dibatalkan pelanggan'`, dan booking baru di slot yang sama bisa disisipkan. t42b `allow_customer_cancel = false` → `BK044`; booking yang mulai `now() + 5 jam` → `BK045`. t42c `REQUESTED` masa depan dengan `allow_customer_cancel = false` tetap berhasil; `REQUESTED` yang sudah mulai → `BK040`. t42d `PENDING`, `CANCELLED`, `no_show_at` terisi → `BK040`. t42e `PAID` hari +3 berhasil.
- [ ] **Step 2: Jalankan** `npm run docker:test`. Harapan: baris `FAIL` di bagian 40 sampai 42.
- [ ] **Step 3: Tulis kedua migration** sesuai Interfaces.
- [ ] **Step 4: Jalankan** `npm run docker:test`. Harapan: tidak ada `FAIL` di seluruh output, termasuk t36i, t36j, t36k F3 yang kini lewat helper.
- [ ] **Step 5: Perbarui tipe** sesuai Interfaces, lalu label di `notification-history.tsx`: `REMINDER_CUSTOMER: "Pengingat H-1 ke pelanggan"`, `REMINDER_CUSTOMER_SAME_DAY: "Pengingat hari H ke pelanggan"`, `BOOKING_RESCHEDULED_MERCHANT: "Pemberitahuan ubah jadwal oleh pelanggan"`, `BOOKING_CANCELLED_MERCHANT: "Pemberitahuan batal oleh pelanggan"`, kanal `PUSH: "Notifikasi HP"`. Jalankan `npm run typecheck && npm run test:unit`.
- [ ] **Step 6: Commit**: `git add supabase/migrations/20261116000100_f4_enum_values.sql supabase/migrations/20261116000200_customer_manage_booking.sql supabase/tests/99_verify.sql src/types/database.ts src/app/dashboard/bookings/notification-history.tsx` lalu `git commit -m "Tambah kebijakan merchant dan RPC ubah jadwal serta batal oleh pelanggan"`.

---

### Task 2: Tabel preferensi pengingat dan langganan push

Model: sonnet.

**Files:**
- Create: `supabase/migrations/20261116000300_reminder_prefs_push.sql`
- Modify: `supabase/tests/99_verify.sql` (bagian `-- 43. Preferensi pengingat dan langganan push (20261116000300)`), `src/types/database.ts`

**Interfaces:**
- Consumes: Task 1 (kolom `bookings`), `public.set_updated_at()`.
- Produces (SQL):

```sql
create table public.booking_reminder_prefs (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  whatsapp boolean not null default true,
  email text,                 -- null = email mati; check char_length <= 254 and ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  day_before boolean,         -- null = ikut merchant_settings.reminder_day_before
  same_day boolean,           -- null = ikut merchant_settings.reminder_same_day
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  endpoint_hash text not null,      -- check ~ '^[0-9a-f]{64}$'
  subscription_enc text not null,   -- secret-box "v1.<iv>.<ct>.<tag>", check char_length <= 4000
  created_at timestamptz not null default now(),
  constraint push_subscriptions_once unique (booking_id, endpoint_hash)
);
create index push_subscriptions_merchant_idx on public.push_subscriptions (merchant_id);

-- Menghapus langganan booking CANCELLED atau yang end_datetime-nya lewat > 1 hari. service_role saja.
public.prune_push_subscriptions() returns integer
```

  Keduanya RLS aktif tanpa policy, `revoke all ... from anon, authenticated` (hanya `service_role`). Trigger `set_updated_at` di `booking_reminder_prefs`.
- Produces (TS): `BookingReminderPrefs` dan `PushSubscriptionRow` (`type`, kolom persis tabel), entri `Tables` dengan `Insert: Pick<..., "booking_id" | "merchant_id"> & Partial<...>` dan `Update` untuk kolom yang bisa diubah, `Functions.prune_push_subscriptions: { Args: Record<string, never>; Returns: number }`.

- [ ] **Step 1: Tulis kasus uji yang gagal** di bagian 43: t43a sisipan prefs minimal punya `whatsapp = true`, `email`, `day_before`, `same_day` null; `email = 'bukan-email'` → `23514`. t43b dua langganan dengan `(booking_id, endpoint_hash)` sama → `23505`; `endpoint_hash = 'xyz'` → `23514`. t43c menghapus booking ikut menghapus prefs dan langganannya. t43d `has_table_privilege` `anon` dan `authenticated` untuk `SELECT`, `INSERT`, `UPDATE`, `DELETE` di kedua tabel false. t43e dengan langganan untuk booking `CANCELLED`, booking yang selesai 2 hari lalu, dan booking `CONFIRMED` minggu depan, `prune_push_subscriptions()` mengembalikan 2 dan langganan minggu depan tetap. t43f `anon` dan `authenticated` tidak bisa EXECUTE `prune_push_subscriptions()`.
- [ ] **Step 2: Jalankan** `npm run docker:test`. Harapan: `FAIL` di bagian 43.
- [ ] **Step 3: Tulis migration** sesuai Interfaces.
- [ ] **Step 4: Jalankan** `npm run docker:test`. Harapan: tidak ada `FAIL`.
- [ ] **Step 5: Perbarui tipe**, jalankan `npm run typecheck`.
- [ ] **Step 6: Commit**: `git commit -m "Tambah preferensi pengingat dan langganan push per booking"` (stage tiga berkas di atas).

---

### Task 3: Modul murni kebijakan, kode booking, dan kontak

Model: haiku (tes lengkap di rencana).

**Files:**
- Create: `src/lib/booking/customer-manage.ts`, `src/lib/booking/customer-manage.test.ts`, `src/lib/booking/contact.ts`, `src/lib/booking/contact.test.ts`

**Interfaces:**
- Consumes: Task 1 tipe `Booking`, `MerchantSettings`, `ContactChannel`; `formatDateTime`, `formatTime` dari `src/lib/format.ts`; `whatsappLink(e164, text?)` dari `src/lib/booking/dashboard.ts` (F3).
- Produces:

```ts
// customer-manage.ts
export const CUSTOMER_CANCEL_REASON = "Dibatalkan pelanggan";
export type ManageSettings = Pick<MerchantSettings,
  "allow_customer_reschedule" | "reschedule_min_hours" | "max_reschedules" |
  "allow_customer_cancel" | "cancel_min_hours" | "policy_text">;
export const DEFAULT_MANAGE_SETTINGS: ManageSettings; // false, 24, 1, false, 24, null
export type ManageBooking = Pick<Booking,
  "id" | "status" | "start_datetime" | "attended_at" | "no_show_at" | "reschedule_count" | "amount_due_now">;
export type ManageState = {
  reschedule:
    | { allowed: true; deadline: string; left: number; earliestNewStart: string }
    | { allowed: false; reason: "OFF" | "STATUS" | "DEADLINE" | "LIMIT" };
  cancel:
    | { allowed: true; deadline: string | null }   // null untuk REQUESTED
    | { allowed: false; reason: "OFF" | "STATUS" | "DEADLINE" };
};
/** Cermin persis aturan RPC Task 1 (Keputusan 3 dan 4). Tanggal ISO UTC. */
export function manageState(b: ManageBooking, s: ManageSettings, nowMs: number): ManageState;
export function policyLines(b: ManageBooking, s: ManageSettings, merchantName: string): string[];
/** "BK-" + 6 hex pertama id tanpa tanda hubung, huruf besar. */
export function bookingCode(id: string): string;
export function customerManageErrorMessage(code: string | undefined): string;

// contact.ts
export type ContactLink = { channel: ContactChannel; label: string; handle: string; href: string };
export type ContactSettings = Pick<MerchantSettings,
  "contact_phone" | "contact_email" | "contact_instagram" | "contact_threads" |
  "contact_x" | "contact_tiktok" | "contact_hidden" | "reply_from" | "reply_until">;
export function contactLinks(whatsapp: string | null, s: ContactSettings, whatsappText: string):
  { whatsapp: ContactLink | null; others: ContactLink[] };
export function contactWhatsappText(p: { merchantName: string; customerName: string; code: string; startISO: string }): string;
export function replyHoursLabel(s: Pick<ContactSettings, "reply_from" | "reply_until">): string | null;
```

Teks persis:
- `policyLines` (urutan, baris yang tidak berlaku dilewati): bila ubah jadwal diizinkan `Ubah jadwal gratis sampai ${formatDateTime(deadline)}, maksimal ${max} kali.`; bila tidak `Ubah jadwal lewat halaman ini tidak tersedia. Hubungi ${merchantName}.`; bila batal diizinkan `Batal sendiri paling lambat ${formatDateTime(deadline)}.`; bila tidak `Pembatalan lewat halaman ini tidak tersedia. Hubungi ${merchantName}.`; lalu `policy_text` apa adanya bila ada, atau bila kosong dan `amount_due_now > 0`: `Soal pengembalian pembayaran, hubungi ${merchantName}.` Deadline di sini dihitung dari setelan meski booking sudah lewat deadline.
- `customerManageErrorMessage`: `BK040` "Booking ini tidak bisa diubah lagi.", `BK041` "Merchant tidak mengizinkan ubah jadwal lewat halaman ini.", `BK042` "Batas waktu ubah jadwal sudah lewat.", `BK043` "Anda sudah memakai semua kesempatan ubah jadwal.", `BK044` "Merchant tidak mengizinkan pembatalan lewat halaman ini.", `BK045` "Batas waktu pembatalan sudah lewat.", `BK046` "Jadwal baru terlalu dekat. Pilih jam yang lebih jauh.", `23P01` "Jam itu baru saja terisi. Pilih jam lain.", `BK001` "Jam itu di luar jam buka. Pilih jam lain.", `P0006` "Jam itu sudah lewat. Pilih jam lain.", lainnya "Gagal menyimpan. Coba lagi."
- `contactWhatsappText`: `Halo ${merchantName}, saya ${namaDepan}. Soal booking ${code}, ${formatDateTime(startISO)}: ` (nama depan = kata pertama `customerName`).
- `replyHoursLabel`: `Jam balas pesan ${HH.MM} sampai ${HH.MM} WIB` dari `reply_from`/`reply_until` (`"09:00:00"` → `09.00`); null bila salah satu null.
- `contactLinks` (urutan tetap, kanal di `contact_hidden` atau bernilai null dilewati): WhatsApp `{label: "WhatsApp", handle: "Paling cepat dibalas", href: whatsappLink(whatsapp, whatsappText)}`; Telepon `tel:<e164>` handle nomor; Email `mailto:<email>`; Instagram `https://instagram.com/<h>`; Threads `https://www.threads.net/@<h>`; X `https://x.com/<h>`; TikTok `https://www.tiktok.com/@<h>`. Handle sosial ditampilkan `@<h>`.

- [ ] **Step 1: Tulis tes yang gagal** (gaya `node:test` + `node:assert/strict` seperti `src/lib/booking/staff-slots.test.ts`). Waktu acuan `NOW = Date.parse("2026-11-16T03:00:00Z")` (10:00 WIB):

```ts
const s = { ...DEFAULT_MANAGE_SETTINGS, allow_customer_reschedule: true, allow_customer_cancel: true };
const b = { id: "7f3a9c00-1111-2222-3333-444444444444", status: "CONFIRMED", attended_at: null, no_show_at: null,
  reschedule_count: 0, amount_due_now: 0, start_datetime: "2026-11-21T03:00:00Z" } as const;

test("ubah jadwal: deadline, sisa, jadwal baru paling cepat", () => {
  assert.deepEqual(manageState(b, s, NOW).reschedule, {
    allowed: true, deadline: "2026-11-20T03:00:00.000Z", left: 1, earliestNewStart: "2026-11-17T03:00:00.000Z" });
});
test("ubah jadwal ditolak: OFF, STATUS, DEADLINE, LIMIT", () => {
  assert.deepEqual(manageState(b, DEFAULT_MANAGE_SETTINGS, NOW).reschedule, { allowed: false, reason: "OFF" });
  assert.deepEqual(manageState({ ...b, attended_at: "2026-11-16T00:00:00Z" }, s, NOW).reschedule, { allowed: false, reason: "STATUS" });
  assert.deepEqual(manageState({ ...b, status: "REQUESTED" }, s, NOW).reschedule, { allowed: false, reason: "STATUS" });
  assert.deepEqual(manageState({ ...b, start_datetime: "2026-11-16T20:00:00Z" }, s, NOW).reschedule, { allowed: false, reason: "DEADLINE" });
  assert.deepEqual(manageState({ ...b, reschedule_count: 1 }, s, NOW).reschedule, { allowed: false, reason: "LIMIT" });
});
test("batal: REQUESTED selalu boleh sebelum mulai, PENDING tidak", () => {
  assert.deepEqual(manageState({ ...b, status: "REQUESTED" }, DEFAULT_MANAGE_SETTINGS, NOW).cancel, { allowed: true, deadline: null });
  assert.deepEqual(manageState({ ...b, status: "PENDING" }, s, NOW).cancel, { allowed: false, reason: "STATUS" });
  assert.deepEqual(manageState(b, s, NOW).cancel, { allowed: true, deadline: "2026-11-20T03:00:00.000Z" });
  assert.deepEqual(manageState({ ...b, start_datetime: "2026-11-16T20:00:00Z" }, s, NOW).cancel, { allowed: false, reason: "DEADLINE" });
});
test("policyLines memakai policy_text atau baris pengembalian", () => {
  assert.equal(policyLines({ ...b, amount_due_now: 100000 }, s, "Rias by Sekar").at(-1), "Soal pengembalian pembayaran, hubungi Rias by Sekar.");
  assert.equal(policyLines(b, { ...s, policy_text: "DP tidak dikembalikan." }, "X").at(-1), "DP tidak dikembalikan.");
  assert.equal(policyLines(b, s, "X").length, 2);
});
test("bookingCode", () => assert.equal(bookingCode(b.id), "BK-7F3A9C"));
test("customerManageErrorMessage", () => {
  assert.equal(customerManageErrorMessage("BK043"), "Anda sudah memakai semua kesempatan ubah jadwal.");
  assert.equal(customerManageErrorMessage("BK044"), "Merchant tidak mengizinkan pembatalan lewat halaman ini.");
  assert.equal(customerManageErrorMessage("zzz"), "Gagal menyimpan. Coba lagi.");
  assert.equal(customerManageErrorMessage(undefined), "Gagal menyimpan. Coba lagi.");
});
```

  `contact.test.ts`: kanal tersembunyi dan null dilewati; urutan Telepon, Email, Instagram, Threads, X, TikTok; href Threads `https://www.threads.net/@riasbysekar`; WhatsApp di `contact_hidden` menghasilkan `whatsapp: null`; `replyHoursLabel({ reply_from: "09:00:00", reply_until: "20:00:00" })` = `"Jam balas pesan 09.00 sampai 20.00 WIB"`, dan null bila satu null; `contactWhatsappText` untuk `customerName: "Ayu Lestari"` diawali `"Halo Rias by Sekar, saya Ayu. Soal booking BK-7F3A9C, "`.
- [ ] **Step 2: Jalankan** `npm run test:unit`. Harapan: gagal karena modul belum ada.
- [ ] **Step 3: Implementasikan** kedua modul.
- [ ] **Step 4: Jalankan** `npm run test:unit && npm run typecheck`. Harapan: lulus.
- [ ] **Step 5: Commit**: `git commit -m "Tambah modul kebijakan kelola booking dan tautan kontak"`.

---

### Task 4: Rute ubah jadwal dan batal, notifikasi merchant, dan kode di dashboard

Model: sonnet.

**Files:**
- Create: `src/app/api/pesanan/[token]/ubah-jadwal/route.ts`, `src/app/api/pesanan/[token]/batal/route.ts`
- Modify: `src/lib/routes.ts`, `src/lib/notify/templates.ts`, `src/lib/notify/templates.test.ts`, `src/lib/notify/dispatch.ts`, `src/app/dashboard/bookings/booking-detail-panel.tsx`

**Interfaces:**
- Consumes: Task 1 RPC dan errcode, Task 3 `customerManageErrorMessage`, `bookingCode`; `toMerchant`, `loadForNotify` di `dispatch.ts`.
- Produces:

```ts
// routes.ts
bookingReschedule: (token: string) => `/pesanan/${token}/ubah-jadwal`,
bookingReminders: (token: string) => `/pesanan/${token}/pengingat`,
bookingRescheduleApi: (token: string) => `/api/pesanan/${token}/ubah-jadwal`,
bookingCancelApi: (token: string) => `/api/pesanan/${token}/batal`,

// POST /api/pesanan/[token]/ubah-jadwal  body { startUtc: string (z.iso.datetime({ offset: true })) }
// POST /api/pesanan/[token]/batal        body kosong
// 200 { ok: true } | 400 { error } (body tidak valid) | 404 { error: "Pesanan tidak ditemukan" } (format token)
// | 409 { error: customerManageErrorMessage(code) } (errcode RPC dari daftar Task 3) | 500 { error: "Gagal menyimpan. Coba lagi." }

// dispatch.ts
export type CustomerChange = { type: "RESCHEDULED"; oldStart: string } | { type: "CANCELLED" };
/** Email + WA ke merchant. Tidak pernah melempar. */
export async function notifyCustomerChange(bookingId: string, change: CustomerChange): Promise<void>;

// templates.ts
export function merchantRescheduledWhatsapp(data: BookingMessageData, oldStart: string): string;
export function merchantRescheduledEmail(data: BookingMessageData, oldStart: string): EmailMessage;
export function merchantCustomerCancelledWhatsapp(data: BookingMessageData): string;
export function merchantCustomerCancelledEmail(data: BookingMessageData): EmailMessage;
```

Ketentuan:
- Kedua rute: cek format token, panggil `admin.rpc(...)` (RPC sendiri mencari lewat `access_token` dan mengunci; rute tidak membaca baris booking). Kode error RPC dibaca dari `error.code`. Errcode di daftar Task 3 → 409; lainnya `console.error` tanpa token lalu 500. Sukses → `after(() => notifyCustomerChange(booking_id, ...))` (`after` dari `next/server`, pola webhook).
- `notifyCustomerChange`: `RESCHEDULED` → `toMerchant(ctx, "BOOKING_RESCHEDULED_MERCHANT", ...)`; `CANCELLED` → `toMerchant(ctx, "BOOKING_CANCELLED_MERCHANT", ...)`. Teks WhatsApp: `*${customerName}* mengubah jadwal *${serviceName}* dari ${formatDateTime(oldStart)} ke ${formatDateTime(startDatetime)}.` dan `*${customerName}* membatalkan *${serviceName}* untuk ${formatDateTime(startDatetime)}. Slotnya sudah kosong lagi.`, masing-masing diikuti baris kosong lalu `Lihat di dashboard: ${dashboardUrl}`. Subjek email: `Jadwal diubah pelanggan: ${serviceName}` dan `Booking dibatalkan pelanggan: ${serviceName}`, isi teks sama dengan WhatsApp (HTML di-escape seperti template email yang ada).
- Panel dashboard: di bawah nama pelanggan tampil teks abu `Kode ${bookingCode(booking.id)}`.

- [ ] **Step 1: Tulis tes yang gagal** di `templates.test.ts`: keempat template memuat nama pelanggan, nama layanan, jadwal lama dan baru (untuk jadwal ulang), dan `dashboardUrl`; tidak ada `·` atau em dash di keluaran.
- [ ] **Step 2: Jalankan** `npm run test:unit`. Harapan: gagal.
- [ ] **Step 3: Implementasikan** template, `notifyCustomerChange`, dua rute, `ROUTES`, dan baris kode di panel.
- [ ] **Step 4: Verifikasi** `npm run typecheck && npm run lint && npm run test:unit`. Lalu dengan `npm run dev` dan DB lokal: `curl -X POST localhost:3000/api/pesanan/xyz/batal` → 404; token valid booking `CONFIRMED` dengan `allow_customer_cancel = false` → 409 dengan pesan `BK044`. Bila DB lokal tidak tersedia, catat di laporan task.
- [ ] **Step 5: Commit**: `git commit -m "Tambah rute ubah jadwal dan batal oleh pelanggan beserta pemberitahuan merchant"`.

---

### Task 5: Pengaturan M4: ubah jadwal dan batal, kontak, pengingat

Model: sonnet.

**Files:**
- Create: `src/app/dashboard/settings/customer-policy-form.tsx`, `src/app/dashboard/settings/contact-settings-form.tsx`, `src/app/dashboard/settings/reminder-settings-form.tsx`, `src/app/dashboard/settings/customer-settings.stories.tsx`, `src/lib/validations/merchant-settings.test.ts`
- Modify: `src/lib/validations/merchant-settings.ts`, `src/app/dashboard/settings/booking-settings-actions.ts`, `src/app/dashboard/settings/page.tsx`, `src/lib/plans.ts`

**Interfaces:**
- Consumes: Task 1 kolom, Task 3 `DEFAULT_MANAGE_SETTINGS`, `normalizeWhatsapp` dari `src/lib/validations/merchant.ts`, `REMINDER_TIERS` (Task 10 memindahkannya; di task ini pakai `["PRO", "STUDIO"]` dari `src/lib/notify/reminder-plan.ts` bila Task 10 belum jalan, jadi buat berkas itu di sini hanya dengan `export const REMINDER_TIERS: SubscriptionTier[] = ["PRO", "STUDIO"];`).
- Produces:

```ts
// merchant-settings.ts
export const customerPolicySchema;  // allow_customer_reschedule, reschedule_min_hours (0..168), max_reschedules (1..5),
                                    // allow_customer_cancel, cancel_min_hours (0..168), policy_text ("" -> null, <= 500)
export const contactSettingsSchema; // contact_phone ("" -> null, normalizeWhatsapp, /^\+[1-9][0-9]{7,14}$/),
                                    // contact_email ("" -> null, z.email, <= 254), contact_instagram|threads|x|tiktok
                                    // ("" -> null, buang "@" di depan, /^[A-Za-z0-9._]{1,30}$/),
                                    // contact_hidden (ContactChannel[] dari checkbox "show_<CHANNEL>" yang TIDAK dicentang),
                                    // reply_from/reply_until ("" -> null, "HH:MM", keduanya atau tidak sama sekali, from < until)
export const reminderSettingsSchema; // reminder_whatsapp, reminder_email, reminder_push, reminder_day_before, reminder_same_day

// booking-settings-actions.ts (pola updateBookingSettings: getUser, update .eq("merchant_id"), revalidatePath(ROUTES.settings))
export async function updateCustomerPolicy(prev: BookingSettingsState, formData: FormData): Promise<BookingSettingsState>;
export async function updateContactSettings(prev: BookingSettingsState, formData: FormData): Promise<BookingSettingsState>;
export async function updateReminderSettings(prev: BookingSettingsState, formData: FormData): Promise<BookingSettingsState>;
```

Ketentuan (teks M4, `DESIGN.md` berlaku):
- Tiga kartu baru di bawah `BookingSettingsForm`, sebelum `AccountSection`, masing-masing form dan tombol "Simpan perubahan" sendiri (pola F2). Pesan gagal netral, sukses `role="status"`.
- "Ubah jadwal & batal oleh pelanggan": sakelar `Pelanggan boleh ubah jadwal sendiri` dengan baris `Paling lambat [n] jam sebelum jadwal` dan `Maksimal [n] kali`; sakelar `Pelanggan boleh batal sendiri` dengan `Paling lambat [n] jam sebelum jadwal`; textarea `Kebijakan yang dilihat pelanggan` dengan placeholder `DP tidak dikembalikan jika dibatalkan, tetapi bisa dipakai untuk jadwal baru.` dan bantuan `Pengembalian DP tidak diproses otomatis. Uang ada di akun payment Anda.`
- "Kontak & media sosial": deskripsi `Tampil di tombol "Hubungi" pada halaman booking pelanggan. Kosongkan yang tidak dipakai.` Tabel Kanal / Alamat / Tampil: baris WhatsApp hanya-baca dari `merchants.whatsapp_number` dengan tautan `Ubah di Profil` (atau `Belum diisi`), lalu Telepon, Email, Instagram, Threads, X, TikTok sebagai input (`aria-label="Alamat <Kanal>"`) plus checkbox `aria-label="Tampilkan <Kanal>"`. Lalu `Jam balas pesan [time] sampai [time] WIB`. Di bawah 768px tabel menjadi daftar bertumpuk.
- "Pengingat untuk pelanggan": deskripsi `Kanal yang Anda nyalakan bisa dipilih pelanggan. Pelanggan tetap bisa mematikannya sendiri.` Sakelar WhatsApp (`Paling sering dibaca.`), Email (`Dengan file kalender .ics.`), Notifikasi HP (`Gratis, tanpa aplikasi. Di iPhone pelanggan perlu menambah halaman ke Layar Utama.`). `Jadwal bawaan`: dua tombol `aria-pressed` `H-1 sekitar pukul 08.00` dan `Pagi hari jadwal`. Merchant di luar `REMINDER_TIERS`: kontrol dinonaktifkan dan teks `Pengingat untuk pelanggan tersedia di paket Pro dan Studio.` dengan tautan ke `ROUTES.billing`.
- `page.tsx`: perluas select `merchant_settings` dengan semua kolom Task 1 (fallback `DEFAULT_MANAGE_SETTINGS` dan default Keputusan 1/2 bila baris tidak ada), teruskan `whatsapp_number` dan `merchant.subscription_tier`.
- `plans.ts`: fitur Pro `Reminder WhatsApp H-1 ke pelanggan` menjadi `Pengingat ke pelanggan lewat WhatsApp, email, dan notifikasi HP`.
- Story: semua menyala, semua mati, merchant Starter, error simpan, HP 390px.

- [ ] **Step 1: Tulis tes yang gagal** di `merchant-settings.test.ts`: `contactSettingsSchema` menerima `contact_instagram: "@riasbysekar"` → `"riasbysekar"`, `contact_phone: "0812-9876-5432"` → `"+6281298765432"`, string kosong → null, `contact_hidden` berisi `"TIKTOK"` bila `show_TIKTOK` tidak terkirim; menolak `reply_from: "20:00", reply_until: "09:00"` dan `reply_from` tanpa `reply_until`; `customerPolicySchema` menolak `max_reschedules: "0"` dan `reschedule_min_hours: "169"`, mengubah `policy_text: ""` jadi null.
- [ ] **Step 2: Jalankan** `npm run test:unit`. Harapan: gagal.
- [ ] **Step 3: Implementasikan** skema, aksi, tiga form, page, plans, dan story.
- [ ] **Step 4: Verifikasi** `npm run typecheck && npm run lint && npm run test:unit`.
- [ ] **Step 5: Commit**: `git commit -m "Tambah pengaturan kebijakan pelanggan, kontak, dan pengingat"`.

---

### Task 6: Halaman booking saya (P1) dan sheet Hubungi (P3)

Model: sonnet.

**Files:**
- Create: `src/app/pesanan/[token]/contact-sheet.tsx`, `src/app/pesanan/[token]/cancel-booking-button.tsx`, `src/app/pesanan/[token]/reminder-summary.tsx`
- Modify: `src/app/pesanan/[token]/page.tsx`, `src/app/pesanan/[token]/booking-status-view.tsx`, `src/app/pesanan/[token]/booking-status-view.stories.tsx`, `src/components/booking-page/add-to-calendar-button.tsx` (prop opsional `label`, default teks sekarang)

**Interfaces:**
- Consumes: Task 3 (`manageState`, `policyLines`, `bookingCode`, `contactLinks`, `contactWhatsappText`, `replyHoursLabel`, `CUSTOMER_CANCEL_REASON`, `customerManageErrorMessage`), Task 4 (`ROUTES.bookingReschedule`, `ROUTES.bookingReminders`, `ROUTES.bookingCancelApi`), Task 2 tabel, `REMINDER_TIERS`.
- Produces:

```ts
// booking-status-view.tsx
export type BookingPageRow = /* yang ada */ & {
  service_id: string | null; staff_id: string | null;
  attended_at: string | null; no_show_at: string | null; reschedule_count: number;
};
export type ReminderView = {
  whatsapp: boolean; email: boolean; push: boolean;       // efektif untuk booking ini
  channelsOffered: { whatsapp: boolean; email: boolean; push: boolean }; // dinyalakan merchant
  offsets: { dayBefore: boolean; sameDay: boolean };
};
type ViewProps = /* yang ada */ & {
  code: string;
  manage: ManageState;
  policy: string[];
  contact: { whatsapp: ContactLink | null; others: ContactLink[]; replyHours: string | null };
  reminders: ReminderView | null;   // null = tidak tersedia (paket, status, atau semua kanal dimatikan merchant)
  /** Diisi Task 9; Task 6 merender null. */
  pushPrompt?: React.ReactNode;
};
export function ContactSheet(props: { merchantName: string; whatsappText: string;
  contact: ViewProps["contact"]; open: boolean; onOpenChange: (open: boolean) => void }): JSX.Element;
export function CancelBookingButton(props: { token: string; policy: string[] }): JSX.Element;
export function ReminderSummary(props: { token: string; startISO: string; reminders: ReminderView }): JSX.Element;
```

Ketentuan:
- `page.tsx` (`getBookingPageData`): tambah kolom di atas dan `customer_whatsapp` ke `BOOKING_COLUMNS` (tanpa `access_token`). `customer_whatsapp` hanya dipakai server untuk 4 digit terakhir (Task 9) dan tidak diteruskan utuh. Tambah `whatsapp_number` ke select merchant. Query admin terpisah, semuanya `.eq("merchant_id", booking.merchant_id)`: `merchant_settings` (kolom Task 1), `booking_reminder_prefs` `.eq("booking_id", booking.id)`, dan jumlah `push_subscriptions` (`select("id", { count: "exact", head: true })`). Error query ini di-`console.error` lalu fallback ke default (halaman booking tetap tampil). `nowMs` dihitung di fungsi data. `reminders` null bila tier di luar `REMINDER_TIERS`, status bukan `PAID`/`CONFIRMED`, atau tiga `reminder_*` kanal mati. Kanal efektif per Keputusan 17.
- Booked (`PAID`/`CONFIRMED`), urutan P1: blok tanggal yang ada; `dl` yang ada ditambah baris `Kode booking` (`code`); baris tiga tombol 44px setara lebar: `Ubah jadwal` (`Link` ke P2, hanya bila `manage.reschedule.allowed`), `Hubungi` (membuka `ContactSheet`, hanya bila ada kontak), `Kalender` (`AddToCalendarButton label="Kalender"`); `pushPrompt`; `ReminderSummary` bila `reminders`; kartu `Kebijakan ${merchantName}` berisi `policy` sebagai paragraf; `CancelBookingButton` bila `manage.cancel.allowed`; tautan kembali dan catatan simpan halaman yang ada.
- `REQUESTED`: tambah `Hubungi` dan `CancelBookingButton` (dengan `policy`). `PENDING`/disetujui: tambah `Hubungi`. Dibatalkan: bila `cancel_reason === CUSTOMER_CANCEL_REASON`, judul `Anda membatalkan booking ini` dan alasan tidak diulang.
- `ContactSheet` (`Sheet side="bottom"`, judul `Hubungi ${merchantName}`, deskripsi `replyHours` bila ada): kartu WhatsApp besar (label, `Paling cepat dibalas`, `Chat`, pratinjau teks pesan dalam tanda kutip, terpotong 80 karakter dengan `...`), lalu daftar kanal lain sebagai tautan 44px `target="_blank" rel="noopener noreferrer"` (Telepon dan Email tanpa `_blank`), lalu `Hanya kanal yang diaktifkan ${merchantName} yang tampil di sini.`
- `CancelBookingButton`: tombol teks `destructive` `Batalkan booking` membuka `Dialog`: judul `Batalkan booking ini?`, isi `policy` lalu `Slot Anda dilepas dan tidak bisa dikembalikan.`, tombol `Kembali` dan `Ya, batalkan` (destructive, `Spinner` saat proses). POST ke `ROUTES.bookingCancelApi(token)`; sukses → tutup dan `router.refresh()`; gagal → pesan dari respons `role="alert"` di dialog, dan bila 409 juga `router.refresh()`.
- `ReminderSummary`: judul `Pengingat` dengan tautan `Atur` ke P4; tiga baris kanal yang ditawarkan merchant dengan `Aktif`/`Mati` (teks, bukan warna saja); kalimat jadwal: kedua offset `Dikirim ${hari H-1} dan ${hari H}, sekitar pukul 08.00 WIB.`, satu offset `Dikirim ${hari}, sekitar pukul 08.00 WIB.`, tanpa offset atau tanpa kanal aktif `Tidak ada pengingat yang akan dikirim.` Hari ditulis seperti `Jumat, 20 November` (`formatDate`).
- Story: `CONFIRMED` semua aksi, `PAID` DP lewat deadline (tanpa Ubah jadwal dan Batalkan, kebijakan tetap tampil), `REQUESTED`, dibatalkan pelanggan, merchant Starter (tanpa Pengingat), sheet Hubungi terbuka 390px, sheet tanpa WhatsApp.

- [ ] **Step 1:** Implementasikan perubahan data, tampilan, dan tiga komponen.
- [ ] **Step 2: Verifikasi** `npm run typecheck && npm run lint && npm run test:unit`, lalu buka story di `npm run storybook` pada 390px: tombol 44px, tidak ada `·`.
- [ ] **Step 3: Commit**: `git commit -m "Tampilkan kelola booking, kebijakan, kontak, dan ringkasan pengingat di halaman booking saya"`.

---

### Task 7: Halaman ubah jadwal (P2)

Model: sonnet.

**Files:**
- Create: `src/app/pesanan/[token]/ubah-jadwal/page.tsx`, `src/app/pesanan/[token]/ubah-jadwal/reschedule-form.tsx`, `src/app/pesanan/[token]/ubah-jadwal/reschedule-form.stories.tsx`

**Interfaces:**
- Consumes: Task 3 (`manageState`, `bookingCode`, `customerManageErrorMessage`), Task 4 (`ROUTES.bookingRescheduleApi`, `ROUTES.bookingStatus`), `buildDateStrip`, `nextOpenDate` (`src/lib/booking/schedule.ts`), `DateStrip`, `TimeSlotPicker`, `TimeSlotState`, `StickyActionBar`, `BookingPageShell`, `GET /api/slots?username&serviceId&date&staffId`.
- Produces:

```ts
export function RescheduleForm(props: {
  token: string; username: string; serviceId: string; staffId: string | null;
  serviceName: string; code: string; currentStart: string;
  earliestNewStart: string; left: number; max: number; paidAmount: number | null; // null bila tidak ada pembayaran online
  strip: DateStripDay[];
}): JSX.Element;
```

Ketentuan:
- `page.tsx`: `dynamic = "force-dynamic"`, metadata `{ title: "Ubah jadwal", robots: { index: false, follow: false } }`. Data seperti P1 (booking lewat token, merchant, settings, `availability` difilter `merchant_id` untuk hari buka, tema lewat `resolveTheme`). Token salah → `notFound()`. Bila `!manage.reschedule.allowed`, `service_id` null, atau merchant tanpa `username`: tampilkan kartu `Jadwal booking ini tidak bisa diubah lewat halaman ini.` dengan alasan dari `customerManageErrorMessage` (`OFF`→`BK041`, `STATUS`→`BK040`, `DEADLINE`→`BK042`, `LIMIT`→`BK043`), tautan `Hubungi merchant` ke P1, dan `Kembali ke booking`.
- `RescheduleForm` (urutan P2): judul `Ubah jadwal`, deskripsi `${serviceName}, ${code}`; catatan `Gratis, pembayaran ${formatRupiah(paidAmount)} tetap berlaku.` (atau `Gratis.` bila `paidAmount` null) lalu `Ini kesempatan ubah terakhir Anda.` bila `left === 1`, atau `Sisa ${left} dari ${max} kali ubah jadwal.`; blok `Jadwal sekarang`; `Tanggal baru` (`DateStrip`, 14 hari dari hari ini); `Jam baru` (`TimeSlotPicker`, slot dengan `startUtc < earliestNewStart` dibuang sebelum ditampilkan; semua terbuang → keadaan `empty`); ringkasan `Dari` / `Menjadi` (`formatDateTime`); `StickyActionBar` dengan tombol `Simpan jadwal baru` (nonaktif sebelum jam dipilih). Pemuatan slot memakai pola `requestIdRef` dari `booking-flow.tsx`.
- Sukses: ganti isi dengan `role="status"` judul `Jadwal sudah diubah`, `Sekarang ${formatDateTime(baru)}. Pengingat ikut pindah.` dan tombol `Lihat booking` ke P1. Gagal: pesan respons `role="alert"` di atas tombol; untuk `23P01`, `BK046`, `P0006` muat ulang slot tanggal terpilih.
- Story: memuat slot (fetch palsu lewat `parameters` atau prop), kesempatan terakhir, gagal bentrok, sukses, 390px.

- [ ] **Step 1:** Implementasikan halaman, form, dan story.
- [ ] **Step 2: Verifikasi** `npm run typecheck && npm run lint`, lalu dengan `npm run dev` dan DB lokal: pindah jadwal booking `CONFIRMED` milik merchant dengan `allow_customer_reschedule = true` berhasil, P1 menunjukkan jadwal baru, dan percobaan kedua menampilkan halaman tidak bisa diubah. Bila DB lokal tidak tersedia, catat.
- [ ] **Step 3: Commit**: `git commit -m "Tambah halaman ubah jadwal untuk pelanggan"`.

---

### Task 8: Fondasi web push: VAPID, service worker, manifest, rute langganan

Model: sonnet.

**Files:**
- Create: `public/sw.js`, `src/lib/notify/push.ts`, `src/lib/notify/push.test.ts`, `src/app/api/pesanan/[token]/push/route.ts`, `src/app/api/pesanan/[token]/manifest/route.ts`, `src/app/pesanan/[token]/push-client.ts`
- Modify: `package.json`, `package-lock.json`, `src/lib/env/server.ts`, `src/lib/env/client.ts`, `.env.example`, `src/lib/crypto/secret-box.ts`, `src/lib/crypto/secret-box.test.ts`, `src/proxy.ts`, `src/lib/routes.ts`, `src/app/pesanan/[token]/page.tsx` (metadata `manifest`)

**Interfaces:**
- Consumes: Task 2 tabel, Task 1 kolom `reminder_push`, `REMINDER_TIERS`.
- Produces:

```ts
// env
serverEnv(): + { vapidPublicKey?: string; vapidPrivateKey?: string; vapidSubject?: string }
// dari NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (emptyToUndefined; subject harus diawali "mailto:" atau "https://")
clientEnv(): + { vapidPublicKey?: string }   // process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY literal

// secret-box.ts
export type SecretContext =
  | { merchantId: string; provider: PaymentProvider; field: "access_token" | "refresh_token" | "webhook_token" }
  | { merchantId: string; bookingId: string; field: "push_subscription" };
// AAD push: `${merchantId}:${bookingId}:push_subscription`; AAD pembayaran tidak berubah.

// push.ts (import "server-only" dan "web-push")
export type PushConfig = { publicKey: string; privateKey: string; subject: string };
export function pushConfig(): PushConfig | null;   // null bila salah satu env kosong
export type StoredPushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };
export const PUSH_HOST_SUFFIXES: readonly string[]; // Keputusan 12
export function isAllowedPushEndpoint(endpoint: string): boolean;
export const pushSubscriptionSchema: z.ZodType<StoredPushSubscription>; // endpoint <= 1000 + isAllowedPushEndpoint, keys base64url <= 200
export function endpointHash(endpoint: string): string;  // sha256 hex
export type PushPayload = { title: string; body: string; url: string; tag: string };
export async function sendPush(config: PushConfig, sub: StoredPushSubscription, payload: PushPayload):
  Promise<SendResult & { gone?: boolean }>;  // TTL 43200 detik; 404/410 -> { ok: false, reason, gone: true }

// routes.ts
serviceWorker: "/sw.js",
bookingPushApi: (token: string) => `/api/pesanan/${token}/push`,
bookingManifest: (token: string) => `/api/pesanan/${token}/manifest`,

// POST /api/pesanan/[token]/push    body StoredPushSubscription -> 200 { ok: true } | 400 | 404 | 409 { error } | 500
// DELETE /api/pesanan/[token]/push  -> 200 { ok: true } (menghapus SEMUA langganan booking itu) | 404 | 500
// GET /api/pesanan/[token]/manifest -> application/manifest+json, tanpa query database

// push-client.ts ("use client" tidak perlu; modul browser murni)
export type PushSupport = "unsupported" | "ios-needs-install" | "denied" | "available";
export function pushSupport(): PushSupport;
export async function subscribePush(token: string, vapidPublicKey: string): Promise<{ ok: true } | { ok: false; message: string }>;
export async function unsubscribePush(token: string): Promise<{ ok: true } | { ok: false; message: string }>;
```

Ketentuan:
- Pasang `npm install web-push` dan `npm install -D @types/web-push`; versi persis yang terpasang ditulis di `package.json` tanpa `^` (harapan 3.6.x).
- `public/sw.js`: `push` → `showNotification(data.title, { body, tag, data: { url } })`, judul cadangan `Pengingat booking`; `notificationclick` → tutup, lalu `clients.openWindow(url)` hanya bila `new URL(url, self.location.origin).origin === self.location.origin`. Komentar Indonesia. Tanpa cache dan tanpa `fetch` handler.
- `src/proxy.ts`: matcher menjadi `"/((?!api|_next/static|_next/image|favicon.ico|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)"`, komentar kenapa (Keputusan 14).
- POST push: cek token, `pushSubscriptionSchema.safeParse` (400 `Langganan notifikasi tidak valid.`), baca booking `id, merchant_id, status, end_datetime` lewat `access_token`; 404 bila tidak ada; 409 `Pengingat tidak tersedia untuk booking ini.` bila status bukan `PAID`/`CONFIRMED`, sudah selesai, tier merchant di luar `REMINDER_TIERS`, atau `reminder_push` mati; 409 `Notifikasi HP belum disiapkan.` bila `pushConfig()` null. Lalu `upsert` `{ booking_id, merchant_id, endpoint_hash, subscription_enc: encryptSecret(JSON.stringify(sub), { merchantId, bookingId, field: "push_subscription" }) }` `onConflict: "booking_id,endpoint_hash"`. DELETE: baca booking lewat token, `delete().eq("booking_id", id).eq("merchant_id", merchant_id)`.
- Manifest: `{ name: "Booking Anda", short_name: "Booking", start_url: "/pesanan/<token>", scope: "/pesanan/<token>", display: "standalone", background_color: "#ffffff" }`; token tidak valid → 404. `generateMetadata` halaman P1 menambah `manifest: ROUTES.bookingManifest(token)`.
- `push-client.ts`: `pushSupport` mengembalikan `ios-needs-install` bila UA iPhone/iPad dan `PushManager` tidak ada di `window`, `unsupported` bila `serviceWorker` atau `PushManager` tidak ada, `denied` bila `Notification.permission === "denied"`. `subscribePush`: `navigator.serviceWorker.register(ROUTES.serviceWorker)`, `Notification.requestPermission()` (ditolak → `Izin notifikasi ditolak. Ubah di pengaturan browser.`), `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` (kunci base64url ke `Uint8Array`), POST `subscription.toJSON()`. `unsubscribePush`: DELETE saja (Keputusan 11).
- `.env.example`: tiga variabel dengan komentar `npx web-push generate-vapid-keys` dan contoh `VAPID_SUBJECT=mailto:halo@domainanda.id`.

- [ ] **Step 1: Tulis tes yang gagal.** `push.test.ts`: `isAllowedPushEndpoint` true untuk `https://fcm.googleapis.com/fcm/send/abc`, `https://updates.push.services.mozilla.com/wpush/v2/x`, `https://web.push.apple.com/Q1`, `https://wns2-par02p.notify.windows.com/w/?token=x`; false untuk `http://fcm.googleapis.com/x`, `https://fcm.googleapis.com.evil.test/x`, `https://evilfcm.googleapis.com.test/x`, `https://169.254.169.254/latest`, `https://localhost/x`, `bukan url`. `pushSubscriptionSchema` menolak endpoint 1001 karakter dan `keys` tanpa `auth`. `endpointHash("a")` = `"ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb"`. `secret-box.test.ts`: payload push untuk booking A gagal didekripsi dengan konteks booking B, dan payload pembayaran yang ada tetap didekripsi dengan konteks lamanya.
- [ ] **Step 2: Jalankan** `npm run test:unit`. Harapan: gagal.
- [ ] **Step 3: Implementasikan** semua berkas di atas.
- [ ] **Step 4: Verifikasi** `npm run typecheck && npm run lint && npm run test:unit`. Dengan `npm run dev`: `curl -sI localhost:3000/sw.js` → `200` dan `content-type` JavaScript; `curl -s localhost:3000/api/pesanan/<48 hex>/manifest` berisi `"display":"standalone"`; POST push dengan endpoint `https://169.254.169.254/x` → 400.
- [ ] **Step 5: Commit**: `git commit -m "Tambah fondasi web push: VAPID, service worker, manifest, dan rute langganan"`.

---

### Task 9: Atur pengingat (P4) dan ajakan notifikasi di P1

Model: sonnet.

**Files:**
- Create: `src/app/pesanan/[token]/pengingat/page.tsx`, `src/app/pesanan/[token]/pengingat/reminder-form.tsx`, `src/app/pesanan/[token]/pengingat/reminder-form.stories.tsx`, `src/app/api/pesanan/[token]/pengingat/route.ts`, `src/app/pesanan/[token]/push-prompt.tsx`, `src/lib/validations/reminder-prefs.ts`
- Modify: `src/app/pesanan/[token]/page.tsx`, `src/app/pesanan/[token]/booking-status-view.stories.tsx`

**Interfaces:**
- Consumes: Task 6 `ReminderView`, `pushPrompt`; Task 8 `pushSupport`, `subscribePush`, `unsubscribePush`, `clientEnv().vapidPublicKey`; Task 2 tabel; `REMINDER_TIERS`.
- Produces:

```ts
// reminder-prefs.ts
export const reminderPrefsSchema: z.ZodType<{ whatsapp: boolean; email: string | null; day_before: boolean; same_day: boolean }>;
// email: "" atau null -> null, selain itu z.email() <= 254

// PUT /api/pesanan/[token]/pengingat  body reminderPrefsSchema -> 200 { ok: true } | 400 | 404 | 409 { error: "Pengingat tidak tersedia untuk booking ini." } | 500
// upsert booking_reminder_prefs { booking_id, merchant_id, ...body } onConflict "booking_id";
// kanal yang dimatikan merchant disimpan apa adanya tetapi tidak berefek (Keputusan 17).

export function ReminderForm(props: {
  token: string; vapidPublicKey: string | undefined;
  serviceName: string; startISO: string; phoneLast4: string;
  offered: ReminderView["channelsOffered"];
  initial: { whatsapp: boolean; email: string | null; dayBefore: boolean; sameDay: boolean; push: boolean };
}): JSX.Element;
export function PushPrompt(props: { token: string; bookingId: string; vapidPublicKey: string; offsets: ReminderView["offsets"] }): JSX.Element | null;
```

Ketentuan:
- P4 `page.tsx`: `force-dynamic`, noindex, judul `Pengingat`. Data lewat token seperti P1. `reminders` null (Task 6) → kartu `Pengingat tidak tersedia untuk booking ini.` dengan tautan kembali. `phoneLast4` = 4 digit terakhir `customer_whatsapp`.
- `ReminderForm` (urutan P4): header dengan tautan kembali 44px `aria-label="Kembali ke booking Anda"`, deskripsi `${serviceName}, ${formatDateTime(startISO)}`, judul `Pengingat`. Bagian `Kirim lewat` (hanya kanal di `offered`), masing-masing `Switch` 44px berlabel: `Notifikasi di HP ini` (`Muncul di layar kunci. Tanpa aplikasi.`), `WhatsApp` (`Ke nomor berakhiran ${phoneLast4}`), `Email` (`Dengan file kalender (.ics).`, saat menyala tampil input `Alamat email` `type="email" autocomplete="email"`). Sakelar push bertindak langsung: menyala → `subscribePush`, mati → `unsubscribePush`, dengan status `role="status"`; `pushSupport()` `ios-needs-install` → sakelar nonaktif dan petunjuk `Pakai iPhone? Ketuk Bagikan lalu "Tambah ke Layar Utama", buka dari ikon itu, lalu aktifkan lagi.`; `unsupported` → `Browser ini tidak mendukung notifikasi.`; `denied` → `Izin notifikasi ditolak. Ubah di pengaturan browser.`; `vapidPublicKey` kosong → baris push tidak dirender. Bagian `Kapan`: dua tombol `aria-pressed` `H-1 (${hari singkat H-1})` dan `Pagi hari jadwal`, lalu `aria-live="polite"` `${n} pengingat lewat ${m} kanal.` atau `Tidak ada pengingat yang akan dikirim.` Tombol `Simpan pengingat` (PUT, lalu `router.push` ke P1) dan catatan `Bisa dimatikan kapan saja dari halaman ini atau tautan detail di setiap pesan.`
- `PushPrompt` (dirender P1 lewat `pushPrompt` hanya bila `reminders.channelsOffered.push`, `!reminders.push`, dan `vapidPublicKey` ada): klien; tidak merender apa pun bila `pushSupport()` `unsupported` atau `denied`, atau sudah ditutup (`localStorage` kunci `marky-push-dismissed-${bookingId}`, dibungkus try/catch). Isi: `Mau diingatkan di HP ini?`, `Notifikasi muncul ${teks offset}, tanpa perlu buka WhatsApp.` (teks offset: `H-1`, `pagi hari jadwal`, atau `H-1 dan pagi hari jadwal`), tombol `Nanti saja` dan `Aktifkan` (`subscribePush` lalu `router.refresh()`). Pada `ios-needs-install`, `Aktifkan` diganti petunjuk iPhone di atas.
- Story: P4 semua kanal, tanpa push (VAPID kosong), iPhone belum ditambah ke Layar Utama, email menyala dengan alamat tidak valid, gagal simpan; P1 dengan `PushPrompt`.

- [ ] **Step 1: Tulis tes yang gagal** untuk `reminderPrefsSchema` (berkas `src/lib/validations/reminder-prefs.test.ts`): `email: ""` → null, `email: "a@b.co"` diterima, `email: "bukan"` ditolak, `day_before` wajib boolean.
- [ ] **Step 2: Jalankan** `npm run test:unit`. Harapan: gagal.
- [ ] **Step 3: Implementasikan** skema, rute, halaman, form, `PushPrompt`, dan sambungan `pushPrompt` di P1.
- [ ] **Step 4: Verifikasi** `npm run typecheck && npm run lint && npm run test:unit`. Di Chrome desktop dengan `npm run dev`, VAPID lokal, dan DB lokal: aktifkan notifikasi di P1, baris `push_subscriptions` muncul, P1 menunjukkan Notifikasi HP `Aktif`; matikan di P4, barisnya hilang. Bila tidak bisa diuji, catat.
- [ ] **Step 5: Commit**: `git commit -m "Tambah halaman atur pengingat dan ajakan notifikasi HP"`.

---

### Task 10: Cron pengingat dua offset dan tiga kanal

Model: sonnet.

**Files:**
- Create: `src/lib/notify/reminder-plan.ts` (lengkapi berkas dari Task 5), `src/lib/notify/reminder-plan.test.ts`
- Modify: `src/lib/notify/window.ts`, `src/lib/notify/window.test.ts`, `src/lib/notify/dispatch.ts`, `src/lib/notify/templates.ts`, `src/lib/notify/templates.test.ts`, `src/lib/notify/email.ts`, `src/app/api/cron/reminders/route.ts`, `docs/NOTIFIKASI.md`

**Interfaces:**
- Consumes: Task 1 kind/kanal, Task 2 tabel dan `prune_push_subscriptions`, Task 8 `pushConfig`, `sendPush`, `decryptSecret`, `buildBookingIcs`.
- Produces:

```ts
// window.ts
/** [max(now + 30 menit, awal hari ini WIB), awal besok WIB). */
export function sameDayRange(now: Date): { from: Date; to: Date };

// reminder-plan.ts
export const REMINDER_TIERS: SubscriptionTier[] = ["PRO", "STUDIO"];
export type ReminderOffset = "DAY_BEFORE" | "SAME_DAY";
export const REMINDER_KIND: Record<ReminderOffset, NotificationKind> =
  { DAY_BEFORE: "REMINDER_CUSTOMER", SAME_DAY: "REMINDER_CUSTOMER_SAME_DAY" };
export type ReminderSettings = Pick<MerchantSettings,
  "reminder_whatsapp" | "reminder_email" | "reminder_push" | "reminder_day_before" | "reminder_same_day">;
export const DEFAULT_REMINDER_SETTINGS: ReminderSettings; // true, true, true, true, false
export type ReminderPrefs = Pick<BookingReminderPrefs, "whatsapp" | "email" | "day_before" | "same_day">;
/** Keputusan 17. Offset mati -> []. Urutan hasil: WHATSAPP, EMAIL, PUSH. */
export function reminderChannels(offset: ReminderOffset, s: ReminderSettings, p: ReminderPrefs | null, hasPush: boolean): NotificationChannel[];

// email.ts
EmailMessage (templates.ts) + attachments?: { filename: string; content: string }[]  // content base64, diteruskan ke body Resend

// templates.ts (ganti tanda tangan yang ada)
export function customerReminderWhatsapp(data: BookingMessageData, offset: ReminderOffset): string; // "besok:" atau "hari ini:"
export function customerReminderEmail(data: BookingMessageData, offset: ReminderOffset): EmailMessage;
export function customerReminderPush(data: BookingMessageData, offset: ReminderOffset): PushPayload;

// dispatch.ts (menggantikan sendDayBeforeReminders)
export async function sendReminders(now?: Date): Promise<{ candidates: number; pruned: number }>;
```

Ketentuan:
- `sendReminders`: panggil `prune_push_subscriptions` (gagal → log, lanjut). Dua jendela: `DAY_BEFORE` = `tomorrowJakartaRange(now)`, `SAME_DAY` = `sameDayRange(now)`, masing-masing booking `PAID`/`CONFIRMED`. Lalu muat sekali per jendela, semuanya difilter `merchant_id`: merchants (`.in("subscription_tier", REMINDER_TIERS)`), `merchant_settings` (lima kolom pengingat, default bila tidak ada), `booking_reminder_prefs` (`.in("booking_id", ids).in("merchant_id", merchantIds)`), `push_subscriptions` (`id, booking_id, merchant_id, subscription_enc`, filter sama). Per booking dan per kanal dari `reminderChannels`, `deliver(admin, booking, REMINDER_KIND[offset], channel, ...)`. WhatsApp tetap memakai jeda `REMINDER_GAP_MS`. Email ke `prefs.email`, lampiran `booking.ics` dari `buildBookingIcs` (butuh `end_datetime`: tambahkan ke `BOOKING_COLUMNS`). Push: dekripsi tiap langganan (konteks `{ merchantId, bookingId, field: "push_subscription" }`), `sendPush` ke semuanya; hasil `ok` bila minimal satu berhasil; langganan `gone` atau gagal didekripsi dihapus (`.eq("id").eq("merchant_id")`); tanpa `pushConfig()` → `SKIPPED` `Notifikasi HP belum dikonfigurasi`. `candidates` = jumlah booking yang punya minimal satu kanal di kedua jendela.
- `customerReminderPush`: judul `Pengingat: ${serviceName}`, isi `${besok|Hari ini}, ${formatTime(start)} WIB di ${merchantName}.`, `url` = `statusUrl` (relatif ke origin tidak perlu; `sw.js` memeriksa origin), `tag` = `booking-${id}` (`BookingMessageData` + `bookingId: string`).
- Email pengingat: subjek `Pengingat ${besok|hari ini}: ${serviceName}`, isi seperti WhatsApp ditambah tautan detail.
- `route.ts`: panggil `sendReminders`, kembalikan `{ candidates, pruned }`, komentar kepala menjelaskan dua offset dan batas Hobby (Keputusan 1).
- `docs/NOTIFIKASI.md`: tabel jenis pesan (H-1 dan pagi hari jadwal, kanal WhatsApp/email/notifikasi HP, Pro dan Studio; pemberitahuan ubah jadwal/batal ke merchant untuk semua paket), bagian baru "Notifikasi HP (web push)" berisi cara membuat kunci (`npx web-push generate-vapid-keys`), tiga env, catatan iPhone, dan bahwa langganan terenkripsi dengan `TOKEN_ENCRYPTION_KEY`; ganti judul "Reminder H-1".

- [ ] **Step 1: Tulis tes yang gagal.** `window.test.ts`: `sameDayRange(new Date("2026-11-16T01:50:00Z"))` (08:50 WIB) → `from` `2026-11-16T02:20:00.000Z`, `to` `2026-11-16T17:00:00.000Z`; `now` 23:50 WIB → `from` sama dengan `now + 30 menit` dan bisa melewati `to` (jendela kosong). `reminder-plan.test.ts`:

```ts
const S = DEFAULT_REMINDER_SETTINGS;
test("tanpa prefs: WA saja untuk H-1, hari H mati", () => {
  assert.deepEqual(reminderChannels("DAY_BEFORE", S, null, false), ["WHATSAPP"]);
  assert.deepEqual(reminderChannels("SAME_DAY", S, null, true), []);
});
test("prefs menimpa default merchant, null ikut merchant", () => {
  const p = { whatsapp: false, email: "a@b.co", day_before: null, same_day: true };
  assert.deepEqual(reminderChannels("DAY_BEFORE", S, p, true), ["EMAIL", "PUSH"]);
  assert.deepEqual(reminderChannels("SAME_DAY", S, p, false), ["EMAIL"]);
});
test("kanal yang dimatikan merchant tidak pernah dipakai", () => {
  const off = { ...S, reminder_whatsapp: false, reminder_push: false };
  assert.deepEqual(reminderChannels("DAY_BEFORE", off, null, true), []);
});
```

  `templates.test.ts`: `customerReminderWhatsapp(data, "SAME_DAY")` memuat `hari ini:` dan tidak memuat `besok`; `customerReminderEmail` punya satu lampiran `booking.ics` yang setelah base64-decode diawali `BEGIN:VCALENDAR`.
- [ ] **Step 2: Jalankan** `npm run test:unit`. Harapan: gagal.
- [ ] **Step 3: Implementasikan** semua perubahan; hapus `sendDayBeforeReminders` dan `REMINDER_TIERS` lama di `dispatch.ts` (impor dari `reminder-plan.ts`).
- [ ] **Step 4: Verifikasi** `npm run typecheck && npm run lint && npm run test:unit`. Dengan `npm run dev` dan DB lokal: `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/reminders` dua kali; panggilan kedua tidak menambah baris `notification_log`. Bila tidak bisa diuji, catat.
- [ ] **Step 5: Commit**: `git commit -m "Perluas cron pengingat ke hari H, email, dan notifikasi HP"`.

---

### Task 11: Verifikasi akhir dan dokumentasi

Dikerjakan controller, bukan subagen.

- [ ] **Step 1:** `open -a Docker`, lalu `npm run docker:test`. Tidak ada baris `FAIL` di seluruh output, termasuk bagian 36 sampai 43.
- [ ] **Step 2:** `npm run check` dan `npm run build-storybook` lulus.
- [ ] **Step 3:** Pemeriksaan browser dengan `npm run dev` dan data lokal (atau Storybook bila Supabase lokal tidak tersedia; catat yang tidak terverifikasi) pada 390px dan 1280px:
  - `/pesanan/<token>` booking `CONFIRMED` merchant Pro dengan semua kebijakan menyala: kode booking, tiga tombol, ajakan notifikasi, ringkasan pengingat, kebijakan, Batalkan dengan dialog. Booking lewat deadline: Ubah jadwal dan Batalkan hilang, kebijakan tetap.
  - Sheet Hubungi: WhatsApp membuka `wa.me` dengan teks berisi kode, kanal lain hanya yang tampil, jam balas.
  - `/pesanan/<token>/ubah-jadwal`: slot sebelum batas tidak tampil, simpan berhasil, P1 menunjukkan jadwal baru, baris `BOOKING_RESCHEDULED_MERCHANT` di timeline dashboard.
  - `/pesanan/<token>/pengingat`: sakelar, petunjuk iPhone (emulasi UA iPhone), simpan kembali ke P1 dengan ringkasan baru.
  - `/sw.js` 200, `/api/pesanan/<token>/manifest` JSON, push berlangganan di Chrome bila VAPID lokal ada.
  - `/dashboard/settings`: tiga kartu baru tersimpan, Starter melihat ajakan Pro, tabel kontak bertumpuk di 390.
  - Di semua halaman: target sentuh 44px atau lebih, fokus terlihat dengan Tab, tidak ada em dash atau `·`, merah hanya pada Batalkan.
- [ ] **Step 4:** Tambah `## 33. Kelola booking pelanggan dan pengingat` di `docs/DECISIONS.md` (Keputusan 1, 2, 6, 10, 11, 12, 14 dengan alasannya; sesuaikan nomor bila F3 memakai nomor lain). Perbarui bagian Status di `AGENTS.md` dengan satu paragraf F4: pelanggan bisa ubah jadwal dan batal sendiri sesuai `merchant_settings` (`reschedule_booking`, `cancel_booking_by_customer`, khusus `service_role` lewat `/api/pesanan/[token]/*`), sheet Hubungi, pengingat H-1 dan pagi hari jadwal lewat WhatsApp, email, dan web push (`web-push`, VAPID sendiri, `public/sw.js`, `push_subscriptions` terenkripsi), panduan di `docs/NOTIFIKASI.md`. Perbarui baris F4 di `docs/superpowers/plans/2026-11-14-marky-roadmap.md` (rencana `2026-11-15-marky-f4-kelola-booking.md`, status selesai di cabang F4). Jalankan `graphify update .`.
- [ ] **Step 5:** Catat untuk langkah rilis (bukan dikerjakan di sini) bahwa Vercel butuh env baru: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, dan env WhatsApp sudah ada dan tetap wajib untuk kanal masing-masing. Tanpa VAPID, push `SKIPPED` dan semua UI push tersembunyi.
- [ ] **Step 6: Commit**: `git add docs/DECISIONS.md AGENTS.md docs/superpowers/plans/2026-11-14-marky-roadmap.md` lalu `git commit -m "Catat F4 selesai di keputusan, status, dan roadmap"`. Jangan stage `graphify-out/` kecuali proyek memang meng-commit-nya di cabang ini.

## Urutan eksekusi

1, 2 (migration berurutan), 3, 4, 5, 6, 7, 8, 9, 10, 11. Task 5 membuat `reminder-plan.ts` minimal yang dilengkapi Task 10. Task 6 sebelum 7 dan 9 karena keduanya memakai data dan tipe P1. Task 8 sebelum 9 karena P4 memakai klien push.
