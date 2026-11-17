"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { groupSlotsByPeriod, SLOT_PERIOD_LABEL } from "@/lib/booking/schedule";
import type { FreeSlot } from "@/lib/booking/slots";
import { cn } from "@/lib/utils";

type Result = { kind: "error" } | { kind: "ready"; slots: FreeSlot[] };

/**
 * Pilih jam kosong dari /api/slots (sumber yang sama dengan halaman publik).
 * shortcut: /api/slots (peran anon) hanya menghitung meja online, sedangkan
 * create_manual_booking boleh memakai meja offline, jadi slot manual bisa
 * terlihat penuh padahal ada meja offline; naik kelas bila merchant mengeluh.
 */
export function SlotField({
  username,
  serviceId,
  staffId,
  partySize,
  dateISO,
  value,
  onChange,
  labelledBy,
}: {
  username: string;
  serviceId: string | null;
  staffId: string | null;
  /** Jumlah tamu layanan reservasi; diteruskan ke /api/slots sebagai `party`. */
  partySize?: number | null;
  dateISO: string;
  value: string | null;
  onChange: (startISO: string | null) => void;
  /** id elemen label untuk radiogroup. */
  labelledBy?: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const key = `${username}|${serviceId}|${staffId}|${partySize ?? ""}|${dateISO}|${attempt}`;
  // Hasil dikunci ke parameter kueri; kunci beda berarti masih memuat.
  const [result, setResult] = useState<(Result & { key: string }) | null>(null);
  const state = result && result.key === key ? result : ({ kind: "loading" } as const);

  useEffect(() => {
    if (!serviceId) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ username, serviceId, date: dateISO });
    if (staffId) params.set("staffId", staffId);
    if (partySize) params.set("party", String(partySize));
    fetch(`/api/slots?${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: { slots: FreeSlot[] }) => {
        setResult({ key, kind: "ready", slots: body.slots });
        if (value && !body.slots.some((s) => s.startUtc === value)) onChange(null);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setResult({ key, kind: "error" });
        onChange(null);
      });
    return () => controller.abort();
    // `value`/`onChange` sengaja di luar dependensi: fetch hanya mengikuti parameter kueri.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, serviceId, staffId, partySize, dateISO, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (!serviceId) return <p className="text-muted-foreground text-sm">Pilih layanan dulu.</p>;
  if (state.kind === "loading") {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {[0, 1, 2].map((row) => (
          <div key={row} className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((col) => (
              <Skeleton key={col} className="h-11" />
            ))}
          </div>
        ))}
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm">Gagal memuat jam.</p>
        <Button type="button" variant="outline" className="min-h-11" onClick={retry}>
          Coba lagi
        </Button>
      </div>
    );
  }
  if (state.slots.length === 0) {
    return <p className="text-muted-foreground text-sm">Tidak ada jam kosong di tanggal ini.</p>;
  }
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : "Jam"} className="flex flex-col gap-3">
      {groupSlotsByPeriod(state.slots).map(({ period, slots }) => (
        <div key={period} className="flex flex-col gap-2">
          <p className="text-sm font-medium">{SLOT_PERIOD_LABEL[period]}</p>
          <div className="grid grid-cols-3 gap-2">
            {slots.map((slot) => {
              const checked = value === slot.startUtc;
              return (
                <button
                  key={slot.startUtc}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => onChange(slot.startUtc)}
                  className={cn(
                    "focus-visible:ring-ring/50 min-h-11 rounded-md border text-sm outline-none focus-visible:ring-3",
                    checked ? "border-primary bg-primary text-primary-foreground font-medium" : "border-border bg-card",
                  )}
                >
                  {slot.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-muted-foreground text-xs">Waktu Indonesia Barat</p>
    </div>
  );
}
