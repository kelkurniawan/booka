# Functional Specification Document (FSD): Marky

Versi dokumen: 1.0. Basis: cabang `fitur/booking-lapangan` (HEAD `841be62`). Bahasa: Indonesia. Identifier, nama tabel, rute, dan kode galat ditulis apa adanya seperti di kode.

Konvensi status: fitur yang sudah dirilis ke produksi tidak diberi tanda. Fitur yang sudah selesai dibangun tetapi belum dirilis ditandai **(belum rilis)**: F11 funnel iklan dan F12 booking lapangan. Semua yang sampai F10, batas atas QRIS, dan indeks FK sudah live.

Aturan sumber: bila dokumen repo dan kode berbeda, kode yang menang. Selisih yang ditemukan dicatat di Lampiran D.

---

## 1. Pendahuluan

### 1.1 Tujuan dokumen

Dokumen ini menjelaskan perilaku fungsional Marky: siapa yang memakai, apa yang bisa dilakukan, aturan bisnis dan batas angka yang berlaku, serta bagaimana sistem merespons keadaan galat. Pembacanya adalah tim produk, pengembang, dan penguji. Dokumen ini tidak menggantikan PRD (maksud produk), `docs/DECISIONS.md` (alasan keputusan teknis), atau `docs/ERROR-CODES.md` (daftar kode galat); dokumen ini merangkum dan menyatukannya dari sudut pandang fungsi.

### 1.2 Ruang lingkup

Marky adalah platform link-in-bio untuk usaha jasa kecil di Indonesia (salon, barbershop, klinik, fotografer, kelas, restoran, lapangan olahraga). Merchant berlangganan bulanan. Pelanggan memesan lewat halaman publik `/[username]`. DP atau pelunasan masuk langsung ke akun payment gateway merchant lewat QRIS; platform tidak pernah menahan dana.

Dalam lingkup: auth merchant, onboarding, dashboard merchant, halaman publik, alur booking dan pembayaran, kelola booking oleh pelanggan lewat token, notifikasi dan pengingat, kustomisasi halaman, promosi, funnel iklan, restoran, sewa lapangan, domain sendiri, landing page.

Di luar lingkup: pembayaran langganan otomatis (perubahan paket masih manual lewat WhatsApp tim Marky), booking rutin mingguan, patungan per pemain, membership atau paket jam, jam buka per lapangan, pelatih plus lapangan dalam satu booking, kirim kejadian pixel dari server (Meta Conversions API dan TikTok Events API, ditandai "Segera hadir"), dan kotak skrip bebas untuk merchant.

### 1.3 Definisi istilah

| Istilah | Arti |
| --- | --- |
| Merchant | Pemilik usaha yang berlangganan Marky. Satu merchant satu akun (`merchants.id` sama dengan `auth.users.id`). |
| Pelanggan | Orang yang memesan lewat halaman publik. Tidak punya akun; mengakses bookingnya lewat token. |
| Anon | Peran database untuk pengunjung tanpa sesi. Hanya bisa membaca lewat RPC dan kolom yang diizinkan. |
| DP | Uang muka. Bagian harga yang dibayar saat booking (`amount_due_now`); sisanya dibayar di tempat (`amount_due_on_site`). |
| Slot | Rentang waktu yang bisa dipesan, dihitung dari jam buka, durasi layanan, dan booking yang sudah ada. |
| Layanan | Baris di `services`: nama, harga, durasi, cara bayar. |
| Layanan reservasi | Layanan restoran yang ditandai `seat_duration_minutes` plus rentang tamu `party_min`/`party_max`. |
| Layanan sewa | Layanan sewa lapangan yang ditandai `court_unit_minutes` (30 atau 60). `price` berarti harga per jam dasar. (belum rilis) |
| Lapangan | Baris di `courts`: sumber daya fisik yang disewa. (belum rilis) |
| Jam ramai | Aturan harga per hari dan rentang jam di `court_price_rules` yang menggantikan harga dasar. (belum rilis) |
| Cara bayar | `payment_mode` layanan: `FULL`, `DEPOSIT`, `ON_SITE`, `REQUEST`. |
| Token akses | String 48 heksadesimal (192 bit) di `bookings.access_token`, satu-satunya kunci halaman `/pesanan/[token]`. |
| Tier | `subscription_tier`: `STARTER`, `PRO`, `STUDIO`. |
| Masa awal gratis | `EARLY_ACCESS_FREE = true`: semua merchant berada di tier `STUDIO` tanpa tagihan. |
| Tautan iklan | `ad_links`: tautan pendek `/username?t=slug` per kanal. (belum rilis) |
| Pixel | ID Meta, TikTok, atau GA4 milik merchant yang dipasang di halaman publik. (belum rilis) |
| WIB | Asia/Jakarta, UTC+7 tetap, satu-satunya zona tampilan. |

### 1.4 Referensi dokumen

| Dokumen | Isi |
| --- | --- |
| `docs/PRD-Smart-Booking-Invoicing-SaaS-V3.md` | Spesifikasi produk awal dan fase 1 sampai 6 |
| `docs/DECISIONS.md` | Penyimpangan dari PRD dan keputusan #1 sampai #43 |
| `docs/ERROR-CODES.md` | Tabel kode galat tiap lapisan |
| `docs/NOTIFIKASI.md` | Email, WhatsApp, web push, dan pengingat |
| `docs/SETUP.md` | Instalasi dan environment |
| `docs/DOCKER.md` | Harness uji migration |
| `DESIGN.md` | Arah visual tiga permukaan |
| `docs/superpowers/specs/*.md` | Spek kustomisasi halaman, kuesioner onboarding, redesign, funnel iklan, booking lapangan |
| `AGENTS.md` | Status F1 sampai F12 dan aturan pengembangan |

---

## 2. Aktor dan peran

| Aktor | Deskripsi |
| --- | --- |
| Merchant owner | Pemilik akun. Mengelola semua data usahanya lewat dashboard `/dashboard/*`, dibatasi RLS ke `auth.uid()`. |
| Staf | Bukan pengguna sistem. Staf adalah baris `staff` (paket Studio) dengan jam kerja, profil, dan kalender sendiri; yang dipilih pelanggan, bukan yang login. Hanya merchant owner yang mengelolanya. |
| Pelanggan (anon) | Pengunjung `/[username]` tanpa sesi, dan pemegang token `/pesanan/[token]`. |
| Platform: cron | Dua pekerjaan Vercel Cron yang diautentikasi `CRON_SECRET`. |
| Platform: webhook | Callback Midtrans atau Xendit ke `/api/webhooks/[provider]`, diautentikasi signature. |
| Platform: admin client | Klien `service_role` di rute server (`/api/bookings`, webhook, cron, callback OAuth); selalu memfilter `merchant_id`. |
| Tim Marky | Mengubah paket merchant secara manual lewat WhatsApp (belum ada pembayaran langganan otomatis). |

### 2.1 Matriks kemampuan

| Kemampuan | Merchant owner | Pelanggan (anon) | Pemegang token | Cron | Webhook |
| --- | --- | --- | --- | --- | --- |
| Melihat halaman publik, layanan, FAQ, banner | Ya | Ya | Ya | Tidak | Tidak |
| Melihat slot kosong (tanpa data pelanggan lain) | Ya | Ya | Ya | Tidak | Tidak |
| Membuat booking online | Tidak (pakai booking manual) | Ya, via `POST /api/bookings` | Ya | Tidak | Tidak |
| Membuat booking manual | Ya | Tidak | Tidak | Tidak | Tidak |
| Melihat detail booking sendiri | Ya (semua bookingnya) | Tidak | Ya (satu booking) | Tidak | Tidak |
| Ubah jadwal, batal, atur pengingat | Merchant: ya, tanpa kebijakan pelanggan, dengan batas 3 kali | Tidak | Ya, mengikuti kebijakan merchant | Tidak | Tidak |
| Setujui atau tolak `REQUESTED` | Ya | Tidak | Tidak | Tidak | Tidak |
| Mengubah status `PENDING` ke `PAID` | Tidak | Tidak | Tidak | Tidak | Ya (setelah signature valid) |
| Membatalkan `PENDING` kedaluwarsa | Tidak | Tidak | Tidak | Ya | Tidak |
| Mengirim pengingat H-1 dan hari H | Tidak | Tidak | Tidak | Ya | Tidak |
| Menghubungkan payment gateway | Ya | Tidak | Tidak | Tidak | Tidak |
| Mengubah tampilan, promosi, tautan, pixel | Ya (sesuai tier) | Tidak | Tidak | Tidak | Tidak |
| Mengekspor atau menghapus data akun | Ya | Tidak | Tidak | Tidak | Tidak |
| Mengubah `subscription_tier` | Tidak (kolom tidak bisa di-UPDATE `authenticated`) | Tidak | Tidak | Tidak | Tidak |
| Menulis kejadian funnel `VIEW`, `SERVICE`, `CHECKOUT`, `LINK_CLICK` | Tidak | Ya, via `POST /api/events` | Tidak | Tidak | Tidak |
| Menulis kejadian funnel `BOOKED`, `PAID` | Tidak | Tidak | Tidak | Tidak | Ya, server saja |

---

## 3. Peta modul

| Modul | Rute utama | Fase | Status |
| --- | --- | --- | --- |
| Landing dan SEO | `/`, `/untuk/<slug>`, `/api/username-check`, `robots`, `sitemap`, OG | F10 | live |
| Legal | `/syarat`, `/privasi` | Kesiapan rilis | live |
| Auth | `/masuk`, `/daftar`, `/lupa-password`, `/reset-password`, `/auth/callback`, `/auth/auth-code-error`, `/auth/signout` | Phase 2 | live |
| Onboarding | `/onboarding` | Phase 2, kuesioner, Olahraga | live (kategori Olahraga belum rilis) |
| Dashboard Hari ini dan panduan | `/dashboard` | F3, F9 | live |
| Booking dan booking manual | `/dashboard/bookings`, `/dashboard/bookings/baru` | F3 | live |
| Layanan | `/dashboard/services` | Phase 3, F2 | live (sewa lapangan belum rilis) |
| Ketersediaan | `/dashboard/availability` | Phase 3 | live |
| Staf | `/dashboard/staf`, `/api/staff/clip` | Studio, F7 | live |
| Pembayaran | `/dashboard/payments`, `/api/payments/[provider]/connect`, `/api/payments/[provider]/callback` | Phase 3 | live |
| Halaman publik merchant | `/[username]`, `/dashboard/halaman` | F1, F6, kustomisasi | live |
| Promosi | `/dashboard/promosi`, `/dashboard/promosi/voucher`, `/api/vouchers/check` | F5 | live |
| Denah meja restoran | `/dashboard/denah`, `/api/tables` | F8 | live |
| Kelola booking pelanggan | `/pesanan/[token]`, `/pesanan/[token]/ubah-jadwal`, `/pesanan/[token]/pengingat`, `/api/pesanan/[token]/*` | F4 | live |
| Notifikasi dan pengingat | `/api/cron/reminders`, `public/sw.js` | Kesiapan rilis, F4 | live |
| Mesin booking | `/api/bookings`, `/api/bookings/[id]/status`, `/api/slots`, `/api/slots/nearest`, `/api/webhooks/[provider]`, `/api/cron/cancel-unpaid` | Phase 4 sampai 6 | live |
| Analitik | `/dashboard/analitik` | Studio | live (bagian funnel belum rilis) |
| Domain sendiri | `/dashboard/domain`, `src/proxy.ts` | Studio | live |
| Pengaturan | `/dashboard/settings`, `/dashboard/settings/ekspor` | Phase 3, F3, F4 | live |
| Langganan | `/dashboard/billing` | Phase 3 | live |
| Tautan link-in-bio dan ikon sosial | `/dashboard/tautan` | F11 | belum rilis |
| Tautan iklan, QR, pixel | `/dashboard/iklan`, `/api/events`, `/[username]/terima-kasih` | F11 | belum rilis |
| Lapangan: jadwal harian, profil, foto, denah venue | `/dashboard/lapangan`, `/api/slots` (cabang sewa) | F12 | belum rilis |

---

## 4. Use case

Konvensi: kode galat dan pesan diambil dari `docs/ERROR-CODES.md`. Pesan "(galat form)" tampil di formulir, bukan status HTTP. Peran yang tidak disebut berarti tidak terlibat.

### 4.1 Akun dan onboarding

#### UC-01 Mendaftar akun merchant
- Aktor: calon merchant.
- Prasyarat: belum login. Setelan Supabase Auth: Email provider aktif.
- Pemicu: membuka `/daftar`.
- Alur utama:
  1. Calon merchant mengisi email dan password (8 sampai 72 karakter) atau memilih Google.
  2. Supabase membuat `auth.users`; trigger `handle_new_user` membuat baris `merchants` dengan `username` NULL dan tier default `STUDIO` (masa awal gratis).
  3. Bila "Confirm email" menyala dan tidak ada sesi, tampil layar "cek email". Bila sesi langsung ada, diarahkan ke `/onboarding`.
- Alternatif dan galat: email sudah terdaftar atau gagal, pesan tidak membedakan alasan; tautan konfirmasi gagal membuka `/auth/auth-code-error`.
- Hasil akhir: akun dan baris `merchants` ada; `username` NULL sehingga proxy memaksa ke `/onboarding`.
- Aturan terkait: DECISIONS #7, #11, #40. Rute `/daftar`, `/masuk`, `/lupa-password` hanya untuk tamu (login mengalihkan ke dashboard).

#### UC-02 Masuk, lupa password, keluar
- Aktor: merchant.
- Prasyarat: akun ada.
- Pemicu: membuka `/masuk`.
- Alur utama:
  1. Merchant masuk dengan email plus password (jalur utama), Google, atau Magic Link ("masuk tanpa password").
  2. `/auth/callback` menukar kode menjadi sesi dan mengarahkan ke dashboard atau onboarding.
  3. Keluar lewat `/auth/signout`.
- Alternatif: lupa password di `/lupa-password` mengirim tautan pemulihan; tautan membuat sesi lalu membuka `/reset-password` (halaman ini tidak termasuk rute tamu-saja). Password baru 8 sampai 72 karakter dan wajib diulang.
- Galat: pesan gagal masuk tidak membedakan "email tidak terdaftar" dari "password salah"; `resetPasswordForEmail` selalu melaporkan berhasil, supaya halaman tidak bisa memetakan siapa yang punya akun.
- Hasil akhir: sesi aktif; `getUser()` di proxy memverifikasi tiap request dashboard.
- Aturan terkait: DECISIONS #11; `/dashboard` dan `/onboarding` adalah rute terlindungi.

#### UC-03 Onboarding wizard
- Aktor: merchant baru.
- Prasyarat: login, `merchants.username` masih NULL.
- Pemicu: diarahkan ke `/onboarding`.
- Alur utama:
  1. Langkah Usaha: pilih bidang (11 kategori: Kecantikan, Kesehatan, Fotografi, Acara, Pendidikan, Hewan, Otomotif, Servis, Konsultasi, Olahraga, Lainnya) dan jenis usaha (slug dari `src/lib/business/catalog.ts`). Kategori Olahraga (belum rilis) menawarkan Padel, Futsal, Mini soccer, Badminton, Tenis.
  2. Langkah Layanan: pilih template atau tulis layanan pertama; harga adalah keputusan merchant (template hanya memberi `priceHint`). Template Olahraga membuat layanan sewa per jam (unit, minimum, maksimum lama main).
  3. Langkah Jam: pilih hari dan jam buka (minimal satu hari).
  4. Langkah Profil: identitas usaha (nama 2 sampai 80, username 3 sampai 30 `^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$`, nomor WhatsApp E.164).
  5. Server menyimpan semuanya dalam satu transaksi lewat RPC `complete_onboarding` (identitas, profil, layanan, jam kerja; untuk Olahraga juga layanan sewa plus dua lapangan contoh "Lapangan 1" dan "Lapangan 2").
  6. Layar sukses menampilkan halaman booking siap pakai, lalu menawarkan kuesioner (UC-04).
