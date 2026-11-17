import { ROUTES } from "@/lib/routes";

// Teks landing per kata dari kanvas Main.dc.html. Angka dan nama di sini
// adalah contoh fiktif, bukan data merchant nyata.

export type Faq = { question: string; answer: string };
export type Policy = { title: string; body: string };
export type BizExample = {
  label: string;
  slug: string;
  name: string;
  bio: string;
  cta: string;
  items: { name: string; price: string }[];
};
export type MessageExample = { label: string; when: string; text: string; linkPath: string };

const EXAMPLE_BOOKING_LINK = ROUTES.bookingStatus("7f3a");

export const LANDING_FAQS: readonly Faq[] = [
  {
    question: "Apakah uang pelanggan ditahan Marky?",
    answer:
      "Tidak. Pembayaran pelanggan masuk langsung ke akun Midtrans atau Xendit milik Anda. Marky tidak pernah memegang uangnya.",
  },
  {
    question: "Bisa booking tanpa bayar dulu?",
    answer:
      "Bisa. Atur cara bayar sebuah layanan menjadi bayar di tempat, dan pelanggan langsung dapat jadwal tanpa membayar dulu.",
  },
  {
    question: "Pelanggan perlu unduh aplikasi?",
    answer:
      "Tidak. Pelanggan memesan lewat browser di HP, dan pengingatnya datang lewat WhatsApp atau email.",
  },
  {
    question: "Bisa pakai voucher dan banner promo?",
    answer:
      "Bisa. Pasang banner di halaman dan buat kode diskon dengan kuota serta masa berlaku.",
  },
  {
    question: "Ada potongan per transaksi dari Marky?",
    answer:
      "Tidak. Biaya QRIS ditagih langsung oleh Midtrans atau Xendit sesuai tarif mereka. Marky tidak memotong apa pun dari pembayaran pelanggan.",
  },
  {
    question: "Bagaimana kalau saya ingin berhenti?",
    answer:
      "Unduh salinan data Anda lalu hapus akun dari menu Pengaturan. Tautan booking langsung berhenti berfungsi.",
  },
];

export const POLICIES: readonly Policy[] = [
  {
    title: "Uang pelanggan",
    body: "DP masuk ke akun Midtrans atau Xendit milik Anda. Marky tidak pernah menahan dana.",
  },
  {
    title: "Data pribadi",
    body: "Data tidak dijual dan tidak dipakai untuk iklan pihak ketiga. Data disimpan di server Singapura.",
  },
  {
    title: "Hak Anda",
    body: "Anda bisa mengunduh salinan data, memperbaikinya, atau menghapus akun kapan saja dari Pengaturan.",
  },
  {
    title: "Yang dilarang",
    body: "Menerima DP untuk layanan yang tidak diberikan, atau menjual barang dan jasa yang melanggar hukum.",
  },
];

export const BIZ_EXAMPLES: readonly BizExample[] = [
  {
    label: "Salon",
    slug: "riasbysekar",
    name: "Rias by Sekar",
    bio: "Makeup wisuda dan pengantin, Bandung",
    cta: "Pilih jadwal",
    items: [
      { name: "Makeup Wisuda", price: "350.000" },
      { name: "Makeup Pesta", price: "450.000" },
      { name: "Pengantin, akad", price: "1.500.000" },
    ],
  },
  {
    label: "Restoran",
    slug: "terasdago",
    name: "Teras Dago",
    bio: "Masakan Sunda, buka sampai 22.00",
    cta: "Reservasi meja",
    items: [
      { name: "Reservasi meja", price: "gratis" },
      { name: "Paket ulang tahun", price: "1.500.000" },
      { name: "Rooftop privat", price: "ajukan" },
    ],
  },
  {
    label: "Fotografer",
    slug: "lensarumah",
    name: "Lensa Rumah",
    bio: "Foto keluarga dan produk, Jakarta",
    cta: "Pilih jadwal",
    items: [
      { name: "Sesi keluarga", price: "750.000" },
      { name: "Foto produk", price: "600.000" },
      { name: "Prewedding", price: "ajukan" },
    ],
  },
  {
    label: "Kelas",
    slug: "studionapas",
    name: "Studio Napas",
    bio: "Yoga dan pilates, Yogyakarta",
    cta: "Pilih kelas",
    items: [
      { name: "Yoga pagi", price: "85.000" },
      { name: "Pilates mat", price: "95.000" },
      { name: "Paket 8 kali", price: "600.000" },
    ],
  },
];

export const MESSAGE_EXAMPLES: readonly MessageExample[] = [
  {
    label: "Konfirmasi",
    when: "Senin 22.05",
    text: "Booking Anda terkonfirmasi.\nMakeup Wisuda, Sabtu 21 Nov pukul 10.00.\nDP Rp350.000 sudah diterima Rias by Sekar.",
    linkPath: EXAMPLE_BOOKING_LINK,
  },
  {
    label: "Pengingat H-1",
    when: "Jumat 10.00",
    text: "Besok pukul 10.00, Makeup Wisuda di Rias by Sekar.\nPerlu pindah jadwal? Buka tautan di bawah.",
    linkPath: EXAMPLE_BOOKING_LINK,
  },
  {
    label: "Pindah jadwal",
    when: "Jumat 10.12",
    text: "Jadwal Anda sudah dipindah ke Senin 23 Nov pukul 13.00.\nDP tetap berlaku.",
    linkPath: EXAMPLE_BOOKING_LINK,
  },
];

export const QRIS_EXAMPLE_ROWS: readonly { customer: string; amount: string }[] = [
  { customer: "Ayu, Makeup Wisuda", amount: "350.000" },
  { customer: "Rina, Paket Ulang Tahun", amount: "450.000" },
  { customer: "Dimas, Sesi Keluarga", amount: "375.000" },
];

export const AGENDA_EXAMPLE_ROWS: readonly { time: string; who: string; status: string }[] = [
  { time: "09.00", who: "Hendra, 2 orang", status: "Hadir" },
  { time: "10.00", who: "Ayu, Makeup Wisuda", status: "Lunas" },
  { time: "13.30", who: "Keluarga Sutanto", status: "Di tempat" },
  { time: "15.00", who: "Rina, 20 orang", status: "DP masuk" },
];

const FORBIDDEN_CHARS = /[\u2014\u2013\u00B7\u2192\u2190]/;

/** Jalur string yang memuat em dash, en dash, `·`, atau panah (larangan DESIGN.md). */
export function findSlopChars(value: unknown, path = "$"): string[] {
  if (typeof value === "string") return FORBIDDEN_CHARS.test(value) ? [path] : [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findSlopChars(item, `${path}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      findSlopChars(item, `${path}.${key}`),
    );
  }
  return [];
}
