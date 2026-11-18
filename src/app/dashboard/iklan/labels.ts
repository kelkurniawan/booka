import type { AdChannel } from "@/types/database";

export const CHANNEL_LABELS: Record<AdChannel, string> = {
  IG_BIO: "Bio Instagram",
  META_ADS: "Iklan Instagram atau Facebook",
  TIKTOK_ADS: "Iklan TikTok",
  WA_STATUS: "Status WhatsApp",
  OTHER: "Lainnya",
};

export const CHANNEL_ORDER = ["IG_BIO", "META_ADS", "TIKTOK_ADS", "WA_STATUS", "OTHER"] as const satisfies readonly AdChannel[];
