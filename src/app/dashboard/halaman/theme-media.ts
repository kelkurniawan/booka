import type { MerchantTheme } from "@/types/database";

export type ThemeMediaKey = "background_image_path" | "logo_path" | "cover_path";

export const THEME_MEDIA_KEYS: readonly ThemeMediaKey[] = [
  "background_image_path",
  "logo_path",
  "cover_path",
];

type ThemeMedia = Pick<MerchantTheme, ThemeMediaKey>;

/**
 * Path yang tersimpan dan tidak lagi dirujuk setelah simpan berhasil. Path yang
 * masih dipakai di kunci mana pun tidak pernah ikut dikembalikan.
 */
export function replacedMediaPaths(saved: ThemeMedia, next: ThemeMedia): string[] {
  const dipakai = new Set(THEME_MEDIA_KEYS.map((kunci) => next[kunci]));
  const hasil: string[] = [];
  for (const kunci of THEME_MEDIA_KEYS) {
    const lama = saved[kunci];
    if (lama !== null && !dipakai.has(lama) && !hasil.includes(lama)) hasil.push(lama);
  }
  return hasil;
}

/** Unggahan yang belum pernah disimpan lalu diganti: belum publik, aman dihapus sekarang. */
export function discardableDraftPath(
  saved: ThemeMedia,
  draft: ThemeMedia,
  key: ThemeMediaKey,
): string | null {
  const path = draft[key];
  return path !== null && path !== saved[key] ? path : null;
}
