/**
 * Geometri denah. Satuan dan ukuran lapangan SAMA dengan `venueLayout()` di
 * src/lib/booking/court-ui.ts (86 x 210, putaran 0 atau 90), supaya lapangan
 * yang ditaruh di editor muncul di tempat yang sama di halaman publik.
 * Konstanta di court-ui.ts privat; geometry.test.ts menjaga keduanya sejalan.
 */
export const COURT_W = 86;
export const COURT_H = 210;
/** Batas atas koordinat di database (pos_x, pos_y antara 0 dan 4000). */
export const VENUE_MAX = 4000;
/** Kanvas editor minimal, dalam satuan yang sama. */
export const MIN_CANVAS = { w: 720, h: 560 } as const;
const STEP = 10;
const STEP_BIG = 50;

export type Rotation = 0 | 90;
export type Box = { x: number; y: number; w: number; h: number };

export function courtSize(rotation: Rotation): { w: number; h: number } {
  return rotation === 90 ? { w: COURT_H, h: COURT_W } : { w: COURT_W, h: COURT_H };
}

export function toggleRotation(r: Rotation): Rotation {
  return r === 90 ? 0 : 90;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max));
}

/** Kanvas membesar bila ada benda yang melewati ukuran minimal. */
export function canvasSize(boxes: Box[]): { w: number; h: number } {
  return {
    w: Math.min(VENUE_MAX, Math.max(MIN_CANVAS.w, ...boxes.map((b) => b.x + b.w + 24))),
    h: Math.min(VENUE_MAX, Math.max(MIN_CANVAS.h, ...boxes.map((b) => b.y + b.h + 24))),
  };
}

/** Menahan kotak tetap di dalam kanvas; hasil bilangan bulat. */
export function clampBox(b: Box, canvas: { w: number; h: number }): { x: number; y: number } {
  return { x: Math.round(clamp(b.x, 0, canvas.w - b.w)), y: Math.round(clamp(b.y, 0, canvas.h - b.h)) };
}

/** Panah menggeser 10; Shift + panah 50. Tombol lain mengembalikan null. */
export function nudge(b: Box, key: string, shift: boolean, canvas: { w: number; h: number }): { x: number; y: number } | null {
  const s = shift ? STEP_BIG : STEP;
  const d: Record<string, [number, number]> = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] };
  const v = d[key];
  return v ? clampBox({ ...b, x: b.x + v[0], y: b.y + v[1] }, canvas) : null;
}

/** Putar 90 derajat di tempat (pojok kiri atas tetap), lalu tahan di kanvas. */
export function rotateCourt(pos: { x: number; y: number }, rotation: Rotation, canvas: { w: number; h: number }) {
  const next = toggleRotation(rotation);
  const { w, h } = courtSize(next);
  return { rotation: next, ...clampBox({ x: pos.x, y: pos.y, w, h }, canvas) };
}

/** Tempat awal lapangan yang belum punya posisi: baris demi baris, enam per baris. */
export function defaultCourtSpot(index: number): { x: number; y: number } {
  return { x: 24 + (index % 6) * (COURT_W + 24), y: 24 + Math.floor(index / 6) * (COURT_H + 24) };
}

/** Teks aria tombol Putar, papan L6. */
export function rotateAria(name: string): string {
  return `Putar ${name} 90 derajat`;
}
