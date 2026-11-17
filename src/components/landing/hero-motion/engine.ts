// Mesin gerak HeroMotion, murni tanpa DOM. Diadaptasi dari explainer-engaging
// (Barty-Bart/motion-graphics, MIT): seek(t) fungsi waktu murni, loop mulus.
import { easeInOutCubic as ease } from "@/lib/theme/motion";

export const LOOP_SECONDS = 12;
/** Frame diam: slip sudah dicap Lunas. Dirender server dan dipakai saat gerak dilarang. */
export const SETTLED_T = 9.2;

export type LayoutName = "wide" | "compact";
export type Point = [number, number];
export type MotionLayout = {
  w: number; h: number; S1: Point; S2a: Point; S2b: Point; S3a: Point; S3b: Point; S4: Point;
  ap: [number, number, number, number, number]; track: number; stampSize: number;
  s1: [number, number, number]; s2: [number, number, number]; s3a: [number, number, number];
  s3b: [number, number, number]; s4: [number, number, number, number];
};

export const LAYOUTS: Record<LayoutName, MotionLayout> = {
  wide: {
    w: 1440, h: 760, S1: [245, 172], S2a: [100, 444], S2b: [360, 444], S3a: [1150, 142], S3b: [1230, 288], S4: [1205, 480],
    ap: [80, -40, 90, 230, -60], track: 260, stampSize: 30,
    s1: [120, 120, 250], s2: [90, 410, 280], s3a: [1060, 70, 220], s3b: [1140, 212, 220], s4: [1080, 470, 250, 130],
  },
  compact: {
    w: 390, h: 260, S1: [97, 84], S2a: [22, 204], S2b: [162, 204], S3a: [290, 30], S3b: [320, 96], S4: [292, 166],
    ap: [70, -10, 30, 100, -20], track: 140, stampSize: 22,
    s1: [12, 14, 170], s2: [12, 170, 180], s3a: [205, 10, 170], s3b: [215, 74, 165], s4: [206, 156, 176, 96],
  },
};

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const spring = (t: number, w: number, z: number) => {
  if (t <= 0) return 0;
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
};
// Parabola: x linear, y lewat titik puncak.
const arc = (p0: Point, p1: Point, apex: number, u: number): Point => {
  const c = 2 * apex - (p0[1] + p1[1]) / 2;
  return [lerp(p0[0], p1[0], u), (1 - u) * (1 - u) * p0[1] + 2 * (1 - u) * u * c + u * u * p1[1]];
};
const HITS = [0, 2.6, 6.6, 7.6, 8.8, 12];

export type MotionFrame = {
  p: Point; k: number; roll: number; time: string; c1: number; c2: number;
  stamp: 0 | 1; stampS: number; stampO: number; pressed: boolean;
};

export function seek(t: number, L: MotionLayout): MotionFrame {
  const { S1, S2a, S2b, S3a, S3b, S4, ap: A } = L;
  t = ((t % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS;
  let p: Point;
  if (t < 1) p = S1;
  else if (t < 2.6) p = arc(S1, S2a, A[0], seg(t, 1, 2.6));
  else if (t < 4.6) p = [lerp(S2a[0], S2b[0], ease(seg(t, 2.6, 4.6))), S2a[1]];
  else if (t < 6.6) p = arc(S2b, S3a, A[1], ease(seg(t, 4.6, 6.6)) * 0.6 + seg(t, 4.6, 6.6) * 0.4);
  else if (t < 7.6) p = arc(S3a, S3b, A[2], seg(t, 6.6, 7.6));
  else if (t < 8.8) p = arc(S3b, S4, A[3], seg(t, 7.6, 8.8));
  else if (t < 9.8) p = S4;
  else {
    const u = seg(t, 9.8, 12);
    p = arc(S4, S1, A[4], clamp(u + 0.1146 * Math.sin(2 * Math.PI * u)));
  }
  const k = clamp(Math.max(...HITS.map((h) => 1 - Math.abs(t - h) / 0.12)));
  const roll = t >= 2.6 && t < 4.6 ? seg(t, 2.6, 4.6) : t >= 4.6 && t < 10.4 ? 1 : t >= 10.4 && t < 11.2 ? 1 - seg(t, 10.4, 11.2) : 0;
  const mins = 480 + Math.round((ease(roll) * 120) / 30) * 30;
  const show = (a: number, b: number) => seg(t, a, a + 0.25) * (1 - seg(t, b, b + 0.3));
  const stamp = t >= 8.8 && t < 11.2 ? 1 : 0;
  return {
    p, k, roll: ease(roll),
    time: `${String(Math.floor(mins / 60)).padStart(2, "0")}.${String(mins % 60).padStart(2, "0")}`,
    c1: show(6.6, 10.6), c2: show(7.6, 10.8),
    stamp, stampS: 1.6 - 0.6 * spring(t - 8.8, 18, 0.55), stampO: stamp * (1 - seg(t, 10.9, 11.2)),
    pressed: t < 1.2 || t > 11.85,
  };
}

export type FrameStyles = Record<
  "hero" | "fill" | "tip" | "card1" | "card2" | "stamp" | "pressedLayer" | "button",
  { transform?: string; opacity?: string }
>;

/** Hanya transform dan opacity: tidak memicu layout atau paint per frame. */
export function frameStyles(f: MotionFrame, L: MotionLayout): FrameStyles {
  const card = (o: number, rot: number) => ({ opacity: o.toFixed(3), transform: `translateY(${((1 - o) * 14).toFixed(1)}px) rotate(${rot}deg)` });
  return {
    hero: { transform: `translate(${f.p[0].toFixed(1)}px, ${f.p[1].toFixed(1)}px) scale(${(1 + 0.25 * f.k).toFixed(3)}, ${(1 - 0.2 * f.k).toFixed(3)})` },
    fill: { transform: `scaleX(${f.roll.toFixed(4)})` },
    tip: { transform: `translateX(${(f.roll * L.track - 8).toFixed(1)}px)` },
    card1: card(f.c1, -2),
    card2: card(f.c2, 1.5),
    stamp: { opacity: f.stampO.toFixed(3), transform: `rotate(-8deg) scale(${(f.stamp ? f.stampS : 1).toFixed(3)})` },
    pressedLayer: { opacity: f.pressed ? "1" : "0" },
    button: { transform: f.pressed ? "translateY(2px)" : "none" },
  };
}

export function stageScale(containerWidth: number, layout: LayoutName): number {
  return layout === "wide" ? Math.min(1, containerWidth / 1440) : Math.min(1.2, containerWidth / 390);
}
