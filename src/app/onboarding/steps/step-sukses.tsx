"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { ArrowRight, Check, Copy, PartyPopper } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { skipOptionalProfile } from "../actions";

/** Ketersediaan clipboard tidak pernah berubah selama halaman hidup. */
const subscribeNoop = () => () => {};

/**
 * Garis finis. Akun sudah tersimpan sebelum layar ini muncul, jadi tidak ada
 * jalan kembali ke langkah identitas -- lihat previousStep() di wizard-state.
 *
 * Dua aksi di bawah SENGAJA sama menonjol. Membuat "Lewati" jadi tautan kelabu
 * di pojok mengubah pilihan menjadi tekanan, dan blok berikutnya memang
 * opsional.
 */
export function StepSukses({
  appUrl,
  username,
  onContinue,
}: {
  appUrl: string;
  username: string;
  onContinue: () => void;
}) {
  const url = `${appUrl.replace(/\/$/, "")}/${username}`;

  // navigator.clipboard tidak ada di origin non-aman (http di luar localhost)
  // dan tidak ada sama sekali saat render di server. useSyncExternalStore
  // dipakai, bukan useState+useEffect, karena inilah cara React membaca nilai
  // khusus-klien tanpa memicu ketidakcocokan hidrasi: snapshot server selalu
  // false, lalu klien merender ulang dengan snapshot aslinya.
  const clipboardTersedia = useSyncExternalStore(
    subscribeNoop,
    () => Boolean(navigator.clipboard),
    () => false,
  );
  const [copyGagal, setCopyGagal] = useState(false);
  const canCopy = clipboardTersedia && !copyGagal;

  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipping, startSkipping] = useTransition();

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function salin() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Izin ditolak atau tab tidak fokus. Tautannya tetap terlihat penuh di
      // layar, jadi merchant masih bisa menyalinnya manual.
      setCopyGagal(true);
    }
  }

  function lewati() {
    setError(null);
    startSkipping(async () => {
      // Berhasil berarti skipOptionalProfile() melakukan redirect ke dashboard
      // dan baris di bawah tidak pernah tercapai.
      const hasil = await skipOptionalProfile();
      setError(hasil.message ?? "Gagal menyimpan. Coba lagi.");
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
          <PartyPopper className="size-6" aria-hidden />
        </span>
        <p className="text-muted-foreground text-sm">
          Halaman booking Anda sudah aktif. Bagikan tautan ini ke pelanggan.
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-lg border p-4">
        <span className="min-w-0 flex-1 truncate font-medium">{url}</span>
        {canCopy ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={salin}
            className="min-h-11 shrink-0"
          >
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? "Tersalin" : "Salin"}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm">
          Mau bantu kami menyesuaikan Booka untuk usaha Anda? Lima pertanyaan
          singkat, tidak wajib.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onContinue}
            disabled={skipping}
            className="min-h-11 w-full"
          >
            Lanjut, 30 detik
            <ArrowRight aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={lewati}
            disabled={skipping}
            className="min-h-11 w-full"
          >
            {skipping ? <Spinner /> : null}
            Lewati
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
