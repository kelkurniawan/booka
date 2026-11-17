import { contrastRatio, relativeLuminance } from "./color";
import type { ResolvedTheme } from "./types";

/** Pesan netral untuk editor: apakah teks tombol disesuaikan agar tetap terbaca. */
export function buttonContrastMessage(theme: ResolvedTheme): {
  adjusted: boolean;
  message: string;
} {
  const rasio = contrastRatio(theme.buttonText, theme.buttonFill)
    .toFixed(1)
    .replace(".", ",");
  const adjusted = theme.buttonStyle !== "FILLED" && theme.buttonText !== theme.accentFill;
  if (!adjusted) {
    return {
      adjusted,
      message: `Teks tombol terbaca jelas (kontras ${rasio}:1). Lolos standar WCAG AA.`,
    };
  }
  const arah =
    relativeLuminance(theme.buttonText) < relativeLuminance(theme.accentFill)
      ? "gelap"
      : "terang";
  return {
    adjusted,
    message: `Warna aksen kurang kontras untuk teks tombol. Marky otomatis memakai warna teks yang lebih ${arah} (kontras ${rasio}:1).`,
  };
}
