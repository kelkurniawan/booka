/**
 * Aturan path berkas staf.
 *
 * WAJIB sejalan dengan constraint `staff_photo_path_scoped` dan
 * `staff_motion_path_scoped` di migration 20261119000100_staff_profile.sql.
 * Yang di database yang mengikat; yang di sini memberi pesan lebih awal.
 */
import { isScopedMediaPath } from "./path";

export const CLIP_UPLOAD_BUCKET = "staff-clip-uploads";

export type ClipUploadExtension = "gif" | "mp4" | "webm" | "mov";

const EKSTENSI_KLIP: Record<string, ClipUploadExtension> = {
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export function clipUploadExtension(type: string): ClipUploadExtension | null {
  return EKSTENSI_KLIP[type] ?? null;
}

/** `${merchantId}/staff/${staffId}/` */
export function staffMediaPrefix(merchantId: string, staffId: string): string {
  return `${merchantId}/staff/${staffId}/`;
}

export function isStaffPhotoPath(path: string, merchantId: string, staffId: string): boolean {
  if (!isScopedMediaPath(path, merchantId)) return false;
  const prefix = staffMediaPrefix(merchantId, staffId);
  return new RegExp(`^${escapeRegex(prefix)}photo-[A-Za-z0-9-]+\\.webp$`).test(path);
}

export function isClipUploadPath(path: string, merchantId: string, staffId: string): boolean {
  if (path.includes("..")) return false;
  const prefix = `${merchantId}/${staffId}/`;
  return new RegExp(
    `^${escapeRegex(prefix)}[A-Za-z0-9-]+\\.(gif|mp4|webm|mov)$`,
  ).test(path);
}

/** Poster JPG berbagi nama dasar dengan MP4 hasil (Keputusan 6). */
export function clipPosterPath(motionPath: string): string {
  return motionPath.replace(/\.mp4$/, ".jpg");
}

function escapeRegex(teks: string): string {
  return teks.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
