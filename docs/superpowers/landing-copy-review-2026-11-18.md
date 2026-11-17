# Tinjauan copy landing, 18 November 2026

Cabang `fitur/landing-copy`. Hanya teks yang berubah; tata letak, token desain, dan struktur tidak disentuh. Fakta tetap: DP langsung ke akun Midtrans atau Xendit merchant, Marky tidak memegang uang, data di Singapura, minimum QRIS Rp1.500, notifikasi lewat WhatsApp dan email.

## Ringkasan

**A. Tinjauan copy.** 32 perubahan (daftar di bawah). Masalah yang ditemukan: klaim keliru ("rekening Anda", "font sendiri"), kalimat canggung ("Nyalakan bayar di tempat di pengaturan"), pengulangan ("Marky hanya menarik biaya langganan" dua kali, "tanpa membalas satu per satu" di empat halaman), judul tipis ("Yang diterima pelanggan Anda."), dan istilah tidak seragam ("notifikasi browser" dan "notifikasi HP").

**B. Masa awal gratis.** Semua teks yang bergantung pada batas paket dikunci ke `EARLY_ACCESS_FREE` di `src/lib/plans.ts`, jadi mengembalikannya ke `false` memulihkan teks lama. Judul harga kini "Semua fitur gratis selama masa awal." Tiga paket dan tabel perbandingan tetap ada, diberi label "Harga nanti, setelah masa awal" (`FUTURE_PRICE_HEADING`). Kalimat "Tersedia di paket Pro dan Studio" kini lewat `planAvailability()`: selama masa awal berbunyi "Gratis selama masa awal, nanti di paket ...". Tidak ada lama masa uji yang diada-adakan.

**C. Discord.** `discord` ditambahkan ke `MARKETING_CONTACT`, `ContactKind`, dan `contactLinks` (urutan terakhir). Hanya URL `https://discord.gg/...` atau `https://discord.com/invite/...` yang dianggap terisi. Ikon outline 24 viewBox di footer dengan label "Discord Marky". Penanda `[UNDANGAN DISCORD]` dibiarkan, jadi ikon belum tampil. Tes baru: tautan terisi (kedua bentuk), penanda, dan URL bukan Discord.

## Daftar sebelum dan sesudah

Contoh di bawah memakai keadaan `EARLY_ACCESS_FREE = true`.

