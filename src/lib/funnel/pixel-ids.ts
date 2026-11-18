// Sama dengan CHECK di merchant_tracking.
export const isValidMetaPixelId = (v: string) => /^\d{15,16}$/.test(v);
export const isValidTiktokPixelId = (v: string) => /^[A-Z0-9]{20}$/.test(v);
export const isValidGa4Id = (v: string) => /^G-[A-Z0-9]{6,12}$/.test(v);

// Hanya https, tanpa spasi, maksimal 500, sama dengan CHECK merchant_links.url.
export function isSafeLinkUrl(url: string): boolean {
  if (url.length > 500 || !url.startsWith("https://") || /\s/.test(url)) return false;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}
