# Marky: redesign, alur baru, dan fitur pendukung

Status: disetujui di desain (2026-11-14). Sumber visual:

- Alur booking, dashboard, pengaturan: https://claude.ai/artifact/RSGQtRjX4RQivoVekkfgeo
- Landing page: https://claude.ai/artifact/LMDhFXG7AvvbmjpCGUhx5a
- Arah visual yang mengikat: `DESIGN.md`

Kode artboard disebut dalam kurung, mis. (01), (M3), (D2).

## 1. Tujuan dan alasan

Tampilan sekarang terasa generik dan alurnya hanya mendukung satu cara bayar (lunas lewat QRIS). Merchant seperti restoran, barbershop, dan klinik butuh booking tanpa bayar di muka; merchant jasa butuh DP, promo, dan kontrol jadwal. Redesign ini:

1. Membuat halaman pelanggan yang mobile-first, mudah dipakai, dan bisa diberi merek merchant.
2. Mendukung beberapa cara bayar per layanan.
3. Memberi merchant dashboard yang dimulai dari "apa yang terjadi hari ini".
4. Menambah fitur yang mengurangi no-show dan menaikkan konversi: pengingat, ubah jadwal mandiri, promo, voucher.
5. Mengganti merek menjadi Marky dan membuat landing page yang menjual.

### Bukan tujuan

- Aplikasi native. Semua tetap web, termasuk notifikasi (web push).
- Pesan pengingat lewat Instagram, Threads, atau X. API mereka tidak mengizinkan bisnis mengirim pesan duluan; kanal itu hanya muncul sebagai tautan kontak.
- Mengubah palet dashboard. Dashboard tetap monokrom.
- Desktop layout terpisah untuk halaman pelanggan.

### Anti-goal

- Uang pelanggan ditahan platform. DP tetap langsung ke akun payment gateway merchant.
- Angka, testimoni, atau klaim karangan di UI mana pun.
- Gerakan yang tidak bisa dihentikan (>5 detik tanpa tombol jeda) atau mengabaikan `prefers-reduced-motion`.

## 2. Batasan yang sudah ada

Semua aturan `AGENTS.md` berlaku, terutama:

- Perubahan skema lewat migration baru, `REVOKE ALL` untuk tabel baru, grant per kolom, fungsi baru tertutup kecuali di-`GRANT EXECUTE` eksplisit, `src/types/database.ts` ikut diperbarui (pakai `type`, bukan `interface`), dan diuji dengan `npm run docker:test` plus kasus di `supabase/tests/99_verify.sql`.
- Tampilan halaman publik hanya lewat `resolveTheme()` / `themeToCssVars()`.
- `createAdminClient()` selalu memfilter `merchant_id`.
- Segmen rute baru masuk `ROUTES` dan `reserved_usernames`.
- UI dan komentar berbahasa Indonesia.

## 3. Pendekatan

| Pendekatan | Untung | Rugi |
|---|---|---|
| A. Satu cabang besar, semua sekaligus | Satu kali rilis | Tidak bisa diuji bertahap, risiko regresi di alur pembayaran |
| **B. Sub-proyek berurutan di balik feature flag per merchant (dipilih)** | Tiap fase bisa dirilis dan diuji sendiri, alur QRIS lama tetap jalan | Perlu menjaga kompatibilitas status booking selama transisi |
| C. Tulis ulang aplikasi | Bersih | Membuang RLS, test, dan alur yang sudah terbukti |

Dipilih B. Fitur yang mengubah alur uang (cara bayar, voucher) masuk lewat kolom default yang mempertahankan perilaku lama (`payment_mode = 'FULL'`).

## 4. Sub-proyek dan urutan

| Fase | Isi | Bergantung pada |
|---|---|---|
| F0 | Fondasi: Storybook, sisa rename Marky, token kontras, `DESIGN.md` diterapkan | – |
| F1 | Halaman pelanggan baru (tanpa perubahan alur uang) | F0 |
| F2 | Cara bayar per layanan + bayar di tempat + status booking baru | F1 |
| F3 | Dashboard baru: Hari ini, Booking + panel detail, booking manual, nav HP | F2 |
| F4 | Kelola booking pelanggan: ubah jadwal, batal, kontak, pengingat (WA, email, web push) | F2 |
| F5 | Promosi: banner dan voucher | F2 |
| F6 | Tampilan lanjutan: logo, sampul, gaya tombol, urutan bagian, latar bergerak | F1 |
| F7 | Profil staf dengan foto dan klip | F1 |
| F8 | Restoran: jumlah tamu, kapasitas, denah dan meja | F2, F3 |
| F9 | Panduan merchant baru: checklist, tur, panduan per halaman | F3 |
| F10 | Landing page Marky + SEO | F0 (bisa paralel) |

Rincian tiap fase di bawah. Setiap fase selesai bila: `npm run check` lulus, `npm run docker:test` lulus bila ada skema, story Storybook untuk komponen baru ada, dan alur utamanya diverifikasi di browser pada 390px dan 1280px.

