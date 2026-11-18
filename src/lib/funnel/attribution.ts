import type { AdChannel } from "@/types/database";

export type Attribution = {
  adLinkSlug: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrerHost: string | null;
};

const UTM_MAX = 64;
const HOST_MAX = 100;
const SLUG_PATTERN = /^[a-z0-9-]{3,40}$/;
// Sama dengan CHECK funnel_events_referrer_host_format.
const HOST_PATTERN = /^[a-z0-9.-]{1,100}$/;

const CHANNEL_UTM: Record<AdChannel, { source: string; medium: string }> = {
  IG_BIO: { source: "instagram", medium: "bio" },
  META_ADS: { source: "meta", medium: "paid" },
  TIKTOK_ADS: { source: "tiktok", medium: "paid" },
  WA_STATUS: { source: "whatsapp", medium: "status" },
  OTHER: { source: "lainnya", medium: "link" },
};

export const channelUtm = (channel: AdChannel) => CHANNEL_UTM[channel];

/** customDomain: domain sendiri melayani halaman di akarnya, jadi tanpa /username (hemat satu redirect). */
export function adLinkUrls(input: { origin: string; username: string; slug: string; channel: AdChannel; customDomain?: boolean }) {
  const { source, medium } = channelUtm(input.channel);
  const base = input.customDomain ? `${input.origin}/` : `${input.origin}/${input.username}`;
  const short = `${base}?t=${encodeURIComponent(input.slug)}`;
  const full = `${short}&utm_source=${source}&utm_medium=${medium}&utm_campaign=${encodeURIComponent(input.slug)}`;
  return { short, full };
}

const CHANNEL_SUFFIX: Record<AdChannel, string> = { IG_BIO: "ig", META_ADS: "meta", TIKTOK_ADS: "tt", WA_STATUS: "wa", OTHER: "lain" };

/** Nama + kanal jadi slug `^[a-z0-9-]{3,40}$`, mis. "Iklan TikTok Wisuda" + TIKTOK_ADS -> "iklan-tiktok-wisuda-tt". */
export function slugifyAdLink(name: string, channel: AdChannel): string {
  const suffix = CHANNEL_SUFFIX[channel];
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40 - suffix.length - 1)
    .replace(/-$/, "");
  return `${base || "tautan"}-${suffix}`;
}

/** Bentrok dengan slug yang sudah ada (termasuk yang diarsipkan) diberi akhiran -2, -3, dst. */
export function uniqueSlug(slug: string, taken: ReadonlySet<string>): string {
  if (!taken.has(slug)) return slug;
  for (let n = 2; ; n++) {
    const tail = `-${n}`;
    const candidate = slug.slice(0, 40 - tail.length).replace(/-$/, "") + tail;
    if (!taken.has(candidate)) return candidate;
  }
}

const clean = (v: string | null, max: number) => {
  const s = v?.trim().slice(0, max);
  return s ? s : null;
};

function hostOf(referrer: string | null, selfHost: string): string | null {
  if (!referrer) return null;
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
  host = host.slice(0, HOST_MAX);
  if (host === selfHost.toLowerCase() || !HOST_PATTERN.test(host)) return null;
  return host;
}

export function readAttribution(url: URL, referrer: string | null, selfHost: string): Attribution {
  const p = url.searchParams;
  const t = p.get("t")?.trim().toLowerCase() ?? "";
  return {
    adLinkSlug: SLUG_PATTERN.test(t) ? t : null,
    utmSource: clean(p.get("utm_source"), UTM_MAX)?.toLowerCase() ?? null,
    utmMedium: clean(p.get("utm_medium"), UTM_MAX)?.toLowerCase() ?? null,
    utmCampaign: clean(p.get("utm_campaign"), UTM_MAX),
    referrerHost: hostOf(referrer, selfHost),
  };
}
