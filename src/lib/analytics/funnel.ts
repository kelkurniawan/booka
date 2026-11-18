// Ringkasan funnel iklan: murni, tanpa akses DB. Baris datang dari RPC funnel_summary.

export type FunnelRow = {
  channel: string;
  views: number;
  service_views: number;
  checkouts: number;
  booked: number;
  paid: number;
  revenue: number;
};

export const FUNNEL_STEPS = ["views", "service_views", "checkouts", "booked", "paid"] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export const STEP_LABEL: Record<FunnelStep, string> = {
  views: "Kunjungan",
  service_views: "Memilih layanan",
  checkouts: "Lanjut ke data diri",
  booked: "Booking dibuat",
  paid: "Dibayar",
};

export const CHANNEL_LABELS = [
  "Bio Instagram",
  "Iklan Instagram atau Facebook",
  "Iklan TikTok",
  "Status WhatsApp",
  "Langsung atau lainnya",
] as const;
export type ChannelLabel = (typeof CHANNEL_LABELS)[number];

/** Nama enum ad_links.channel atau utm_source mentah -> satu dari lima label. */
export function channelLabel(raw: string | null | undefined): ChannelLabel {
  switch ((raw ?? "").toLowerCase()) {
    case "ig_bio":
    case "instagram":
      return "Bio Instagram";
    case "meta_ads":
    case "meta":
    case "facebook":
      return "Iklan Instagram atau Facebook";
    case "tiktok_ads":
    case "tiktok":
      return "Iklan TikTok";
    case "wa_status":
    case "whatsapp":
      return "Status WhatsApp";
    default:
      return "Langsung atau lainnya";
  }
}

const cap = (n: number) => Math.min(n, 1);

export function summarizeFunnel(rows: FunnelRow[], channel: string | "ALL") {
  const merged = new Map<ChannelLabel, FunnelRow>();
  for (const r of rows) {
    const label = channelLabel(r.channel);
    const m = merged.get(label) ?? { ...r, channel: label, views: 0, service_views: 0, checkouts: 0, booked: 0, paid: 0, revenue: 0 };
    for (const k of [...FUNNEL_STEPS, "revenue"] as const) m[k] += Number(r[k]);
    merged.set(label, m);
  }
  const channels = CHANNEL_LABELS.filter((l) => merged.has(l)).map((l) => {
    const m = merged.get(l)!;
    return {
      channel: l as string,
      views: m.views,
      booked: m.booked,
      paid: m.paid,
      conversion: m.views > 0 ? cap(m.paid / m.views) : 0,
      revenue: m.revenue,
    };
  });

  const picked = [...merged.values()].filter((m) => channel === "ALL" || m.channel === channel);
  const sum = (k: FunnelStep) => picked.reduce((a, m) => a + m[k], 0);
  const steps = FUNNEL_STEPS.map((key, i) => {
    const count = sum(key);
    const prev = i === 0 ? 0 : sum(FUNNEL_STEPS[i - 1]);
    return { key, count, rateFromPrev: i === 0 || prev === 0 ? null : cap(count / prev) };
  });

  let worstStep: FunnelStep | null = null;
  if (steps[0].count > 0) {
    let low = Infinity;
    for (const s of steps) {
      if (s.rateFromPrev !== null && s.rateFromPrev < low) {
        low = s.rateFromPrev;
        worstStep = s.key;
      }
    }
  }
  return { steps, worstStep, channels };
}