- Alternatif dan galat (galat form, `save-onboarding.ts`): 23505 "Username baru saja diambil orang lain. Coba yang lain."; 23514 "Username tidak dapat digunakan."; 23P01 "Jam kerja yang dipilih tumpang tindih. Periksa kembali."; 22023 "Pengaturan sewa lapangan tidak valid. Periksa kembali."; 42501 "Sesi berakhir. Muat ulang halaman lalu masuk lagi."; lainnya "Gagal menyimpan data. Coba lagi." (dicatat di log).
- Hasil akhir: merchant punya username, layanan aktif, jam buka, dan halaman publik `/{username}`.
- Aturan terkait: username tidak boleh memakai kata di `reserved_usernames` (trigger `reject_reserved_username`); durasi layanan 5 sampai 480 menit; untuk sewa, durasi layanan sama dengan lama main minimum.

#### UC-04 Kuesioner profil opsional
- Aktor: merchant baru atau lama.
- Prasyarat: onboarding selesai.
- Pemicu: layar kuesioner setelah layar sukses, atau kartu `ProfileNudge` di dashboard untuk merchant lama.
- Alur utama:
  1. Langkah 1: ukuran tim (`SENDIRI`, `KECIL_2_5`, `MENENGAH_6_15`, `BESAR_15_PLUS`) dan provinsi.
  2. Langkah 2: kanal pemesanan saat ini (maksimal 6), kendala utama (`goals`, maksimal 3: `NO_SHOW`, `DP_SULIT`, `JADWAL_BENTROK`, `CHAT_BERULANG`, `HALAMAN_RAPI`, `LAPORAN_PEMASUKAN`), dan sumber tahu Marky.
  3. Tombol "Lewati" sama menonjol dengan "Lanjut".
  4. Jawaban disimpan ke `merchant_profiles`.
- Alternatif: dilewati, semua bidang null.
- Hasil akhir: baris `merchant_profiles` terisi sebagian atau seluruhnya.
- Aturan terkait: `merchant_profiles` tidak pernah bisa diakses `anon`; seluruhnya opsional.

### 4.2 Menyiapkan usaha

#### UC-05 Mengatur layanan dan cara bayar
- Aktor: merchant.
- Prasyarat: login, onboarding selesai.
- Pemicu: `/dashboard/services`, tombol tambah atau ubah.
- Alur utama:
  1. Merchant mengisi nama (2 sampai 80), deskripsi (maksimal 500), harga (0 sampai 9.999.999.999,99), durasi (5 sampai 480 menit).
  2. Memilih cara bayar: `FULL` (lunas lewat QRIS), `DEPOSIT` (DP persen 1 sampai 90 atau tetap, minimal 1 dan kurang dari harga; sisa di tempat), `ON_SITE` (tanpa pembayaran online), `REQUEST` (ajukan dulu, bayar setelah disetujui).
  3. Form memvalidasi harga: untuk selain `ON_SITE`, harga Rp0 atau minimal Rp1.500; tagihan QRIS dihitung `computeAmounts` dan tidak boleh melebihi Rp10.000.000 (`MAX_ONLINE_CHARGE`).
  4. Opsional melampirkan galeri gambar (maksimal 5 per layanan, JPG/PNG/WebP, 12MB sebelum kompres) atau video (MP4/WebM, 20MB, 30 detik; Pro dan Studio) sejak layanan pertama dibuat.
  5. Layanan bisa diaktifkan atau dinonaktifkan, dan dihapus (berkas Storage ikut dibersihkan klien).
- Alternatif dan galat: Starter hanya 1 layanan (trigger `enforce_service_limit`); harga di antara Rp1 dan Rp1.499 untuk mode online ditolak "Harga minimal Rp1.500 untuk pembayaran QRIS, atau Rp0 untuk gratis."; tagihan di atas batas ditolak "Pembayaran QRIS maksimal Rp10.000.000 per transaksi. Pakai DP yang lebih kecil, atau bayar di tempat."
- Hasil akhir: layanan tampil di halaman publik dengan label cara bayar ("Lunas di muka", "DP 30% di muka" atau "DP Rp... di muka", "Bayar di tempat", "Ajukan dulu").
- Aturan terkait: bagian 6.1 (urutan hitung uang). Pengaturan `allow_pay_on_site` mati membuat `ON_SITE` jatuh ke `FULL` (`effectivePaymentMode`). Snapshot `service_name`, `service_price`, `duration_minutes` disalin ke booking.

#### UC-06 Layanan reservasi restoran (kursi dan meja)
- Aktor: merchant restoran.
- Prasyarat: layanan ada; Aktif `merchant_settings.table_mode` bukan `NONE`.
- Pemicu: `/dashboard/denah` dan form layanan.
- Alur utama:
  1. Merchant memilih mode: `AREA` (total kursi per jam, tanpa denah) atau `TABLE` (per meja).
  2. Layanan reservasi ditandai `seat_duration_minutes` plus rentang tamu `party_min` dan `party_max`.
  3. Untuk `TABLE`, merchant menggambar area dan meja di editor denah (UC-32).
