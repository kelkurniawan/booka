"use client";

import { useEffect, useState } from "react";

import { PixelScripts, firePixel, pixelReady } from "@/components/booking-page/pixel-scripts";
import type { PixelIds } from "@/components/booking-page/pixel-snippets";
import { Button } from "@/components/ui/button";

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
  // Tidak ada tautan pesanan di sini (skrip pihak ketiga bisa membaca storage/DOM): hanya kembali di riwayat.
  const [canGoBack, setCanGoBack] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- history hanya ada di browser
    setCanGoBack(window.history.length > 1);
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
      {canGoBack ? (
        <Button variant="outline" className="min-h-11" onClick={() => window.history.back()}>
          Lihat pesanan saya
        </Button>
      ) : (
        <p className="text-muted-foreground text-sm">Buka lagi tautan pesanan dari WhatsApp Anda.</p>
      )}
    </>
  );
}
