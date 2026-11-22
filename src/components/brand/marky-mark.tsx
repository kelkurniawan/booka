import { useId } from "react";

import { CAP, CAP_TRANSFORM, MARK_PATH, MARK_STROKE, MARK_TRANSFORM } from "@/lib/brand/mark";
import { cn } from "@/lib/utils";

import { loaderLabel, maskIdFromReactId } from "./mark-ids";

/**
 * Simbol Marky "Cap m", satu warna (currentColor). Bentuknya dari
 * src/lib/brand/mark.ts, sumber yang sama dengan favicon dan gambar OG.
 * Tanpa `title` simbol dianggap hiasan; dengan `title` jadi gambar berlabel.
 */
export function MarkyMark({ className, title }: { className?: string; title?: string }) {
  const maskId = maskIdFromReactId(useId());
  const a11y = title
    ? ({ role: "img", "aria-label": title } as const)
    : ({ "aria-hidden": true } as const);
  return (
    <svg viewBox="0 0 100 100" className={cn("shrink-0", className)} {...a11y}>
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="140">
          <rect x="-20" y="-20" width="140" height="140" fill="#fff" />
          <path
            d={MARK_PATH}
            fill="none"
            stroke="#000"
            strokeWidth={MARK_STROKE}
            transform={MARK_TRANSFORM}
          />
        </mask>
      </defs>
      <rect
        x={CAP.x}
        y={CAP.y}
        width={CAP.size}
        height={CAP.size}
        rx={CAP.rx}
        fill="currentColor"
        mask={`url(#${maskId})`}
        transform={CAP_TRANSFORM}
      />
    </svg>
  );
}

/**
 * Simbol + tulisan "marky". Ukurannya mengikuti font-size induk: simbol
 * 1,05 kali tinggi huruf, jarak 0,3 em (spek logo).
 */
export function MarkyLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-[0.3em] leading-none", className)}>
      <MarkyMark className="size-[1.05em]" />
      <span className="font-[family-name:var(--font-wordmark),var(--font-general-sans),ui-sans-serif,system-ui,sans-serif] font-bold tracking-[-0.05em]">
        marky
      </span>
    </span>
  );
}

/**
 * Loading layar penuh: cap ditekan lalu lepas (kelas marky-cap-press di
 * globals.css, berhenti saat prefers-reduced-motion). Untuk isi halaman tetap
 * pakai skeleton.
 */
export function MarkyLoader({ label }: { label?: string }) {
  const { text, visible } = loaderLabel(label);
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-4">
      <MarkyMark className="marky-cap-press size-14" />
      <span className={visible ? "text-muted-foreground text-sm" : "sr-only"}>{text}</span>
    </div>
  );
}
