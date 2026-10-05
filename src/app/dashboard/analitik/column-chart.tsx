"use client";

import { useState } from "react";

export type ColumnDatum = { key: string; label: string; value: number; display: string };

/** Rupiah ringkas untuk sumbu: 1,2 jt / 450 rb. */
function compactRupiah(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  }
  if (value >= 1_000) return `${Math.round(value / 1_000)} rb`;
  return `${value}`;
}

/**
 * Satuan sumbu sebagai string, bukan fungsi pemformat: grafik ini Client
 * Component, dan fungsi tidak bisa dioper dari Server Component.
 */
const TICK_FORMAT = {
  rupiah: compactRupiah,
  count: (value: number) => `${Math.round(value)}`,
} as const;

/** Angka sumbu yang "bersih": 1, 2, 2.5, 5 x 10^n. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * exponent;
}

/**
 * Grafik kolom satu seri. Satu seri berarti tanpa legenda -- judul kartu
 * yang menyebut apa yang diplot. Warna batang dari token netral dashboard
 * (--chart-2), teks selalu memakai token teks, bukan warna data.
 *
 * Nilai tiap batang muncul di tooltip saat hover atau fokus keyboard, dan
 * semua nilai tersedia di tabel di bawahnya -- grafik tidak pernah menjadi
 * satu-satunya jalan membaca angka.
 */
export function ColumnChart({
  data,
  unit,
  caption,
  height = 160,
}: {
  data: ColumnDatum[];
  unit: keyof typeof TICK_FORMAT;
  /** Kalimat ringkas untuk pembaca layar, mis. "Pendapatan per hari". */
  caption: string;
  height?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const formatTick = TICK_FORMAT[unit];
  // Jumlah booking selalu bulat; sumbu "0,5 booking" tidak masuk akal.
  const rawMax = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const max = unit === "count" ? Math.max(2, Math.ceil(rawMax / 2) * 2) : rawMax;
  const ticks = [max, max / 2, 0];
  // Label sumbu-x yang terlalu rapat saling bertabrakan; tampilkan secukupnya.
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));

  return (
    <figure className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div
          className="text-muted-foreground flex flex-col justify-between text-right text-[0.7rem] tabular-nums"
          style={{ height }}
          aria-hidden
        >
          {ticks.map((tick) => (
            <span key={tick} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {formatTick(tick)}
            </span>
          ))}
        </div>

        <div className="relative flex-1">
          {/* Garis bantu: rambut 1px, satu langkah dari permukaan. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden>
            {ticks.map((tick) => (
              <div key={tick} className="border-border border-t" />
            ))}
          </div>

          <div
            className="relative flex items-end justify-around gap-[2px]"
            style={{ height }}
            role="img"
            aria-label={caption}
            onMouseLeave={() => setActive(null)}
          >
            {data.map((datum, index) => {
              const barHeight = datum.value > 0 ? Math.max(2, (datum.value / max) * height) : 0;
              const isActive = active === index;
              return (
                <div
                  key={datum.key}
                  // Area hover selebar slot, bukan selebar batang -- batang
                  // tipis sulit dikenai kursor.
                  className="group relative flex h-full flex-1 items-end justify-center outline-none"
                  tabIndex={0}
                  onMouseEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                  aria-label={`${datum.label}: ${datum.display}`}
                >
                  <div
                    className={
                      isActive
                        ? "bg-foreground w-full max-w-6 rounded-t-[4px] transition-colors"
                        : "bg-chart-2 w-full max-w-6 rounded-t-[4px] transition-colors"
                    }
                    style={{ height: barHeight }}
                  />
                  {isActive ? (
                    <div className="bg-popover text-popover-foreground absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-md border px-2 py-1 text-xs whitespace-nowrap shadow-sm">
                      <div className="text-muted-foreground">{datum.label}</div>
                      <div className="font-medium">{datum.display}</div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="text-muted-foreground mt-1.5 flex justify-around gap-[2px] text-[0.7rem]" aria-hidden>
            {data.map((datum, index) => (
              // Lebar nol + overflow terlihat: label boleh meluber ke slot
              // tetangga yang memang dikosongkan (labelEvery), alih-alih
              // terpotong jadi "10..".
              <span key={datum.key} className="flex flex-1 justify-center">
                <span className="w-0 overflow-visible whitespace-nowrap flex justify-center">
                  {index % labelEvery === 0 ? datum.label : ""}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <details className="text-sm">
        <summary className="text-muted-foreground cursor-pointer text-xs">Lihat sebagai tabel</summary>
        <table className="mt-2 w-full text-left text-xs tabular-nums">
          <tbody>
            {data.map((datum) => (
              <tr key={datum.key} className="border-b last:border-0">
                <td className="py-1">{datum.label}</td>
                <td className="py-1 text-right">{datum.display}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
