"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  BENTUK_SHAPES,
  MOTION_SPEED_FACTOR,
  PARTIKEL_DOTS,
  motionAllowed,
  seekBentuk,
} from "@/lib/theme/motion";
import type { BackgroundMotion, MotionSpeed } from "@/types/database";
import { cn } from "@/lib/utils";

import styles from "./motion-background.module.css";
import { useDocumentHidden, useMedia, useSaveData } from "./use-motion-allowed";

export type MotionBackgroundProps = {
  preset: BackgroundMotion;
  speed: MotionSpeed;
  /** Paksa bingkai diam; untuk story dan sama perilakunya dengan reduced motion. */
  forceStatic?: boolean;
};

const GELOMBANG_PATHS = [
  "M0 100 Q 195 20 390 100 T 780 100 T 1170 100 T 1560 100 V200 H0Z",
  "M0 110 Q 195 40 390 110 T 780 110 T 1170 110 T 1560 110 V200 H0Z",
  "M0 120 Q 195 60 390 120 T 780 120 T 1170 120 T 1560 120 V200 H0Z",
];
const GELOMBANG_FILLS = [
  "var(--motion-a)",
  "var(--motion-b)",
  "var(--background)",
];

export function MotionBackground({
  preset,
  speed,
  forceStatic = false,
}: MotionBackgroundProps) {
  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)");
  const saveData = useSaveData();
  const hidden = useDocumentHidden();
  const [paused, setPaused] = useState(false);

  const boleh = motionAllowed({ reducedMotion, saveData }) && !forceStatic;
  const berjalan = boleh && !paused && !hidden;

  const shapeRefs = useRef<(HTMLSpanElement | null)[]>([]);
  // Waktu berjalan yang terkumpul (ms): jeda dan tab tersembunyi tidak dihitung.
  const elapsed = useRef(0);

  useEffect(() => {
    if (!berjalan || preset !== "BENTUK") return;
    let raf = 0;
    let last = performance.now();
    let lastWrite = 0;
    const factor = MOTION_SPEED_FACTOR[speed];
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      elapsed.current += now - last;
      last = now;
      if (now - lastWrite < 33) return;
      lastWrite = now;
      const t = elapsed.current / 1000 / factor;
      seekBentuk(t).forEach((tf, i) => {
        const el = shapeRefs.current[i];
        if (el) el.style.transform = tf;
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [berjalan, preset, speed]);

  const awal = seekBentuk(0);

  return (
    <>
      <div
        aria-hidden="true"
        className={cn(
          styles.layer,
          !berjalan && styles.paused,
          !boleh && styles.static,
        )}
      >
        {preset === "GELOMBANG"
          ? GELOMBANG_PATHS.map((d, i) => (
              <svg
                key={i}
                viewBox="0 0 1560 200"
                preserveAspectRatio="none"
                className={cn(
                  styles.wave,
                  styles[`wave${i + 1}`],
                  styles[`wv${i + 1}`],
                )}
              >
                <path d={d} fill={GELOMBANG_FILLS[i]} />
              </svg>
            ))
          : null}
        {/* Selain gelombang, pola diletakkan di kolom yang sama dengan isi halaman supaya tidak terdampar di pojok layar lebar. */}
        <div className="relative mx-auto h-full w-full max-w-[440px]">
          {preset === "AURORA"
            ? [1, 2, 3].map((n) => (
                <div key={n} className={cn(styles.blob, styles[`au${n}`])} />
              ))
            : null}
          {preset === "BENTUK"
            ? BENTUK_SHAPES.map((s, i) => (
                <span
                  key={i}
                  ref={(el) => {
                    shapeRefs.current[i] = el;
                  }}
                  className="absolute left-0 top-0"
                  style={{
                    width: s.size,
                    height: s.size,
                    borderRadius: s.rounded === "full" ? "9999px" : "28px",
                    background: `var(--motion-${s.tone})`,
                    willChange: "transform",
                    transform: awal[i],
                  }}
                />
              ))
            : null}
          {preset === "PARTIKEL"
            ? PARTIKEL_DOTS.map((d, i) => (
                <span
                  key={i}
                  className={styles.dot}
                  style={
                    {
                      left: `${d.leftPercent}%`,
                      width: d.size,
                      height: d.size,
                      background: `var(--motion-${d.tone})`,
                      "--d": `${d.durationSeconds}s`,
                      "--l": `${d.delaySeconds}s`,
                    } as React.CSSProperties
                  }
                />
              ))
            : null}
        </div>
      </div>
      {boleh ? (
        <button
          type="button"
          aria-pressed={paused}
          aria-label={paused ? "Putar animasi latar" : "Jeda animasi latar"}
          onClick={() => setPaused((p) => !p)}
          className="fixed right-2 top-2 z-30 flex size-11 items-center justify-center rounded-full border border-border bg-card/85 text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {paused ? (
            <Play aria-hidden className="size-4" />
          ) : (
            <Pause aria-hidden className="size-4" />
          )}
        </button>
      ) : null}
    </>
  );
}
