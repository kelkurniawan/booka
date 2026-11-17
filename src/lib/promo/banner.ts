// Aturan banner promosi. BANNER_URL_PATTERN harus sama dengan constraint merchant_banners
// di supabase/migrations/20261117000300. Bila keduanya berbeda, SQL yang menang.

import type { MerchantBanner } from "@/types/database";

export const BANNER_URL_PATTERN = /^https:\/\/[A-Za-z0-9.-]+(:[0-9]+)?(\/\S*)?$/;

export function isSafeBannerUrl(url: string): boolean {
  return url.length <= 500 && BANNER_URL_PATTERN.test(url);
}

export type BannerStatus = "Tayang" | "Terjadwal" | "Selesai" | "Draf";

export function bannerStatus(
  banner: Pick<MerchantBanner, "published" | "starts_at" | "ends_at">,
  nowMs: number,
): BannerStatus {
  if (!banner.published) return "Draf";
  if (banner.starts_at && Date.parse(banner.starts_at) > nowMs) return "Terjadwal";
  if (banner.ends_at && Date.parse(banner.ends_at) <= nowMs) return "Selesai";
  return "Tayang";
}

export const MAX_LIVE_BANNERS = 3;
