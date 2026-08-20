import type { CSSProperties } from "react";

import { FONT_PAIR_VARS } from "./font-pairs";
import type { ResolvedTheme } from "./types";

/**
 * Ukuran dasar Tailwind v4 dalam rem, sebelum dikalikan skala teks merchant.
 * Nilainya harus sama dengan node_modules/tailwindcss/theme.css.
 */
const UKURAN_DASAR = {
  "--text-xs": 0.75,
  "--text-sm": 0.875,
  "--text-base": 1,
  "--text-lg": 1.125,
  "--text-xl": 1.25,
  "--text-2xl": 1.5,
} as const;

/**
 * Menerjemahkan tema jadi CSS custom property untuk dipasang inline pada satu
 * elemen pembungkus.
 *
 * Komponen shadcn membaca `--background`, `--foreground`, `--radius`, dan
 * kawan-kawan lewat `var(--...)`, jadi menimpanya di sini membuat semuanya ikut
 * bertema tanpa satu komponen pun diubah. Hal yang sama berlaku untuk ukuran
 * teks: `text-sm` mengompilasi jadi
 * `font-size:var(--text-sm);line-height:var(--tw-leading,var(--text-sm--line-height))`,
 * dan tinggi barisnya rasio tanpa satuan sehingga menyesuaikan sendiri.
 */
export function themeToCssVars(theme: ResolvedTheme): CSSProperties {
  const font = FONT_PAIR_VARS[theme.fontPair];

  const ukuran: Record<string, string> = {};
  for (const [nama, rem] of Object.entries(UKURAN_DASAR)) {
    ukuran[nama] = `${rem * theme.scale}rem`;
  }

  const vars: Record<string, string> = {
    "--background": theme.background,
    "--foreground": theme.foreground,
    "--card": theme.card,
    "--card-foreground": theme.foreground,
    "--popover": theme.card,
    "--popover-foreground": theme.foreground,
    "--muted": theme.card,
    "--muted-foreground": theme.mutedForeground,
    "--border": theme.border,
    "--input": theme.border,
    "--ring": theme.accentFill,
    "--primary": theme.accentFill,
    "--primary-foreground": theme.accentForeground,
    "--accent-fill": theme.accentFill,
    "--accent-text": theme.accentText,
    "--radius": theme.radius,
    "--font-sans": font.body,
    "--font-heading": font.heading,
    ...ukuran,
  };

  if (theme.backgroundStyle === "IMAGE") {
    vars["--page-overlay"] = String(theme.backgroundOverlay / 100);
  }

  return vars as CSSProperties;
}
