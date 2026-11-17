/**
 * Pemetaan errcode Postgres dari RPC `create_booking` (lihat
 * `supabase/migrations/20260730000700_create_booking.sql`) ke pesan
 * Indonesia yang aman ditampilkan ke pengunjung. Teks error Postgres mentah
 * (`error.message`) TIDAK PERNAH boleh diteruskan ke klien -- bisa
 * membocorkan detail skema/implementasi (AGENTS.md, hard requirement 5).
 *
 * `status` disertakan di sini (bukan tabel switch terpisah di route handler)
 * supaya pesan dan status HTTP-nya tidak bisa diam-diam tidak sinkron.
 */
export type BookingErrorMapping = {
  status: number;
  message: string;
};

const ERROR_MAP: Record<string, BookingErrorMapping> = {
  // bookings_no_overlap (exclusion constraint) -- slot direbut request lain
  // yang commit lebih dulu.
  "23P01": {
    status: 409,
    message: "Jam tersebut baru saja dipesan orang lain, silakan pilih jadwal lain.",
  },
  // Trigger bookings_enforce_quota -- kuota transaksi bulanan paket STARTER habis.
  P0002: {
    status: 409,
    message: "Merchant sedang tidak menerima pesanan baru.",
  },
  // create_booking: slot di luar jam kerja (availability) merchant.
  //
  // Kodenya BK001, BUKAN P0004. P0004 adalah SQLSTATE bawaan PL/pgSQL
  // `assert_failure`, dan PostgreSQL secara eksplisit tidak menangkapnya
  // lewat `WHEN OTHERS` -- jadi pembungkus PL/pgSQL mana pun akan meledak
  // alih-alih menangani kasus ini dengan rapi. Lihat migration
  // 20260731000200_reap_expired_pending_inline.sql.
  BK001: {
    status: 409,
    message: "Slot yang dipilih di luar jam kerja merchant, silakan pilih jadwal lain.",
  },
  // create_booking (paket Studio): pelanggan memilih "siapa saja" tapi semua
  // staf sudah dipesan atau tidak bekerja di jam itu.
  BK002: {
    status: 409,
    message: "Semua staf sudah terisi di jam tersebut, silakan pilih jadwal lain.",
  },
  // create_booking (paket Studio): staf yang dipilih sudah nonaktif/dihapus.
  BK003: {
    status: 409,
    message: "Staf yang dipilih sedang tidak menerima pesanan, silakan pilih staf lain.",
  },
  // create_booking: service_id tidak ditemukan atau is_active = false.
  P0005: {
    status: 404,
    message: "Layanan tidak ditemukan atau sudah tidak aktif.",
  },
  // create_booking: p_start_datetime <= now() -- slot sudah lewat.
  // 409 (bukan 422/400) supaya konsisten dengan 23P01/P0002/BK001 di atas:
  // keempatnya sama-sama "state slot ini berubah/tidak valid lagi sejak
  // klien memuat daftar slot", bukan kesalahan bentuk input (400) maupun
  // kesalahan semantik input yang independen dari waktu (422).
  P0006: {
    status: 409,
    message: "Jam tersebut sudah lewat. Silakan pilih waktu lain.",
  },
  // create_booking: nomor WhatsApp sudah mencapai batas booking aktif
  // (max_active_per_phone), untuk ON_SITE, REQUEST, dan booking gratis.
  BK020: {
    status: 409,
    message:
      "Nomor WhatsApp ini sudah mencapai batas booking aktif di merchant ini. Selesaikan atau batalkan booking sebelumnya dulu.",
  },
  // create_booking: mode efektif butuh pembayaran online tapi merchant belum
  // menyambungkan payment gateway (koneksi ACTIVE).
  BK021: {
    status: 409,
    message: "Merchant belum mengaktifkan pembayaran",
  },
  // create_booking: nominal bayar sekarang di bawah minimum QRIS (layanan
  // lama yang harganya 1..1499, dibuat sebelum Zod menolaknya).
  BK022: {
    status: 409,
    message: "Nominal pembayaran terlalu kecil untuk QRIS. Hubungi merchant.",
  },
  // create_booking / evaluate_voucher: kode voucher tidak ada, nonaktif, atau sudah dihapus.
  BK050: {
    status: 404,
    message: "Kode voucher tidak ditemukan atau sudah tidak berlaku.",
  },
  // evaluate_voucher: di luar periode berlaku voucher.
  BK051: {
    status: 409,
    message: "Voucher ini belum berlaku atau sudah berakhir.",
  },
  // evaluate_voucher: kuota pemakaian voucher sudah habis.
  BK052: {
    status: 409,
    message: "Kuota voucher ini sudah habis.",
  },
  // create_booking: nomor WhatsApp ini sudah pernah memakai voucher ini.
  BK053: {
    status: 409,
    message: "Nomor WhatsApp ini sudah memakai voucher ini.",
  },
  // evaluate_voucher: harga layanan di bawah minimal belanja voucher.
  BK054: {
    status: 409,
    message: "Harga layanan belum memenuhi minimal transaksi voucher ini.",
  },
  // evaluate_voucher: voucher terbatas pada layanan lain.
  BK055: {
    status: 409,
    message: "Voucher ini tidak berlaku untuk layanan yang dipilih.",
  },
  // evaluate_voucher: voucher hanya untuk pelanggan baru.
  BK056: {
    status: 409,
    message: "Voucher ini khusus pelanggan baru.",
  },
  // enforce_banner_target: target banner bukan voucher publik atau layanan milik merchant ini.
  BK057: {
    status: 409,
    message: "Target banner harus voucher publik atau layanan milik Anda sendiri.",
  },
  // guard_banner_voucher_visibility: voucher yang dituju banner dijadikan rahasia.
  BK058: {
    status: 409,
    message: "Voucher ini dipakai banner. Ganti target banner dulu sebelum menjadikannya rahasia.",
  },
  // create_booking / move_booking_slot: kapasitas kursi atau meja habis untuk
  // jumlah tamu itu di jam itu (Keputusan 6-8 F8).
  BK060: {
    status: 409,
    message: "Tempat untuk jumlah tamu ini sudah penuh di jam tersebut, silakan pilih jam lain.",
  },
  // create_booking: meja pilihan pelanggan tidak tersedia atau tidak cocok.
  BK061: {
    status: 409,
    message:
      "Meja yang dipilih sudah terisi atau tidak cocok untuk jumlah tamu ini. Pilih meja lain atau Pilihkan untuk saya.",
  },
  // save_dining_layout: meja atau area masih punya reservasi mendatang.
  BK062: {
    status: 409,
    message:
      "Meja atau area ini masih punya reservasi mendatang. Pindahkan reservasinya dulu, lalu hapus.",
  },
  // create_booking: jumlah tamu di luar rentang layanan.
  BK063: {
    status: 422,
    message: "Jumlah tamu di luar batas layanan ini.",
  },
  // bookings_enforce_max_online_charge: booking PENDING di atas batas QRIS Midtrans.
  BK037: {
    status: 422,
    message: "Pembayaran QRIS maksimal Rp10.000.000 per transaksi. Pakai DP yang lebih kecil, atau bayar di tempat.",
  },
  // save_dining_layout: denah melanggar batas atau aturan (nama ganda, gabungan tidak cocok).
  BK064: {
    status: 422,
    message: "Denah meja tidak valid. Periksa jumlah, nama, dan gabungan meja, lalu coba lagi.",
  },
};

