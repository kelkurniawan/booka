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

export function adLinkUrls(input: { origin: string; username: string; slug: string; channel: AdChannel }) {
  const { source, medium } = channelUtm(input.channel);
  const base = `${input.origin}/${input.username}`;
  const short = `${base}?t=${encodeURIComponent(input.slug)}`;
  const full = `${short}&utm_source=${source}&utm_medium=${medium}&utm_campaign=${encodeURIComponent(input.slug)}`;
  return { short, full };
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
    utmSource: clean(p.get("utm_source"), UTM_MAX),
    utmMedium: clean(p.get("utm_medium"), UTM_MAX),
    utmCampaign: clean(p.get("utm_campaign"), UTM_MAX),
    referrerHost: hostOf(referrer, selfHost),
  };
}
