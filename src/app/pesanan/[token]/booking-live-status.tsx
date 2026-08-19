"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { formatCountdown } from "@/lib/booking/countdown";
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
  /**
   * Blok QR + nominal + instruksi pindai, dirender oleh PendingPayment
   * (Server Component, page.tsx) dan diteruskan sebagai children -- BUKAN
   * dirender ulang di sini. Alasannya dua: (1) QrisCode adalah Server
   * Component async yang tidak bisa dipanggil dari komponen client seperti
   * ini, dan (2) begitu SERVER mengonfirmasi status terminal, komponen ini
   * WAJIB berhenti menampilkan children sama sekali -- lihat cabang
   * isServerTerminal di bawah -- supaya kode QR yang sudah dibayar tidak
   * terus terlihat mengundang dipindai lagi selama round-trip
   * router.refresh() (atau lebih lama lagi kalau itu macet, lihat I3/I4 di
   * catatan review).
   */
  children: React.ReactNode;
};

/**
 * Bagian "menunggu pembayaran" di /pesanan/[token] -- pola polling +
 * watchdog kedaluwarsa sisi klien DIPINDAH dari
 * src/app/[username]/payment-status.tsx (interval dibersihkan di cleanup,
 * watchdog `setTimeout` terpisah, `useState` lazy initializer karena aturan
 * react-hooks/purity), bukan ditulis ulang.
 *
 * Bedanya dengan versi lama: begitu SERVER mengonfirmasi status terminal
 * (PAID/CANCELLED lewat polling), komponen ini TIDAK merender layar
 * sukses/gagalnya sendiri -- itu tanggung jawab page.tsx (Server Component)
 * lewat `router.refresh()`, supaya tampilan PAID/kedaluwarsa/dibatalkan
 * SELALU berasal dari data database yang sebenarnya, bukan state klien yang
 * bisa diam-diam berbeda kalau mis. dua tab dibuka bersamaan.
 *
 * PENTING soal jam kedaluwarsa: `clientExpired` (watchdog sisi klien, lihat
 * di bawah) HANYA mengubah TAMPILAN, TIDAK PERNAH menghentikan polling atau
 * memicu router.refresh() sendirian. Kalau jam perangkat pelanggan lebih
 * cepat dari jam server (atau pas kena race di detik yang sama), server
 * yang jadi wasit satu-satunya soal "sudah benar-benar terminal atau
 * belum" -- bukan jam klien yang tidak bisa dipercaya. Versi sebelumnya
 * memakai `clientExpired` untuk MENGHENTIKAN polling juga, yang berarti
 * kalau jam klien salah duga duluan, polling berhenti untuk selamanya dan
 * layar ini macet di "Memperbarui status booking..." walau pelanggan sudah
 * benar-benar membayar -- itu bug yang diperbaiki di sini.
 */
