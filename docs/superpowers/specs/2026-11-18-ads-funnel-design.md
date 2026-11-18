# Funnel iklan dan link-in-bio

Tanggal: 2026-11-18. Status: draf, menunggu persetujuan pemilik.
Papan desain: F1 sampai F6 di kanvas
https://claude.ai/artifact/RSGQtRjX4RQivoVekkfgeo (baris "Funnel iklan dan
link-in-bio"), salinan lokal di `docs/design/booking-flow/Fun*.dc.html`.

## Maksud dan alasan

Ide awal Marky: halaman booking menjadi CTA untuk usaha yang hidup di media
sosial dan belum punya funnel. Halaman, QRIS, voucher, dan banner sudah ada.
Yang belum ada adalah bagian yang membuat halaman itu layak dipasang di bio
dan di iklan: tautan per kanal, asal pengunjung, funnel kunjungan, pixel
iklan, tautan link-in-bio, dan QR.

## Sasaran

1. **Tautan iklan** (F3): merchant membuat tautan pendek per kanal
   (`/username?t=slug`) yang bisa langsung membuka satu layanan dan memasang
   voucher. Ada versi UTM lengkap untuk Ads Manager, tombol salin, dan QR
   (PNG dan SVG).
2. **Datang dari tautan** (F2): pengunjung dari tautan iklan langsung masuk
   langkah Jadwal untuk layanan itu, voucher sudah terpasang dan bisa dilepas.
   Voucher kedaluwarsa atau layanan terhapus punya pesan sendiri.
3. **Asal pengunjung**: setiap booking menyimpan kanal, UTM, situs asal, dan
   tautan iklan yang dipakai. Detail booking menampilkannya.
4. **Funnel kunjungan** (F5): Analitik menampilkan Kunjungan, Memilih layanan,
   Lanjut ke data diri, Booking dibuat, Dibayar, per kanal dan per rentang
   7/30/90 hari, plus kalimat langkah dengan penurunan terbesar.
5. **Pixel iklan** (F4): Meta, TikTok, dan GA4 lewat ID saja, dengan kejadian
   standar.
6. **Link-in-bio** (F1, F6): maksimal 8 tautan dan ikon sosmed di halaman
   publik, letaknya bisa diatur bersama Promo, Layanan, FAQ.

## Bukan sasaran

- Kirim kejadian dari server (Meta Conversions API, TikTok Events API).
  Ditandai "Segera hadir" di F4. Desain data sudah menyiapkan `event_id`
  untuk deduplikasi nanti.
- Kotak skrip bebas. Ditolak: skrip merchant bisa membaca data pelanggan.
- Pemendek tautan di domain lain dan atribusi lintas perangkat.
- Banner persetujuan cookie. Lihat Keputusan 6.

## Anti-sasaran

- Token `/pesanan/[token]` bocor ke Meta, TikTok, atau Google.
- Angka funnel yang tidak bisa dijelaskan (misalnya Dibayar lebih besar dari
  Booking dibuat).
- Pixel yang memperlambat halaman booking atau memblokir render.
- Merchant lain bisa membaca data kunjungan atau tautan merchant lain.

## Pendekatan

Pixel: pemilik memilih **A, ID pixel saja, dibangun siap-C** (lihat
percakapan 2026-11-18). B (skrip bebas) ditolak karena keamanan. C (server)
ditunda sampai ada merchant yang aktif beriklan.

Pelacakan kunjungan: **tabel kejadian milik Marky sendiri** (bukan membaca
balik dari Meta/GA), karena merchant tanpa pixel tetap butuh funnel, dan
angka Booking/Dibayar harus sama dengan data booking.

## Desain

### Data (semua tabel baru: `REVOKE ALL` lalu grant per kolom, RLS per merchant)

**`ad_links`**: `id`, `merchant_id`, `slug` (`^[a-z0-9-]{3,40}$`, unik per
merchant), `name` (1-60, hanya terlihat merchant), `channel` (enum
`IG_BIO`, `META_ADS`, `TIKTOK_ADS`, `WA_STATUS`, `OTHER`), `service_id` (null =
halaman utama, FK gabungan dengan `merchant_id`), `voucher_code` (null boleh),
`archived_at`, `created_at`. UTM diturunkan dari `channel` dan `slug`:

| channel | utm_source | utm_medium |
| --- | --- | --- |
| IG_BIO | instagram | bio |
| META_ADS | meta | paid |
| TIKTOK_ADS | tiktok | paid |
| WA_STATUS | whatsapp | status |
| OTHER | lainnya | link |

`utm_campaign` = `slug`. `anon` me-resolve `?t=` lewat RPC
`resolve_ad_link(p_username, p_slug)` yang mengembalikan `id`, `service_id`,
`voucher_code`, `channel` saja, untuk tautan yang tidak diarsipkan, dengan
batas laju per IP seperti `/api/vouchers/check`.

