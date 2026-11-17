// Mesin gerak murni untuk latar halaman publik: tanpa DOM, tanpa React.
// Pola seek(t) dan keyframe diadaptasi dari Barty-Bart/motion-graphics (MIT).
// Keputusan 13: morf border-radius dari kanvas dibuang; hanya translate, rotate, scale.
import type { BackgroundMotion, MotionSpeed } from "@/types/database";

export const BENTUK_LOOP_SECONDS = 12;

export const MOTION_SPEED_FACTOR: Record<MotionSpeed, number> = {
  SLOW: 1.5,
  NORMAL: 1,
};

export const MOTION_LABELS: Record<BackgroundMotion, { label: string; hint: string }> = {
  BENTUK: { label: "Bentuk", hint: "Bentuk melayang dan berputar pelan" },
  GELOMBANG: { label: "Gelombang", hint: "Ombak pelan bergulir di bawah layar" },
  AURORA: { label: "Aurora", hint: "Cahaya lembut bergeser" },
  PARTIKEL: { label: "Partikel", hint: "Titik kecil melayang naik" },
};

export function easeInOutCubic(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

export type Keyframe = readonly [seconds: number, value: number];

export function keyframes(keys: readonly Keyframe[]): (t: number) => number {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    const last = keys[keys.length - 1];
    if (t >= last[0]) return last[1];
    for (let i = 1; i < keys.length; i++) {
      const [a, va] = keys[i - 1];
      const [b, vb] = keys[i];
      if (t <= b) return va + (vb - va) * easeInOutCubic((t - a) / (b - a));
    }
    return last[1];
  };
}

export type BentukShape = { size: number; rounded: "full" | "soft"; tone: "a" | "b" | "c" };

export const BENTUK_SHAPES: readonly BentukShape[] = [
  { size: 150, rounded: "full", tone: "a" },
  { size: 120, rounded: "soft", tone: "b" },
  { size: 90, rounded: "full", tone: "c" },
];

const BENTUK_TRACKS = [
  {
    x: keyframes([[0, 40], [4, 220], [8, 120], [12, 40]]),
    y: keyframes([[0, 60], [4, 30], [8, 150], [12, 60]]),
    s: keyframes([[0, 1], [6, 1.25], [12, 1]]),
  },
  {
    x: keyframes([[0, 230], [4, 90], [8, 260], [12, 230]]),
    y: keyframes([[0, 140], [4, 190], [8, 40], [12, 140]]),
    s: keyframes([[0, 1.1], [6, 0.85], [12, 1.1]]),
  },
  {
    x: keyframes([[0, 150], [6, 10], [12, 150]]),
    y: keyframes([[0, 210], [6, 100], [12, 210]]),
    s: keyframes([[0, 0.8], [3, 1.2], [6, 0.8], [9, 1.2], [12, 0.8]]),
  },
];

export function seekBentuk(t: number): string[] {
  const L = BENTUK_LOOP_SECONDS;
  const wrapped = ((t % L) + L) % L;
  return BENTUK_TRACKS.map((tr, i) => {
    const deg = (wrapped / L) * 360 * (i % 2 ? -1 : 1);
    return `translate(${tr.x(wrapped).toFixed(1)}px, ${tr.y(wrapped).toFixed(1)}px) rotate(${deg.toFixed(1)}deg) scale(${tr.s(wrapped).toFixed(3)})`;
  });
}

export type PartikelDot = {
  leftPercent: number;
  size: number;
  durationSeconds: number;
  delaySeconds: number;
  tone: "a" | "c";
};

export const PARTIKEL_DOTS: readonly PartikelDot[] = Array.from({ length: 14 }, (_, i) => ({
  leftPercent: (((i * 53) % 370) / 370) * 100,
  size: 6 + ((i * 7) % 12),
  durationSeconds: 7 + (i % 5) * 2,
  delaySeconds: -(i * 0.9),
  tone: i % 3 ? "a" : "c",
}));

export function motionAllowed(env: { reducedMotion: boolean; saveData: boolean }): boolean {
  return !env.reducedMotion && !env.saveData;
}
