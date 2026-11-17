/**
 * Batas media.
 *
 * Angka-angka ini WAJIB sejalan dengan setelan bucket di migration
 * 20260820000200_storage_bucket.sql. Yang di sini memberi pesan yang enak
 * dibaca sebelum berkas dikirim; yang di bucket adalah yang benar-benar
 * mengikat, karena pemeriksaan di browser bisa dilewati siapa pun yang
 * menembak Storage langsung dengan token sesinya sendiri.
 */
export const MEDIA_LIMITS = {
  imageTypes: ["image/jpeg", "image/png", "image/webp"],
  videoTypes: ["video/mp4", "video/webm"],
  /** Batas berkas mentah yang boleh dipilih merchant, sebelum dikompres. */
  imageMaxUploadBytes: 12 * 1024 * 1024,
  videoMaxBytes: 20 * 1024 * 1024,
  videoMaxSeconds: 30,
  avatarMaxSide: 512,
  backgroundMaxSide: 1200,
  serviceImageMaxSide: 800,
  maxServiceImages: 5,
  maxFaqs: 10,
  /** Klip staf: tipe mentah yang boleh diunggah merchant sebelum diubah ke MP4. */
  clipTypes: ["image/gif", "video/mp4", "video/webm", "video/quicktime"],
  /** = file_size_limit bucket staff-clip-uploads (20261119000100). */
  clipMaxBytes: 8 * 1024 * 1024,
  clipMaxSeconds: 5,
  clipMaxSide: 480,
} as const;

export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!MEDIA_LIMITS.imageTypes.includes(file.type as never)) {
    return "Format gambar harus JPG, PNG, atau WebP.";
  }
  if (file.size > MEDIA_LIMITS.imageMaxUploadBytes) {
    return "Ukuran gambar maksimal 12MB.";
  }
  return null;
}

export function validateVideoFile(
  file: { type: string; size: number },
  durationSeconds: number,
): string | null {
  if (!MEDIA_LIMITS.videoTypes.includes(file.type as never)) {
    return "Format video harus MP4 atau WebM.";
  }
  if (file.size > MEDIA_LIMITS.videoMaxBytes) {
    return "Ukuran video maksimal 20MB.";
  }
  if (durationSeconds > MEDIA_LIMITS.videoMaxSeconds) {
    return "Durasi video maksimal 30 detik.";
  }
  return null;
}

/** Durasi null = tidak tercatat (diperiksa ulang di server; keluaran tetap dipotong 5 detik). */
export function validateClipFile(
  file: { type: string; size: number },
  durationSeconds: number | null,
): string | null {
  if (!MEDIA_LIMITS.clipTypes.includes(file.type as never)) {
    return "Format klip harus GIF, MP4, WebM, atau MOV.";
  }
  if (file.size > MEDIA_LIMITS.clipMaxBytes) {
    return "Ukuran klip maksimal 8MB.";
  }
  // 0,1 detik toleransi: jeda bingkai GIF membuat durasi terbaca sedikit lebih panjang.
  if (durationSeconds !== null && durationSeconds > MEDIA_LIMITS.clipMaxSeconds + 0.1) {
    return "Durasi klip maksimal 5 detik.";
  }
  return null;
}
