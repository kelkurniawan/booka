"use client";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";

/** Simpan tautan pesanan di sessionStorage (bukan di URL tujuan), lalu buka halaman terima kasih tanpa token. */
export function FinishButton({ username, eventId }: { username: string; eventId: string }) {
  return (
    <Button
      className="min-h-11 w-full"
      onClick={() => {
        try {
          sessionStorage.setItem("marky:pesanan-url", window.location.pathname);
        } catch {
          // tanpa tautan balik; halaman terima kasih tetap jalan
        }
        window.location.assign(ROUTES.thankYou(username, eventId));
      }}
    >
      Selesai
    </Button>
  );
}
