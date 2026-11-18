"use client";

import { useEffect } from "react";

import { readAttribution, type Attribution } from "@/lib/funnel/attribution";

type Kind = "VIEW" | "SERVICE" | "CHECKOUT" | "LINK_CLICK";
type Ctx = { merchantId: string; sessionId: string; attribution: Attribution };

// Diisi FunnelTracker saat halaman publik terpasang. Preview dashboard tidak
// memasangnya, jadi trackFunnel di sana tidak melakukan apa-apa.
let ctx: Ctx | null = null;
const viewSent = new Set<string>();

const store = (op: () => string | null): string | null => {
  try {
    return op();
  } catch {
    return null;
  }
};

const hasTouch = (a: Attribution) => Boolean(a.adLinkSlug || a.utmSource || a.utmMedium || a.utmCampaign);

function init(merchantId: string): Ctx {
  const attrKey = `marky:funnel:attr:${merchantId}`;
  const sidKey = `marky:funnel:sid:${merchantId}`;
  const seen = readAttribution(new URL(window.location.href), document.referrer || null, window.location.hostname);

  let attribution = seen;
  const stored = store(() => sessionStorage.getItem(attrKey));
  if (stored && !hasTouch(seen)) {
    try {
      attribution = JSON.parse(stored) as Attribution;
    } catch {
      // simpan ulang di bawah
    }
  }
  store(() => (sessionStorage.setItem(attrKey, JSON.stringify(attribution)), null));

  let sessionId = store(() => sessionStorage.getItem(sidKey));
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    const id = sessionId;
    store(() => (sessionStorage.setItem(sidKey, id), null));
  }
  return { merchantId, sessionId, attribution };
}

/** Sesi dan atribusi untuk dikirim bersama booking; null di luar halaman publik. */
export const funnelContext = () => (ctx ? { sessionId: ctx.sessionId, attribution: ctx.attribution } : null);

export function trackFunnel(kind: Kind, extra: { serviceId?: string; merchantLinkId?: string } = {}) {
  if (!ctx) return;
  try {
    const body = JSON.stringify({ ...ctx, kind, ...extra });
    if (navigator.sendBeacon?.("/api/events", new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // pelacakan tidak boleh mengganggu booking
  }
}

export function FunnelTracker({ merchantId }: { merchantId: string }) {
  useEffect(() => {
    try {
      ctx = init(merchantId);
    } catch {
      // crypto.randomUUID tidak ada (http biasa, Safari lama): tanpa pelacakan, halaman tetap jalan.
      ctx = null;
    }
    // Penjaga atas efek ganda mode dev; muat ulang halaman memulai modul baru.
    if (!viewSent.has(merchantId)) {
      viewSent.add(merchantId);
      trackFunnel("VIEW");
    }
    return () => {
      ctx = null;
    };
  }, [merchantId]);
  return null;
}
