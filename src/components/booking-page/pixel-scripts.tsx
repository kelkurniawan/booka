"use client";

/**
 * PERINGATAN KEAMANAN: komponen ini TIDAK BOLEH diimpor dari src/app/pesanan
 * maupun src/app/dashboard. Skrip pixel mengirim URL halaman ke Meta, TikTok
 * dan Google, dan URL /pesanan/[token] memuat token akses booking. Dijaga
 * oleh pixel-no-leak.test.ts. Hanya /[username] dan /[username]/terima-kasih.
 * Tanpa advanced matching: tidak ada nama, nomor WA, atau email yang dikirim.
 */
import Script from "next/script";

import { PIXEL_EVENTS, type FunnelStep } from "@/lib/funnel/events";

import { pixelSnippets, type PixelIds } from "./pixel-snippets";

export function PixelScripts({ ids }: { ids: PixelIds }) {
  const s = pixelSnippets(ids);
  return (
    <>
      {s.meta ? <Script id="pixel-meta" strategy="afterInteractive">{s.meta}</Script> : null}
      {s.tiktok ? <Script id="pixel-tiktok" strategy="afterInteractive">{s.tiktok}</Script> : null}
      {s.ga4 ? <Script id="pixel-ga4" strategy="afterInteractive">{s.ga4}</Script> : null}
    </>
  );
}

type PixelWindow = {
  fbq?: (...args: unknown[]) => void;
  ttq?: { track: (name: string, props: object, opts: object) => void };
  gtag?: (...args: unknown[]) => void;
};
const pw = () => window as unknown as PixelWindow;

/** true bila stub tiap platform yang dikonfigurasi sudah terpasang (skrip afterInteractive datang belakangan). */
export function pixelReady(ids: PixelIds): boolean {
  const s = pixelSnippets(ids);
  const w = pw();
  return (!s.meta || !!w.fbq) && (!s.tiktok || !!w.ttq) && (!s.ga4 || !!w.gtag);
}

/** Kirim satu kejadian ke platform yang terpasang; diam bila tidak ada. */
export function firePixel(
  step: FunnelStep,
  payload: { eventId: string; value?: number; contentName?: string },
) {
  const ev = PIXEL_EVENTS[step];
  const w = pw();
  const props = {
    ...(payload.value != null ? { value: payload.value, currency: "IDR" } : {}),
    ...(payload.contentName ? { content_name: payload.contentName } : {}),
  };
  try {
    w.fbq?.("track", ev.meta, props, { eventID: payload.eventId });
    w.ttq?.track(ev.tiktok, props, { event_id: payload.eventId });
    w.gtag?.("event", ev.ga4, {
      ...props,
      ...(step === "PAID" ? { transaction_id: payload.eventId } : {}),
      ...(payload.contentName ? { items: [{ item_name: payload.contentName }] } : {}),
    });
  } catch {
    // pixel tidak boleh mengganggu booking
  }
}
