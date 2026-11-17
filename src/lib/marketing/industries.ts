import { BIZ_EXAMPLES, type BizExample, type Faq } from "./content";

export type IndustrySlug = "salon" | "barbershop" | "restoran" | "fotografer" | "klinik" | "kelas";

export type Industry = {
  slug: IndustrySlug;
  name: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro: string;
  example: BizExample;
  paymentFit: { title: string; body: string };
  points: { title: string; body: string }[];
  faqs: Faq[];
};

const exampleOf = (label: string): BizExample => {
  const found = BIZ_EXAMPLES.find((e) => e.label === label);
  if (!found) throw new Error(`Contoh usaha tidak ada: ${label}`);
  return found;
};

// Klaim pengingat dan pindah jadwal sama dengan beranda: pengingat H-1 plus
// opsional pagi hari H (WhatsApp, email, web push) khusus Pro dan Studio;
// pelanggan pindah jadwal sendiri hanya bila merchant mengizinkan.
const FAQ_DP: Faq = {
  question: "Ke mana DP pelanggan masuk?",
  answer:
    "Langsung ke akun Midtrans atau Xendit milik Anda. Marky tidak menahan dana dan hanya menarik biaya langganan.",
};
const FAQ_RESCHEDULE: Faq = {
  question: "Bisa pelanggan pindah jadwal sendiri?",
  answer:
    "Bisa, bila Anda mengizinkannya di Pengaturan. Pelanggan membuka tautan pesanan mereka. Bila tidak diizinkan, pelanggan bisa menghubungi Anda dari tautan yang sama.",
};

