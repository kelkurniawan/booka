"use client";

import { useEffect, useState } from "react";

import { PixelScripts, firePixel, pixelReady } from "@/components/booking-page/pixel-scripts";
import type { PixelIds } from "@/components/booking-page/pixel-snippets";
import { Button } from "@/components/ui/button";

/** Disimpan tombol "Selesai" di /pesanan; hanya path, tidak pernah masuk DOM sebagai href. */
const ORDER_KEY = "marky:pesanan-url";

const read = (op: () => string | null) => {
  try {
    return op();
  } catch {
    return null;
  }
};

export function ThankYouClient({
  eventId,
  value,
  serviceName,
  ids,
}: {
  eventId: string;
  value: number;
  serviceName: string;
  ids: PixelIds;
}) {
  const [orderUrl, setOrderUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = read(() => sessionStorage.getItem(ORDER_KEY));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage hanya ada di browser
    if (url?.startsWith("/pesanan/")) setOrderUrl(url);
  }, []);

  // Purchase sekali per event_id. Skrip afterInteractive datang setelah hydrate,
  // jadi tunggu stub terpasang; ditandai terkirim hanya setelah benar-benar dikirim.
  useEffect(() => {
    const key = `marky:pixel:purchase:${eventId}`;
    if (read(() => localStorage.getItem(key))) return;
    let tries = 0;
    const timer = setInterval(() => {
      if (++tries > 50) return clearInterval(timer);
      if (!pixelReady(ids)) return;
      clearInterval(timer);
      firePixel("PAID", { eventId: `${eventId}:paid`, value, contentName: serviceName });
      read(() => (localStorage.setItem(key, "1"), null));
    }, 200);
    return () => clearInterval(timer);
  }, [eventId, value, serviceName, ids]);

  return (
    <>
      <PixelScripts ids={ids} />
      {orderUrl ? (
        <Button variant="outline" className="min-h-11" onClick={() => window.location.assign(orderUrl)}>
          Lihat pesanan saya
        </Button>
      ) : null}
    </>
  );
}