## 5. Rincian fase

### F0. Fondasi

- Storybook 9 dengan `@storybook/nextjs-vite`, Tailwind v4 lewat `globals.css`, addon a11y dan viewport (390, 768, 1280). Story pertama: komponen di `src/components/booking-page/*` dengan data contoh dan 3 tema (Hangat, Malam, Berani).
- Komponen yang sekarang mengambil data sendiri dipecah: data di server component, tampilan di komponen murni yang bisa dirender Storybook.
- Sisa rename: README, AGENTS.md, docs, `compose.yaml`, `.env.example`, `reserved_usernames` + `marky`. Verifikasi DNS domain sendiri menerima `_marky` dan `_booka` selama masa transisi (migration + `src/lib/domains/config.ts`). Kunci `localStorage` onboarding menerima nama lama.
- `resolveTheme()`: `mutedForeground` minimal 4,5:1 (sekarang 3). Uji di `resolve.test.ts`.

### F1. Halaman pelanggan baru (01, 02, 03, 05, P5)

- Layanan sebagai kartu radio (bukan daftar ganda), bar aksi menempel di bawah, label cara bayar per kartu (sementara selalu "Bayar saat booking").
- Alur 3 langkah dengan indikator: Layanan, Jadwal, Data diri. Jadwal: strip tanggal termasuk hari tutup (nonaktif), jam dikelompokkan Pagi/Siang/Sore, keadaan memuat/kosong/gagal.
- Desktop: kolom yang sama ±440px di tengah, kartu QR "Lanjut di HP" di layar lebar.
- Halaman status booking `/pesanan/[token]` jadi "Halaman booking saya" (P1) tanpa aksi baru dulu.
- Komponen tetap memakai token tema.

### F2. Cara bayar per layanan (M1, M4, 03b, 05b, V2 harga)

Skema:

- `services.payment_mode` enum `FULL | DEPOSIT | ON_SITE | REQUEST`, default `FULL`.
- `services.deposit_type` enum `PERCENT | FIXED` null, `services.deposit_value` int null, dengan constraint: wajib diisi bila `DEPOSIT`, persen 1 sampai 90.
- `merchant_settings` (tabel baru, satu baris per merchant): `allow_pay_on_site`, `auto_confirm_on_site`, `max_active_per_phone`, `deposit_after_no_show`, plus kolom F4.
- `bookings`: status bertambah `CONFIRMED` (tanpa pembayaran online) dan `REQUESTED` (menunggu persetujuan); kolom `payment_mode` (snapshot), `amount_due_now`, `amount_due_on_site`, `paid_on_site_at`, `paid_on_site_method` (`CASH | QRIS | TRANSFER`), `attended_at`, `no_show_at`.
- `create_booking` menghitung `amount_due_now` di server; untuk `ON_SITE` tanpa `allow_pay_on_site` jatuh ke `FULL`. Batas booking aktif per nomor ditegakkan di fungsi.
- `/api/cron/cancel-unpaid` hanya menyentuh `PENDING`. Webhook tidak berubah.
- `REQUEST`: merchant menyetujui di dashboard, sistem membuat tagihan dan mengirim tautan bayar. Batas 24 jam lalu otomatis ditolak.

### F3. Dashboard (D1, D2, D3)

- Sidebar dikelompokkan: Hari ini, Booking, Analitik; Atur usaha; Halaman booking; Akun.
- "Hari ini" menggantikan Ringkasan: Perlu tindakan, agenda dengan tombol Hadir, total ditagih di tempat, ringkasan 7 hari.
- Booking: tab Perlu tindakan / Akan datang / Riwayat / Dibatalkan, pencarian, panel detail (Hadir, Tidak datang, Jadwal ulang, Batalkan, Tandai lunas di tempat dengan metode), riwayat notifikasi.
- Booking manual (telepon / datang langsung) memakai `create_booking` dengan sumber `MANUAL`.
- HP: nav bawah dengan tombol tambah booking.

### F4. Kelola booking pelanggan (P1 sampai P4, M4)

- `merchant_settings`: `allow_customer_reschedule`, `reschedule_min_hours`, `max_reschedules`, `allow_customer_cancel`, `cancel_min_hours`, `policy_text`, kanal kontak (`contact_email`, `contact_phone`, `instagram`, `threads`, `x`, `tiktok` beserta tampil/sembunyi), `reply_hours`.
- `bookings.reschedule_count`. RPC `reschedule_booking(token, new_start)` dan `cancel_booking_by_customer(token)` yang memeriksa kebijakan dan bentrok jadwal.
- Pengingat: `booking_reminder_prefs` (kanal + offset) dan `push_subscriptions` (endpoint terenkripsi, per booking). Web push lewat VAPID; di iOS hanya setelah ditambah ke Layar Utama, UI memberi petunjuk. Cron pengingat yang ada diperluas dari H-1 menjadi offset bebas, tetap idempoten lewat `notification_log`.
- Sheet kontak dengan pesan WhatsApp berisi kode booking.

### F5. Promosi (V1, V2, M5, M6)

