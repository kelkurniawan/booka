/** Aturan unggah foto lapangan (L6): JPG/PNG/WebP, maksimal 5 MB, path `{merchant}/court/{lapangan}/{uuid}.{ext}`. */
export const COURT_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const COURT_PHOTO_TOO_BIG = "Foto terlalu besar. Pakai JPG, PNG, atau WebP maksimal 5 MB.";

export function courtPhotoPath(merchantId: string, courtId: string, uuid: string, ext: string): string {
  return `${merchantId}/court/${courtId}/${uuid}.${ext}`;
}
