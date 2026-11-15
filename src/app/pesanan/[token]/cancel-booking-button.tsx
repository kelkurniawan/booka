"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { ROUTES } from "@/lib/routes";

/** Pelanggan membatalkan booking sendiri; kebijakan ditegakkan RPC, dialog hanya menampilkannya. */
export function CancelBookingButton({ token, policy }: { token: string; policy: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onOpenChange(next: boolean) {
    if (busy) return;
    setOpen(next);
    if (!next) setError(null);
  }

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(ROUTES.bookingCancelApi(token), { method: "POST" });
      if (response.ok) {
        setOpen(false);
        router.refresh();
      } else {
        const body: unknown = await response.json().catch(() => null);
        setError(
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : "Gagal membatalkan. Coba lagi.",
        );
        // 409: keadaan booking berubah; muat ulang supaya tombol mengikuti.
        if (response.status === 409) router.refresh();
      }
    } catch {
      setError("Gagal membatalkan, periksa koneksi lalu coba lagi.");
    }
    setBusy(false);
  }

  return (
    <>
      <Button type="button" variant="destructive" className="min-h-11 w-full" onClick={() => setOpen(true)}>
        Batalkan booking
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batalkan booking ini?</DialogTitle>
            <DialogDescription asChild>
              <div className="flex flex-col gap-2">
                {policy.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                <p>Slot Anda dilepas dan tidak bisa dikembalikan.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="text-sm text-pretty">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={busy}>
              Kembali
            </Button>
            <Button type="button" variant="destructive" className="min-h-11" onClick={cancel} disabled={busy}>
              {busy ? <Spinner aria-hidden /> : null}
              Ya, batalkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
