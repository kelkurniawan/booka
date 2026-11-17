// Isi panduan merchant: satu entri per halaman dashboard plus teks checklist.
// Setiap kalimat harus cocok dengan halamannya. Saat sebuah halaman berubah,
// cek komentar "Sumber" di entrinya.

import { ROUTES } from "@/lib/routes";

import type { ChecklistStepKey, GuidePage, TourStep } from "./guide";
import type { GuidePageKey } from "@/types/database";

/** Langkah pembuka tur halaman: satu ringkasan tanpa sorotan. */
const intro = (title: string, body: string): TourStep => ({ target: null, title, body });

export const GUIDE_PAGES: Record<GuidePageKey, GuidePage> = {
  // Sumber: src/app/dashboard/page.tsx, src/app/dashboard/_today/*
  today: {
    title: "Hari ini",
    summary: "Halaman pertama setiap pagi: siapa datang hari ini dan apa yang perlu Anda tindak lanjuti.",
    points: [
      {
        term: "Perlu tindakan",
        text: "Permintaan yang menunggu persetujuan (otomatis ditolak bila lewat batasnya), booking yang belum dibayar dengan tombol Ingatkan lewat WhatsApp, dan booking yang sudah lewat tetapi belum ditandai hadir atau tidak datang.",
      },
      {
        term: "Agenda hari ini",
        text: "Daftar booking hari ini menurut jam. Tombol Tandai hadir aktif mulai satu jam sebelum jadwal.",
      },
      {
        term: "Ditagih di tempat hari ini",
        text: "Sisa pembayaran yang harus Anda terima langsung dari pelanggan yang datang hari ini.",
      },
      {
        term: "7 hari terakhir",
        text: "Ringkasan jumlah booking, uang masuk via QRIS, uang dibayar di tempat, dan yang tidak datang. Tautan Buka analitik ada di bawahnya.",
      },
      {
        term: "Booking manual",
        text: "Catat booking dari telepon atau pelanggan yang datang langsung supaya jadwalnya tidak bentrok.",
      },
      {
        term: "Tautan halaman",
        text: "Tombol salin tautan halaman booking ada di bagian atas. Di layar lebar ada juga tombol Lihat halaman.",
      },
    ],
    note: null,
    video: null,
    tour: [
      {
        target: "getting-started",
        viewport: "mobile",
        title: "Panduan memulai",
        body: "Enam langkah sampai booking pertama masuk. Ketuk satu langkah untuk melihat caranya.",
      },
      {
        target: "page-link",
        viewport: "desktop",
        title: "Tautan Anda ada di sini",
        body: "Ini alamat halaman booking Anda. Pasang di bio Instagram, TikTok, atau status WhatsApp supaya pelanggan bisa booking.",
      },
      {
        target: "nav-today",
        viewport: "desktop",
        title: "Hari ini",
        body: "Halaman pertama setiap pagi: siapa datang hari ini dan apa yang perlu Anda cek.",
      },
      {
        target: "nav-bookings",
        title: "Booking",
        body: "Semua pesanan ada di sini. Buka satu booking untuk menandai hadir atau lunas, mengubah jadwal, atau membatalkan.",
      },
      {
        target: "new-booking",
        title: "Booking manual",
        body: "Pelanggan menelepon atau datang langsung? Catat di sini supaya jadwalnya tidak bentrok dengan booking online.",
      },
      {
        target: "page-guide",
        title: "Butuh bantuan?",
        body: "Setiap halaman punya tombol panduan berisi penjelasan singkat halaman itu. Tur ini bisa diulang dari sana.",
      },
    ],
  },

  // Sumber: src/app/dashboard/bookings/page.tsx, booking-tabs.tsx, booking-detail-panel.tsx, baru/*
  bookings: {
    title: "Booking",
    summary: "Semua pesanan pelanggan, dikelompokkan menurut apa yang perlu Anda lakukan.",
    points: [
      {
        term: "Empat tab",
        text: "Perlu tindakan, Akan datang, Riwayat, dan Dibatalkan. Angka di tab menunjukkan jumlah yang menunggu Anda.",
      },
      {
        term: "Cari booking",
        text: "Ketik nama atau nomor WhatsApp pelanggan di kolom pencarian.",
      },
      {
        term: "Panel detail",
        text: "Buka satu booking untuk melihat kode booking, jadwal, layanan, staf, jumlah tamu, meja, catatan pelanggan, dan rincian pembayaran termasuk voucher bila dipakai.",
      },
      {
        term: "Yang bisa Anda lakukan",
        text: "Setujui atau Tolak permintaan, Tandai lunas di tempat (pilih Tunai, QRIS, atau Transfer), Tandai hadir atau Tidak datang, Jadwal ulang lalu kabari pelanggan lewat WhatsApp, dan Batalkan.",
      },
      {
        term: "Tidak datang",
        text: "Baru bisa ditandai mulai jam jadwal booking itu.",
      },
      {
        term: "Booking manual",
        text: "Dicatat dari menu Booking manual dan langsung terkonfirmasi, dibayar di tempat.",
      },
    ],
    note: null,
    video: null,
    tour: [
      intro("Booking", "Semua pesanan pelanggan ada di sini. Pilih tab sesuai yang ingin Anda kerjakan."),
      {
        target: "booking-tabs",
        title: "Empat tab",
        body: "Perlu tindakan, Akan datang, Riwayat, dan Dibatalkan. Mulai dari Perlu tindakan.",
      },
      {
        target: "booking-search",
        title: "Cari booking",
        body: "Ketik nama atau nomor WhatsApp pelanggan untuk menemukan bookingnya.",
      },
      {
        target: "new-booking",
        title: "Booking manual",
        body: "Catat booking dari telepon atau pelanggan yang datang langsung.",
      },
    ],
  },

  // Sumber: src/app/dashboard/analitik/page.tsx
  analytics: {
    title: "Analitik",
    summary: "Pendapatan, tingkat konfirmasi, dan layanan terlaris dari booking yang terkonfirmasi atau sudah dibayar.",
    points: [
      {
        term: "Uang diterima",
        text: "DP atau pelunasan online ditambah pelunasan di tempat, menurut tanggal uang diterima.",
      },
      {
        term: "Booking terkonfirmasi",
        text: "Jumlah booking terkonfirmasi dibandingkan dengan pesanan yang dibuat, ditambah tingkat konfirmasi dan pelanggan kembali.",
      },
      {
        term: "Periode",
        text: "Pilih 30 hari, 90 hari, atau 12 bulan. Hitungan memakai waktu Indonesia Barat.",
      },
      {
        term: "Layanan terlaris",
        text: "Lima layanan teratas menurut pendapatan.",
      },
      {
        term: "Hari tersibuk dan per staf",
        text: "Jumlah booking terkonfirmasi menurut hari dalam seminggu, dan menurut staf.",
      },
    ],
    note: "Analitik khusus paket Studio.",
    video: null,
    tour: [
      intro("Analitik", "Ringkasan uang dan booking Anda, dihitung dari booking yang terkonfirmasi atau sudah dibayar."),
      {
        target: "analytics-summary",
        title: "Ringkasan",
        body: "Uang diterima, booking terkonfirmasi, tingkat konfirmasi, dan pelanggan kembali untuk periode yang Anda pilih.",
      },
    ],
  },

  // Sumber: src/app/dashboard/services/*
  services: {
    title: "Layanan",
    summary: "Daftar layanan yang bisa dipesan pelanggan, lengkap dengan harga, durasi, dan cara bayarnya.",
    points: [
      {
        term: "Tambah layanan",
        text: "Isi nama, deskripsi (opsional), harga, dan durasi. Anda juga bisa melampirkan foto atau video sejak layanan dibuat.",
      },
      {
        term: "Kapan pelanggan membayar",
        text: "Bayar penuh saat booking, DP saat booking dengan sisanya di tempat, Bayar di tempat, atau Ajukan dulu lalu bayar setelah disetujui.",
      },
      {
        term: "Besar DP",
        text: "Isi dalam persen atau nominal rupiah. Pada Ajukan dulu, DP boleh dikosongkan, dan pelanggan diminta bayar penuh setelah Anda setujui.",
      },
      {
        term: "Aktif atau nonaktif",
        text: "Saklar di tiap baris menyembunyikan layanan dari halaman booking tanpa menghapusnya.",
      },
      {
        term: "Jumlah tamu dan lama duduk",
        text: "Kolom ini muncul bila Anda memakai kapasitas di menu Denah meja, untuk layanan reservasi.",
      },
    ],
    note: "Paket Starter dibatasi 1 layanan. Video layanan hanya untuk paket Pro dan Studio.",
    video: null,
    tour: [
      intro("Layanan", "Atur apa yang bisa dipesan pelanggan, berapa harganya, dan kapan mereka membayar."),
      {
        target: "service-add",
        title: "Tambah layanan",
        body: "Mulai dari sini. Isi nama, harga, durasi, lalu pilih kapan pelanggan membayar.",
      },
      {
        target: "service-list",
        title: "Daftar layanan",
        body: "Ubah, nonaktifkan, atau hapus layanan dari baris masing-masing.",
      },
    ],
  },

  // Sumber: src/app/dashboard/availability/*
  availability: {
    title: "Jam buka",
    summary: "Hari dan jam Anda menerima pelanggan. Pelanggan hanya bisa memilih jam di dalam rentang ini.",
    points: [
      {
        term: "Rentang jam per hari",
        text: "Tambahkan satu atau lebih rentang untuk setiap hari. Rentang yang tumpang tindih pada hari yang sama tidak diperbolehkan.",
      },
      {
        term: "Hari tanpa rentang",
        text: "Hari yang belum punya jam kerja tidak bisa dipesan.",
      },
      {
        term: "Salin ke semua hari kerja",
        text: "Pakai tombol ini untuk menyalin jam satu hari ke hari kerja lainnya.",
      },
      {
        term: "Staf",
        text: "Staf bisa punya jam kerja sendiri, diatur di menu Staf.",
      },
    ],
    note: null,
    video: null,
    tour: [
      intro("Jam buka", "Tentukan kapan pelanggan boleh memesan. Di luar rentang ini, jam tidak muncul di halaman booking."),
      {
        target: "hours-days",
        title: "Jam tiap hari",
        body: "Tambahkan rentang jam untuk setiap hari, atau salin ke semua hari kerja.",
      },
    ],
  },

  // Sumber: src/app/dashboard/denah/page.tsx, capacity-settings-form.tsx, floor-plan-editor.tsx
  floor_plan: {
    title: "Denah meja",
    summary: "Atur area dan meja agar reservasi tidak melebihi tempat yang ada.",
    points: [
      {
        term: "Mati",
        text: "Setiap jam hanya untuk satu booking, seperti layanan biasa.",
      },
      {
        term: "Total kursi per jam",
        text: "Reservasi dibatasi jumlah kursi yang Anda isi di Kapasitas per jam, tanpa denah.",
      },
      {
        term: "Pakai denah meja",
        text: "Marky menghitung per meja. Pelanggan bisa memilih meja atau dipilihkan. Denah muncul di bawah setelah Anda menyimpan pilihan ini.",
      },
      {
        term: "Area dan meja",
        text: "Tambah area (misalnya Dalam atau Teras), lalu Tambah meja bulat atau Tambah meja kotak. Isi nama, ukuran, catatan untuk pelanggan, dan apakah meja Bisa dipesan online. Tekan Simpan denah setelah selesai. Meja tidak boleh bertumpuk, dan meja atau area yang masih punya reservasi mendatang tidak bisa dihapus sampai reservasinya dipindah.",
      },
      {
        term: "Gabung meja",
        text: "Pilih meja mana yang Boleh digabung dengan meja terpilih, atau nyalakan Gabung meja otomatis untuk rombongan.",
      },
      {
        term: "Layanan reservasi",
        text: "Kapasitas hanya dipakai layanan yang ditandai sebagai reservasi meja di menu Layanan.",
      },
    ],
    note: null,
    video: null,
    tour: [
      intro("Denah meja", "Pilih cara Marky membatasi jumlah reservasi di satu jam, lalu atur mejanya bila perlu."),
      {
        target: "dining-capacity",
        title: "Kapasitas",
        body: "Pilih Mati, Total kursi per jam, atau Pakai denah meja. Pengaturan lain menyesuaikan pilihan ini.",
      },
      {
        target: "dining-editor",
        title: "Denah",
        body: "Tambah area dan meja, lalu tekan Simpan denah. Editor ini hanya muncul bila Anda memilih Pakai denah meja.",
      },
    ],
  },

  // Sumber: src/app/dashboard/staf/page.tsx, staff-manager.tsx, staff-profile-dialog.tsx
  staff: {
    title: "Staf",
    summary: "Jadwal dan booking terpisah untuk tiap staf, dengan profil yang dilihat pelanggan saat memilih jadwal.",
    points: [
      {
        term: "Tambah staf",
        text: "Ketik nama lalu tekan Tambah. Selama belum ada staf, semua booking masuk ke satu kalender seperti biasa.",
      },
      {
        term: "Menerima booking",
        text: "Saklar di tiap staf mengatur apakah staf itu bisa dipilih pelanggan.",
      },
      {
        term: "Jam kerja sendiri",
        text: "Staf bisa memakai jam kerja sendiri. Tanpa itu, staf ikut jam buka usaha.",
      },
      {
        term: "Profil",
        text: "Tombol Profil membuka foto, peran, perkenalan singkat, keahlian, dan klip pendek. Klip berformat GIF, MP4, WebM, atau MOV.",
      },
      {
        term: "Memilih staf",
        text: "Pelanggan memilih staf di bagian Dengan siapa? atau memilih Siapa saja.",
      },
    ],
    note: "Staf khusus paket Studio.",
    video: null,
    tour: [
      intro("Staf", "Beri tiap staf jadwal dan profil sendiri supaya pelanggan bisa memilih orang yang mereka suka."),
      {
        target: "staff-list",
        title: "Daftar staf",
        body: "Tambah staf, atur jam kerjanya, dan lengkapi profilnya dari sini.",
      },
    ],
  },

  // Sumber: src/app/dashboard/payments/*
  payments: {
    title: "Pembayaran",
    summary: "Hubungkan akun payment gateway Anda. DP pelanggan masuk langsung ke akun tersebut, bukan ke Marky.",
    points: [
      {
        term: "Midtrans dan Xendit",
        text: "Pilih salah satu penyedia. Kartu penyedia menampilkan statusnya: Belum terhubung, Terputus, atau Dipakai untuk booking baru.",
      },
      {
        term: "Server Key manual",
        text: "Tempel Server Key dari dashboard penyedia, pilih Sandbox untuk uji coba atau Production untuk transaksi sungguhan. Hanya empat karakter terakhir yang ditampilkan lagi.",
      },
      {
        term: "Hubungkan via OAuth",
        text: "Tombol ini hanya muncul bila penyedia itu mendukungnya di Marky.",
      },
      {
        term: "Putuskan koneksi",
        text: "Melepas akun dari Marky. Peringatan merah muncul bila pembayaran sedang gagal.",
      },
      {
        term: "Bayar di tempat",
        text: "Layanan yang dibayar di tempat atau gratis tidak membutuhkan koneksi.",
      },
    ],
    note: null,
    video: null,
    tour: [
      intro("Pembayaran", "Uang pelanggan masuk langsung ke akun payment gateway Anda."),
      {
        target: "payment-providers",
        title: "Penyedia pembayaran",
        body: "Hubungkan Midtrans atau Xendit. Pakai Sandbox dulu untuk uji coba.",
      },
    ],
  },

  // Sumber: src/app/dashboard/halaman/*, src/lib/plans.ts
  appearance: {
    title: "Tampilan",
    summary: "Atur tampilan halaman booking yang dilihat pelanggan. Pratinjau di samping sama dengan halaman publik.",
    points: [
      {
        term: "Foto profil, Logo, dan Foto sampul",
        text: "Foto profil dipotong persegi. Foto sampul dipotong rasio 3:1.",
      },
      {
        term: "Tema dan Warna aksen",
        text: "Pilih tema, lalu ubah warna aksen untuk tombol. Warna tulisan menyesuaikan kontras.",
      },
      {
        term: "Background",
        text: "Polos, Gradasi, Foto, atau Bergerak (Bentuk, Gelombang, Aurora, Partikel, dengan kecepatan Pelan atau Normal). Pengunjung punya tombol jeda untuk latar bergerak.",
      },
      {
        term: "Huruf, Ukuran teks, Sudut, dan Gaya tombol",
        text: "Pasangan huruf, ukuran Kecil, Sedang, atau Besar, bentuk sudut, serta tombol Penuh, Garis, atau Lembut.",
      },
      {
        term: "Urutan bagian",
        text: "Naikkan atau turunkan bagian di bawah profil, atau sembunyikan. Tombol pesan selalu tampil di bawah layar.",
      },
      {
        term: "Pertanyaan umum",
        text: "Tambah pertanyaan dan jawaban. Selama kosong, bagian ini tidak muncul sama sekali di halaman.",
      },
      {
        term: "Simpan tampilan",
        text: "Perubahan baru terlihat pengunjung setelah Anda menekan Simpan tampilan.",
      },
    ],
    note: "Paket Starter memakai tema gratis dan ada watermark Marky. Warna aksen, background, huruf, ukuran teks, sampul, dan gaya tombol ditandai Pro.",
    video: null,
    tour: [
      intro("Tampilan", "Bentuk halaman booking Anda: foto, warna, huruf, dan urutan bagian."),
      {
        target: "appearance-editor",
        title: "Editor",
        body: "Ubah pengaturan di sini. Bagian bertanda Pro terkunci di paket Starter.",
      },
      {
        target: "appearance-preview",
        title: "Pratinjau",
        body: "Tampilannya sama dengan halaman publik. Tekan Simpan tampilan supaya pengunjung ikut melihatnya.",
      },
    ],
  },

  // Sumber: src/app/dashboard/promosi/*, src/lib/promo/banner.ts
  promo: {
    title: "Promosi",
    summary: "Banner di halaman booking dan voucher diskon untuk pelanggan.",
    points: [
      {
        term: "Banner",
        text: "Tampil di atas daftar layanan. Maksimal 3 banner tayang bersamaan. Buat dari template atau unggah gambar, lalu atur Mulai tayang dan Selesai.",
      },
      {
        term: "Tombol banner",
        text: "Pilih Tombol menuju: Tanpa tombol, Voucher publik, layanan, atau Tautan lain.",
      },
      {
        term: "Urutan tayang",
        text: "Naikkan atau turunkan banner untuk mengatur urutannya.",
      },
      {
        term: "Voucher",
        text: "Buat kode dengan potongan persen atau nominal. Atur Maks potongan, Min transaksi, Total kuota, tanggal, dan layanan tertentu.",
      },
      {
        term: "Syarat voucher",
        text: "Bisa dibatasi Satu kali per nomor WhatsApp dan Hanya untuk pelanggan baru.",
      },
      {
        term: "Publik atau rahasia",
        text: "Voucher publik tampil di langkah terakhir booking. Kode rahasia hanya bisa dipakai pelanggan yang mengetik kodenya, minimal 6 karakter.",
      },
      {
        term: "Layanan dengan DP",
        text: "DP dihitung dari harga setelah diskon.",
      },
    ],
    note: "Promosi khusus paket Pro dan Studio.",
    video: null,
    tour: [
      intro("Promosi", "Pasang banner dan voucher diskon supaya pelanggan tertarik memesan."),
      {
        target: "promo-tabs",
        title: "Banner dan Voucher",
        body: "Pindah antara daftar banner dan daftar voucher lewat tab ini.",
      },
    ],
  },

  // Sumber: src/app/dashboard/domain/*
  domain: {
    title: "Domain",
    summary: "Halaman booking Anda di alamat sendiri, misalnya booking.salonanda.id.",
    points: [
      {
        term: "Pasang domain",
        text: "Ketik nama domain lalu tekan Pasang.",
      },
      {
        term: "Dua record DNS",
        text: "Halaman menampilkan dua record yang harus Anda pasang di pengaturan DNS domain, lengkap dengan Tipe, Nama, dan Nilai.",
      },
      {
        term: "Record TXT",
        text: "Membuktikan domain itu milik Anda. Namanya diawali _marky.",
      },
      {
        term: "Periksa",
        text: "Tekan Periksa setelah record dipasang. Perubahan DNS bisa butuh waktu. Status berubah dari Menunggu DNS menjadi Aktif.",
      },
      {
        term: "Lepas domain",
        text: "Melepas domain dari halaman booking Anda.",
      },
    ],
    note: "Domain sendiri khusus paket Studio.",
    video: null,
    tour: [
      intro("Domain", "Pakai alamat Anda sendiri untuk halaman booking."),
      {
        target: "domain-form",
        title: "Pasang domain",
        body: "Ketik domain, pasang record yang ditampilkan di DNS, lalu tekan Periksa.",
      },
    ],
  },

  // Sumber: src/app/dashboard/billing/page.tsx, src/lib/plans.ts
  billing: {
    title: "Langganan",
    summary: "Paket sewa sistem Marky. Terpisah dari pembayaran DP pelanggan Anda.",
    points: [
      {
        term: "Pemakaian bulan ini",
        text: "Jumlah transaksi dibandingkan kuota paket. Kuota dihitung ulang setiap awal bulan.",
      },
      {
        term: "Kuota habis",
        text: "Halaman booking menolak pesanan baru sampai bulan depan atau sampai paket naik.",
      },
      {
        term: "Paket Starter, Pro, dan Studio",
        text: "Kartu paket menampilkan fitur masing-masing dan menandai Paket Anda.",
      },
      {
        term: "Ganti paket",
        text: "Perubahan paket masih ditangani manual oleh tim Marky, belum lewat pembayaran di halaman ini.",
      },
    ],
    note: null,
    video: null,
    tour: [
      intro("Langganan", "Lihat pemakaian kuota dan bandingkan paket."),
      {
        target: "billing-plans",
        title: "Paket",
        body: "Bandingkan Starter, Pro, dan Studio. Paket Anda ditandai.",
      },
    ],
  },

  // Sumber: src/app/dashboard/settings/*
  settings: {
    title: "Pengaturan",
    summary: "Profil publik, aturan booking, kebijakan pelanggan, pengingat, dan data akun Anda.",
    points: [
      {
        term: "Profil",
        text: "Nama usaha, Bio, Nomor WhatsApp untuk notifikasi (tidak tampil ke publik), dan Alamat halaman booking. Mengubah alamat membuat tautan lama berhenti berfungsi.",
      },
      {
        term: "Booking tanpa bayar",
        text: "Izinkan bayar di tempat, pilih apakah booking langsung terkonfirmasi, batasi booking aktif per nomor WhatsApp, dan minta DP dari nomor yang pernah tidak datang.",
      },
      {
        term: "Ubah jadwal dan batal oleh pelanggan",
        text: "Atur boleh atau tidaknya pelanggan mengubah jadwal atau batal dari tautan pesan konfirmasi, batas jam paling lambat, dan kebijakan yang mereka lihat.",
      },
      {
        term: "Kontak dan media sosial",
        text: "Telepon, Email, Instagram, Threads, X, dan TikTok yang bisa dipakai pelanggan menghubungi Anda, serta Jam balas pesan.",
      },
      {
        term: "Pengingat untuk pelanggan",
        text: "Nyalakan WhatsApp, Email, atau Notifikasi HP, dengan pengingat H-1 sekitar pukul 08.00 dan Pagi hari jadwal. Pelanggan tetap bisa mematikannya sendiri.",
      },
      {
        term: "Akun",
        text: "Unduh data Anda atau Hapus akun. Penghapusan akun permanen.",
      },
    ],
    note: "Pengingat untuk pelanggan tersedia di paket Pro dan Studio.",
    video: null,
    tour: [
      intro("Pengaturan", "Semua aturan usaha Anda ada di sini, dibagi per kartu."),
      {
        target: "settings-profile",
        title: "Profil",
        body: "Nama usaha, bio, nomor WhatsApp, dan alamat halaman booking.",
      },
      {
        target: "settings-booking",
        title: "Booking tanpa bayar",
        body: "Atur bayar di tempat dan batas booking aktif per nomor WhatsApp.",
      },
      {
        target: "settings-customer",
        title: "Ubah jadwal dan batal",
        body: "Tentukan apa yang boleh dilakukan pelanggan sendiri dari tautan pesanan mereka.",
      },
      {
        target: "settings-reminders",
        title: "Pengingat",
        body: "Pilih kanal pengingat yang ditawarkan ke pelanggan.",
      },
      {
        target: "settings-account",
        title: "Akun",
        body: "Unduh salinan data Anda atau hapus akun.",
      },
    ],
  },
};

