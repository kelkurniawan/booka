"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 3000;
const TICK_INTERVAL_MS = 1000;
const URGENT_THRESHOLD_MS = 2 * 60 * 1000;

type PollStatus = "PENDING" | "PAID" | "CANCELLED";

/** Bentuk respons `GET /api/bookings/[id]/status` -- sengaja cuma dua field ini. */
type BookingStatusResponse = { status: PollStatus; expires_at: string };

export type BookingLiveStatusProps = {
  /** id booking -- BUKAN rahasia (token yang rahasia), boleh dipakai di URL polling. */
  bookingId: string;
  /** `expires_at` booking pada saat page.tsx (server) merender halaman ini. */
  expiresAt: string;
};

function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Bagian "menunggu pembayaran" di /pesanan/[token] -- pola polling +
 * watchdog kedaluwarsa sisi klien DIPINDAH dari
 * src/app/[username]/payment-status.tsx (interval dibersihkan di cleanup,
 * watchdog `setTimeout` terpisah, `useState` lazy initializer karena aturan
 * react-hooks/purity), bukan ditulis ulang.
 *
 * Bedanya dengan versi lama: begitu status jadi terminal (PAID/CANCELLED,
 * atau kedaluwarsa menurut jam klien), komponen ini TIDAK merender layar
 * sukses/gagalnya sendiri -- itu tanggung jawab page.tsx (Server Component)
 * lewat `router.refresh()`, supaya tampilan PAID/kedaluwarsa/dibatalkan
 * SELALU berasal dari data database yang sebenarnya, bukan state klien yang
 * bisa diam-diam berbeda kalau mis. dua tab dibuka bersamaan.
 */
export function BookingLiveStatus({ bookingId, expiresAt }: BookingLiveStatusProps) {
  const router = useRouter();

  const [status, setStatus] = useState<PollStatus>("PENDING");
  const [currentExpiresAt, setCurrentExpiresAt] = useState(expiresAt);
  const [pollError, setPollError] = useState(false);
  // Lazy initializer (bukan dihitung langsung di body render, yang tidak
  // boleh memanggil Date.now() -- react-hooks/purity) supaya booking yang
  // dibuka lama setelah tenggatnya lewat (mis. tautan lama dibuka lagi)
  // langsung dianggap kedaluwarsa sejak render pertama.
  const [clientExpired, setClientExpired] = useState(
    () => Date.now() >= new Date(expiresAt).getTime(),
  );
  const isTerminal = status !== "PENDING" || clientExpired;

  // Angka mm:ss yang berdetik. SENGAJA `null` sampai effect pertama jalan --
  // beda dari `clientExpired` di atas, nilai ini dirender jadi teks yang
  // hampir selalu berbeda tiap kali dihitung. Komponen ini ikut dirender di
  // SERVER (bagian dari page.tsx, bukan cuma dipasang belakangan lewat state
  // klien seperti payment-status.tsx dulu), jadi kalau dihitung langsung di
  // body render, HTML dari server dan hasil hydration di klien nyaris pasti
  // beda -> hydration mismatch. Menghitungnya hanya di dalam effect (murni
  // sisi klien, effect tidak pernah jalan saat render server) menghindari
  // itu; render pertama sebelum effect jalan cukup pakai deadline statis.
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  const refreshTriggeredRef = useRef(false);

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

  // Watchdog kedaluwarsa sisi klien -- terpisah dari polling supaya
  // transisi ke "waktu habis" terjadi tepat saat tenggat lewat, bukan
  // menunggu tick 3 detik berikutnya (atau menunggu cron pembatalan
  // benar-benar meng-update baris di database). Selalu lewat setTimeout
  // (bukan setClientExpired langsung di body effect) meski sisa waktunya
  // <= 0 -- react-hooks/set-state-in-effect melarang memanggil setState
  // sinkron langsung di body effect.
  useEffect(() => {
    if (isTerminal) return;

    const msLeft = new Date(currentExpiresAt).getTime() - Date.now();
    const timeout = setTimeout(() => setClientExpired(true), Math.max(msLeft, 0));
    return () => clearTimeout(timeout);
  }, [currentExpiresAt, isTerminal]);

  // Detak angka mm:ss yang ditampilkan -- terpisah lagi dari watchdog di
  // atas. Watchdog itu presisi ke milidetik lewat satu setTimeout, ini murni
  // kosmetik (angka yang dilihat pelanggan), jadi cukup interval 1 detik dan
  // SELALU dihitung ulang dari selisih waktu asli (currentExpiresAt vs
  // Date.now() saat itu juga) tiap tick -- bukan dikurangi 1 detik dari
  // nilai sebelumnya -- supaya tidak drift kalau tab sempat di-throttle
  // browser saat tidak aktif.
  useEffect(() => {
    if (isTerminal) return;

    function tick() {
      setRemainingMs(Math.max(new Date(currentExpiresAt).getTime() - Date.now(), 0));
    }
    tick();
    const interval = setInterval(tick, TICK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [currentExpiresAt, isTerminal]);

  // Begitu terminal, minta SERVER merender ulang halaman -- page.tsx yang
  // memutuskan tampilan PAID/kedaluwarsa/dibatalkan berdasarkan data
  // database yang sebenarnya, bukan state klien di sini. refreshTriggeredRef
  // mencegah router.refresh() dipanggil berkali-kali selama komponen ini
  // masih terpasang menunggu refresh selesai (mis. render ulang karena
  // currentExpiresAt berubah tidak memicu ini lagi).
  useEffect(() => {
    if (!isTerminal || refreshTriggeredRef.current) return;
    refreshTriggeredRef.current = true;
    router.refresh();
  }, [isTerminal, router]);

  if (isTerminal) {
    return (
      <div className="text-muted-foreground flex items-center justify-center gap-2 text-xs">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Memperbarui status booking...
      </div>
    );
  }

  const countdownLabel = remainingMs === null ? null : formatCountdown(remainingMs);
  const isUrgent = remainingMs !== null && remainingMs <= URGENT_THRESHOLD_MS;

  return (
    <div className="border-border flex flex-col gap-3 border p-4">
      <p className="text-sm text-pretty">
        Selesaikan pembayaran QRIS sebelum{" "}
        <span className="font-medium">{formatTime(currentExpiresAt)} WIB</span> agar slot ini tidak
        hangus.
        {countdownLabel ? (
          <>
            {" "}
            <span
              className={cn(
                "font-mono font-medium tabular-nums",
                isUrgent ? "text-destructive" : "text-foreground",
              )}
            >
              (tersisa {countdownLabel})
            </span>
          </>
        ) : null}
      </p>
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        {pollError ? "Gagal memeriksa status, mencoba lagi..." : "Memeriksa status pembayaran..."}
      </div>
    </div>
  );
}
