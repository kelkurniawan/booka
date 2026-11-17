"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { DateStrip } from "@/components/booking-page/date-strip";
import { StickyActionBar } from "@/components/booking-page/sticky-action-bar";
import { TimeSlotPicker, type TimeSlotState } from "@/components/booking-page/time-slot-picker";
import { Button } from "@/components/ui/button";
import { nextOpenDate, type DateStripDay } from "@/lib/booking/schedule";
import type { FreeSlot } from "@/lib/booking/slots";
import { formatDateTime, formatRupiah } from "@/lib/format";
import { ROUTES } from "@/lib/routes";

export function RescheduleForm({
  token, username, serviceId, staffId, partySize, serviceName, code, currentStart,
  earliestNewStart, left, max, paidAmount, strip,
}: {
  token: string;
  username: string;
  serviceId: string;
  staffId: string | null;
  /** Terisi untuk booking ber-jumlah tamu; slot reservasi dihitung dari angka ini. */
  partySize: number | null;
  serviceName: string;
  code: string;
  currentStart: string;
  earliestNewStart: string;
  left: number;
  max: number;
  /** null bila tidak ada pembayaran online. */
  paidAmount: number | null;
  strip: DateStripDay[];
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<FreeSlot | null>(null);
  const [slotState, setSlotState] = useState<TimeSlotState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneStart, setDoneStart] = useState<string | null>(null);

  // `requestIdRef` menjaga urutan: respons request lama tidak menimpa yang terbaru.
  const requestIdRef = useRef(0);

  async function loadSlots(dateISO: string) {
    const requestId = (requestIdRef.current += 1);
    setSlotState({ kind: "loading" });
    try {
      const params = new URLSearchParams({ username, serviceId, date: dateISO });
      if (staffId) params.set("staffId", staffId);
      if (partySize) params.set("party", String(partySize));
      const response = await fetch(`/api/slots?${params.toString()}`);
      if (!response.ok) throw new Error("Gagal memuat jadwal");
      const body = (await response.json()) as { slots: FreeSlot[] };
      if (requestIdRef.current !== requestId) return;
      // Keputusan 3: slot yang lebih dekat dari batas minimum tidak ditawarkan.
      const slots = body.slots.filter((slot) => Date.parse(slot.startUtc) >= Date.parse(earliestNewStart));
      setSlotState(
        slots.length === 0 ? { kind: "empty", nextDate: nextOpenDate(strip, dateISO) } : { kind: "ready", slots },
      );
    } catch {
      if (requestIdRef.current === requestId) setSlotState({ kind: "error" });
    }
  }

  function handleSelectDate(dateISO: string) {
    setSelectedDate(dateISO);
    setSelectedSlot(null);
    setError(null);
    void loadSlots(dateISO);
  }

  async function save() {
    if (!selectedSlot || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(ROUTES.bookingRescheduleApi(token), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startUtc: selectedSlot.startUtc }),
      });
      if (response.ok) {
        setDoneStart(selectedSlot.startUtc);
      } else {
        const body: unknown = await response.json().catch(() => null);
        setError(
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : "Gagal menyimpan. Coba lagi.",
        );
        // 409 (bentrok, terlalu dekat, sudah lewat): slot basi, muat ulang tanggal terpilih.
        if (response.status === 409 && selectedDate) {
          setSelectedSlot(null);
          void loadSlots(selectedDate);
        }
      }
    } catch {
      setError("Gagal menyimpan, periksa koneksi lalu coba lagi.");
    }
    setBusy(false);
  }

  if (doneStart) {
    return (
      <div role="status" className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Jadwal sudah diubah</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Sekarang {formatDateTime(doneStart)}. Pengingat ikut pindah.
        </p>
        <Button asChild className="min-h-11 w-full">
          <Link href={ROUTES.bookingStatus(token)}>Lihat booking</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link
          href={ROUTES.bookingStatus(token)}
          aria-label="Kembali ke booking Anda"
          className="-ml-3 inline-flex size-11 items-center justify-center"
        >
          <ChevronLeft aria-hidden className="size-5" />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Ubah jadwal</h1>
        <p className="text-muted-foreground text-sm">{`${serviceName}, ${code}`}</p>
        <p className="text-sm text-pretty">
          {paidAmount === null ? "Gratis." : `Gratis, pembayaran ${formatRupiah(paidAmount)} tetap berlaku.`}{" "}
          {left === 1 ? "Ini kesempatan ubah terakhir Anda." : `Sisa ${left} dari ${max} kali ubah jadwal.`}
        </p>
      </header>

      <section className="bg-card border-border flex flex-col gap-1 border p-4" style={{ borderRadius: "var(--radius)" }}>
        <h2 className="text-muted-foreground text-sm">Jadwal sekarang</h2>
        <p className="font-medium">{formatDateTime(currentStart)}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Tanggal baru</h2>
        <DateStrip days={strip} selected={selectedDate} onSelect={handleSelectDate} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Jam baru</h2>
        <TimeSlotPicker
          state={slotState}
          selected={selectedSlot?.startUtc ?? null}
          onSelect={setSelectedSlot}
          onRetry={() => selectedDate && void loadSlots(selectedDate)}
          onPickDate={handleSelectDate}
        />
      </section>

      {selectedSlot ? (
        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Dari</dt>
            <dd className="font-medium">{formatDateTime(currentStart)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Menjadi</dt>
            <dd className="font-medium">{formatDateTime(selectedSlot.startUtc)}</dd>
          </div>
        </dl>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-pretty">
          {error}
        </p>
      ) : null}
      <StickyActionBar
        summary={selectedSlot ? formatDateTime(selectedSlot.startUtc) : "Pilih jam baru"}
        actionLabel="Simpan jadwal baru"
        disabled={!selectedSlot}
        busy={busy}
        onAction={save}
      />
    </div>
  );
}
