"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { useDocumentHidden, useMotionAllowed } from "@/components/booking-page/use-motion-allowed";

import {
  LAYOUTS,
  LOOP_SECONDS,
  SETTLED_T,
  frameStyles,
  seek,
  stageScale,
  type FrameStyles,
  type LayoutName,
  type MotionLayout,
} from "./engine";

type Part = keyof FrameStyles;
const PARTS: Part[] = ["hero", "fill", "tip", "card1", "card2", "stamp", "pressedLayer", "button"];

const place = (a: readonly number[]): CSSProperties => ({
  position: "absolute", left: a[0], top: a[1], width: a[2], ...(a[3] ? { height: a[3] } : {}),
});

/** Panggung dekoratif: server merender frame diam, loop menulis gaya ke ref (tanpa setState per frame). */
export function HeroMotion({ layout, paused, host }: { layout: LayoutName; paused: boolean; host: string }) {
  const L: MotionLayout = LAYOUTS[layout];
  const allowed = useMotionAllowed();
  const hidden = useDocumentHidden();
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const timeText = useRef<HTMLSpanElement>(null);
  const t = useRef(SETTLED_T);
  const width = useRef(0);
  const lastTime = useRef("");
  const initial = frameStyles(seek(SETTLED_T, L), L);

  // Skala panggung dari lebar wadah; lebar 0 berarti disembunyikan CSS, loop tidak menulis.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      width.current = entry.contentRect.width;
      if (stage.current) stage.current.style.transform = `translateX(-50%) scale(${stageScale(width.current, layout).toFixed(4)})`;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout]);

  useEffect(() => {
    if (!allowed || hidden || paused) return;
    const els = PARTS.map((p) => [p, root.current?.querySelector<HTMLElement>(`[data-part="${p}"]`)] as const);
    let raf = 0;
    let last = 0;
    let idle = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = (now: number, start: number) => {
      raf = requestAnimationFrame((n) => loop(n, start));
      if (now - last < 33 || width.current === 0) return;
      last = now;
      t.current = ((now - start) / 1000) % LOOP_SECONDS;
      const f = seek(t.current, L);
      const styles = frameStyles(f, L);
      for (const [p, el] of els) {
        if (!el) continue;
        const s = styles[p];
        if (s.transform !== undefined) el.style.transform = s.transform;
        if (s.opacity !== undefined) el.style.opacity = s.opacity;
      }
      if (timeText.current && f.time !== lastTime.current) timeText.current.textContent = lastTime.current = f.time;
    };
    const begin = () => {
      const start = performance.now() - t.current * 1000;
      raf = requestAnimationFrame((n) => loop(n, start));
    };
    if ("requestIdleCallback" in window) idle = window.requestIdleCallback(begin);
    else timer = setTimeout(begin, 300);
    return () => {
      if (idle) window.cancelIdleCallback(idle);
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [allowed, hidden, paused, L]);

  return (
    <div ref={root} aria-hidden="true" className={`hm-root hm-${layout}`}>
      <div ref={stage} className="hm-stage" style={{ width: L.w, height: L.h }}>
        <div className="hm-card hm-s1" style={place(L.s1)}>
          <span className="hm-mono">{host}/riasbysekar</span>
          <span className="hm-btn" data-part="button" style={initial.button}>
            Pilih jadwal
            <span className="hm-btn-on" data-part="pressedLayer" style={initial.pressedLayer}>Pilih jadwal</span>
          </span>
        </div>

        <div style={place([L.s2[0], L.s2[1], L.s2[2], 70])}>
          <span className="hm-track" />
          <span className="hm-fill" data-part="fill" style={{ ...initial.fill, width: L.track }} />
          <span className="hm-tip" data-part="tip" style={initial.tip}><span ref={timeText}>{seek(SETTLED_T, L).time}</span></span>
          <span className="hm-label">Jadwal</span>
        </div>

        <div className="hm-card hm-note" data-part="card1" style={{ ...place(L.s3a), ...initial.card1 }}>
          <strong>Jadwal dikunci</strong><span className="hm-label-s">Sabtu 21 Nov, 10.00</span>
        </div>
        <div className="hm-card hm-note" data-part="card2" style={{ ...place(L.s3b), ...initial.card2 }}>
          <strong>DP masuk</strong><span className="hm-mono">Rp350.000</span>
        </div>

        <div className="hm-card hm-s4" style={place(L.s4)}>
          <span className="hm-strong">Rias by Sekar</span>
          <span className="hm-label-s">Makeup Wisuda, Sabtu 10.00</span>
          <span className="hm-rule" />
          <span className="hm-stamp" data-part="stamp" style={{ ...initial.stamp, fontSize: L.stampSize }}>Lunas</span>
        </div>

        <span className="hm-hero" data-part="hero" style={initial.hero} />
      </div>
    </div>
  );
}

/** Merakit latar lebar, intro, tombol jeda, pita HP, dan meja. Satu state jeda untuk kedua panggung. */
export function HeroMotionShell({ children, desk, host }: { children: ReactNode; desk: ReactNode; host: string }) {
  const [paused, setPaused] = useState(false);
  const allowed = useMotionAllowed();
  return (
    <div className="hm-shell">
      <div className="hero-motion-bg"><HeroMotion layout="wide" paused={paused} host={host} /></div>
      {children}
      {allowed && (
        <button type="button" className="hm-pause" onClick={() => setPaused((p) => !p)}>
          {paused ? "Putar animasi" : "Jeda animasi"}
        </button>
      )}
      <div className="hero-motion-band"><HeroMotion layout="compact" paused={paused} host={host} /></div>
      {desk}
    </div>
  );
}
