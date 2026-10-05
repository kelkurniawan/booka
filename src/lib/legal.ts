/**
 * Identitas penyelenggara yang dicantumkan di /syarat dan /privasi.
 *
 * Nilai berkurung siku adalah PENANDA yang wajib diganti sebelum rilis
 * publik -- `LEGAL_PLACEHOLDER_PATTERN` di bawah dipakai halaman legal untuk
 * menampilkan peringatan selama masih ada yang belum diisi, supaya draf ini
 * tidak diam-diam tayang apa adanya.
 */
export const LEGAL_IDENTITY = {
  /** Nama badan usaha atau perorangan yang menyelenggarakan Booka. */
  operatorName: "[NAMA BADAN USAHA]",
  /** Alamat korespondensi (minimal kota dan provinsi). */
  address: "[ALAMAT]",
  /** Email untuk pertanyaan privasi, permintaan data, dan keluhan. */
  contactEmail: "[EMAIL KONTAK]",
  /** Tanggal berlaku versi dokumen ini, format bebas berbahasa Indonesia. */
  effectiveDate: "5 Oktober 2026",
} as const;

export const LEGAL_PLACEHOLDER_PATTERN = /^\[.+\]$/;

export function hasUnfilledLegalIdentity(): boolean {
  return Object.values(LEGAL_IDENTITY).some((value) =>
    LEGAL_PLACEHOLDER_PATTERN.test(value),
  );
}
