"use client";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";

/**
 * Muat dokumen penuh (bukan router.push): navigasi klien membuat skrip pixel
 * di halaman tujuan melihat URL bertoken ini lewat document.referrer atau
 * pushState. Tidak ada yang disimpan di storage.
 */
export function FinishButton({ username, eventId }: { username: string; eventId: string }) {
  return (
    <Button className="min-h-11 w-full" onClick={() => window.location.assign(ROUTES.thankYou(username, eventId))}>
      Selesai
    </Button>
  );
}
