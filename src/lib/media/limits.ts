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