**`funnel_events`**: `id`, `merchant_id`, `session_id` (uuid acak per tab,
dari `sessionStorage`, bukan cookie), `kind` (enum `VIEW`, `SERVICE`,
`CHECKOUT`, `BOOKED`, `PAID`, `LINK_CLICK`), `ad_link_id`, `utm_source`,
`utm_medium`, `utm_campaign` (masing-masing maksimal 64), `referrer_host`
(maksimal 100, host saja), `service_id`, `booking_id`, `merchant_link_id`,
`created_at`. Tanpa IP, tanpa user agent, tanpa data pelanggan.
- `VIEW`, `SERVICE`, `CHECKOUT`, `LINK_CLICK` dikirim browser ke route
  `POST /api/events` (validasi Zod, batas laju per IP hash, `VIEW` sekali per
  sesi per merchant, ditulis dengan admin client yang memfilter
  `merchant_id`).
- `BOOKED` ditulis server di `create_booking` (atau route `/api/bookings`)
  memakai `session_id` dari klien.
- `PAID` ditulis server saat status booking berubah ke `PAID` (webhook),
  jadi angka Dibayar selalu sama dengan data pembayaran.
- Retensi 13 bulan, dibersihkan cron yang sudah ada.

**`bookings`**: tambah `session_id`, `ad_link_id`, `utm_source`,
`utm_medium`, `utm_campaign`, `referrer_host`, `pixel_event_id` (uuid acak,
bukan token akses). Atribusi = sentuhan terakhir dalam sesi tab: parameter
URL pertama kali halaman dibuka disimpan di `sessionStorage` dan dikirim saat
booking dibuat.

**`merchant_tracking`**: `merchant_id` (PK), `meta_pixel_id`
(`^\d{15,16}$`), `tiktok_pixel_id` (`^[A-Z0-9]{20}$`), `ga4_measurement_id`
(`^G-[A-Z0-9]{6,12}$`), tiga flag `*_enabled`. CHECK di database memakai pola
yang sama dengan Zod. `anon` membacanya hanya lewat RPC
`get_public_tracking(p_merchant_id)` yang mengembalikan ID yang aktif saja.

**`merchant_links`**: `id`, `merchant_id`, `label` (1-40), `url` (`^https://`,
maksimal 500), `sort_order`, `is_visible`, `created_at`. Maksimal 8 per
merchant, ditegakkan trigger (pola banner, DECISIONS #34). `anon` membaca
baris `is_visible`.

**`merchant_themes`**: `section_order` dan `hidden_sections` menerima nilai
baru `LINKS`. Constraint diganti agar `section_order` berisi tepat empat nilai
`LINKS`, `PROMO`, `SERVICES`, `FAQ`; migration menambahkan `LINKS` di depan
untuk baris lama. Bagian tanpa tautan tidak dirender. Kolom baru
`show_social_icons boolean default true`; ikon diambil dari kontak di
`merchant_settings` (Instagram, TikTok, WhatsApp) lewat jalur baca anon yang
sudah ada atau RPC baru bila kolom kontak belum terbaca anon.

### Pixel

- ID disisipkan lewat `JSON.stringify` setelah lolos regex; skrip resmi
  dimuat dengan `next/script` strategi `afterInteractive`, jadi tidak
  memblokir render. Meta dipanggil dengan `fbq('set', 'autoConfig', false,
  id)` dan tanpa advanced matching manual.
- Dimuat hanya di `/[username]` (dan domain sendiri yang dipetakan ke sana)
  serta halaman terima kasih baru. **Tidak pernah** di `/pesanan/[token]`,
  karena skrip pixel mengirim URL halaman, dan URL itu memuat token akses.
- Pemetaan kejadian (sama dengan tabel di F4):

| Di halaman booking | Meta | TikTok | GA4 | event_id |
| --- | --- | --- | --- | --- |
| Membuka halaman | PageView | Pageview | page_view | acak |
| Memilih layanan | ViewContent | ViewContent | view_item | acak |
| Lanjut ke data diri | InitiateCheckout | InitiateCheckout | begin_checkout | acak |
| Booking dibuat | Lead | SubmitForm | generate_lead | `pixel_event_id` |
| Pembayaran QRIS berhasil | Purchase | CompletePayment | purchase | `pixel_event_id` + `:paid` |

  Nilai (`value`, `currency: IDR`) dikirim untuk ViewContent (harga
  layanan), Lead dan Purchase (nominal). Nama layanan dikirim sebagai
  `content_name`. Tidak ada nama, nomor WA, atau catatan.
- **Halaman terima kasih** `/[username]/terima-kasih?e=<pixel_event_id>`:
  setelah status di `/pesanan/[token]` menjadi `PAID`, halaman itu menawarkan
  tombol "Selesai" yang membuka halaman terima kasih (tanpa token). Halaman
  ini membaca ringkasan lewat RPC `get_paid_event(p_event_id)` (layanan,
  nominal, dibayar dalam 24 jam terakhir; tanpa data pelanggan), memuat pixel,
  dan mengirim Purchase sekali (`localStorage` per `event_id`; deduplikasi di
  platform lewat `event_id`). Tautan kembali ke pesanan disimpan di
  `sessionStorage`, bukan di DOM.
- CSP saat ini (`next.config.ts`) tidak membatasi `script-src` atau
  `connect-src`, jadi tidak perlu diubah. Bila kelak diperketat, domain Meta,
  TikTok, dan Google harus masuk untuk dua halaman publik itu.

### Halaman publik

- `?t=slug` di-resolve di server saat render `/[username]`: layanan valid
  membuka langkah Jadwal (F2), voucher valid dipasang lewat jalur
  `evaluate_voucher` yang sudah ada. Voucher tidak berlaku tetap membiarkan
  booking lanjut dengan harga normal. Layanan terhapus menampilkan pesan dan
  daftar layanan.
- `?kode=` dan `utm_*` dari luar juga diterima (untuk tautan yang dibuat
  manual).
- Link-in-bio dan ikon sosmed mengikuti token tema (`themeToCssVars`); tidak
  ada warna tertulis langsung di `src/components/booking-page/*`.

### Dashboard

- Menu baru di grup "Halaman booking": **Tautan dan sosmed** (F6) dan
  **Iklan** (F3 tab Tautan iklan, F4 tab Pixel). Route baru
  `/dashboard/tautan` dan `/dashboard/iklan` (di bawah `/dashboard`, jadi
  tidak perlu masuk `reserved_usernames`; `ROUTES` tetap diperbarui).
- **Analitik** (F5) mendapat bagian funnel di atas grafik yang sudah ada.
  Agregasi lewat RPC `funnel_summary(p_from, p_to)` untuk merchant yang login,
  dengan baris per kanal; konversi = Dibayar dibagi Kunjungan.
- Detail booking menampilkan "Datang dari: Iklan TikTok (Iklan TikTok wisuda
  Desember)".
