"use client";

import { useState } from "react";

import { courtPrice, durationOptions, formatDuration, type CourtPriceRule } from "@/lib/booking/court";
import { formatRupiah } from "@/lib/format";

import { dotted } from "./peak-pricing-editor";

const DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
// Senin 2026-11-16; hari ke-d jatuh pada tanggal 15 + d. courtPrice hanya butuh hari dalam pekan.
const dateFor = (d: number) => `2026-11-${15 + d}`;

/** "Cek harga": memakai courtPrice TS yang sama dengan halaman publik. */
export function PriceChecker({
  basePerHour,
  rules,
  unit,
  minMinutes,
  maxMinutes,
}: {
  basePerHour: number;
  rules: CourtPriceRule[];
  unit: 30 | 60;
  minMinutes: number;
  maxMinutes: number;
}) {
  const [day, setDay] = useState(6);
  const [start, setStart] = useState("16:30");
  const [len, setLen] = useState(90);

  const starts: string[] = [];
  for (let m = 6 * 60; m < 24 * 60; m += unit) {
    starts.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  const lens = durationOptions({ minMinutes, maxMinutes, unitMinutes: unit });
  // Pilihan yang tidak lagi ada setelah unit atau batas berubah diganti yang terdekat.
  const startNow = starts.includes(start) ? start : starts[0];
  const lenNow = lens.includes(len) ? len : (lens[0] ?? minMinutes);

  const { total, segments } = courtPrice({
    basePerHour,
    rules,
    dateISO: dateFor(day),
    startHHMM: startNow,
    durationMinutes: lenNow,
    unitMinutes: unit,
  });
  const sel = "h-9 w-full rounded-lg border bg-background px-2.5 text-sm";

  return (
    <aside aria-labelledby="cek-h" className="flex flex-col gap-3 rounded-xl border p-4">
      <h3 id="cek-h" className="text-sm font-semibold">Cek harga</h3>
      <p className="text-muted-foreground text-[13px]">Harga yang akan dilihat pelanggan, dihitung dari aturan di atas.</p>
      <div className="flex flex-wrap gap-2">
        <label className="flex flex-1 basis-24 flex-col gap-1">
          <span className="text-muted-foreground text-xs">Hari</span>
          <select className={sel} value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {DAYS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
          </select>
        </label>
        <label className="flex flex-1 basis-24 flex-col gap-1">
          <span className="text-muted-foreground text-xs">Mulai</span>
          <select className={sel} value={startNow} onChange={(e) => setStart(e.target.value)}>
            {starts.map((s) => <option key={s} value={s}>{dotted(s)}</option>)}
          </select>
        </label>
        <label className="flex flex-1 basis-24 flex-col gap-1">
          <span className="text-muted-foreground text-xs">Lama</span>
          <select className={sel} value={lenNow} onChange={(e) => setLen(Number(e.target.value))}>
            {lens.map((m) => <option key={m} value={m}>{formatDuration(m)}</option>)}
          </select>
        </label>
      </div>
      <dl className="flex flex-col gap-1.5 border-t pt-2.5 text-sm">
        {segments.map((s) => (
          <div key={s.fromHHMM} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">
              {dotted(s.fromHHMM)} sampai {dotted(s.toHHMM)}, {s.peak ? "jam ramai" : "harga biasa"}
            </dt>
            <dd>{formatRupiah(Math.round((s.pricePerHour * s.minutes) / 60))}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-2 border-t pt-1.5 font-semibold">
          <dt>Total</dt>
          <dd>{formatRupiah(total)}</dd>
        </div>
      </dl>
    </aside>
  );
}