- `merchant_banners`: sumber `TEMPLATE | IMAGE`, teks, warna dari tema, `image_path`, `alt_text` wajib untuk gambar, target (`VOUCHER | SERVICE | URL`), `starts_at`, `ends_at`, urutan, maksimal 3 tayang.
- `vouchers`: `code` unik per merchant (tidak peka huruf besar/kecil), `kind PERCENT | FIXED`, `value`, `max_discount`, `min_spend`, `service_ids`, `quota`, `per_phone_limit`, `new_customer_only`, `visibility PUBLIC | PRIVATE`, periode. `voucher_redemptions` mengunci kuota secara atomik.
- `create_booking` menerima kode, memvalidasi di server, menyimpan `voucher_code` dan `discount_amount`. DP dihitung dari harga setelah diskon. Voucher publik bisa dibaca `anon` hanya kolom yang perlu; voucher privat tidak pernah bisa dilist `anon`.
- Pelanggan: daftar voucher publik yang memenuhi syarat (yang belum memenuhi syarat ditampilkan dengan alasannya) dan kolom kode privat.

### F6. Tampilan lanjutan (M2, M7, B1)

- `merchant_themes`: `logo_path`, `cover_path`, `button_style FILLED | OUTLINE | SOFT`, `section_order` (array teks yang divalidasi), `hidden_sections`.
- `background_style` bertambah `MOTION`; kolom `background_motion BENTUK | GELOMBANG | AURORA | PARTIKEL` dan `background_motion_speed SLOW | NORMAL`.
- Komponen latar bergerak murni klien, transform dan opacity saja, animasi CSS untuk preset sederhana, `seek(t)` untuk Bentuk (diadaptasi dari skill motion-graphics). Tombol jeda, berhenti saat reduced motion, hemat data, atau tab tersembunyi. Konten tetap di atas kartu solid.
- Pemeriksa kontras di editor memakai `resolveTheme()` yang sama.

### F7. Profil staf (02, M8)

- `staff`: `role`, `bio` (≤140), `tags` (array), `photo_path`, `motion_path`, `show_motion`.
- Unggahan klip: GIF atau video tanpa suara, ≤5 detik, ≤8 MB. Diubah ke MP4 di server agar ringan; GIF asli tidak disajikan.
- Kartu "Dengan siapa?" menampilkan foto, peran, jam kosong terdekat, dan profil singkat.

### F8. Restoran (R1 sampai R4, M3)

- `services.party_min`, `services.party_max`, `services.seat_duration_minutes`.
- `merchant_settings.table_mode NONE | AREA | TABLE`, `seats_per_slot`, `table_hold_minutes`, `auto_join_tables`.
- `dining_areas`, `dining_tables` (nama, kursi min/maks, bentuk, posisi grid, `bookable_online`, `joinable_with`).
- `bookings.party_size`, `area_id`, `table_id`, `customer_note`.
- `get_booked_ranges` dan `create_booking` menghitung kapasitas per meja atau per slot. Pilihan meja selalu punya opsi "Pilihkan untuk saya" dan tampilan daftar yang setara dengan denah.

### F9. Panduan (G1, G2)

- `merchant_onboarding_progress`: langkah selesai, tur sudah dilihat per halaman.
- Checklist 6 langkah di Hari ini, tur coachmark (dialog modal, fokus terkunci, Esc menutup), panel "Panduan halaman ini" per halaman dengan video placeholder.

### F10. Landing page Marky (kanvas landing)

- Bangun ulang `src/app/page.tsx` mengikuti kanvas: tema Coral, General Sans self-host, HeroMotion dengan jeda dan versi ringkas di HP, harga dari `src/lib/plans.ts`, harga di HP sebagai pemilih paket.
- SEO: server-rendered, satu H1, metadata, OG image, JSON-LD (SoftwareApplication, Organization, FAQPage). Halaman per jenis usaha (`/untuk/salon`, `/untuk/restoran`, …) masuk `ROUTES` dan `reserved_usernames`.
- Formulir klaim memeriksa ketersediaan username sungguhan sebelum menampilkan status apa pun.
- Lint dengan Hallmark `sloplint` dan cek antislop sebelum rilis.

## 6. Keputusan yang diambil sendiri (perlu dicek)

1. Domain `marky.id` diasumsikan; alamat kontak di landing masih contoh.
2. `REQUEST` memakai batas 24 jam sebelum ditolak otomatis.
3. Batas booking aktif per nomor default 2.
4. Banner maksimal 3 tayang bersamaan.
5. Klip staf dikonversi ke MP4 di server; butuh pemrosesan video (pilih layanan di fase F7).
6. Web push memakai VAPID sendiri, bukan layanan pihak ketiga.
7. Selama transisi, verifikasi domain menerima prefiks lama `_booka`.

## 7. Yang diserahkan ke builder

- Nama komponen dan pembagian file di dalam tiap fase.
- Pilihan library konversi video dan web push.
- Bentuk persis RPC selama memenuhi aturan hak akses di bagian 2.