export const CHECKLIST_COPY: Record<
  ChecklistStepKey,
  { title: string; body: string; ctaLabel: string; ctaHref: string | null }
> = {
  SERVICE: {
    title: "Tambah layanan pertama",
    body: "Nama, durasi, harga, dan cara bayar: lunas di muka, DP, bayar di tempat, atau ajukan dulu.",
    ctaLabel: "Buka Layanan",
    ctaHref: ROUTES.services,
  },
  HOURS: {
    title: "Atur jam buka",
    body: "Hari dan jam Anda menerima pelanggan. Pelanggan hanya bisa memilih jam di dalam rentang ini.",
    ctaLabel: "Atur jam buka",
    ctaHref: ROUTES.availability,
  },
  PAYMENT: {
    title: "Pilih cara menerima uang",
    body: "Hubungkan Midtrans atau Xendit supaya pelanggan bisa membayar lunas atau DP lewat QRIS, langsung ke akun Anda. Belum siap? Pilih bayar di tempat di setiap layanan.",
    ctaLabel: "Buka Pembayaran",
    ctaHref: ROUTES.payments,
  },
  PAGE: {
    title: "Rapikan tampilan halaman",
    body: "Foto profil atau logo, warna, dan latar halaman booking. Ini yang pertama dilihat pelanggan.",
    ctaLabel: "Buka Tampilan",
    ctaHref: ROUTES.appearance,
  },
  SHARE: {
    title: "Bagikan tautan halaman",
    body: "Pasang tautan di bio Instagram, TikTok, atau status WhatsApp. Langkah ini selesai saat Anda menyalin tautan atau booking online pertama masuk.",
    ctaLabel: "Salin tautan",
    ctaHref: null,
  },
  BOOKING: {
    title: "Terima booking pertama",
    body: "Coba pesan sendiri dari halaman Anda untuk melihat alurnya dari sisi pelanggan. Booking percobaan memegang jamnya dan ikut dihitung kuota bulanan; batalkan dari Booking bila perlu.",
    ctaLabel: "Buka halaman saya",
    ctaHref: null,
  },
};
