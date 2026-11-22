/**
 * Satu-satunya sumber bentuk simbol Marky "Cap m" (spek
 * docs/superpowers/specs/2026-11-22-marky-logo-design.md). Dipakai komponen
 * React, skrip ikon (scripts/brand-icons.ts), dan gambar OG. Modul murni:
 * aman diimpor dari kode server, klien, dan tes.
 */

/** Huruf m yang dilubangi dari cap, dalam koordinat viewBox 0 0 100 100. */
export const MARK_PATH = "M22 79V43a14.5 14.5 0 0 1 29 0v36M51 43a14.5 14.5 0 0 1 29 0v36";
export const MARK_STROKE = 16;
/** Memperkecil m ke 56% lalu memusatkannya di cap. */
export const MARK_TRANSFORM = "translate(50 51) scale(.56) translate(-51 -49.75)";
export const CAP = { x: 14, y: 14, size: 72, rx: 18, rotate: -8 } as const;
export const CAP_TRANSFORM = `rotate(${CAP.rotate} 50 50)`;

/** Tinta dan kertas landing dalam hex: sharp dan Satori tidak membaca oklch. */
export const INK_HEX = "#1d1814";
export const PAPER_HEX = "#f7f3ef";

export type MarkSvgOptions = {
  /** Warna simbol. Bawaan tinta. */
  color?: string;
  /** Lebar dan tinggi dalam px; tanpa nilai, SVG mengikuti wadahnya. */
  size?: number;
  /** Id mask; wajib unik bila beberapa SVG digabung di satu dokumen. */
  maskId?: string;
  /** Berganti ke warna kertas saat prefers-color-scheme: dark (favicon). */
  adaptive?: boolean;
  /** Kotak latar (ikon aplikasi): simbol diperkecil `scale` di tengahnya. */
  tile?: { background: string; radius: number; scale: number };
};

export function markSvg({
  color = INK_HEX,
  size,
  maskId = "marky-cap",
  adaptive = false,
  tile,
}: MarkSvgOptions): string {
  const dims = size ? ` width="${size}" height="${size}"` : "";
  const style = adaptive
    ? `<style>.c{fill:${color}}@media (prefers-color-scheme: dark){.c{fill:${PAPER_HEX}}}</style>`
    : "";
  const mask =
    `<mask id="${maskId}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="140">` +
    `<rect x="-20" y="-20" width="140" height="140" fill="#fff"/>` +
    `<path d="${MARK_PATH}" fill="none" stroke="#000" stroke-width="${MARK_STROKE}" transform="${MARK_TRANSFORM}"/>` +
    `</mask>`;
  const cap =
    `<rect${adaptive ? ' class="c"' : ""} x="${CAP.x}" y="${CAP.y}" width="${CAP.size}" height="${CAP.size}" rx="${CAP.rx}" ` +
    `fill="${color}" mask="url(#${maskId})" transform="${CAP_TRANSFORM}"/>`;
  const body = tile
    ? `<rect width="100" height="100" rx="${tile.radius}" fill="${tile.background}"/>` +
      `<g transform="translate(50 50) scale(${tile.scale}) translate(-50 -50)">${cap}</g>`
    : cap;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${dims}>${style}<defs>${mask}</defs>${body}</svg>`;
}

export function markDataUri(options: MarkSvgOptions): string {
  return `data:image/svg+xml;base64,${Buffer.from(markSvg(options)).toString("base64")}`;
}