const DEFAULT_MAPPING: BookingErrorMapping = {
  status: 500,
  message: "Gagal membuat booking, silakan coba lagi.",
};

/**
 * `code` adalah `error.code` dari respons postgrest-js -- untuk error yang
 * berasal dari Postgres (lewat RAISE EXCEPTION ... USING ERRCODE), field ini
 * berisi SQLSTATE lima karakter (mis. "23P01", "P0002"). Kode yang tidak
 * dikenali (termasuk null/undefined, mis. error jaringan) jatuh ke pesan
 * generik 500 -- tidak pernah menampilkan `error.message` mentah.
 */
export function mapBookingError(code: string | null | undefined): BookingErrorMapping {
  if (!code) return DEFAULT_MAPPING;
  return ERROR_MAP[code] ?? DEFAULT_MAPPING;
}

/** True bila errcode ada di peta (dipakai route untuk menyertakan `code` di respons). */
export function isKnownBookingError(code: string | null | undefined): code is string {
  return !!code && Object.hasOwn(ERROR_MAP, code);
}

const VOUCHER_PRIVACY_MAPPING: BookingErrorMapping = {
  status: 409,
  message: "Voucher tidak berlaku untuk booking ini. Lepas voucher untuk melanjutkan.",
};

/**
 * Untuk POST /api/bookings (publik, tanpa login). BK053 (nomor sudah memakai)
 * dan BK056 (bukan pelanggan baru) disatukan jadi satu respons tanpa `code`,
 * supaya pesan berbeda tidak membocorkan riwayat nomor WhatsApp orang lain.
 */
export function mapPublicBookingError(code: string | null | undefined): {
  mapped: BookingErrorMapping;
  code: string | undefined;
} {
  if (code === "BK053" || code === "BK056") return { mapped: VOUCHER_PRIVACY_MAPPING, code: undefined };
  return { mapped: mapBookingError(code), code: isKnownBookingError(code) ? code : undefined };
}
