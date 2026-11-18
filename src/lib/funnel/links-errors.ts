const GENERIC = "Perubahan gagal disimpan. Coba lagi sebentar lagi.";

const MESSAGES = new Map<string, string>([
  ["BK080", "Maksimal 8 tautan. Hapus satu tautan dulu."],
  ["BK081", "Tautan tidak valid. Periksa judul (1 sampai 40 huruf) dan alamat (https://...)."],
  ["42501", "Sesi Anda berakhir atau tautan bukan milik akun ini. Muat ulang halaman lalu coba lagi."],
]);

/** Pesan Indonesia untuk galat RPC save_merchant_links; kode tak dikenal jadi pesan umum. */
export function linksErrorMessage(code: string | undefined): string {
  return MESSAGES.get(code ?? "") ?? GENERIC;
}