- Panduan memulai (`src/lib/guide/content.ts`) mendapat langkah "Pasang
  tautan di bio Instagram".

### Kebijakan privasi

`/privasi` ditambah bagian: Marky mencatat kunjungan tanpa cookie pelacak;
merchant bisa memasang pixel Meta, TikTok, atau Google di halaman booking
dan halaman terima kasihnya; data yang dikirim Marky ke platform itu.

## Keputusan (pengendali, boleh dikoreksi pemilik)

1. Tautan pendek `?t=slug` di domain Marky (atau domain sendiri merchant),
   bukan layanan pemendek luar.
2. Atribusi sentuhan terakhir per sesi tab, tanpa cookie.
3. `PAID` dan `BOOKED` ditulis server, bukan browser.
4. Purchase dikirim dari halaman terima kasih tanpa token. Pelanggan yang
   menutup tab sebelum membukanya tidak memicu Purchase di browser; ini
   alasan C (server) ada di rencana berikutnya.
5. Paket: tidak dikunci selama masa awal gratis. Usulan saat penagihan
   dimulai: link-in-bio dan tautan iklan di semua paket, pixel dan funnel per
   kanal di Pro dan Studio.
6. Tanpa banner cookie di versi ini: Marky sendiri tidak memakai cookie
   pelacak, dan pixel adalah pilihan merchant yang diungkap di `/privasi`.
   Pemilik perlu memastikan ini cukup untuk UU PDP sebelum ada merchant yang
   memasang pixel.

## Batasan

- Semua aturan AGENTS.md (migration baru, grant per kolom, fungsi tertutup
  kecuali di-`GRANT EXECUTE`, `search_path = ''`, `type` di `database.ts`,
  UI dan komentar berbahasa Indonesia, admin client memfilter `merchant_id`).
- Setiap perubahan skema diuji `npm run docker:test` dengan kasus baru di
  `supabase/tests/99_verify.sql`: anon tidak bisa membaca `funnel_events`,
  `ad_links`, atau `merchant_tracking` langsung; regex ID pixel ditolak di
  database; batas 8 tautan; `section_order` dengan `LINKS`.
- Desain papan F1 sampai F6 dan aturan `DESIGN.md` (tanpa em dash, tanpa
  titik tengah sebagai pemisah, keadaan memuat/kosong/gagal, target sentuh
  44px di halaman publik).

## Diserahkan ke pembuat

- Struktur komponen dan nama berkas.
- Cara menggambar bar funnel (CSS biasa sudah cukup).
- Detail pustaka QR: pakai `qrcode` yang sudah terpasang.