export function BookingLiveStatus({ bookingId, expiresAt, children }: BookingLiveStatusProps) {
  const router = useRouter();

  const [status, setStatus] = useState<PollStatus>("PENDING");
  const [currentExpiresAt, setCurrentExpiresAt] = useState(expiresAt);
  const [pollError, setPollError] = useState(false);
  // Lazy initializer (bukan dihitung langsung di body render, yang tidak
  // boleh memanggil Date.now() -- react-hooks/purity) supaya booking yang
  // dibuka lama setelah tenggatnya lewat (mis. tautan lama dibuka lagi)
  // langsung dianggap kedaluwarsa (secara TAMPILAN, lihat komentar di atas)
  // sejak render pertama.
  const [clientExpired, setClientExpired] = useState(
    () => Date.now() >= new Date(expiresAt).getTime(),
  );

  // Satu-satunya sumber kebenaran untuk "sudah terminal" -- HANYA dari
  // status yang dikembalikan server lewat polling. `clientExpired` di atas
  // SENGAJA tidak ikut menentukan ini (lihat komentar besar di atas
  // komponen ini).
  const isServerTerminal = status !== "PENDING";

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

  // Jaring pengaman TERAKHIR kalau router.refresh() gagal diam-diam (I3) --
  // beda dari refreshTriggeredRef di atas (menjaga router.refresh() otomatis
  // di effect di bawah cuma terpanggil sekali), state ini murni menjaga
  // TOMBOL manualnya sendiri tidak bisa dipencet dobel sambil reload
  // sebelumnya masih berjalan.
  const [reloading, setReloading] = useState(false);

  function handleManualReload() {
    if (reloading) return;
    setReloading(true);
    // window.location.reload() SENGAJA dipakai di sini, BUKAN
    // router.refresh() lagi -- ini tombol jalan keluar untuk kasus
    // router.refresh() (di effect bawah) sudah gagal/macet. Memanggil
    // mekanisme yang sama yang baru saja gagal bukan jalan keluar
    // sungguhan. Navigasi full-page ini melewati Next.js router sama
    // sekali, jadi tidak bisa ikut macet dengan cara yang sama.
    window.location.reload();
  }

  // Polling itu sendiri -- berhenti (tidak memasang interval baru) HANYA
  // begitu SERVER sudah mengonfirmasi status terminal. Kalau cuma jam klien
  // yang menduga sudah lewat tenggat (clientExpired), polling TETAP jalan --
  // itu satu-satunya cara mendeteksi PAID yang sebenarnya kalau jam
  // pelanggan meleset, atau kalau pembayarannya masuk tepat di detik-detik
  // terakhir sebelum cron pembatalan sempat jalan.
  useEffect(() => {
    if (isServerTerminal) return;

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
  }, [bookingId, isServerTerminal]);

  // Watchdog kedaluwarsa sisi klien -- terpisah dari polling. HANYA
  // mengubah tampilan (lihat `clientExpired` di JSX di bawah), TIDAK
  // menghentikan polling ataupun memicu refresh -- itu tanggung jawab
  // `isServerTerminal`. Selalu lewat setTimeout (bukan setClientExpired
  // langsung di body effect) meski sisa waktunya <= 0 --
  // react-hooks/set-state-in-effect melarang memanggil setState sinkron
  // langsung di body effect.
  useEffect(() => {
    if (isServerTerminal || clientExpired) return;

    const msLeft = new Date(currentExpiresAt).getTime() - Date.now();
    const timeout = setTimeout(() => setClientExpired(true), Math.max(msLeft, 0));
    return () => clearTimeout(timeout);
  }, [currentExpiresAt, isServerTerminal, clientExpired]);

  // Detak angka mm:ss yang ditampilkan -- terpisah lagi dari watchdog di
  // atas. Berhenti begitu clientExpired (angkanya sudah mentok 0, tidak ada
  // gunanya terus dihitung) ATAU server sudah terminal. Watchdog itu
  // presisi ke milidetik lewat satu setTimeout, ini murni kosmetik (angka
  // yang dilihat pelanggan), jadi cukup interval 1 detik dan SELALU
  // dihitung ulang dari selisih waktu asli (currentExpiresAt vs Date.now()
  // saat itu juga) tiap tick -- bukan dikurangi 1 detik dari nilai
  // sebelumnya -- supaya tidak drift kalau tab sempat di-throttle browser
  // saat tidak aktif.
  useEffect(() => {
    if (isServerTerminal || clientExpired) return;

    function tick() {
      setRemainingMs(Math.max(new Date(currentExpiresAt).getTime() - Date.now(), 0));
    }
    tick();
    const interval = setInterval(tick, TICK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [currentExpiresAt, isServerTerminal, clientExpired]);

  // Begitu SERVER (bukan jam klien) mengonfirmasi terminal, minta server
  // merender ulang halaman -- page.tsx yang memutuskan tampilan
  // PAID/kedaluwarsa/dibatalkan berdasarkan data database yang sebenarnya.
  // refreshTriggeredRef mencegah router.refresh() dipanggil berkali-kali
  // otomatis selama komponen ini masih terpasang menunggu refresh selesai.
  useEffect(() => {
    if (!isServerTerminal || refreshTriggeredRef.current) return;
    refreshTriggeredRef.current = true;
    router.refresh();
  }, [isServerTerminal, router]);

  if (isServerTerminal) {
    // children (blok QR + nominal + instruksi pindai) SENGAJA TIDAK
    // dirender di cabang ini -- lihat komentar children di
    // BookingLiveStatusProps. Begitu server bilang statusnya sudah
    // terminal, tidak ada alasan apa pun pelanggan masih perlu (atau
    // boleh) memindai kode itu lagi -- entah statusnya berakhir PAID
    // (sudah lunas, memindai lagi berisiko membayar dua kali karena
    // payload QRIS tidak dijamin sekali-pakai dan sistem ini belum punya
    // jalur refund) atau CANCELLED (kodenya sudah tidak valid).
    return (
      <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-xs">
        <div className="flex items-center gap-2">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Memperbarui status booking...
        </div>
        {/* Jaring pengaman SUNGGUHAN (I3) -- router.refresh() di atas cuma
            dipicu SEKALI (refreshTriggeredRef), dan kalau panggilan itu
            gagal diam-diam ATAU balik dengan tree yang masih basi (server
            component tidak remount, refreshTriggeredRef tetap terpasang),
            memanggil router.refresh() LAGI dari tombol ini tidak menolong --
            itu mekanisme yang sama yang baru saja gagal. window.location.
            reload() melewati Next.js router sama sekali (navigasi
            full-page sungguhan), jadi tidak bisa macet dengan cara yang
            sama. disabled+label berubah mencegah dobel klik menumpuk dua
            reload sekaligus. */}
        <button
          type="button"
          onClick={handleManualReload}
          disabled={reloading}
          className="text-foreground underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
        >
          {reloading ? "Memuat ulang..." : "Muat ulang halaman"}
        </button>
      </div>
    );
  }

  const countdownLabel = remainingMs === null ? null : formatCountdown(remainingMs);
  const isUrgent = remainingMs !== null && remainingMs <= URGENT_THRESHOLD_MS;

  return (
    <div className="flex flex-col gap-6">
      {children}

      <div className="border-border flex flex-col gap-3 border p-4">
        {clientExpired ? (
          // Jam PERANGKAT PELANGGAN menduga tenggat sudah lewat, tapi server
          // (lewat polling) belum mengonfirmasi status terminal apa pun --
          // ini kondisi jam klien meleset (lebih cepat dari server) atau
          // pembayaran masuk tepat di detik-detik terakhir. Polling TETAP
          // jalan di latar belakang (lihat komentar besar di atas komponen),
          // jadi pesan di sini menjelaskan itu, bukan menampilkan hitung
          // mundur negatif yang membingungkan.
          <p className="text-sm text-pretty">
            Waktu pembayaran menurut perangkatmu sudah lewat. Kami masih memeriksa status
            pembayaran terakhir -- kalau kamu sudah membayar, jangan tutup halaman ini dulu.
          </p>
        ) : (
          <p className="text-sm text-pretty">
            Selesaikan pembayaran QRIS sebelum{" "}
            <span className="font-medium">{formatTime(currentExpiresAt)} WIB</span> agar slot ini
            tidak hangus.
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
        )}
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {pollError ? "Gagal memeriksa status, mencoba lagi..." : "Memeriksa status pembayaran..."}
        </div>
      </div>
    </div>
  );
}
