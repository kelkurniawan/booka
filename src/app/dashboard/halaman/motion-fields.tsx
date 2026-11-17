"use client";

import { Button } from "@/components/ui/button";
import { MOTION_LABELS } from "@/lib/theme/motion";
import { cn } from "@/lib/utils";
import type { BackgroundMotion, MotionSpeed } from "@/types/database";

const POLA = Object.keys(MOTION_LABELS) as BackgroundMotion[];
const KECEPATAN: { nilai: MotionSpeed; label: string }[] = [
  { nilai: "SLOW", label: "Pelan" },
  { nilai: "NORMAL", label: "Normal" },
];

export function MotionFields({
  motion,
  speed,
  onMotionChange,
  onSpeedChange,
}: {
  motion: BackgroundMotion;
  speed: MotionSpeed;
  onMotionChange: (value: BackgroundMotion) => void;
  onSpeedChange: (value: MotionSpeed) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Pola" className="grid grid-cols-2 gap-2">
        {POLA.map((pola) => (
          <button
            key={pola}
            type="button"
            role="radio"
            aria-checked={motion === pola}
            onClick={() => onMotionChange(pola)}
            className={cn(
              "border-border hover:bg-muted focus-visible:ring-ring/50 flex min-h-11 flex-col gap-0.5 rounded-lg border p-2 text-left outline-none focus-visible:ring-3",
              motion === pola && "ring-ring ring-2",
            )}
          >
            <span className="text-sm font-medium">{MOTION_LABELS[pola].label}</span>
            <span className="text-muted-foreground text-xs">{MOTION_LABELS[pola].hint}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Kecepatan</h3>
        <div className="flex gap-2">
          {KECEPATAN.map((k) => (
            <Button
              key={k.nilai}
              type="button"
              className="min-h-11"
              variant={speed === k.nilai ? "default" : "outline"}
              aria-pressed={speed === k.nilai}
              onClick={() => onSpeedChange(k.nilai)}
            >
              {k.label}
            </Button>
          ))}
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Pelanggan melihat tombol jeda di pojok kepala halaman. Gerakan berhenti sendiri saat
        &quot;kurangi gerakan&quot; atau hemat data aktif, dan saat tab tidak dilihat.
      </p>
    </div>
  );
}