export const INDUSTRIES: readonly Industry[] = [
  {
    slug: "salon",
    name: "Salon dan MUA",
    metaTitle: "Marky untuk salon dan MUA: booking dan DP otomatis",
    metaDescription:
      "Halaman booking untuk salon dan MUA. Pelanggan pilih layanan dan jadwal, DP masuk langsung ke akun Midtrans atau Xendit Anda.",
    h1: "Booking salon dan MUA yang masuk sendiri.",
    intro:
      "Pelanggan memilih layanan dan jam dari satu tautan di bio, lalu membayar DP. Jadwal Anda terisi tanpa membalas obrolan satu per satu.",
    example: exampleOf("Salon"),
    paymentFit: {
      title: "DP supaya jadwal tidak kosong",
      body: "Atur layanan seperti makeup pengantin dengan DP lewat QRIS, dan layanan harian dengan bayar penuh atau bayar di tempat. Cara bayar dipilih per layanan.",
    },
    points: [
      {
        title: "Satu tautan di bio",
        body: "Layanan, harga, dan jam kosong tampil di satu halaman yang bisa ditaruh di Instagram atau WhatsApp.",
      },
      {
        title: "Jam kerja dan hari libur",
        body: "Atur jam buka per hari. Pelanggan hanya melihat jam yang masih kosong.",
      },
      {
        title: "Pengingat untuk pelanggan",
        body: "Pengingat H-1 dan opsional pagi hari H lewat WhatsApp, email, atau notifikasi browser. Tersedia di paket Pro dan Studio.",
      },
    ],
    faqs: [FAQ_DP, FAQ_RESCHEDULE],
  },
  {
    slug: "barbershop",
    name: "Barbershop",
    metaTitle: "Marky untuk barbershop: jadwal potong tanpa antre obrolan",
    metaDescription:
      "Halaman booking untuk barbershop. Pelanggan memilih layanan dan jam, Anda melihat semuanya di satu kalender, termasuk per barber.",
    h1: "Jadwal barbershop terisi tanpa membalas satu per satu.",
    intro:
      "Pelanggan memilih layanan dan jam dari satu tautan. Anda tinggal membuka kalender dan melayani yang datang.",
    example: {
      label: "Barbershop",
      slug: "pangkasrapi",
      name: "Pangkas Rapi",
      bio: "Potong rambut dan cukur, Surabaya",
      cta: "Pilih jadwal",
      items: [
        { name: "Potong rambut", price: "60.000" },
        { name: "Potong dan cukur", price: "90.000" },
        { name: "Hair coloring", price: "ajukan" },
      ],
    },
    paymentFit: {
      title: "Bayar di tempat tetap bisa",
      body: "Layanan cepat seperti potong rambut bisa memakai bayar di tempat, sedangkan layanan panjang bisa meminta DP. Cara bayar dipilih per layanan.",
    },
    points: [
      {
        title: "Kalender per staf",
        body: "Di paket Studio, setiap barber punya kalender sendiri dan pelanggan bisa memilih barbernya.",
      },
      {
        title: "Booking manual",
        body: "Pelanggan yang datang langsung atau memesan lewat DM bisa Anda catat sendiri di kalender yang sama.",
      },
      {
        title: "Pelanggan bisa membatalkan",
        body: "Pelanggan membatalkan atau menghubungi Anda dari tautan pesanan, sesuai kebijakan yang Anda atur.",
      },
    ],
    faqs: [
      {
        question: "Bisa tiap barber punya jadwal sendiri?",
        answer: "Bisa, lewat fitur multi-staf di paket Studio. Setiap staf punya kalender sendiri.",
      },
      FAQ_DP,
    ],
  },
  {
    slug: "restoran",
    name: "Restoran dan kafe",
    metaTitle: "Marky untuk restoran dan kafe: reservasi meja online",
    metaDescription:
      "Halaman reservasi meja untuk restoran dan kafe. Pelanggan memilih jumlah tamu dan meja, bayar di tempat, tanpa balas obrolan.",
    h1: "Reservasi meja yang masuk sendiri.",
    intro:
      "Pelanggan memilih tanggal, jam, dan jumlah tamu dari satu tautan. Anda melihat reservasi masuk tanpa membalas pesan satu per satu.",
    example: exampleOf("Restoran"),
    paymentFit: {
      title: "Reservasi dibayar di tempat",
      body: "Reservasi meja bisa memakai bayar di tempat, jadi pelanggan tidak perlu membayar apa pun saat memesan. Paket atau acara khusus tetap bisa meminta DP.",
    },
    points: [
      {
        title: "Jumlah tamu dan kapasitas",
        body: "Atur total kursi. Reservasi tidak akan melebihi kapasitas yang Anda tetapkan.",
      },
      {
        title: "Denah dan pilihan meja",
        body: "Susun denah meja Anda. Pelanggan bisa memilih meja, atau menekan Pilihkan untuk saya.",
      },
      {
        title: "Satu agenda",
        body: "Semua reservasi tampil di dashboard Anda per hari, lengkap dengan jumlah tamu.",
      },
    ],
    faqs: [
      {
        question: "Apakah pelanggan bisa memilih meja?",
        answer:
          "Bisa, bila Anda menyusun denah meja. Pelanggan memilih meja di denah, atau menekan Pilihkan untuk saya agar meja dipilihkan.",
      },
      {
        question: "Apakah pelanggan wajib membayar saat reservasi?",
        answer:
          "Tidak harus. Reservasi meja bisa diatur bayar di tempat. Anda juga bisa meminta DP untuk layanan tertentu.",
      },
    ],
  },
  {
    slug: "fotografer",
    name: "Fotografer",
    metaTitle: "Marky untuk fotografer: booking sesi dan DP otomatis",
    metaDescription:
      "Halaman booking untuk fotografer. Pelanggan memilih paket dan jadwal sesi, DP masuk langsung ke akun Midtrans atau Xendit Anda.",
    h1: "Booking sesi foto dengan DP yang masuk sendiri.",
    intro:
      "Pelanggan memilih paket dan tanggal sesi dari satu tautan. DP mengunci jadwal Anda sebelum Anda membalas apa pun.",
    example: exampleOf("Fotografer"),
    paymentFit: {
      title: "DP untuk mengunci sesi, ajukan untuk yang khusus",
      body: "Paket standar bisa memakai DP atau bayar penuh. Untuk paket yang perlu dibahas dulu, seperti prewedding, pelanggan mengajukan dan Anda yang menyetujui.",
    },
    points: [
      {
        title: "Galeri di tiap layanan",
        body: "Pasang gambar contoh hasil kerja di setiap layanan agar calon pelanggan melihat gayanya. Video tersedia di paket Pro dan Studio.",
      },
      {
        title: "Tampilan sesuai merek Anda",
        body: "Pilih tema, foto profil, dan latar halaman booking dari Dashboard. Warna dan font sendiri tersedia di paket Pro dan Studio.",
      },
      {
        title: "Pengingat sesi",
        body: "Pengingat H-1 dan opsional pagi hari H bagi pelanggan, di paket Pro dan Studio.",
      },
    ],
    faqs: [FAQ_DP, FAQ_RESCHEDULE],
  },
  {
    slug: "klinik",
    name: "Klinik dan praktik",
    metaTitle: "Marky untuk klinik dan praktik: jadwal janji temu",
    metaDescription:
      "Halaman jadwal untuk klinik kecil dan praktik mandiri. Pelanggan memilih layanan dan jam, Anda melihat janji temu di satu kalender.",
    h1: "Jadwal janji temu yang terisi tanpa telepon.",
    intro:
      "Pasien memilih layanan dan jam dari satu tautan. Marky membantu mengatur jadwal dan pembayaran, bukan menyimpan data medis.",
    example: {
      label: "Klinik",
      slug: "klinikbundasehat",
      name: "Klinik Bunda Sehat",
      bio: "Praktik dokter umum dan gigi, Medan",
      cta: "Pilih jadwal",
      items: [
        { name: "Konsultasi dokter umum", price: "120.000" },
        { name: "Pembersihan karang gigi", price: "250.000" },
        { name: "Pemeriksaan lanjutan", price: "ajukan" },
      ],
    },
    paymentFit: {
      title: "Bayar di tempat atau DP",
      body: "Konsultasi biasa bisa memakai bayar di tempat. Layanan yang memakan waktu panjang bisa meminta DP agar slot tidak terbuang.",
    },
    points: [
      {
        title: "Jam praktik",
        body: "Atur jam buka per hari. Pasien hanya melihat jam yang masih kosong.",
      },
      {
        title: "Kalender per staf",
        body: "Di paket Studio, tiap dokter atau terapis punya kalender sendiri.",
      },
      {
        title: "Pengingat janji temu",
        body: "Pengingat H-1 dan opsional pagi hari H lewat WhatsApp, email, atau notifikasi browser, di paket Pro dan Studio.",
      },
    ],
    faqs: [
      {
        question: "Apakah Marky menyimpan rekam medis?",
        answer:
          "Tidak. Marky dipakai untuk jadwal dan pembayaran janji temu. Marky bukan tempat menyimpan rekam medis.",
      },
      FAQ_DP,
    ],
  },
  {
    slug: "kelas",
    name: "Kelas dan studio",
    metaTitle: "Marky untuk kelas dan studio: booking kelas dan paket",
    metaDescription:
      "Halaman booking untuk studio yoga, pilates, dan kelas privat. Pelanggan memilih kelas dan jam, bayar lewat QRIS ke akun Anda sendiri.",
    h1: "Booking kelas yang terisi tanpa daftar manual.",
    intro:
      "Peserta memilih kelas dan jam dari satu tautan, lalu membayar. Anda tidak perlu lagi mencatat pendaftar dari obrolan.",
    example: exampleOf("Kelas"),
    paymentFit: {
      title: "Bayar penuh untuk kelas, DP untuk paket",
      body: "Kelas satuan bisa memakai bayar penuh lewat QRIS. Paket yang lebih mahal bisa memakai DP. Cara bayar dipilih per layanan.",
    },
    points: [
      {
        title: "Kelas dan paket jadi layanan",
        body: "Kelas satuan dan paket, misalnya paket 8 kali, bisa ditulis sebagai layanan terpisah dengan harga masing-masing.",
      },
      {
        title: "Kode diskon dan banner",
        body: "Buat kode diskon dengan kuota dan masa berlaku, serta pasang banner promo di halaman. Tersedia di paket Pro dan Studio.",
      },
      {
        title: "Pindah jadwal oleh peserta",
        body: "Bila Anda mengizinkan, peserta memindahkan jadwal sendiri dari tautan pesanan mereka.",
      },
    ],
    faqs: [FAQ_DP, FAQ_RESCHEDULE],
  },
];

export function industryBySlug(slug: string): Industry | undefined {
  return INDUSTRIES.find((i) => i.slug === slug);
}
