"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";

/** Membuat QRIS untuk permintaan yang disetujui, lalu memuat ulang halaman agar QR tampil. */
export function PayNowButton({ token, label }: { token: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(ROUTES.bookingPay(token), { method: "POST" });
      if (response.ok) {
        // `busy` dibiarkan: halaman dirender ulang dengan QR.
        router.refresh();
        return;
      }
      const body: unknown = await response.json().catch(() => null);
      const message =
        body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error
          : null;
      setError(message ?? "Gagal menyiapkan pembayaran, silakan coba lagi.");
    } catch {
      setError("Gagal menyiapkan pembayaran, periksa koneksi lalu coba lagi.");
    }
    setBusy(false);
  }

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <Button type="button" className="min-h-11 w-full" onClick={pay} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {label}
      </Button>
      {error ? (
        <p role="alert" className="text-destructive text-sm text-pretty">
          {error}
        </p>
      ) : null}
    </div>
  );
}
