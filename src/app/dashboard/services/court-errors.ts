/**
 * Pemetaan kode error Postgres pada simpan layanan sewa ke pesan Indonesia.
 * Teks mentah Postgres tidak pernah diteruskan ke klien. Daftar di
 * docs/ERROR-CODES.md.
 */
export const COURT_ERROR_GENERIC = "Gagal menyimpan layanan sewa. Coba lagi.";

const MESSAGES: Record<string, string> = {
  "23P01": "Aturan jam ramai tumpang tindih di hari yang sama. Ubah jam atau lepas harinya.",
  "42501": "Anda tidak punya akses untuk tindakan ini.",
  "22023": "Data sewa tidak valid. Periksa isian lalu coba lagi.",
  "23514": "Pengaturan sewa tidak valid. Periksa lama main dan jam mulai.",
  "23503": "Lapangan yang dipilih tidak cocok. Muat ulang halaman lalu coba lagi.",
  "23505": "Nama lapangan itu sudah dipakai. Pakai nama lain.",
  P0001: "Paket Starter hanya mengizinkan 1 layanan. Upgrade paket untuk menambah layanan lagi.",
};

export function mapCourtError(code: string | undefined): string {
  return (code && MESSAGES[code]) || COURT_ERROR_GENERIC;
}
