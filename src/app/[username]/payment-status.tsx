"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/format";

const POLL_INTERVAL_MS = 3000;

type PollStatus = "PENDING" | "PAID" | "CANCELLED";

/** Bentuk respons `GET /api/bookings/[id]/status` -- lihat route.ts, sengaja cuma dua field ini. */
type BookingStatusResponse = { status: PollStatus; expires_at: string };

export type PaymentStatusProps = {
  bookingId: string;
  paymentUrl: string;
  /** `expires_at` dari respons `POST /api/bookings` (Task 8) saat komponen ini pertama dipasang. */
  expiresAt: string;
  /** Dipanggil saat pengunjung menekan "Coba lagi" di layar gagal/kedaluwarsa. */
  onStartOver: () => void;
};

/**
 * Layar "menunggu pembayaran" Task 8 -> polling otomatis Task 9.
 *
 * Poll `GET /api/bookings/[id]/status` tiap 3 detik sampai status jadi
 * terminal:
 *   - `PAID` -> layar sukses.
 *   - `CANCELLED`, ATAU `PENDING` yang `expires_at`-nya sudah lewat menurut
 *     jam klien -> layar gagal/kedaluwarsa. Kasus kedua ini murni
 *     penanda sisi klien -- tidak menunggu cron pembatalan (Task 10) benar-
 *     benar meng-update baris di database, supaya pengunjung tidak terus
 *     melihat "menunggu pembayaran" sampai satu menit setelah tenggat.
 *
 * Polling berhenti begitu salah satu kondisi di atas terpenuhi -- interval
 * dibersihkan lewat cleanup effect (juga saat komponen unmount).
 */
export function PaymentStatus({ bookingId, paymentUrl, expiresAt, onStartOver }: PaymentStatusProps) {
  const [status, setStatus] = useState<PollStatus>("PENDING");
  const [currentExpiresAt, setCurrentExpiresAt] = useState(expiresAt);
  const [pollError, setPollError] = useState(false);
  // Inisialisasi lewat lazy initializer (bukan dihitung langsung di body
  // render, yang tidak boleh memanggil Date.now() -- lihat aturan
  // react-hooks/purity) supaya booking yang dibuka lama setelah tenggatnya
  // lewat (mis. tab lama dibuka lagi) langsung tampil sebagai kedaluwarsa.
  const [clientExpired, setClientExpired] = useState(
    () => Date.now() >= new Date(expiresAt).getTime(),
  );
  const isPaid = status === "PAID";
  const isTerminal = isPaid || status === "CANCELLED" || clientExpired;

  // Polling itu sendiri -- berhenti (tidak memasang interval baru) begitu
  // status sudah terminal.
  useEffect(() => {
    if (isTerminal) return;

    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch(`/api/bookings/${bookingId}/status`, { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) setPollError(true);
          return;
        }
        const body = (await response.json()) as BookingStatusResponse;
        if (cancelled) return;
        setPollError(false);
        setStatus(body.status);
        setCurrentExpiresAt(body.expires_at);
      } catch {
        // Gangguan jaringan sesaat -- tidak dianggap gagal permanen, coba
        // lagi di tick berikutnya (interval tetap jalan).
        if (!cancelled) setPollError(true);
      }
    }

    void poll();
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [bookingId, isTerminal]);

  // Watchdog kedaluwarsa sisi klien -- terpisah dari polling supaya layar
  // gagal muncul tepat saat tenggat lewat, bukan menunggu tick 3 detik
  // berikutnya (atau menunggu cron Task 10 mengubah status di database).
  // Selalu lewat setTimeout (bukan setClientExpired langsung di body effect)
  // meski sisa waktunya <= 0 -- react-hooks/set-state-in-effect melarang
  // memanggil setState sinkron langsung di body effect.
  useEffect(() => {
    if (isTerminal) return;

    const msLeft = new Date(currentExpiresAt).getTime() - Date.now();
    const timeout = setTimeout(() => setClientExpired(true), Math.max(msLeft, 0));
    return () => clearTimeout(timeout);
  }, [currentExpiresAt, isTerminal]);

  if (isPaid) {
    return (
      <div className="border-border flex flex-col items-center gap-3 border p-6 text-center">
        <CheckCircle2 className="size-10" aria-hidden />
        <div className="flex flex-col gap-1">
          <span className="font-medium">Pembayaran berhasil</span>
          <p className="text-muted-foreground text-sm text-pretty">
            Booking kamu sudah dikonfirmasi. Sampai jumpa di jadwal yang dipilih.
          </p>
        </div>
      </div>
    );
  }

  if (isTerminal) {
    return (
      <div className="border-border flex flex-col items-center gap-3 border p-6 text-center">
        <XCircle className="text-destructive size-10" aria-hidden />
        <div className="flex flex-col gap-1">
          <span className="font-medium">
            {status === "CANCELLED" ? "Booking dibatalkan" : "Waktu pembayaran habis"}
          </span>
          <p className="text-muted-foreground text-sm text-pretty">
            Slot ini sudah dilepas kembali. Silakan pilih jadwal baru untuk mencoba lagi.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onStartOver}>
          Coba lagi
        </Button>
      </div>
    );
  }

  return (
    <div className="border-border flex flex-col gap-3 border p-4">
      <span className="text-muted-foreground font-mono text-[0.7rem] tracking-[0.18em] uppercase">
        Menunggu pembayaran
      </span>
      <p className="text-sm text-pretty">
        Booking berhasil dibuat. Selesaikan pembayaran QRIS sebelum{" "}
        <span className="font-medium">{formatTime(currentExpiresAt)} WIB</span> agar slot ini tidak
        hangus.
      </p>
      <code className="bg-muted block overflow-x-auto p-2 text-xs break-all">{paymentUrl}</code>
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        {pollError ? "Gagal memeriksa status, mencoba lagi..." : "Memeriksa status pembayaran..."}
      </div>
    </div>
  );
}
