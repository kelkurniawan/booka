/**
 * Perhitungan warna untuk tema halaman publik.
 *
 * Semuanya fungsi murni tanpa DOM supaya bisa dipanggil di server, di klien,
 * dan diuji lewat `npm run test:unit`. Rumus luminansi dan rasio kontras
 * mengikuti WCAG 2.1.
 */

export type Rgb = { r: number; g: number; b: number };

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function hexToRgb(hex: string): Rgb {
  if (!HEX_PATTERN.test(hex)) {
    throw new Error(`Warna hex tidak valid: ${hex}`);
  }
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const bagian = (nilai: number) =>
    Math.max(0, Math.min(255, Math.round(nilai))).toString(16).padStart(2, "0");
  return `#${bagian(r)}${bagian(g)}${bagian(b)}`;
}

/** Kanal sRGB dilinearkan sebelum ditimbang -- bukan rata-rata biasa. */
function kanalLinear(nilai: number): number {
  const rasio = nilai / 255;
  return rasio <= 0.04045 ? rasio / 12.92 : ((rasio + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (
    0.2126 * kanalLinear(r) + 0.7152 * kanalLinear(g) + 0.0722 * kanalLinear(b)
  );
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const terang = Math.max(la, lb);
  const gelap = Math.min(la, lb);
  return (terang + 0.05) / (gelap + 0.05);
}

export function isDark(hex: string): boolean {
  return relativeLuminance(hex) < 0.18;
}

/** Warna teks yang terbaca di atas `background`. */
export function readableOn(background: string): "#ffffff" | "#111111" {
  return contrastRatio("#ffffff", background) >= contrastRatio("#111111", background)
    ? "#ffffff"
    : "#111111";
}

function campur(dari: Rgb, ke: Rgb, rasio: number): Rgb {
  return {
    r: dari.r + (ke.r - dari.r) * rasio,
    g: dari.g + (ke.g - dari.g) * rasio,
    b: dari.b + (ke.b - dari.b) * rasio,
  };
}

/**
 * Menggeser `color` ke arah hitam atau putih secukupnya sampai kontrasnya
 * terhadap `background` memenuhi `minRatio`.
 *
 * Arahnya ditentukan oleh latar, bukan oleh warnanya sendiri: di atas latar
 * terang warna digelapkan, di atas latar gelap dicerahkan. Ini yang membuat
 * merchant tetap bisa memakai kuning cerah sebagai warna tombol tanpa pernah
 * menghasilkan tulisan yang hilang.
 */
export function ensureContrast(
  color: string,
  background: string,
  minRatio = 4.5,
): string {
  if (contrastRatio(color, background) >= minRatio) {
    return color;
  }

  const asal = hexToRgb(color);
  const tujuan: Rgb = isDark(background)
    ? { r: 255, g: 255, b: 255 }
    : { r: 0, g: 0, b: 0 };

  const LANGKAH = 20;
  for (let i = 1; i <= LANGKAH; i += 1) {
    const kandidat = rgbToHex(campur(asal, tujuan, i / LANGKAH));
    if (contrastRatio(kandidat, background) >= minRatio) {
      return kandidat;
    }
  }

  // Ujung skala: hitam pekat atau putih penuh. Kalau ini pun tidak cukup,
  // backgroundnya sendiri yang bermasalah dan tidak ada warna yang menolong.
  return rgbToHex(tujuan);
}