| # | Lokasi | Sebelum | Sesudah |
|---|---|---|---|
| 1 | Harga, judul | Mulai gratis, naik saat ramai. | Semua fitur gratis selama masa awal. |
| 2 | Harga, angka besar | Rp0 untuk mulai | Rp0 selama masa awal |
| 3 | Harga, catatan | **Semua fitur gratis selama masa awal.** Harga di bawah berlaku nanti; kami kabari dulu sebelum ada tagihan. | **Harga nanti, setelah masa awal.** Tiga paket di bawah adalah harga nanti. Kami kabari dulu sebelum ada tagihan. |
| 4 | Harga, kartu HP | Tanpa kartu kredit. Perubahan paket dibantu tim Marky. | Tanpa kartu kredit. Harga paket berlaku nanti. |
| 5 | Paket Pro | Semua tema, warna, dan font sendiri | Semua tema, plus atur warna dan font |
| 6 | Tabel | Tema, warna, dan font sendiri | Tema, warna, dan font |
| 7 | Tabel | Reminder WhatsApp H-1 | Pengingat H-1 ke pelanggan |
| 8 | FAQ 1 | Tidak. Pembayaran masuk ke akun Midtrans atau Xendit milik Anda. Marky hanya menarik biaya langganan. | Tidak. Pembayaran pelanggan masuk langsung ke akun Midtrans atau Xendit milik Anda. Marky tidak pernah memegang uangnya. |
| 9 | FAQ 2 | Bisa. Nyalakan bayar di tempat di pengaturan dan pilih layanan yang memakainya. | Bisa. Atur cara bayar sebuah layanan menjadi bayar di tempat, dan pelanggan langsung dapat jadwal tanpa membayar dulu. |
| 10 | FAQ 3 | Tidak. Semua berjalan di browser HP, termasuk notifikasi pengingat. | Tidak. Pelanggan memesan lewat browser di HP, dan pengingatnya datang lewat WhatsApp atau email. |
| 11 | FAQ 5 | ...sesuai tarif mereka. Marky hanya menarik biaya langganan. | ...sesuai tarif mereka. Marky tidak memotong apa pun dari pembayaran pelanggan. |
| 12 | Kebijakan, data | Tidak dijual dan tidak dipakai untuk iklan pihak ketiga. Disimpan di server Singapura. | Data tidak dijual dan tidak dipakai untuk iklan pihak ketiga. Data disimpan di server Singapura. |
| 13 | Kebijakan, hak | Unduh salinan data, perbaiki, atau hapus akun kapan saja dari Pengaturan. | Anda bisa mengunduh salinan data, memperbaikinya, atau menghapus akun kapan saja dari Pengaturan. |
| 14 | Alur, judul | Satu booking, dari tautan sampai kursi terisi. | Satu booking, dari tautan sampai hari H. |
| 15 | Alur 1 | (dibatalkan: editor punya unggah logo, teks lama dipertahankan) | ...dengan warna dan logo usaha Anda. |
| 16 | Alur 2, judul | 2. DP masuk ke rekening Anda | 2. DP masuk ke akun pembayaran Anda |
| 17 | Alur 2, isi | ...Untuk restoran atau barbershop, pilih bayar di tempat saja. | ...Untuk restoran atau barbershop, layanan bisa diatur bayar di tempat. |
| 18 | Alur 3 | Pengingat H-1, bisa ditambah pagi hari jadwal, lewat WhatsApp, email, atau notifikasi HP, untuk paket Pro dan Studio. Pelanggan bisa pindah jadwal sendiri bila Anda mengizinkan. | Pengingat H-1 dikirim lewat WhatsApp, email, atau notifikasi HP, dan bisa ditambah pengingat pagi hari H. Gratis selama masa awal, nanti di paket Pro dan Studio. Pelanggan bisa pindah jadwal sendiri bila Anda mengizinkan. |
| 19 | Alur 4 | Buka dashboard di HP: siapa datang, siapa sudah bayar, siapa ditagih di tempat. | Dashboard di HP menunjukkan siapa yang datang, siapa yang sudah bayar, dan siapa yang membayar di tempat. |
| 20 | Klaim, judul | Yang diterima pelanggan Anda. | Pelanggan Anda menerima pesan ini. |
| 21 | Salon, intro | ...Jadwal Anda terisi tanpa membalas obrolan satu per satu. | ...Anda tidak perlu lagi menjawab "masih kosong, Kak?" berkali-kali. |
| 22 | Salon, pengingat | ...atau notifikasi browser. Tersedia di paket Pro dan Studio. | ...atau notifikasi HP. Gratis selama masa awal, nanti di paket Pro dan Studio. |
| 23 | Barbershop, staf | Di paket Studio, setiap barber punya kalender sendiri... | Setiap barber punya kalender sendiri... Gratis selama masa awal, nanti di paket Studio. |
| 24 | Barbershop, FAQ | Bisa, lewat fitur multi-staf di paket Studio. Setiap staf punya kalender sendiri. | Bisa, lewat fitur multi-staf. Setiap staf punya kalender sendiri. Gratis selama masa awal, nanti di paket Studio. |
| 25 | Restoran, intro | ...Anda melihat reservasi masuk tanpa membalas pesan satu per satu. | ...Reservasi langsung muncul di dashboard, tanpa pesan "meja untuk 4 orang masih ada?". |
| 26 | Fotografer, intro | ...DP mengunci jadwal Anda sebelum Anda membalas apa pun. | ...Begitu DP masuk, tanggal sesi terkunci untuk pelanggan itu. |
| 27 | Fotografer, galeri | ...Video tersedia di paket Pro dan Studio. | ...Video juga bisa dipasang. Gratis selama masa awal, nanti di paket Pro dan Studio. |
| 28 | Fotografer, tampilan | ...dari Dashboard. Warna dan font sendiri tersedia di paket Pro dan Studio. | ...dari dashboard. Warna dan font bisa disetel juga. Gratis selama masa awal, nanti di paket Pro dan Studio. |
| 29 | Fotografer, pengingat | Pengingat H-1 dan opsional pagi hari H bagi pelanggan, di paket Pro dan Studio. | Pelanggan menerima pengingat H-1 dan opsional pagi hari H. Gratis selama masa awal, nanti di paket Pro dan Studio. |
| 30 | Klinik, staf | Di paket Studio, tiap dokter atau terapis punya kalender sendiri. | Tiap dokter atau terapis punya kalender sendiri. Gratis selama masa awal, nanti di paket Studio. |
| 31 | Klinik, pengingat | ...atau notifikasi browser, di paket Pro dan Studio. | ...atau notifikasi HP. Gratis selama masa awal, nanti di paket Pro dan Studio. |
| 32 | Kelas, diskon | ...banner promo di halaman. Tersedia di paket Pro dan Studio. | ...banner promo di halaman. Gratis selama masa awal, nanti di paket Pro dan Studio. |

Catatan: butir 5, 6, 7 juga tampil di `/dashboard/billing` karena `PLANS` dipakai bersama. `EARLY_ACCESS_DETAIL` (butir 3) tampil di sana juga.

## Tidak diubah, perlu keputusan pemilik

- JSON-LD `offers` masih mencantumkan harga tiga paket (Starter Rp0). Selama masa awal itu menyesatkan ringan; belum diubah karena di luar lingkup teks.
- Kalimat "kami kabari dulu sebelum ada tagihan" sudah ada sebelumnya; dipertahankan sebagai komitmen pemilik.
- `hasUnfilledMarketingContact` menganggap nilai Discord terisi bila bukan penanda, tanpa memeriksa bentuk URL. Tautan tetap hanya tampil bila URL-nya valid.
