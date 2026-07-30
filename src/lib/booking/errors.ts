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
  P0004: {
    status: 409,
    message: "Slot yang dipilih di luar jam kerja merchant, silakan pilih jadwal lain.",
  },
  // create_booking: service_id tidak ditemukan atau is_active = false.
  P0005: {
    status: 404,
    message: "Layanan tidak ditemukan atau sudah tidak aktif.",
  },
  // create_booking: p_start_datetime <= now() -- slot sudah lewat.
  // 409 (bukan 422/400) supaya konsisten dengan 23P01/P0002/P0004 di atas:
  // keempatnya sama-sama "state slot ini berubah/tidak valid lagi sejak
  // klien memuat daftar slot", bukan kesalahan bentuk input (400) maupun
  // kesalahan semantik input yang independen dari waktu (422).
  P0006: {
    status: 409,
    message: "Jam tersebut sudah lewat. Silakan pilih waktu lain.",
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