- Galat: BK063 "Jumlah tamu di luar batas layanan ini." (422).
- Hasil akhir: pelanggan memilih jumlah tamu dan (mode `TABLE`) meja atau "Pilihkan untuk saya".
- Aturan terkait: reservasi gratis tanpa pemilih voucher dan tanpa ringkasan Rp0 (DECISIONS #37); layanan reservasi dan sewa tidak boleh digabung dalam satu layanan (CHECK `court_unit_minutes is null or seat_duration_minutes is null`).

#### UC-07 Layanan sewa lapangan dengan harga jam ramai (belum rilis)
- Aktor: merchant lapangan.
- Prasyarat: layanan ada; lapangan sudah dibuat (UC-31) atau dari onboarding Olahraga.
- Pemicu: bagian "Sewa lapangan" di dialog layanan.
- Alur utama:
  1. Merchant menyalakan sewa dan memilih unit 30 atau 60 menit, lama main minimum (`duration_minutes`) dan maksimum (`court_max_minutes`, kelipatan unit, maksimal 480).
  2. Memilih lapangan yang terkait layanan (`service_courts`).
  3. Menambah aturan jam ramai: kartu berisi chip hari, jam mulai dan selesai, harga per jam (maksimal 50 aturan per layanan).
  4. Simpan lewat RPC atomik `save_court_service` (dengan `p_activate`), yang menulis kolom sewa, `service_courts`, dan `save_court_pricing` dalam satu transaksi.
  5. Pemeriksa harga (`PriceChecker`) menunjukkan total untuk contoh jam.
- Alternatif dan galat (`court-errors.ts`): 23P01 "Aturan jam ramai tumpang tindih di hari yang sama. Ubah jam atau lepas harinya."; 42501 "Anda tidak punya akses untuk tindakan ini."; 22023 "Data sewa tidak valid. Periksa isian lalu coba lagi."; 23514 "Pengaturan sewa tidak valid. Periksa lama main dan jam mulai."; 23503 "Lapangan yang dipilih tidak cocok. Muat ulang halaman lalu coba lagi."; 23505 "Nama lapangan itu sudah dipakai. Pakai nama lain."
- Hasil akhir: layanan sewa aktif; label "mulai Rp.../jam" memakai harga terendah.
- Aturan terkait: `price` layanan sewa adalah harga per jam di semua tampilan merchant (akhiran "/jam"); aturan jam ramai tidak melewati tengah malam (`start_time < end_time`); jam di luar aturan memakai harga dasar; bagian 6.1.

#### UC-08 Mengatur jam buka
- Aktor: merchant.
- Pemicu: `/dashboard/availability`.
- Alur utama: merchant menambah jendela per hari (hari 1 sampai 7, jam mulai dan selesai), menghapusnya, atau menyalin ke hari kerja ("copyToWeekdays").
- Galat: 23P01 (jam tumpang tindih, constraint `availability_no_overlap`) dipetakan ke pesan ramah di `availability/actions.ts`; galat lain "Gagal menyimpan jam kerja. Coba lagi."
- Hasil akhir: `availability` menjadi dasar slot publik.
- Aturan terkait: jam usaha adalah dasar slot untuk semua jenis layanan; staf tanpa baris jam sendiri mengikuti jam usaha; semua lapangan mengikuti jam usaha.

#### UC-09 Profil staf dan klip (Studio)
- Aktor: merchant Studio.
- Prasyarat: tier `STUDIO` (otomatis selama masa awal gratis).
- Pemicu: `/dashboard/staf`.
- Alur utama:
  1. Merchant menambah staf (maksimal 20), mengisi peran, perkenalan, keahlian, foto.
  2. Mengatur jam kerja staf (tabel `staff_availability`, satu rentang per hari).
  3. Mengunggah klip mentah (GIF, MP4, WebM, MOV) ke bucket privat `staff-clip-uploads`, lalu browser memanggil `POST /api/staff/clip`.
  4. Rute memverifikasi sesi (`getUser()`), memeriksa `Content-Length`, mengubah klip dengan `ffmpeg-static` menjadi MP4 bisu maksimal 5 detik plus poster JPG di `merchant-media`, menulis `staff.motion_path`, dan menghapus berkas mentah apa pun hasilnya (batas waktu ffmpeg 45 detik, `maxDuration` rute 60 detik).
- Galat: BK010 "Fitur staf khusus paket Studio."; BK011 "Maksimal 20 staf.".
- Hasil akhir: kartu "Dengan siapa?" di halaman publik menampilkan foto, peran, dan jam kosong terdekat.
- Aturan terkait: staf yang punya riwayat booking dinonaktifkan, bukan dihapus (`bookings.staff_id` `NO ACTION`); turun paket tidak menghapus staf tetapi `create_booking`, `/api/slots`, dan halaman publik mengabaikan staf; GIF tidak pernah disajikan; `motion_path` hanya ditulis `service_role`.

#### UC-10 Menghubungkan payment gateway
- Aktor: merchant.
- Prasyarat: login.
- Pemicu: `/dashboard/payments`, kartu Midtrans atau Xendit.
- Alur utama (OAuth, hanya bila `MIDTRANS_CLIENT_ID` dan sejenisnya terisi):
  1. Merchant menekan Connect; `GET /api/payments/[provider]/connect` membuat `state` acak di cookie httpOnly lalu mengalihkan ke provider.
  2. `GET /api/payments/[provider]/callback` mencocokkan `state` (tahan timing attack), menukar kode, dan menyimpan token terenkripsi (AES-256-GCM) lewat `upsert_payment_credential` ke `private.payment_credentials`.
- Alur alternatif (Server Key manual): dialog "Server Key manual" menyimpan kredensial (`saveManualKey`) dengan pilihan `environment` `SANDBOX` atau `PRODUCTION`; Xendit juga butuh Callback Token webhook.
- Galat: BK021 "Merchant belum mengaktifkan pembayaran" bila mode online dipakai tanpa koneksi `ACTIVE`.
- Hasil akhir: `payment_connections` berstatus `ACTIVE` dengan `connection_mode` `OAUTH` atau `MANUAL_KEY`. Merchant bisa memutus koneksi (`disconnectProvider`).
- Aturan terkait: kolom `environment` per koneksi mengalahkan `MIDTRANS_ENV` dan `XENDIT_ENV`; token tidak pernah keluar dari server dan tidak ikut ekspor data.

### 4.3 Halaman publik dan promosi

#### UC-11 Menyesuaikan halaman publik
- Aktor: merchant.
- Pemicu: `/dashboard/halaman` (editor plus pratinjau yang memakai komponen yang sama dengan halaman publik).
- Alur utama:
  1. Memilih tema preset (Bersih, Hangat, Malam gratis; Pastel, Berani, Elegan untuk Pro dan Studio) dan gaya sudut.
  2. Mengunggah foto profil dan logo (semua paket); foto sampul, background gambar, gaya tombol `OUTLINE`/`SOFT`, dan latar `MOTION` (Pro dan Studio).
  3. Pro dan Studio juga mengatur warna aksen, pasangan font, ukuran teks, warna background.
  4. Mengelola FAQ (maksimal 10, semua paket); FAQ kosong menghilang sepenuhnya dari halaman.
  5. Mengatur susunan bagian `LINKS`, `PROMO`, `SERVICES`, `FAQ` dan menyembunyikan bagian (`SERVICES` tidak bisa disembunyikan).
  6. Simpan: `updateTheme`, `updateProfileMedia`, `saveFaqs` (lewat `replace_merchant_faqs`, atomik).
- Galat: nilai premium untuk Starter ditolak trigger `merchant_themes_enforce_tier`; path berkas di luar `{merchant_id}/` ditolak constraint.
- Hasil akhir: `/[username]` merender tema lewat `resolveTheme()` dan `themeToCssVars()` saja.
- Aturan terkait: DECISIONS #21 sampai #25, #35. Penegakan dua lapis (trigger saat tulis, `resolveTheme()` saat baca). Mode terang atau gelap diturunkan dari luminansi, tidak dipilih. Berkas tema lama dihapus server setelah upsert berhasil. Latar bergerak berhenti saat reduced motion, hemat data, dan tab tersembunyi, dengan tombol jeda 44 px.

#### UC-12 Banner promosi dan voucher (Pro dan Studio)
- Aktor: merchant Pro atau Studio.
- Pemicu: `/dashboard/promosi` (banner) dan `/dashboard/promosi/voucher`.
- Alur utama banner:
  1. Membuat banner `TEMPLATE` atau `IMAGE`, warna `ACCENT`/`DARK`/`SOFT`, target `VOUCHER`, `SERVICE`, atau `URL`, dengan jadwal tayang.
  2. Maksimal 3 banner tayang bersamaan (trigger `enforce_banner_live_limit`; draf dan yang sudah berakhir tidak dihitung). Urutan bisa digeser.
- Alur utama voucher:
  1. Membuat voucher `PERCENT` atau `FIXED` (nilai 1 sampai 100.000.000; persen maksimal 100), `max_discount`, `min_spend`, kuota, periode, dan lingkup layanan (semua atau maksimal 50 layanan terpilih).
  2. Kode publik (muncul di `public_vouchers`) atau rahasia (kode minimal 6 huruf atau angka; pelanggan harus mengetik persis).
- Galat: BK057 "Target banner harus voucher publik atau layanan milik Anda sendiri."; BK058 "Voucher ini dipakai banner. Ganti target banner dulu sebelum menjadikannya rahasia."
- Hasil akhir: banner tampil sebagai baris gulir horizontal dengan `scroll-snap` tanpa auto-putar; voucher dipakai di UC-18.
- Aturan terkait: DECISIONS #34. Starter yang diturunkan tetap menyimpan baris, tetapi banner tidak tampil, `public_vouchers` kosong, dan kode apa pun ditolak BK050. Tabel `voucher_redemptions` tidak ada; pemakaian dihitung dari `bookings`.

#### UC-13 Tautan link-in-bio dan ikon sosial (belum rilis)
- Aktor: merchant.
- Pemicu: `/dashboard/tautan`.
- Alur utama:
  1. Menambah tautan (judul 1 sampai 40 huruf, alamat `https://` maksimal 500 karakter), maksimal 8, bisa disembunyikan dan diurutkan.
  2. Menentukan letak bagian tautan: `BEFORE_SERVICES`, `AFTER_SERVICES`, atau `END`.
  3. Menyalakan ikon sosial (`show_social_icons`, bawaan benar) dari kontak di Pengaturan (Instagram, Threads, X, TikTok, WhatsApp).
  4. Ikon WhatsApp opt-in lewat `merchant_themes.public_whatsapp` (bawaan `false`).
  5. Simpan lewat `save_merchant_links` (atomik).
- Galat (galat form): BK080 "Maksimal 8 tautan. Hapus satu tautan dulu."; BK081 "Tautan tidak valid. Periksa judul (1 sampai 40 huruf) dan alamat (https://...)."; 42501 "Sesi Anda berakhir atau tautan bukan milik akun ini. Muat ulang halaman lalu coba lagi."; lainnya "Perubahan gagal disimpan. Coba lagi sebentar lagi."
- Hasil akhir: bagian tautan tampil di `/[username]` bila ada tautan terlihat.
- Aturan terkait: `section_order` menerima tiga bagian (aplikasi lama) atau empat bagian (dengan `LINKS`); `LINKS` yang hilang berarti paling depan. Nomor WhatsApp hanya dikembalikan ke `anon` bila merchant mencentangnya; `get_public_contacts` menghormati `contact_hidden`.

#### UC-14 Tautan iklan, QR, dan pixel (belum rilis)
- Aktor: merchant.
- Pemicu: `/dashboard/iklan` (tab Tautan iklan dan tab Pixel).
- Alur utama tautan iklan:
  1. Membuat tautan: nama (1 sampai 60, hanya terlihat merchant), kanal (`IG_BIO`, `META_ADS`, `TIKTOK_ADS`, `WA_STATUS`, `OTHER`), layanan tujuan (opsional), kode voucher (opsional).
  2. Slug otomatis cocok `^[a-z0-9-]{3,40}$`, unik per merchant. Tautan: `/{username}?t={slug}` di domain Marky atau domain sendiri.
  3. Tersedia versi UTM (source dan medium diturunkan dari kanal, `utm_campaign` sama dengan slug), tombol salin, dan QR (PNG dan SVG, pustaka `qrcode`).
  4. Tautan bisa diarsipkan (`archiveAdLink`).
- Alur utama pixel:
  1. Merchant mengisi ID Meta (`^\d{15,16}$`), TikTok (`^[A-Z0-9]{20}$`), GA4 (`^G-[A-Z0-9]{6,12}$`) dan flag aktif per pixel (`saveTracking`).
  2. Pixel dimuat dengan `next/script` strategi `afterInteractive` hanya di `/[username]` dan `/[username]/terima-kasih`.
  3. Kejadian: PageView, ViewContent (pilih layanan), InitiateCheckout (lanjut ke data diri), Lead (booking dibuat, `pixel_event_id`), Purchase (QRIS berhasil, dikirim sekali dari halaman terima kasih).
- Galat: BK081 untuk payload tautan tidak valid; ID pixel yang melanggar pola ditolak Zod dan CHECK database.
- Hasil akhir: setiap booking menyimpan kanal, UTM, `referrer_host`, `ad_link_id`.
- Aturan terkait: DECISIONS #42. Pixel tidak pernah dimuat di `/pesanan` atau dashboard; navigasi antara `/pesanan` dan halaman berpixel selalu memuat dokumen penuh; Meta memakai `fbq.disablePushState`; `Referrer-Policy: no-referrer` untuk `/pesanan/*` dan `/<username>/terima-kasih`. Tidak ada banner cookie (Marky tidak memakai cookie pelacak). Pengiriman dari server ditandai "Segera hadir".

### 4.4 Booking oleh pelanggan

#### UC-15 Booking layanan biasa (salon, klinik, fotografer, staf)
- Aktor: pelanggan.
- Prasyarat: merchant punya username, layanan aktif, jam buka.
- Pemicu: membuka `/[username]` (atau `?t=slug` dari tautan iklan, yang langsung membuka langkah Jadwal untuk layanannya dan memasang voucher bila valid).
- Alur utama (`BookingFlow`, tiga langkah):
  1. Langkah 1: pilih layanan (banner, FAQ, dan tautan tampil menurut susunan merchant).
  2. Langkah 2: pilih tanggal dan jam. Slot dihitung `GET /api/slots` dari jam buka, durasi, dan `get_booked_ranges`. Pada merchant Studio dengan staf, pelanggan memilih staf atau "Siapa saja" (`GET /api/slots/nearest` memberi jam terdekat 14 hari per staf).
  3. Langkah 3: isi nama (2 sampai 80), WhatsApp (E.164), catatan (maksimal 300), voucher opsional, lalu kirim `POST /api/bookings`.
  4. Server memeriksa ukuran badan (413), JSON (400), Zod (400), merchant (404), layanan (404), rate limit (429), memanggil RPC `create_booking`, lalu untuk status `PENDING` membuat charge QRIS (UC-19).
  5. Respons 201 membawa status dan tautan `/pesanan/{token}`.
- Alternatif dan galat (pesan API): P0006 "Jam tersebut sudah lewat. Silakan pilih waktu lain." (409); BK002 "Semua staf sudah terisi di jam tersebut, silakan pilih jadwal lain." (409); BK003 "Staf yang dipilih sedang tidak menerima pesanan, silakan pilih staf lain." (409); BK001 "Slot yang dipilih di luar jam kerja merchant, silakan pilih jadwal lain." (409); 23P01 "Jam tersebut baru saja dipesan orang lain, silakan pilih jadwal lain." (409); BK020 "Nomor WhatsApp ini sudah mencapai batas booking aktif di merchant ini. Selesaikan atau batalkan booking sebelumnya dulu." (409); BK021 "Merchant belum mengaktifkan pembayaran" (409); BK022 "Nominal pembayaran terlalu kecil untuk QRIS. Hubungi merchant." (409); BK037 "Pembayaran QRIS maksimal Rp10.000.000 per transaksi. Pakai DP yang lebih kecil, atau bayar di tempat." (422); P0002 "Merchant sedang tidak menerima pesanan baru." (409, kuota Starter); P0005 "Layanan tidak ditemukan atau sudah tidak aktif." (404); 22023 dan 23514 "Data tidak valid. Periksa isian lalu coba lagi." (422); 42501 "Anda tidak punya akses untuk tindakan ini." (403); 23503 "Lapangan atau layanan yang dipilih tidak cocok. Muat ulang halaman lalu coba lagi." (409); kode tak dikenal "Gagal membuat booking, silakan coba lagi." (500); rate limit "Terlalu banyak percobaan pemesanan. Coba lagi beberapa menit lagi." (429); gagal charge 502.
- Hasil akhir: booking berstatus `PENDING` (QRIS menunggu), `CONFIRMED` (bayar di tempat, otomatis), atau `REQUESTED` (menunggu merchant).
- Aturan terkait: bagian 6; kunci advisory per merchant; `max_active_per_phone` bawaan 2 (rentang 1 sampai 10 atau tanpa batas); bila `deposit_after_no_show` menyala, aturan no-show hanya dihitung di server.

#### UC-16 Booking meja restoran
- Aktor: pelanggan.
- Prasyarat: `table_mode` `AREA` atau `TABLE`, layanan reservasi.
- Pemicu: memilih layanan reservasi di langkah 1.
- Alur utama:
  1. Pelanggan memilih jumlah tamu (1 sampai 200 di Zod; dibatasi `party_min`/`party_max` layanan).
  2. Untuk `TABLE`, `GET /api/tables` menampilkan denah dan status meja per jam (`get_table_status`); pelanggan memilih meja atau "Pilihkan untuk saya". Untuk `AREA`, kapasitas kursi per jam (`get_seat_availability`).
  3. `POST /api/bookings` dengan `partySize`, `areaId`, `tableId`.
  4. Kursi atau meja dihitung di `create_booking` di bawah kunci merchant, setelah membersihkan booking kedaluwarsa.
- Galat: BK060 "Tempat untuk jumlah tamu ini sudah penuh di jam tersebut, silakan pilih jam lain." (409); BK061 "Meja yang dipilih sudah terisi atau tidak cocok untuk jumlah tamu ini. Pilih meja lain atau Pilihkan untuk saya." (409); BK063 "Jumlah tamu di luar batas layanan ini." (422).
- Hasil akhir: booking (umumnya `CONFIRMED` karena reservasi gratis) dengan `table_label` atau kursi tercatat.
- Aturan terkait: DECISIONS #37; `bookings_no_overlap` hanya untuk `capacity_mode = 'NONE'`, meja dijaga eksklusi per meja sebagai jaring kedua.

#### UC-17 Booking lapangan dengan lama main dan pilihan lapangan (belum rilis)
- Aktor: pelanggan.
- Prasyarat: layanan sewa aktif dengan lapangan terkait.
- Pemicu: memilih layanan sewa.
- Alur utama:
  1. Langkah 2 menampilkan tanggal, lama main (opsi dari `durationOptions`: minimum sampai maksimum menurut unit), lalu jam mulai (grid per unit 30 atau 60 menit).
  2. `GET /api/slots` dengan `durationMinutes` mengembalikan per jam: harga total, jumlah lapangan kosong, dan status penuh (dicoret, bukan disembunyikan). Data dari RPC `get_court_profiles`, `get_court_price_rules`, `get_court_availability`.
  3. Pelanggan memilih lapangan atau "Mana saja"; kartu lapangan menampilkan foto sampul, nama, ciri, deskripsi; tautan "Lihat denah dan foto lapangan" muncul bila setidaknya satu lapangan punya posisi di denah.
  4. `POST /api/bookings` dengan `courtId` (null untuk "Mana saja") dan `durationMinutes` (30 sampai 480).
  5. `create_booking` memvalidasi lama main, grid, dan jam buka, lalu di bawah kunci merchant memilih lapangan (diminta atau pertama menurut `sort_order` lalu nama), menghitung `court_price`, menyimpan total di `service_price` dan nama lapangan di `court_name`.
- Alternatif dan galat: BK070 "Lapangan yang dipilih tidak tersedia. Pilih lapangan lain atau Mana saja." (409); BK071 "Lama main tidak valid untuk layanan ini." (422); BK072 "Semua lapangan penuh untuk lama main ini di tanggal ini. Coba lama main lebih singkat atau pilih tanggal lain." (409); BK001 bila rentang tidak muat dalam satu jendela jam usaha atau jam mulai di luar grid; 23P01 dari `bookings_court_no_overlap` bila slot direbut; slots: `duration_required` (400) "Lama main wajib dipilih untuk layanan sewa lapangan.", `duration_invalid` (400) "Lama main tidak valid untuk layanan ini.", `court_load_failed` (500) "Gagal memuat jadwal lapangan."; `GET /api/slots/nearest` untuk layanan sewa: `court_service_not_supported` (400) "Layanan sewa lapangan tidak memakai jam terdekat. Pilih tanggal dan lama main."
- Hasil akhir: booking dengan `court_id`, `court_name`, dan harga total hasil `court_price` (contoh: dasar Rp150.000 per jam, jam ramai Rp250.000; main 16.30 sampai 18.00 sama dengan 30 menit x 150.000 + 60 menit x 250.000 = Rp325.000).
- Aturan terkait: DECISIONS #43; bagian 6.1 dan 6.2. `excludeBookingId` pada `/api/slots` hanya dihormati bila pemanggil adalah merchant pemilik yang login.

#### UC-18 Memakai voucher saat booking
- Aktor: pelanggan.
- Pemicu: memilih voucher publik di langkah 3 atau mengetik kode.
- Alur utama:
  1. Voucher publik tampil dari `public_vouchers` (hanya syarat layanan dan minimal belanja yang terlihat anon).
  2. Kode diketik (4 sampai 16 huruf atau angka, dinormalkan ke huruf besar); `POST /api/vouchers/check` (body: `username`, `serviceId`, `code`, opsional `startUtc` dan `durationMinutes` untuk sewa) memanggil `check_voucher` dengan rate limit `check_voucher_rate_limit`.
  3. Respons 200 membawa `code`, `kind`, `value`, `max_discount`, `min_spend`, `service_ids`, `discount`.
  4. Saat `POST /api/bookings`, `create_booking` mengevaluasi ulang lewat `evaluate_voucher` di bawah kunci merchant dan menyimpan `voucher_id`, `voucher_code`, `discount_amount`.
- Galat: 400 "Data kode voucher tidak valid"; 404 "Merchant tidak ditemukan"; 429 "Terlalu banyak percobaan kode. Coba lagi beberapa menit lagi."; 503 "Pemeriksaan kode sedang gangguan. Coba lagi sebentar." (gagal tertutup); BK050 "Kode voucher tidak ditemukan atau sudah tidak berlaku." (404); BK051 "Voucher ini belum berlaku atau sudah berakhir."; BK052 "Kuota voucher ini sudah habis."; BK053 dan BK056 di jalur publik disatukan "Voucher tidak berlaku untuk booking ini. Lepas voucher untuk melanjutkan." (tidak membocorkan riwayat nomor); BK054 "Harga layanan belum memenuhi minimal transaksi voucher ini."; BK055 "Voucher ini tidak berlaku untuk layanan yang dipilih."; BK071 pada pratinjau sewa bila lama main bukan kelipatan unit.
- Hasil akhir: harga setelah diskon menjadi dasar DP.
- Aturan terkait: bagian 6.1. Rute cek tidak menerima nomor WhatsApp. Batas 10 percobaan per hash IP dan merchant per 15 menit.

#### UC-19 Membayar dan memantau status
- Aktor: pelanggan, payment gateway.
- Prasyarat: booking `PENDING` dengan `payment_url` QRIS, atau `REQUESTED` yang sudah disetujui.
- Pemicu: respons `POST /api/bookings` atau membuka `/pesanan/{token}`.
- Alur utama:
  1. `chargeBooking` membuat QRIS sebesar `amount_due_now` memakai kredensial merchant; `expires_at` 15 menit.
  2. Halaman `/pesanan/{token}` menampilkan QR, hitung mundur, dan polling `GET /api/bookings/[id]/status` tiap 3 detik (hanya `status` dan `expires_at`).
  3. Setelah webhook (UC-20), status menjadi `PAID`.
  4. Untuk `REQUESTED` yang disetujui: booking menjadi `PENDING` tanpa `payment_url` dengan tenggat lebih panjang; pelanggan menekan bayar di `POST /api/pesanan/[token]/bayar`, yang membuat charge saat itu dan memendekkan tenggat jadi 15 menit.
- Alternatif dan galat: gagal membuat charge pada `POST /api/bookings` membatalkan booking `PENDING` dan mengembalikan 502; `/bayar`: 404 "Pesanan tidak ditemukan", 409 bila status tidak cocok atau "Merchant belum mengaktifkan pembayaran", 500 "Gagal memproses pembayaran", 502 gagal charge. Setelah `PAID`, halaman menawarkan "Selesai" ke halaman terima kasih (UC-14).
- Hasil akhir: `PAID` atau `CANCELLED` (kedaluwarsa).
- Aturan terkait: DECISIONS #18; booking `REQUESTED` kedaluwarsa dibatalkan oleh `create_booking` dan `reap_expired_bookings`.

### 4.5 Pembayaran otomatis dan pekerjaan terjadwal

#### UC-20 Webhook pembayaran
- Aktor: payment gateway.
- Pemicu: `POST /api/webhooks/[provider]` (`MIDTRANS` atau `XENDIT`).
- Alur utama:
  1. Ambil order id dari payload; bila tidak ada atau booking tidak dikenal, balas 200 (tidak untuk di-retry).
  2. Muat kredensial merchant pemilik booking; bila tidak aktif, 401 "Kredensial tidak ditemukan".
  3. Verifikasi signature dengan kredensial merchant itu; bila tidak cocok, 401 "Signature tidak valid" dan nol UPDATE.
  4. Bila `shouldMarkPaid(status)`: ubah ke `PAID`, jadwalkan `notifyBookingPaid` lewat `after()`, tulis kejadian funnel `PAID` lewat RPC `record_paid_event`.
  5. Balas 200.
- Alternatif: event duplikat untuk booking yang sudah `PAID` memicu ulang notifikasi (aman karena `notification_log`) dan mencoba ulang `PAID`; pembayaran untuk booking `CANCELLED` tidak di-flip ke `PAID`, hanya dicatat.
- Hasil akhir: booking `PAID`; merchant menerima email plus WhatsApp, pelanggan menerima WhatsApp.
- Aturan terkait: bagian 6.4; Xendit menolak bila merchant belum mengisi Callback Token.

#### UC-21 Pembatalan otomatis booking tak dibayar
- Aktor: cron.
- Pemicu: `GET /api/cron/cancel-unpaid`, jadwal `0 20 * * *` (20:00 UTC, 03:00 WIB).
- Alur utama: header `Authorization: Bearer $CRON_SECRET` diperiksa (`isAuthorizedCron`, gagal tertutup); satu UPDATE atomik mengubah `PENDING` dengan `expires_at` lewat menjadi `CANCELLED` (alasan `EXPIRY_CANCEL_REASON`); lalu `prune_funnel_events` memangkas kejadian funnel lebih dari 13 bulan.
- Galat: 401 "Tidak diizinkan"; 500 "Gagal membatalkan booking".
- Hasil akhir: respons `{ cancelledCount }`; slot dan kuota bulanan dibebaskan.
- Aturan terkait: karena cron harian (batas Vercel Hobby), slot booking tak dibayar bisa tertahan hingga 24 jam; `create_booking` juga membersihkan booking kedaluwarsa secara inline di bawah kunci merchant.

#### UC-22 Pengingat H-1 dan pagi hari jadwal
- Aktor: cron.
- Pemicu: `GET /api/cron/reminders`, jadwal `0 1 * * *` (01:00 UTC, 08:00 WIB), `maxDuration = 300`.
- Alur utama:
  1. Offset H-1: booking `PAID`/`CONFIRMED` yang jadwalnya besok (hari kalender WIB).
  2. Offset pagi hari: booking hari ini yang mulai paling cepat 30 menit dari saat cron jalan.
  3. Hanya merchant Pro dan Studio. Kanal ditentukan setelan merchant dan bisa ditimpa pelanggan per booking: WhatsApp, email, notifikasi HP.
  4. Maksimal 1000 booking per offset per jalan (peringatan di log bila tercapai).
  5. Memangkas langganan push yang kedaluwarsa atau ditolak (404 atau 410).
- Hasil akhir: respons `{ candidates, pruned }`. Memanggil ulang tidak mengirim ulang.
- Aturan terkait: bagian 6.4; kanal tanpa konfigurasi dicatat `SKIPPED`.

### 4.6 Kelola booking oleh pelanggan (`/pesanan`)

#### UC-23 Pelanggan mengubah jadwal
- Aktor: pemegang token.
- Prasyarat: booking `PAID` atau `CONFIRMED` tanpa catatan kehadiran; merchant mengizinkan (`allow_customer_reschedule`, bawaan mati).
- Pemicu: `/pesanan/[token]/ubah-jadwal`.
- Alur utama:
  1. Halaman menampilkan tenggat (`reschedule_min_hours` sebelum mulai, bawaan 24, 0 sampai 168) dan sisa kesempatan (`max_reschedules`, bawaan 1, 1 sampai 5).
  2. Pelanggan memilih jam baru; `POST /api/pesanan/[token]/ubah-jadwal` dengan `{ startUtc }` memanggil RPC `reschedule_booking`.
  3. Sukses: jadwal pindah, `reschedule_count` naik, merchant dinotifikasi (`BOOKING_RESCHEDULED_MERCHANT`). Untuk sewa lapangan, bila lapangan terisi di jam baru, pindah otomatis ke lapangan lain yang terkait dan kosong.
- Alternatif dan galat (409 kecuali disebut; respons memuat `error` dan `code`): BK040 "Booking ini tidak bisa diubah lagi."; BK041 "Merchant tidak mengizinkan ubah jadwal lewat halaman ini."; BK042 "Batas waktu ubah jadwal sudah lewat."; BK043 "Anda sudah memakai semua kesempatan ubah jadwal."; BK046 "Jadwal baru terlalu dekat. Pilih jam yang lebih jauh."; BK003 "Staf untuk booking ini sudah tidak tersedia. Silakan hubungi merchant."; 23P01 "Jam itu baru saja terisi. Pilih jam lain."; BK001 "Jam itu di luar jam buka. Pilih jam lain."; P0006 "Jam itu sudah lewat. Pilih jam lain."; BK060 "Meja di jam itu sudah penuh. Pilih jam lain."; BK061 "Meja Anda sudah terisi di jam itu. Pilih jam lain."; BK072 "Semua lapangan penuh di jam itu. Pilih jam lain."; **BK073 "Jam baru harganya lebih tinggi. Hubungi merchant untuk pindah ke jam ini."** (pelanggan tidak bisa pindah ke slot lebih mahal; sama atau lebih murah boleh dan harga tidak berubah); 400 `invalid_body` "Jadwal baru tidak valid"; 404 `not_found` (token cacat); 500 `save_failed`.
- Hasil akhir: jadwal baru; harga tersimpan tidak dihitung ulang.
- Aturan terkait: bagian 5.5; kode mesin stabil `price_higher`, `no_court_free`, `outside_hours`, `slot_taken`, `slot_in_past`, `new_slot_too_soon`, `reschedule_limit_reached`, `reschedule_deadline_passed`, `reschedule_not_allowed`, `booking_not_changeable`, `staff_unavailable`, `table_full`, `table_occupied`.

#### UC-24 Pelanggan membatalkan booking
- Aktor: pemegang token.
- Prasyarat: `REQUESTED` yang belum mulai (selalu boleh, tanpa tenggat), atau `PAID`/`CONFIRMED` tanpa catatan kehadiran dengan `allow_customer_cancel` menyala (bawaan mati) dan sebelum tenggat `cancel_min_hours` (bawaan 24).
- Pemicu: tombol batal di `/pesanan/[token]`, `POST /api/pesanan/[token]/batal`.
- Alur utama: RPC `cancel_booking_by_customer` mengunci baris, memeriksa kebijakan, mengubah ke `CANCELLED` dengan alasan "Dibatalkan pelanggan", dan merchant dinotifikasi (`BOOKING_CANCELLED_MERCHANT`).
- Galat: BK044 "Merchant tidak mengizinkan pembatalan lewat halaman ini."; BK045 "Batas waktu pembatalan sudah lewat."; BK040; 404 "Pesanan tidak ditemukan"; 500 pesan umum.
- Hasil akhir: booking `CANCELLED`, slot dan kuota bebas. Pengembalian dana tidak otomatis; halaman menampilkan teks kebijakan merchant atau "Soal pengembalian pembayaran, hubungi {merchant}."

#### UC-25 Hubungi merchant, atur pengingat, dan web push
- Aktor: pemegang token.
- Pemicu: `/pesanan/[token]` dan `/pesanan/[token]/pengingat`.
- Alur utama:
  1. Hubungi merchant lewat tautan kontak (WhatsApp dan kanal yang diisi merchant).
  2. Atur pengingat: `PUT /api/pesanan/[token]/pengingat` (badan maksimal 4096 byte) menyimpan pilihan kanal (WhatsApp, email, notifikasi HP) dan offset (H-1, pagi hari). Offset yang tidak terjangkau cron dipangkas (`reachableOffsets`); booking yang sudah selesai tidak menampilkan pengingat.
  3. Aktifkan web push: `POST /api/pesanan/[token]/push` menyimpan langganan terenkripsi (`TOKEN_ENCRYPTION_KEY`), maksimal 5 perangkat per booking; `DELETE` mencabutnya. `GET /api/pesanan/[token]/manifest` melayani manifest supaya iOS bisa menambah ke Layar Utama.
- Galat: 400 "Pilihan pengingat tidak valid." atau "Langganan notifikasi tidak valid."; 409 "Pengingat tidak tersedia untuk booking ini.", "Notifikasi HP belum disiapkan." (VAPID belum diisi), "Batas perangkat untuk booking ini tercapai."; 404 "Pesanan tidak ditemukan"; 500 "Gagal menyimpan pengingat" atau "Gagal menyimpan langganan".
- Hasil akhir: `booking_reminder_prefs` dan `push_subscriptions` terisi.
- Aturan terkait: pengingat hanya berlaku bila merchant Pro atau Studio; kanal yang dimatikan merchant disimpan tetapi tidak berefek. iPhone butuh iOS 16.4 ke atas dan situs ditambahkan ke Layar Utama. Payload push membawa path, bukan URL absolut.

### 4.7 Dashboard merchant

#### UC-26 Dashboard Hari ini
- Aktor: merchant.
- Pemicu: `/dashboard`.
- Alur utama: halaman menampilkan daftar "perlu tindakan" (permintaan menunggu, tagihan di tempat), agenda hari ini, ringkasan uang yang ditagih di tempat, tautan halaman yang bisa disalin, kartu "Panduan memulai" (UC-37) dan kartu `ProfileNudge` (UC-04), serta peringatan setup.
- Hasil akhir: titik masuk harian merchant.
- Aturan terkait: DESIGN.md (monokrom, merah hanya untuk tindakan merusak); kuota bulanan Starter ditampilkan lewat `my_quota_usage()` yang memakai fungsi hitung sama dengan trigger.

#### UC-27 Daftar booking dan aksi detail
- Aktor: merchant.
- Pemicu: `/dashboard/bookings`; panel detail lewat `?b=`.
- Alur utama:
  1. Empat tab: Perlu tindakan (`tindakan`), Akan datang (`mendatang`, bawaan), Riwayat (`riwayat`), Dibatalkan (`batal`), dengan pencarian dan paginasi.
  2. Detail booking menampilkan data pelanggan, asal kunjungan ("Datang dari ..."), riwayat notifikasi (`notification_log`), nama staf, meja, atau lapangan.
  3. Aksi: batalkan (`cancelBooking`), setujui atau tolak `REQUESTED` (`decideRequest`), tandai lunas di tempat (`markPaidOnSite`, metode `CASH`/`QRIS`/`TRANSFER`), catat kehadiran atau no-show (`markAttendance`), jadwal ulang (UC-29).
- Galat (galat form): BK030 "Permintaan ini sudah dijawab atau tidak ditemukan."; BK031 "Permintaan ini sudah kedaluwarsa."; BK032 "Booking ini tidak punya tagihan di tempat yang belum lunas."; BK033 "Kehadiran baru bisa ditandai mendekati jadwal."; BK037 saat menyetujui "DP layanan ini di atas batas QRIS Rp10.000.000. Kecilkan DP di Layanan, lalu setujui lagi."
- Hasil akhir: status dan notifikasi diperbarui (`BOOKING_APPROVED_CUSTOMER`, `BOOKING_REJECTED_CUSTOMER`).
- Aturan terkait: status `PENDING`, `PAID`, `CANCELLED`, `CONFIRMED`, `REQUESTED`; booking `REQUESTED` yang disetujui menjadi `PENDING` tanpa `payment_url` dan pelanggan membayar lewat `/bayar` (UC-19).

#### UC-28 Booking manual
- Aktor: merchant.
- Pemicu: `/dashboard/bookings/baru` (bisa diisi awal lewat query).
- Alur utama: merchant memilih layanan, jam (dan staf, meja, atau lapangan plus lama main), mengisi data pelanggan; RPC `create_manual_booking` membuat booking `source = MANUAL` tanpa memeriksa koneksi payment (BK021) dan batas per nomor (BK020). Harga lapangan dihitung otomatis.
- Galat (galat form): BK035 "Batas 50 booking manual per hari tercapai. Coba lagi besok."; P0002 "Kuota transaksi bulan ini sudah habis. Upgrade paket di menu Langganan untuk menambah booking."; BK070, BK071, BK072 untuk lapangan; BK001, 23P01 dan sejenisnya "Jam itu sudah terisi. Pilih jam lain."; P0006 "Jam itu sudah lewat. Pilih jam lain."
- Hasil akhir: booking tercatat di kalender.
- Aturan terkait: maksimal 50 booking `MANUAL` per 24 jam bergulir (semua status, termasuk `CANCELLED`); DECISIONS #31.

#### UC-29 Jadwal ulang atau pindah oleh merchant
- Aktor: merchant.
- Pemicu: aksi jadwal ulang di panel detail.
- Alur utama: merchant memilih jam baru (untuk sewa, juga lapangan tujuan lewat `p_court_id`); RPC `reschedule_booking_by_merchant` memanggil `move_booking_slot`. Lapangan sendiri dipertahankan bila null dan kosong; bila terisi pindah ke lapangan lain yang terkait dan kosong.
- Galat: BK034 "Booking ini tidak bisa dijadwal ulang." (status bukan `PAID`/`CONFIRMED`); BK036 "Booking ini sudah dijadwal ulang 3 kali."; BK003 "Staf untuk booking ini sudah tidak aktif."; BK060 "Kursi atau meja di jam itu sudah penuh. Pilih jam lain."; BK061 "Meja itu sudah terisi di jam baru. Pilih jam lain."; BK070 bila lapangan tujuan tidak milik merchant atau tidak terkait layanan; BK072; BK001 (jam di luar jam buka atau grid); P0006; 42501.
- Hasil akhir: jadwal baru; harga tetap (tidak dihitung ulang di jalur mana pun; jalur merchant juga tidak memeriksa BK073).
- Aturan terkait: maksimal 3 jadwal ulang per booking (`merchant_reschedule_count`); pesan "Gagal menyimpan. Coba lagi." untuk kode yang tidak dipetakan (22023, 42501, BK071).

#### UC-30 Jadwal harian lapangan (belum rilis)
- Aktor: merchant lapangan.
- Pemicu: `/dashboard/lapangan` tab Jadwal.
- Alur utama: lapangan sebagai kolom dan jam sebagai baris; booking sebagai blok yang membuka panel detail (`?b=`); navigasi tanggal, legenda, penanda jam ramai; di HP kolom bisa digeser horizontal; tombol tambah booking manual.
- Hasil akhir: merchant melihat semua lapangan sekaligus.
- Aturan terkait: tab Lapangan di nav bawah HP hanya muncul untuk merchant sewa (target tur `nav-courts-mobile`), sidebar desktop memakai `nav-courts`.

#### UC-31 Editor lapangan dan denah venue (belum rilis)
- Aktor: merchant lapangan.
- Pemicu: `/dashboard/lapangan` tab "Lapangan dan denah".
- Alur utama:
  1. Tambah, ganti nama (1 sampai 40 karakter, unik per merchant), urutkan, nonaktifkan, atau hapus lapangan.
  2. Profil: olahraga (`PADEL`, `FUTSAL`, `MINI_SOCCER`, `BADMINTON`, `TENIS`), lingkungan (`INDOOR`, `OUTDOOR`, `OUTDOOR_BERATAP`), permukaan (maksimal 60), deskripsi (maksimal 280), ciri (maksimal 5, tiap ciri maksimal 40). Tombol "Simpan profil".
  3. Foto: maksimal 5 per lapangan (JPG/PNG/WebP, maksimal 5MB per berkas, teks alternatif wajib maksimal 140 karakter; foto pertama jadi sampul; foto tanpa alt tidak tampil di publik). Path `{merchant_id}/court/{court_id}/{berkas}`.
  4. Denah venue: area berlabel dan penanda (Pintu masuk, Ruang ganti, Kantin, Parkir, Toilet) dengan posisi; label 1 sampai 30 karakter; tombol "Simpan denah" memanggil `save_venue_layout` (atomik, maksimal 100 lapangan, 20 area, 50 penanda per simpan).
- Galat: `name_taken` "Nama lapangan itu sudah dipakai. Pakai nama lain."; `forbidden` "Anda tidak punya akses untuk tindakan ini."; `invalid_data` "Data tidak valid. Periksa isian lalu coba lagi."; `has_bookings` bila lapangan punya riwayat booking atau 23503 saat hapus, lapangan otomatis dinonaktifkan (`deactivated: true`) dan pesan "Lapangan yang punya riwayat booking dinonaktifkan, bukan dihapus."; 22023 untuk id null atau ganda di denah.
- Hasil akhir: profil dan denah tampil di halaman publik.
- Aturan terkait: lapangan yang punya riwayat dinonaktifkan, tidak dihapus (`bookings.court_id` `NO ACTION`); dua tombol simpan terpisah sengaja dipakai.

#### UC-32 Denah meja restoran
- Aktor: merchant restoran.
- Pemicu: `/dashboard/denah`.
- Alur utama: menyimpan pengaturan kapasitas (`saveCapacitySettings`, mode `NONE`/`AREA`/`TABLE`), lalu menggambar area dan meja (bentuk `ROUND` atau `RECT`, gabungan meja) di editor; simpan lewat `save_dining_layout` (atomik: upsert dulu, lalu hapus).
- Galat: BK062 "Meja atau area ini masih punya reservasi mendatang. Pindahkan reservasinya dulu, lalu hapus." (409); BK064 "Denah meja tidak valid. Periksa jumlah, nama, dan gabungan meja, lalu coba lagi." (422).
- Hasil akhir: pelanggan bisa memilih meja di UC-16.

#### UC-33 Analitik dan funnel (Studio)
- Aktor: merchant Studio.
- Pemicu: `/dashboard/analitik`.
- Alur utama: ringkasan dan grafik kolom dari data booking; bagian funnel (belum rilis) menampilkan Kunjungan, Memilih layanan, Lanjut ke data diri, Booking dibuat, Dibayar, per kanal dan per rentang 7, 30, atau 90 hari lewat RPC `funnel_summary`, plus kalimat langkah dengan penurunan terbesar.
- Hasil akhir: konversi sama dengan Dibayar dibagi Kunjungan; kejadian disimpan 13 bulan.
- Aturan terkait: halaman ini hanya untuk tier `STUDIO` (selain itu ditolak di halaman); kejadian tanpa IP, tanpa user agent, tanpa data pelanggan; `PAID` dan `BOOKED` ditulis server sehingga angka Dibayar tidak mungkin melebihi Booking dibuat.

#### UC-34 Domain sendiri (Studio)
- Aktor: merchant Studio.
- Pemicu: `/dashboard/domain`.
- Alur utama:
  1. Daftarkan domain (`registerDomain`); sistem memberi token acak.
  2. Merchant memasang CNAME atau A ke Vercel dan TXT `_marky.<domain>` berisi token (`_booka.<domain>` masih diterima).
  3. `checkDomain` memeriksa Vercel REST API dan `dns.resolveTxt`; bila keduanya benar, service role menandai `ACTIVE`.
  4. `src/proxy.ts` me-resolve host asing lewat `resolve_custom_domain` (cache 60 detik per instance), me-rewrite `/` ke `/{username}`, dan mengalihkan path lain ke domain Marky.
- Galat: BK010 "Domain sendiri khusus paket Studio."; tanpa `VERCEL_API_TOKEN` dan `VERCEL_PROJECT_ID`, halaman menampilkan "belum diaktifkan".
- Hasil akhir: halaman merchant tersedia di domain sendiri.
- Aturan terkait: DECISIONS #29; satu domain per merchant; unik hanya untuk `ACTIVE`; host tak dikenal jatuh ke aplikasi biasa; `NEXT_PUBLIC_APP_URL` wajib benar.

#### UC-35 Pengaturan, ekspor data, hapus akun
- Aktor: merchant.
- Pemicu: `/dashboard/settings`.
- Alur utama:
  1. Profil: nama usaha, bio, nomor WhatsApp (`updateSettings`).
  2. Pemesanan: `allow_pay_on_site`, `auto_confirm_on_site`, `max_active_per_phone` (1 sampai 10 atau kosong), `deposit_after_no_show` (`updateBookingSettings`).
  3. Kebijakan pelanggan: izinkan ubah jadwal dan batal, jam minimum (0 sampai 168), maksimum ubah jadwal (1 sampai 5), teks kebijakan (maksimal 500) (`updateCustomerPolicy`).
  4. Kontak publik: WhatsApp, Instagram, Threads, X, TikTok, email, dan jam (`updateContactSettings`).
  5. Pengingat: kanal (WhatsApp, email, push) dan offset (H-1, pagi hari) (`updateReminderSettings`).
  6. Ekspor: `GET /dashboard/settings/ekspor` mengunduh seluruh data merchant sebagai satu berkas JSON memakai klien bersesi (RLS), tanpa kredensial gateway dan tanpa `access_token` booking.
  7. Hapus akun: merchant mengetik username sebagai konfirmasi; `deleteAccount` menghapus lewat `auth.admin.deleteUser` lalu keluar.
- Galat: ekspor 401 "Tidak diizinkan" tanpa sesi; konfirmasi hapus yang tidak cocok ditolak dengan pesan galat form.
- Hasil akhir: setelan tersimpan, berkas ekspor, atau akun terhapus.
- Aturan terkait: bagian 10.2.

#### UC-36 Langganan, paket, dan masa awal gratis
- Aktor: merchant, tim Marky.
- Pemicu: `/dashboard/billing`.
- Alur utama: halaman menampilkan tiga paket dari `PLANS` dan kuota. Selama `EARLY_ACCESS_FREE = true`, tampil catatan "Semua fitur gratis selama masa awal." dan "Tiga paket di bawah adalah harga nanti. Kami kabari dulu sebelum ada tagihan." Tombol upgrade membuka WhatsApp tim bila `NEXT_PUBLIC_SUPPORT_WHATSAPP` terisi; bila kosong, tombol disembunyikan.
- Hasil akhir: tidak ada pembayaran langganan otomatis; perubahan paket manual.
- Aturan terkait: bagian 7.

#### UC-37 Panduan memulai dan tur
- Aktor: merchant.
- Pemicu: dashboard Hari ini dan panel "Panduan halaman ini" di tiap halaman.
- Alur utama:
  1. Checklist enam langkah dihitung dari data lewat RPC `onboarding_state()`: layanan ada, jam buka ada, cara menerima uang siap, tampilan pernah disimpan, tautan pernah dibagikan, booking pertama masuk.
  2. Langkah "cara menerima uang" selesai bila ada gateway aktif, atau ada layanan dan tidak satu pun butuh bayar online.
  3. Progres non-data (tur sudah dilihat, checklist disembunyikan, tautan disalin) disimpan lewat `save_onboarding_progress` ke `merchant_onboarding_progress`.
  4. Tur coachmark memakai Radix `Dialog` dengan target `data-tour`; Enter maju, Esc menutup; tur Hari ini mulai sendiri sekali, lima langkah di desktop dan empat di HP; langkah yang targetnya tidak ada dilewati.
- Hasil akhir: merchant baru terarah ke tindakan berikutnya.
- Aturan terkait: teks di `src/lib/guide/content.ts` wajib diperbarui saat halaman berubah (`content.test.ts` memeriksa target); 16 kunci halaman termasuk `links`, `ads`, `courts`; slot video sengaja kosong ("Video panduan belum tersedia.").

### 4.8 Pemasaran

#### UC-38 Landing, halaman industri, dan cek username
- Aktor: calon merchant (anon).
- Pemicu: membuka `/` atau `/untuk/<slug>`.
- Alur utama:
  1. Landing menampilkan paket dan perbandingan dari `src/lib/plans.ts`, contoh slip booking, dan formulir klaim username.
  2. Formulir memanggil `GET /api/username-check?u=<slug>` (masukan dipotong 64 karakter); RPC `check_username_claim` (hanya `service_role`) mengembalikan status ketersediaan dan menolak setelah 30 cek per 10 menit per hash IP.
  3. Halaman `/untuk/<slug>` tersedia untuk `salon`, `barbershop`, `restoran`, `fotografer`, `klinik`, `kelas`, dan `lapangan` (belum rilis), dirender statis dari `industries.ts`.
- Galat: respons `rate_limited` memberi 429; `error` memberi 503; selain itu 200 dengan `Cache-Control: no-store`.
- Hasil akhir: pendaftaran selalu mulai di Starter secara tampilan paket (selama masa awal gratis, tier efektif `STUDIO`).
- Aturan terkait: DECISIONS #39; segmen `untuk` dicadangkan di `reserved_usernames`; semua host berasal dari `NEXT_PUBLIC_APP_URL`; font General Sans self-host dengan `display: "optional"`.

#### UC-39 Halaman terima kasih dan Purchase (belum rilis)
- Aktor: pelanggan.
- Prasyarat: booking `PAID`.
- Pemicu: tombol "Selesai" di `/pesanan/[token]`, membuka `/{username}/terima-kasih?e=<pixel_event_id>`.
- Alur utama: halaman membaca ringkasan lewat RPC `get_paid_event(p_event_id)` (layanan, nominal, dibayar dalam 24 jam terakhir, tanpa data pelanggan), memuat pixel, dan mengirim Purchase sekali (penanda `localStorage` per `event_id`; deduplikasi di platform lewat `event_id`).
- Hasil akhir: Purchase terkirim tanpa token di URL.
- Aturan terkait: pelanggan yang menutup tab sebelum membukanya tidak memicu Purchase di browser (diterima sadar, DECISIONS #42).

---

## 5. Spesifikasi fungsional per fitur

### 5.1 Phase 1 sampai 2: scaffold, skema, auth, onboarding, shell dashboard

- Stack: Next.js 16 (App Router, konvensi `proxy.ts` menggantikan middleware), Tailwind v4, shadcn/ui (preset radix-nova), Supabase (Postgres, Auth, RLS), Zod.
- Skema awal: `merchants`, `services`, `availability`, `bookings` dengan RLS; semua tabel `REVOKE ALL` dari `anon` dan `authenticated` lalu grant per kolom.
- `merchants.username` nullable sampai onboarding; proxy memaksa `/onboarding`.
- `reserved_usernames` plus trigger mencegah username memakai segmen rute (`dashboard`, `api`, `masuk`, `untuk`, dan sebagainya). Segmen tingkat atas baru wajib masuk `ROUTES` dan `reserved_usernames`.
- Kuota Starter: 10 transaksi per bulan menurut waktu Jakarta, menghitung `PENDING` dan `PAID`; `CANCELLED` mengembalikan kuota; ditegakkan trigger `bookings_enforce_quota`; angka dashboard dari `my_quota_usage()`. Konstanta TS `STARTER_MONTHLY_TRANSACTIONS = 10` wajib sama dengan SQL.

### 5.2 Phase 3 sampai 6: layanan, pembayaran, halaman publik, mesin booking, webhook, cron

- Layanan, jam buka, penegakan batas paket (Starter 1 layanan lewat trigger `enforce_service_limit`; `subscription_tier` tidak bisa di-UPDATE `authenticated`).
- Gateway Midtrans dan Xendit, OAuth atau Server Key manual, kredensial terenkripsi di `private.payment_credentials`, `environment` per koneksi.
- `POST /api/bookings`: rute dengan service role, tidak ada INSERT langsung `anon` ke `bookings` (DECISIONS #1). Urutan: batas ukuran badan, parse JSON, Zod, resolve merchant dan layanan, rate limit `check_booking_rate_limit` (3 percobaan per hash IP dan merchant per 15 menit, gagal terbuka bila pengecekan itu sendiri gagal), RPC `create_booking`, charge QRIS bila `PENDING`.
- Polling status tiap 3 detik di `/pesanan/[token]` lewat `GET /api/bookings/[id]/status` yang hanya mengembalikan `status` dan `expires_at`.
- Webhook dan cron: UC-20 sampai UC-22.
- Kolom snapshot pada `bookings` (`service_name`, `service_price`, `duration_minutes`; `service_id` `ON DELETE SET NULL`).
- Token akses booking 192 bit di path URL (DECISIONS #18).
- Pengerasan: `get_booked_ranges` sebagai satu-satunya jalur anon membaca bentrok; `access_token` untuk akses pelanggan; `reap_expired_bookings`; migration `dashboard_perf`.

### 5.3 Kustomisasi halaman publik

Detail UC-11. Tabel gating:

| Kemampuan | Starter | Pro | Studio |
| --- | --- | --- | --- |
| Preset Bersih, Hangat, Malam | Ya | Ya | Ya |
| Preset Pastel, Berani, Elegan | Tidak | Ya | Ya |
| Gaya sudut, foto profil, logo, susunan bagian, FAQ | Ya | Ya | Ya |
| Warna aksen, background, font, ukuran teks | Tidak | Ya | Ya |
| Background foto, foto sampul, gaya tombol, latar bergerak | Tidak | Ya | Ya |
| Video pada layanan | Tidak | Ya | Ya |
| Watermark "Dibuat dengan Marky" | Ada | Tidak | Tidak |

Aturan: warna aksen menghasilkan `--accent-fill` (mentah) dan `--accent-text` (digeser sampai kontras 4,5:1); teks tombol `FILLED` dijaga 4,5:1 (`ensureContrast`); `resolveTheme()` memangkas nilai premium saat baca bila merchant turun paket. Tampilan publik hanya boleh datang dari `resolveTheme()` dan `themeToCssVars()`; komponen `src/components/booking-page/*` tidak boleh menulis warna, ukuran, atau font langsung.

Batas media: gambar JPG/PNG/WebP, 12MB mentah sebelum kompres; sisi maksimal avatar 512, background 1200, gambar layanan 800; video MP4/WebM maksimal 20MB dan 30 detik; maksimal 5 gambar per layanan; maksimal 10 FAQ.

### 5.4 F0 sampai F1: fondasi dan halaman pelanggan baru

- F0: Storybook 10 (`@storybook/nextjs-vite`), sisa rename ke Marky, token kontras, penerapan `DESIGN.md`.
- F1: `/[username]` kini alur tiga langkah (`BookingFlow`, komponen murni di `src/components/booking-page/`); `/pesanan/[token]` memakai tema merchant.

### 5.5 F2 sampai F4: cara bayar, dashboard operasional, kelola booking

F2: empat cara bayar, status `CONFIRMED` dan `REQUESTED`, tabel `merchant_settings`, minimum QRIS Rp1.500, aksi merchant di detail booking, rute `/api/pesanan/[token]/bayar`.

| Cara bayar | Bayar sekarang (`amount_due_now`) | Status awal |
| --- | --- | --- |
| `FULL` | harga setelah diskon | `PENDING` bila lebih dari 0, selain itu `CONFIRMED` |
| `DEPOSIT` | DP persen (dibulatkan setengah ke atas) atau tetap (maksimal harga), minimal Rp1.500 | `PENDING` |
| `ON_SITE` | 0 | `CONFIRMED`, atau `REQUESTED` bila `auto_confirm_on_site` mati |
| `REQUEST` | DP dihitung sama seperti `DEPOSIT`, ditagih setelah disetujui | `REQUESTED` |

F3: dashboard mulai dari Hari ini; Booking bertab dengan panel detail (`?b=`); booking manual; jadwal ulang oleh merchant; sidebar berkelompok dan nav bawah HP. Batas: 50 booking manual per 24 jam (BK035), 3 jadwal ulang merchant per booking (BK036). Target sentuh 44px berlaku hanya di layar sentuh (`max-md`); sidebar desktop memakai baris `h-8` (DECISIONS #32).

F4: pelanggan bisa ubah jadwal, batal, hubungi merchant, dan atur pengingat dari `/pesanan/[token]`. Kebijakan merchant: `allow_customer_reschedule`, `reschedule_min_hours` (bawaan 24), `max_reschedules` (bawaan 1), `allow_customer_cancel`, `cancel_min_hours` (bawaan 24), `policy_text`. Pengingat hanya dua offset (H-1 dan pagi hari jadwal) karena cron berjalan sekali sehari. Lisensi dan keputusan web push di DECISIONS #33. Kode booking untuk pelanggan: `BK-` plus 6 heksa pertama id huruf besar (`bookingCode`).

### 5.6 F5: voucher dan banner

Detail UC-12 dan UC-18. Rumus diskon (`computeDiscount`, cermin `evaluate_voucher`):

1. `PERCENT`: `round(harga x nilai / 100)` (setengah ke atas), dibatasi `max_discount`; `FIXED`: nilai apa adanya.
2. Diskon tidak pernah melebihi harga.
3. Bila harga minimal Rp1.500 dan sisa jatuh antara Rp1 dan Rp1.499, diskon dikurangi sampai sisa tepat Rp1.500.
4. Sisa Rp0 diizinkan dan membuat booking `CONFIRMED`.

Pemakaian dihitung di dalam `create_booking` dari `bookings` (`voucher_id`, `voucher_code`, `discount_amount`) di bawah kunci merchant; booking `CANCELLED` atau kedaluwarsa otomatis membebaskan pemakaian, `PAID` dan `CONFIRMED` dihitung selamanya. Gating: Pro dan Studio (trigger `enforce_promo_tier` saat tulis, pembaca saat tampil).

### 5.7 F6: tampilan lanjutan

Logo (semua paket); foto sampul, gaya tombol (`FILLED`, `OUTLINE`, `SOFT`), latar `MOTION` (Pro dan Studio); susunan bagian lewat `section_order` (permutasi tepat dari `PROMO`, `SERVICES`, `FAQ`, dan `LINKS` sejak F11) dan `hidden_sections`. Kepala profil selalu paling atas, watermark selalu paling bawah. Latar bergerak: mesin `seek(t)` murni, loop 12 detik, hanya `translate`, `rotate`, `scale`; dimuat malas lewat `next/dynamic`; berhenti saat reduced motion, hemat data, dan tab tersembunyi.

### 5.8 F7: profil staf

Detail UC-09. Kartu "Dengan siapa?" (`staff-picker.tsx`) menghormati reduced motion dan hemat data (hanya poster tampil, MP4 tidak diminta). Klip diputar sekali tanpa suara dengan tombol "Putar lagi". `GET /api/slots/nearest` memakai satu panggilan `get_booked_ranges` untuk 14 hari.

Multi-staf (Studio): kalender per staf, `bookings_no_overlap` per (merchant, staf); "Siapa saja" menugaskan staf aktif pertama yang jamnya cocok dan kosong di bawah kunci yang sama; maksimal 20 staf; `computeStaffSlots` (TS) mencerminkan `create_booking` (SQL) dan keduanya diuji.

### 5.9 F8: reservasi restoran

Detail UC-06, UC-16, UC-32. `merchant_settings.table_mode`: `NONE` (bawaan), `AREA`, `TABLE`. Kursi dan meja dihitung di `create_booking`, `create_manual_booking`, `move_booking_slot` di bawah kunci merchant. Denah hanya ditulis lewat `save_dining_layout`. Sisi anon: `get_seat_availability` dan `get_table_status` (jam, jumlah, status, tanpa data pelanggan). Tidak dikunci paket.

### 5.10 F9: panduan merchant

Detail UC-37.

### 5.11 F10: landing page dan SEO

Detail UC-38. Landing di route group `(marketing)` dengan token Coral (`marketing.css`); teks di `src/lib/marketing/*`; JSON-LD, OG, `robots`, `sitemap` dari data yang sama; kontak yang masih berupa penanda tidak dirender; klaim sesuai produk (pengingat hanya Pro dan Studio; pindah jadwal oleh pelanggan hanya bila merchant mengizinkan; perubahan paket dibantu tim Marky).

### 5.12 Kesiapan rilis dan fitur Studio

`/syarat` dan `/privasi` (identitas penyelenggara di `src/lib/legal.ts`), unduh data dan hapus akun, robots, sitemap, gambar OG, Sentry (mati tanpa DSN). Notifikasi email, WhatsApp, dan push. Studio: Analitik, multi-staf, domain sendiri.

### 5.13 Masa awal gratis dan batas atas QRIS

- Masa awal gratis: migration `20261123000100` menjadikan `STUDIO` default `merchants.subscription_tier` dan menaikkan merchant lama; seluruh pengecekan tier tetap utuh. Menagih lagi: ubah tier per merchant, kembalikan default kolom lewat migration baru, set `EARLY_ACCESS_FREE = false`.
- Batas atas QRIS: `MAX_ONLINE_CHARGE = 10_000_000` (Midtrans menerima 1 sampai 10.000.000 per transaksi). Dipakai form layanan (FULL, DEPOSIT, REQUEST) dan trigger `bookings_enforce_max_online_charge` (BK037, 422, hanya untuk status `PENDING`). Layanan lama di atas batas tetap bisa dipesan lewat `ON_SITE`.
- Indeks FK: migration `20261124000100_fk_covering_indexes.sql` menambah indeks penutup untuk kunci asing.

### 5.14 F11: funnel iklan dan link-in-bio (belum rilis)

Detail UC-13, UC-14, UC-33, UC-39.

Kejadian (`funnel_events.kind`): `VIEW`, `SERVICE`, `CHECKOUT`, `BOOKED`, `PAID`, `LINK_CLICK`. `VIEW`, `SERVICE`, `CHECKOUT`, `LINK_CLICK` dikirim browser ke `POST /api/events` (Zod, `VIEW` sekali per sesi per merchant, batas 120 per menit per hash IP per merchant lewat `check_event_rate_limit`, gagal terbuka, 429 "Terlalu banyak permintaan", 404 "Merchant tidak ditemukan", 400 "Data kejadian tidak valid", respons sukses 204). `BOOKED` dan `PAID` ditulis server, hanya untuk booking `ONLINE` yang punya sesi.

Atribusi: sentuhan terakhir per sesi tab, `session_id` acak dari `sessionStorage` (bukan cookie); `bookings` menyimpan `session_id`, `ad_link_id`, `utm_source`, `utm_medium`, `utm_campaign` (masing-masing maksimal 64), `referrer_host` (maksimal 100, host saja), `pixel_event_id`. `resolve_ad_link` boleh dipanggil `anon` tanpa rate limit SQL.

Gating: tidak dikunci paket selama masa awal gratis; usulan saat penagihan dimulai (belum diputuskan): link-in-bio dan tautan iklan semua paket, pixel dan funnel per kanal Pro dan Studio. Analitik tetap tier `STUDIO` di halaman.

### 5.15 F12: booking lapangan (belum rilis)

Detail UC-07, UC-17, UC-30, UC-31.

| Aturan | Nilai |
| --- | --- |
| Unit sewa (`court_unit_minutes`) | 30 atau 60 menit |
| Lama main minimum | `duration_minutes` layanan (kelipatan unit) |
| Lama main maksimum (`court_max_minutes`) | kelipatan unit, maksimal 480 menit, tidak kurang dari minimum |
| Aturan jam ramai | maksimal 50 per layanan, satu baris per hari, tidak tumpang tindih, `start_time < end_time` |
| Nama lapangan | 1 sampai 40 karakter, unik per merchant |
| Ciri lapangan | maksimal 5 butir, tiap butir maksimal 40 |
| Foto lapangan | maksimal 5, alt wajib, maksimal 5MB per berkas |
| Denah venue per simpan | maksimal 100 lapangan, 20 area, 50 penanda |
| Paket | tidak dikunci paket |

Harga: tiap unit dihargai dengan aturan yang aktif pada jam mulai unit itu (hari dan jam WIB), atau harga dasar; total `jumlah(harga_per_jam x unit / 60)` dibulatkan sekali ke rupiah (setengah naik). SQL `court_price` adalah sumber kebenaran, `courtPrice()` di `src/lib/booking/court.ts` mencerminkannya.

Bentrok: `bookings_court_no_overlap` (eksklusi per `court_id` untuk status aktif) sebagai jaring terakhir di belakang kunci advisory merchant; `bookings_no_overlap` ditambah predikat `court_id is null`. Booking lapangan tetap `capacity_mode = 'NONE'`.

Jadwal ulang tidak menghitung ulang harga. Pelanggan tidak bisa pindah ke slot lebih mahal (BK073); jalur merchant tidak memeriksa ini.

Onboarding Olahraga: kategori `OLAHRAGA` dengan Padel, Futsal, Mini soccer, Badminton, Tenis; halaman `/untuk/lapangan`; kunci panduan `courts`.

---

## 6. Aturan bisnis lintas fitur

### 6.1 Urutan hitung uang

Dihitung di `create_booking` (SQL, sumber kebenaran) dan dicerminkan `computeAmounts` dan `computeDiscount` di TS. Urutan:

1. **Harga dasar.** Layanan biasa: `services.price`. Layanan sewa: total `court_price` untuk jam mulai dan lama main yang dipilih (disimpan di `bookings.service_price`).
2. **Voucher.** Bila ada, `evaluate_voucher` memeriksa kode, periode, kuota, layanan, minimal belanja, dan riwayat nomor, lalu menghitung diskon (bagian 5.6). Harga efektif sama dengan harga dikurangi diskon.
3. **Cara bayar.** `FULL`: bayar sekarang sama dengan harga efektif. `DEPOSIT` dan `REQUEST`: persen dibulatkan setengah ke atas, atau tetap dibatasi harga efektif. `ON_SITE`: 0.
4. **Minimum QRIS.** Bila harga efektif lebih dari 0 dan ada DP, bayar sekarang dinaikkan ke `min(harga efektif, 1500)` (`MIN_ONLINE_CHARGE`). Tagihan online di bawah Rp1.500 ditolak BK022.
5. **Maksimum QRIS.** Tagihan `PENDING` di atas Rp10.000.000 ditolak BK037 (trigger).
6. **Sisa.** `amount_due_on_site = harga efektif - amount_due_now`. Pembayaran di tempat dicatat lewat `markPaidOnSite` (`CASH`, `QRIS`, `TRANSFER`).
7. **Status awal.** `REQUESTED` bila `REQUEST` atau (`ON_SITE` tanpa auto-konfirmasi); `PENDING` bila bukan `ON_SITE` dan bayar sekarang lebih dari 0; selain itu `CONFIRMED`. Harga akhir Rp0 menjadi `CONFIRMED`.

Pembulatan: `Number()` membungkus numeric PostgREST (bisa berupa string).

### 6.2 Konkurensi

- `create_booking`, `create_manual_booking`, `move_booking_slot`, dan `save_dining_layout` mengambil `pg_advisory_xact_lock(hashtext(merchant_id::text))`. Di bawah kunci itu dilakukan: pembersihan booking kedaluwarsa, hitungan voucher, hitungan batas per nomor, hitungan kuota, pemilihan staf, kursi, meja, atau lapangan.
- Constraint eksklusi GiST sebagai jaring terakhir: `bookings_no_overlap` (per merchant dan staf, status aktif, `capacity_mode = 'NONE'` dan `court_id is null`), `bookings_court_no_overlap` (per lapangan), eksklusi per meja, dan eksklusi aturan jam ramai per `(service_id, day_of_week, rentang jam)`. Rentang setengah terbuka `[)`: bersentuhan bukan irisan.
- Status yang menahan slot: `PENDING`, `PAID`, `CONFIRMED`, `REQUESTED`.
- Pemetaan konflik: 23P01 menjadi 409 dengan pesan per lapisan.

### 6.3 Zona waktu

Semua tampilan dalam WIB (Asia/Jakarta, UTC+7, tanpa DST). `src/lib/format.ts` menghitung jam dinding WIB sendiri, tidak memakai `TZ` proses. Hari kalender untuk kuota bulanan, H-1, dan harga jam ramai memakai WIB. Cron dijadwalkan dalam UTC (20:00 dan 01:00).

### 6.4 Idempotensi

- `notification_log` unik `(booking_id, kind, channel)`: tiap pesan terkirim paling banyak sekali, walau webhook di-retry atau cron terpanggil ulang. Jenis: `BOOKING_PAID_MERCHANT`, `BOOKING_PAID_CUSTOMER`, `REMINDER_CUSTOMER`, `REMINDER_CUSTOMER_SAME_DAY`, `BOOKING_CONFIRMED_MERCHANT`, `BOOKING_CONFIRMED_CUSTOMER`, `BOOKING_REQUESTED_MERCHANT`, `BOOKING_APPROVED_CUSTOMER`, `BOOKING_REJECTED_CUSTOMER`, `BOOKING_RESCHEDULED_MERCHANT`, `BOOKING_CANCELLED_MERCHANT`. Kanal: `EMAIL`, `WHATSAPP`, `PUSH`. Status termasuk `SKIPPED` untuk kanal tanpa konfigurasi.
- Event `PAID` duplikat: `shouldMarkPaid` hanya `true` untuk status yang belum final; event ganda ke booking `PAID` memicu ulang notifikasi (aman) dan `record_paid_event` (idempoten), tanpa UPDATE; ke booking `CANCELLED` tidak di-flip.
- Webhook selalu dibalas 200 untuk payload tak dikenal agar gateway tidak retry selamanya.
- Penyimpanan FAQ dan tautan atomik (`replace_merchant_faqs`, `save_merchant_links`); simpan lapangan dan layanan sewa atomik (`save_court_service`).

### 6.5 Batas dan angka (ringkasan)

| Batas | Nilai | Sumber |
| --- | --- | --- |
| Transaksi Starter per bulan | 10 | trigger `bookings_enforce_quota` |
| Layanan Starter | 1 | `enforce_service_limit` |
| Booking manual per 24 jam bergulir | 50 (BK035) | `create_manual_booking` |
| Jadwal ulang merchant per booking | 3 (BK036) | `merchant_reschedule_count` |
| Banner tayang bersamaan | 3 | `enforce_banner_live_limit` |
| Tautan link-in-bio | 8 (BK080) | trigger `merchant_links` |
| FAQ | 10 | `merchant_faqs` |
| Staf | 20 (BK011) | trigger `staff` |
| Foto lapangan | 5 | `enforce_court_media_limit` |
| Gambar per layanan | 5 | `MEDIA_LIMITS` |
| Unit sewa | 30 atau 60 menit | CHECK `services` |
| Lama main maksimum | 480 menit | CHECK `services`, `checkoutSchema` |
| Durasi layanan | 5 sampai 480 menit | `services_duration_range` |
| QRIS | minimum Rp1.500, maksimum Rp10.000.000 | `payment-mode.ts`, BK022, BK037 |
| Masa berlaku QRIS (PENDING) | 15 menit | `create_booking` |
| Masa berlaku `REQUESTED` | paling lama 24 jam dan tidak melewati jam mulai | `create_booking` |
| Booking aktif per nomor | bawaan 2 (1 sampai 10 atau tanpa batas) | `merchant_settings.max_active_per_phone` |
| Percobaan booking | 3 per hash IP per merchant per 15 menit | `check_booking_rate_limit` |
| Cek kode voucher | 10 per hash IP per merchant per 15 menit | `check_voucher_rate_limit` |
| Kejadian funnel | 120 per menit per hash IP per merchant | `check_event_rate_limit` |
| Cek username | 30 per 10 menit per hash IP | `check_username_claim` |
| Perangkat push per booking | 5 | `/api/pesanan/[token]/push` |
| Pengingat per jalan cron | 1000 booking per offset | `/api/cron/reminders` |
| Retensi kejadian funnel | 13 bulan | `prune_funnel_events` |
| Klip staf | MP4 bisu maksimal 5 detik | `/api/staff/clip` |

---

## 7. Paket dan hak akses

Sumber tunggal: `src/lib/plans.ts` (`PLANS`, `PLAN_COMPARISON`). Batas wajib sejalan dengan trigger database dan `/syarat`.

| Fitur | Starter (Gratis) | Pro (Rp79.000 per bulan) | Studio (Rp199.000 per bulan) |
| --- | --- | --- | --- |
| Transaksi per bulan | 10 | Tanpa batas | Tanpa batas |
| Jenis layanan | 1 | Tanpa batas | Tanpa batas |
| Halaman booking dan QRIS | Ya | Ya | Ya |
| Notifikasi email dan WhatsApp ke merchant | Ya | Ya | Ya |
| Pengingat H-1 dan hari H ke pelanggan (WhatsApp, email, notifikasi HP) | Tidak | Ya | Ya |
| Tema | 3 preset gratis dan FAQ | Semua, plus warna dan font | Semua, plus warna dan font |
| Watermark | Ada | Tidak | Tidak |
| Video pada layanan | Tidak | Ya | Ya |
| Voucher dan banner promosi | Tidak | Ya | Ya |
| Foto sampul, gaya tombol, latar bergerak | Tidak | Ya | Ya |
| Staf dengan jadwal, foto, klip | Tidak | Tidak | Ya |
| Analitik dan funnel | Tidak | Tidak | Ya |
| Domain sendiri | Tidak | Tidak | Ya |
| Restoran (meja), lapangan, tautan, iklan | Tidak dikunci | Tidak dikunci | Tidak dikunci |

Penegakan: trigger database (`enforce_service_limit`, `bookings_enforce_quota`, `merchant_themes_enforce_tier`, `enforce_theme_tier`, `enforce_promo_tier`, fungsi staf dan domain) menolak saat tulis; pembaca (`resolveTheme()`, `public_vouchers`, `resolve_custom_domain`, `create_booking` untuk staf) memangkas saat baca, karena turun paket tidak memicu UPDATE.

**Masa awal gratis (`EARLY_ACCESS_FREE = true`).** Semua merchant, baru dan lama, bertier `STUDIO` (default kolom). Konstanta hanya mengatur catatan harga di landing, `/dashboard/billing`, dan `PromoUpsell`. Teks tabel harga di landing diberi judul "Harga nanti, setelah masa awal". Tidak ada pembayaran langganan otomatis: perubahan paket dibantu tim Marky lewat WhatsApp (`NEXT_PUBLIC_SUPPORT_WHATSAPP`).

---

## 8. Integrasi eksternal

Nilai env tidak ditulis di dokumen ini. Daftar bersumber dari `docs/SETUP.md`, `docs/NOTIFIKASI.md`, dan `.env.example`.

| Integrasi | Fungsi | Variabel env |
| --- | --- | --- |
| Supabase Auth, Postgres, Storage | Identitas, data, RLS, bucket `merchant-media` dan `staff-clip-uploads` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (atau `NEXT_PUBLIC_SUPABASE_ANON_KEY`), `SUPABASE_SECRET_KEY` (atau `SUPABASE_SERVICE_ROLE_KEY`) |
| Enkripsi kredensial | AES-256-GCM untuk token gateway dan langganan push; juga garam hash IP | `TOKEN_ENCRYPTION_KEY` |
| Midtrans | QRIS merchant, OAuth Connect (program platform) atau Server Key manual; webhook `/api/webhooks/MIDTRANS` | `MIDTRANS_CLIENT_ID`, `MIDTRANS_CLIENT_SECRET`, `MIDTRANS_ENV` |
| Xendit | QRIS merchant (xenPlatform atau Server Key manual plus Callback Token); webhook `/api/webhooks/XENDIT` | `XENDIT_CLIENT_ID`, `XENDIT_CLIENT_SECRET`, `XENDIT_SECRET_KEY`, `XENDIT_ENV` |
| Vercel Cron | `cancel-unpaid` (20:00 UTC) dan `reminders` (01:00 UTC), diautentikasi bearer | `CRON_SECRET` |
| Resend | Email transaksional lewat REST, tanpa SDK; SMTP Supabase memakai kunci yang sama | `RESEND_API_KEY`, `EMAIL_FROM` |
| WhatsApp (WAHA, Evolution API self-host, atau Fonnte) | Pesan transaksional; adapter di `src/lib/notify/whatsapp.ts` | `WHATSAPP_PROVIDER` (`waha`, `evolution`, `fonnte`), `WHATSAPP_API_URL`, `WHATSAPP_API_KEY`, `WHATSAPP_SESSION` |
| Web push (VAPID) | Pengingat ke HP pelanggan; `public/sw.js` | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| Pixel Meta, TikTok, GA4 (belum rilis) | Dipasang per merchant; ID disimpan di `merchant_tracking`, bukan env | tidak ada env; ID per merchant |
| Sentry | Pemantauan galat; mati tanpa DSN; token booking, nomor WA, dan email disensor (`src/lib/monitoring/scrub.ts`) | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (hanya unggah source map) |
| Vercel REST API | Domain sendiri merchant Studio | `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` (hanya bila proyek di team) |
| Aplikasi | Host Marky dan redirect OAuth, dasar semua host landing dan proxy domain | `NEXT_PUBLIC_APP_URL` (wajib benar di produksi) |
| Dukungan | Tombol upgrade ke WhatsApp tim | `NEXT_PUBLIC_SUPPORT_WHATSAPP` (opsional) |
| ffmpeg | Transcode klip staf (`ffmpeg-static`) | tidak ada env |

Semua kanal notifikasi opsional; kanal tanpa konfigurasi dilewati dan tercatat `SKIPPED`, sehingga webhook tidak pernah gagal karena notifikasi. Gateway WhatsApp self-host harus HTTPS (Cloudflare Tunnel disarankan) dan memakai nomor khusus Marky; WAHA bukan API resmi WhatsApp sehingga nomor bisa diblokir.

---

## 9. Model data ringkas

Skema `public` kecuali disebut. Semua tabel `REVOKE ALL` dari `anon` dan `authenticated` lalu diberi grant per kolom; RLS per merchant.

**Identitas dan akun**
- `merchants`: profil merchant, `username`, `subscription_tier`, nomor WhatsApp, `avatar_url`.
- `merchant_profiles`: jawaban kuesioner onboarding (tidak pernah terbaca `anon`).
- `merchant_settings`: cara bayar bawaan, kebijakan pelanggan, kontak, pengingat, `table_mode`, batas per nomor.
- `merchant_onboarding_progress`: progres panduan, hanya ditulis `save_onboarding_progress`.
- `reserved_usernames`: kata yang tidak boleh jadi username.

**Katalog dan jadwal**
- `services`: layanan, harga, durasi, cara bayar, kolom reservasi dan sewa.
- `service_media`: galeri gambar dan video layanan.
- `availability`: jam buka usaha.
- `staff`, `staff_availability`: staf, profil, klip, jam staf.

**Booking dan pembayaran**
- `bookings`: transaksi inti dengan snapshot layanan, status, token akses, kolom atribusi, `court_id`, `court_name`, `staff_id`.
- `payment_connections`: metadata koneksi gateway (provider, mode, `environment`, status).
- `private.payment_credentials`: token terenkripsi, tidak terekspos API.
- `booking_attempts`: log rate limit booking (hash IP saja).
- `booking_reminder_prefs`, `push_subscriptions`: pilihan pengingat dan langganan push per booking.
- `notification_log`: riwayat dan kunci idempotensi notifikasi.

**Tampilan dan promosi**
- `merchant_themes`: tema, media, susunan bagian, `public_whatsapp`, `show_social_icons`.
- `merchant_faqs`: FAQ.
- `vouchers`, `voucher_attempts`: voucher dan log rate limit.
- `merchant_banners`: banner promosi.
- `merchant_links`: tautan link-in-bio (belum rilis).
- `merchant_domains`: domain sendiri dan token verifikasi.

**Restoran**
- `dining_areas`, `dining_tables`: area dan meja.

**Lapangan (belum rilis)**
- `courts`, `court_media`, `service_courts`, `court_price_rules`, `venue_areas`, `venue_markers`.

**Funnel (belum rilis)**
- `ad_links`, `funnel_events`, `merchant_tracking`, `event_attempts`; `username_check_attempts` (landing).

**RPC yang boleh dipanggil anon** (semuanya hanya mengembalikan kolom tampilan, tanpa data pelanggan lain):
- `get_booked_ranges(username, from, to)`: hanya rentang `start_datetime` dan `end_datetime`.
- `get_seat_availability`, `get_table_status`: kursi dan meja per jam (restoran).
- `get_court_availability`, `get_court_price_rules`, `get_court_profiles`: ketersediaan, aturan harga, dan profil lapangan (belum rilis).
- `public_vouchers(merchant_id)`: voucher publik.
- `get_public_contacts`, `get_public_tracking`: kontak publik dan ID pixel aktif.
- `resolve_ad_link(username, slug)`: id, layanan, kode voucher, kanal.
- `get_paid_event(event_id)`: ringkasan pembayaran untuk halaman terima kasih.
- `resolve_custom_domain(host)`: pemetaan domain ke username (hanya Studio).

RPC lain (`create_booking`, `check_voucher`, `check_*_rate_limit`, `check_username_claim`, `record_paid_event`, `get_payment_credential`, dan lainnya) hanya `service_role`; RPC merchant (`save_*`, `reschedule_booking_by_merchant`, `create_manual_booking`, `funnel_summary`, dan sebagainya) diberi `GRANT EXECUTE` eksplisit ke `authenticated`. Fungsi baru tertutup secara default sejak migration `20260730000300`.

---

## 10. Kebutuhan non-fungsional

### 10.1 Keamanan

- **RLS.** Semua tabel dilindungi RLS per `auth.uid()`; `anon` tidak punya akses tabel ke `bookings`. Perubahan skema selalu lewat migration baru dan diuji `npm run docker:test` (`supabase/tests/99_verify.sql`).
- **Empat klien Supabase.** `client.ts` (komponen client), `server.ts` `createClient` (sesi), `createPublicClient` (anon tanpa sesi, halaman publik), `admin.ts` (service role, melewati RLS, setiap query wajib memfilter `merchant_id`).
- **`getSession()` terlarang.** `getUser()` memverifikasi ke server Auth setiap kali (pencabutan sesi langsung ketahuan). `getClaims()` memverifikasi JWT secara lokal lewat JWKS bila kunci asimetris aktif (tidak tahu sesi dicabut sampai `exp`); aman di dashboard karena `getUser()` di `src/lib/supabase/proxy.ts` jalan di tiap request yang cocok matcher. Pada Route Handler `/api/*`, matcher proxy tidak mencakup `/api/*`, jadi verifikasi wajib dilakukan sendiri. Di Server Component dipakai helper ber-`cache()` (`getSessionUser()`, `requireMerchant()`).
- **Token URL.** `/pesanan/[token]` memakai token 48 heksa di path; rute `/api/pesanan/[token]/*` mengabaikan sesi, memfilter query admin dengan `access_token` lalu `merchant_id`, dan tidak pernah mengembalikan token. Respons `GET /api/bookings/[id]/status` sengaja minimal.
- **Tanpa pixel di `/pesanan`.** Pixel tidak pernah dimuat di `/pesanan` atau dashboard; `Referrer-Policy: no-referrer` untuk `/pesanan/*` dan halaman terima kasih; log atau APM tidak boleh mencatat path `/pesanan`.
- **Header.** `Content-Security-Policy` dengan `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (kecuali yang disebut di atas), `Permissions-Policy`.
- **Webhook dan cron.** Signature diverifikasi dengan kredensial merchant pemilik booking sebelum UPDATE; cron gagal tertutup tanpa `CRON_SECRET`; OAuth memakai `state` acak di cookie httpOnly.
- **Penyalahgunaan.** Rate limit berbasis hash IP (booking, voucher, kejadian, cek username); IP mentah tidak pernah disimpan. Voucher rahasia tidak bisa ditebak lewat daftar; rute cek tidak menerima nomor.
- **Path berkas.** Constraint database membatasi path media ke `{merchant_id}/` dengan charset sempit tanpa `..`, mencegah keluar dari `url()` CSS. `staff.motion_path` hanya ditulis `service_role`.
- **Domain sendiri.** Verifikasi TXT per merchant mencegah penyerobotan domain.

### 10.2 Privasi (selaras UU PDP sebagaimana diimplementasikan)

- Hak atas salinan data: ekspor JSON lengkap dari Pengaturan (RLS, tanpa kredensial gateway).
- Hak penghapusan: hapus akun dengan konfirmasi mengetik username; data merchant terhapus lewat penghapusan `auth.users`.
- Data minimal: kejadian funnel tanpa IP, user agent, atau data pelanggan; IP hanya sebagai hash untuk rate limit.
- Marky tidak memakai cookie pelacak; pixel adalah pilihan merchant dan diungkap di `/privasi`. Tidak ada banner cookie; kecukupan terhadap UU PDP dicatat sebagai pekerjaan pemilik sebelum merchant memasang pixel (DECISIONS #42).
- Pelanggan hanya terlihat oleh merchant pemilik booking; anon tidak pernah membaca data pelanggan.
- Sentry menyensor token booking, nomor WhatsApp, dan email sebelum dikirim.
- Identitas penyelenggara dan kebijakan ada di `/syarat` dan `/privasi` (`src/lib/legal.ts`).

### 10.3 Aksesibilitas

- Target sentuh minimal 44px di layar sentuh (nav bawah, panel booking, halaman publik, tautan kaki halaman); sidebar desktop memakai baris `h-8` (DECISIONS #32).
- Fokus selalu terlihat, semua fungsi bisa dipakai dengan keyboard; dialog tur Radix mengunci fokus.
- Reduced motion: latar bergerak, klip staf, dan animasi landing berhenti atau diganti poster; gerakan lebih dari 5 detik wajib punya tombol jeda (44px).
- Kontras teks sekunder minimal 4,5:1; warna aksen dikoreksi `ensureContrast`; status dibedakan dengan isi dan teks, tidak hanya warna.
- Setiap daftar data punya keadaan memuat, kosong, dan gagal. Foto lapangan wajib teks alternatif.

### 10.4 Kinerja

- Landing `/` dan `/untuk/<slug>` dirender statis saat build; satu-satunya permintaan dinamis adalah cek username.
- Latar bergerak dimuat malas (`next/dynamic`, sekitar 4,4 KB gzip) dan hanya untuk tema `MOTION`.
- Pixel dimuat `afterInteractive`, tidak memblokir render.
- Tercatat: Lighthouse mobile landing Performance 88 (target 90) dengan LCP simulasi sekitar 3,8 detik; perbaikan berikutnya: muat klien Sentry hanya bila DSN diisi (DECISIONS #39).
- Wilayah fungsi Vercel `sin1`, terikat ke wilayah Supabase (DECISIONS #20).
- Indeks penutup untuk kunci asing; ringkasan dashboard lewat RPC (`dashboard_*`).

### 10.5 Observabilitas

- Sentry (mati tanpa DSN) dengan penyensoran data sensitif.
- Log terstruktur di rute API (`console.error` dan `console.warn` dengan konteks); kode galat tak dikenal dicatat dan jatuh ke pesan umum; teks mentah Postgres tidak pernah diteruskan ke klien.
- `notification_log` memberi riwayat pengiriman per booking di dialog detail.
- Respons cron memuat hitungan (`cancelledCount`, `candidates`, `pruned`).
- Peringatan di log saat batas 1000 booking pengingat tercapai dan saat `ip_hash` kosong.

---

## 11. Referensi kode error

Daftar lengkap: `docs/ERROR-CODES.md` (satu tabel untuk semua lapisan; pemetaan HTTP dan pesan booking ada di `src/lib/booking/errors.ts`, pelanggan di `customer-manage.ts`, merchant di `manual-booking.ts`). Kode tak dikenal selalu jatuh ke pesan umum lapisannya.

| Keluarga | Kode | Ringkasan |
| --- | --- | --- |
| Kuota, layanan, jam | P0002, P0005, P0006 | Kuota Starter habis, layanan tak ada atau nonaktif, jam sudah lewat |
| Staf dan paket | BK002, BK003, BK010, BK011 | Semua staf penuh, staf tak tersedia, fitur khusus Studio, maksimal 20 staf |
| Booking publik | BK001, BK020, BK021, BK022, BK037 | Di luar jam kerja, batas per nomor, tanpa gateway aktif, di bawah Rp1.500, di atas Rp10.000.000 |
| Aksi merchant | BK030 sampai BK036 | Permintaan, tagihan di tempat, kehadiran, jadwal ulang merchant, batas 50 manual dan 3 jadwal ulang |
| Kebijakan pelanggan | BK040 sampai BK046 | Ubah jadwal dan batal menurut kebijakan merchant |
| Voucher dan banner | BK050 sampai BK058 | Kode, periode, kuota, nomor, minimal, layanan, pelanggan baru, target banner, voucher banner |
| Restoran | BK060 sampai BK064 | Kursi, meja, hapus meja berisi reservasi, rentang tamu, denah tidak valid |
| Lapangan (belum rilis) | BK070 sampai BK073 | Lapangan tak tersedia, lama main tidak valid, semua penuh, slot lebih mahal |
| Tautan | BK080, BK081 | Maksimal 8 tautan, payload tautan tidak valid (belum rilis) |
| Postgres umum | 23P01, 22023, 23514, 23503, 23505, 42501 | Bentrok slot atau aturan, data tidak valid, CHECK, FK, duplikat, tanpa akses |
| Kode mesin rute | `duration_required`, `duration_invalid`, `court_service_not_supported`, `court_load_failed`, kode `ubah-jadwal` | Slot sewa dan ubah jadwal pelanggan (`code` stabil di samping `error`) |
| Server action | `name_taken`, `forbidden`, `invalid_data`, `has_bookings`, `validation`, `invalid_path`, `court_not_found`, `photo_not_found` | Lapangan dan foto (belum rilis) |

Catatan ketidakkonsistenan antarlapisan ada di akhir `docs/ERROR-CODES.md`: satu kode punya kalimat berbeda menurut lapisan (nada publik, pelanggan, merchant) secara sengaja; `POST /api/vouchers/check` belum punya `code` mesin stabil; 23505 pada `POST /api/bookings` jatuh ke 500 umum.

---

## Lampiran A. Daftar rute

**Halaman publik dan pemasaran**

| Rute | Keterangan |
| --- | --- |
| `/` | Landing |
| `/untuk/<slug>` | `salon`, `barbershop`, `restoran`, `fotografer`, `klinik`, `kelas`, `lapangan` |
| `/syarat`, `/privasi` | Legal |
| `/[username]` | Halaman booking merchant (`?t=slug`, `?kode=`, `utm_*`) |
| `/[username]/terima-kasih` | `?e=<pixel_event_id>` (belum rilis) |
| `/pesanan/[token]` | Status dan kelola booking |
| `/pesanan/[token]/ubah-jadwal`, `/pesanan/[token]/pengingat` | Ubah jadwal dan pengingat |
| `/sw.js`, `robots`, `sitemap`, OG | Service worker dan SEO |

**Auth**

| Rute | Keterangan |
| --- | --- |
| `/masuk`, `/daftar`, `/lupa-password`, `/reset-password` | Halaman auth |
| `/auth/callback`, `/auth/auth-code-error`, `/auth/signout` | Alur sesi |

**Aplikasi merchant (terlindungi)**

| Rute | Keterangan |
| --- | --- |
| `/onboarding` | Wizard |
| `/dashboard` | Hari ini |
| `/dashboard/bookings`, `/dashboard/bookings/baru` | Booking dan booking manual |
| `/dashboard/analitik` | Analitik (Studio) |
| `/dashboard/halaman` | Tampilan halaman |
| `/dashboard/tautan` | Link-in-bio (belum rilis) |
| `/dashboard/iklan` | Tautan iklan dan pixel (belum rilis) |
| `/dashboard/promosi`, `/dashboard/promosi/voucher` | Banner dan voucher |
| `/dashboard/services`, `/dashboard/availability` | Layanan dan jam buka |
| `/dashboard/denah` | Denah meja |
| `/dashboard/lapangan` | Lapangan dan jadwal (belum rilis) |
| `/dashboard/staf` | Staf (Studio) |
| `/dashboard/payments`, `/dashboard/billing`, `/dashboard/domain`, `/dashboard/settings` | Pembayaran, langganan, domain, pengaturan |
| `/dashboard/settings/ekspor` | Unduh data JSON |

**API**

| Rute | Metode | Auth | Fungsi |
| --- | --- | --- | --- |
| `/api/bookings` | POST | publik, rate limit | Buat booking |
| `/api/bookings/[id]/status` | GET | publik (UUID) | Polling `status` dan `expires_at` |
| `/api/slots` | GET | publik | Slot kosong (cabang staf, meja, sewa) |
| `/api/slots/nearest` | GET | publik | Jam kosong terdekat per staf (bukan untuk sewa) |
| `/api/tables` | GET | publik | Denah dan status meja |
| `/api/vouchers/check` | POST | publik, rate limit | Cek kode voucher |
| `/api/username-check` | GET | publik, rate limit | Cek klaim username |
| `/api/events` | POST | publik, rate limit | Kejadian funnel (belum rilis) |
| `/api/webhooks/[provider]` | POST | signature | Webhook pembayaran |
| `/api/payments/[provider]/connect`, `/callback` | GET | sesi, state | OAuth Connect |
| `/api/pesanan/[token]/bayar` | POST | token | Bayar `REQUESTED` yang disetujui |
| `/api/pesanan/[token]/ubah-jadwal` | POST | token | Ubah jadwal |
| `/api/pesanan/[token]/batal` | POST | token | Batalkan |
| `/api/pesanan/[token]/pengingat` | PUT | token | Simpan pengingat |
| `/api/pesanan/[token]/push` | POST, DELETE | token | Langganan push |
| `/api/pesanan/[token]/manifest` | GET | bentuk token | Manifest PWA |
| `/api/staff/clip` | POST | sesi (`getUser()`) | Transcode klip staf |
| `/api/cron/cancel-unpaid`, `/api/cron/reminders` | GET | `CRON_SECRET` | Cron |

## Lampiran B. Cron

| Path | Jadwal (UTC) | Setara WIB | Fungsi |
| --- | --- | --- | --- |
| `/api/cron/cancel-unpaid` | `0 20 * * *` | 03:00 | Batalkan `PENDING` kedaluwarsa; pangkas `funnel_events` lebih dari 13 bulan |
| `/api/cron/reminders` | `0 1 * * *` | 08:00 | Pengingat H-1 dan pagi hari; pangkas langganan push usang |

Keduanya sekali sehari karena batas cron paket Vercel Hobby.

## Lampiran C. Garis waktu migration menurut fase

Total 77 berkas di `supabase/migrations/`.

| Fase | Berkas (prefiks tanggal) | Isi |
| --- | --- | --- |
| Phase 1 sampai 2 | `20260729000100`, `20260729000200`, `20260730000100`, `20260730000200`, `20260730000300`, `20260730000400` | Skema awal, RLS, rute cadangan, kuota, penutupan EXECUTE fungsi, backfill merchant yatim |
| Phase 3 sampai 6 | `20260730000500` sampai `20260819000400` (termasuk `20260813051417`) | Mode koneksi payment, RPC kredensial, `create_booking`, tolak slot lampau, pembersihan kedaluwarsa, pengerasan abuse, token webhook, token akses booking, batal merchant, kesehatan koneksi, performa dashboard |
| Kustomisasi halaman publik | `20260820000100` sampai `20260828000100` | Tema, bucket storage, media layanan, FAQ, pengerasan media, avatar |
| Onboarding kuesioner | `20260830171006`, `20260830171027` | `merchant_profiles`, kategori nullable |
| Kesiapan rilis dan Studio | `20261005175819` sampai `20261005180048` | `notification_log`, rute metadata, staf, `merchant_domains` |
| Redesign F1 | `20261114000100` | Username merek dicadangkan |
| F2 | `20261115000100` sampai `20261115000700` | Nilai status, cara bayar, `create_booking` bermode, aksi merchant, minimum QRIS, booking manual, pembacaan dashboard |
| F4 | `20261116000100` sampai `20261116000300` | Nilai enum, kelola booking pelanggan, preferensi pengingat dan push |
| F5 | `20261117000100` sampai `20261117000300` | Voucher, voucher di `create_booking`, banner |
| F6 | `20261118000100`, `20261118000200` | Nilai latar bergerak, merek, susunan, gerak |
| F7 | `20261119000100`, `20261119000200` | Profil staf, kebijakan unggah klip |
| F8 | `20261120000100` sampai `20261120000300` | Skema restoran, kapasitas kursi, pembacaan dan simpan denah |
| F9 | `20261121000100` | Progres panduan |
| F10 | `20261122000100` | Klaim username landing |
| Masa awal gratis | `20261123000100` | Default tier `STUDIO` |
| Indeks FK dan QRIS maksimum | `20261124000100`, `20261124000200` | Indeks penutup, trigger BK037 |
| F11 (belum rilis) | `20261125000100` sampai `20261125000600` | Enum funnel, tautan iklan dan link, kejadian dan atribusi, rate limit kejadian, kunci panduan, perbaikan review |
| F12 (belum rilis) | `20261126000100` sampai `20261126001500` (tanpa `001100`) | Enum, skema lapangan, pembacaan dan simpan, pengerasan, mesin booking, voucher total sewa, aturan harga publik, penjaga jadwal ulang, `save_court_service` (plus `p_activate`), onboarding, path foto, pindah ke lapangan, kunci panduan, reload PostgREST |

## Lampiran D. Catatan selisih dokumen

Kode yang menang. Setiap butir menyebut dokumen, isinya, dan keadaan di kode.

1. **PRD bagian 5B (endpoint webhook).** PRD menyebut `POST /api/webhooks/payment` dan antrean Upstash QStash. Kode memakai `POST /api/webhooks/[provider]` dan `after()` dengan `notification_log` (DECISIONS #27).
2. **PRD bagian 3 dan 6 (auto-batal).** PRD meminta Vercel Cron untuk batal booking unpaid lebih dari 15 menit. Kode: masa berlaku `PENDING` 15 menit, tetapi cron hanya sekali sehari (20:00 UTC); pembersihan juga terjadi inline di `create_booking` di bawah kunci merchant.
3. **PRD bagian 4 (RLS `bookings`).** PRD: `INSERT` publik (anon). Kode: anon tanpa hak apa pun ke `bookings`; pembuatan lewat `POST /api/bookings` dengan service role (DECISIONS #1).
4. **PRD bagian 4 (kolom token).** PRD: `merchants.payment_access_token`. Kode: `payment_connections` plus `private.payment_credentials` (DECISIONS #3).
5. **PRD bagian 4 (status booking).** PRD: `PENDING`, `PAID`, `CANCELLED`. Kode: tambah `CONFIRMED` dan `REQUESTED`.
6. **PRD bagian 1 (Custom Theme paket Pro).** Kode memberi Starter tiga preset gratis, gaya sudut, foto profil, dan FAQ (DECISIONS #21).
7. **PRD bagian 6 (polling).** PRD menaruh polling di halaman publik `/[username]`. Kode melakukannya di `/pesanan/[token]` (`booking-live-status.tsx`, 3 detik).
8. **DECISIONS #39 versus kode.** DECISIONS menyebut "enam `/untuk/<slug>`". `IndustrySlug` di `industries.ts` memuat tujuh slug (ditambah `lapangan`, belum rilis).
9. **DECISIONS #12 (celah kuota).** Dokumen menulis advisory lock "di Phase 5" sebagai penutup celah; kode kini memakainya di `create_booking`. Catatan celah itu sudah tidak berlaku.
10. **AGENTS.md F11.** Menyebut pixel "Meta, GA4"; kode dan spek juga mendukung TikTok (`isValidTiktokPixelId`, `merchant_tracking`). AGENTS.md juga menulis `BOOKED` dan `PAID` lewat `/api/events`, padahal `eventBodySchema` hanya menerima `VIEW`, `SERVICE`, `CHECKOUT`, `LINK_CLICK`; `BOOKED` dan `PAID` ditulis server di `create_booking` dan webhook (`record_paid_event`).
11. **Spek F11 dan F12 (status "draf").** Kedua spek masih berstatus "draf, menunggu persetujuan pemilik", padahal sudah diimplementasikan di cabang ini.
12. **Spek F12 (foto lapangan di `{merchant_id}/court/`).** Kode memakai path bersarang `{merchant_id}/court/{court_id}/{berkas}` dengan constraint yang mengikat folder ke lapangan barisnya (DECISIONS #43 butir 6).
13. **Spek F12 (jadwal ulang mempertahankan harga).** Spek tidak menyebut BK073; kode menolak jadwal ulang pelanggan ke slot lebih mahal (DECISIONS #43 butir 1).
14. **SETUP.md (tabel env).** Tidak memuat `NEXT_PUBLIC_SUPPORT_WHATSAPP`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`; semuanya dipakai di kode dan ada di `.env.example` atau `docs/NOTIFIKASI.md`.
15. **PRD (jumlah tabel dan fase).** PRD hanya mendefinisikan empat tabel; kode memiliki lebih dari 30 tabel (bagian 9).
16. **ERROR-CODES.md (urutan baris).** Baris BK001 muncul setelah BK072 dan 23P01 muncul dua kali (slot direbut dan `bookings_court_no_overlap`); bukan selisih perilaku, hanya tata letak dokumen.
17. **Rentang fase di AGENTS.md.** AGENTS.md menyatakan semua halaman dashboard sudah implementasi sungguhan; selaras dengan kode, tidak ada `PhasePlaceholder` yang dipakai di rute di atas.
