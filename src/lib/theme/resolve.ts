import type { MerchantTheme, SubscriptionTier, TextScale } from "@/types/database";

import { ensureContrast, isDark, mixHex, readableOn } from "./color";
import { CORNER_RADIUS, isFreePreset, THEME_PRESETS } from "./presets";
import type { ResolvedTheme } from "./types";

const SKALA_TEKS: Record<TextScale, number> = {
  KECIL: 0.9375,
  SEDANG: 1,
  BESAR: 1.125,
};

/**
 * Overlay minimum saat background berupa foto. Di bawah ini, teks di atas foto
 * yang ramai praktis tidak terbaca, dan tidak ada warna teks yang menolong.
 */
const OVERLAY_MINIMUM = 40;

/**
 * Menggabungkan preset dengan penimpaan merchant menjadi tema yang siap
 * dirender.
 *
 * Pemangkasan nilai premium di sini BUKAN duplikasi trigger
 * `merchant_themes_enforce_tier`. Trigger tidak pernah menyala saat merchant
 * PRO turun ke STARTER -- barisnya sudah terlanjur premium dan tidak ada UPDATE
 * yang terjadi. Trigger menjaga data tetap bersih saat ditulis; fungsi ini
 * menjaga tampilan tetap benar saat dibaca.
 */
export function resolveTheme(
  tier: SubscriptionTier,
  row: MerchantTheme | null,
): ResolvedTheme {
  const starter = tier === "STARTER";

  const presetDiminta = row?.preset ?? "BERSIH";
  const preset = starter && !isFreePreset(presetDiminta) ? "BERSIH" : presetDiminta;
  const def = THEME_PRESETS[preset];

  // Null berarti "ikut preset" -- lihat komentar kolom di migration.
  const cornerStyle = row?.corner_style ?? def.corner;
  const fontPair = starter ? def.fontPair : (row?.font_pair ?? def.fontPair);
  const textScale = starter ? "SEDANG" : (row?.text_scale ?? "SEDANG");

  const gayaDiminta = starter ? "SOLID" : (row?.background_style ?? "SOLID");
  const pathGambar = starter ? null : (row?.background_image_path ?? null);
  // Background bergambar tanpa gambar akan merender kotak kosong. Constraint DB
  // sudah menolak kombinasi ini, tapi baris lama milik merchant yang turun
  // paket bisa saja lolos -- jadi dijaga lagi di sini.
  const backgroundStyle =
    gayaDiminta === "IMAGE" && pathGambar === null ? "SOLID" : gayaDiminta;

  const backgroundPilihan = starter ? null : (row?.background_color ?? null);
  const background = backgroundPilihan ?? def.background;

  // Saat background berupa foto, teks sebenarnya duduk di atas overlay berwarna
  // background preset -- itulah permukaan yang menentukan kontras, bukan fotonya.
  const permukaan = backgroundStyle === "IMAGE" ? def.background : background;

  const accentFill = starter ? def.accent : (row?.accent ?? def.accent);

  return {
    preset,
    colorMode: isDark(permukaan) ? "GELAP" : "TERANG",
    background,
    // Merchant boleh mengganti warna background tanpa mengganti preset, jadi
    // warna teks preset belum tentu masih kontras. Digeser secukupnya.
    foreground: ensureContrast(def.foreground, permukaan, 4.5),
    card: backgroundPilihan ?? def.card,
    mutedForeground: ensureContrast(def.mutedForeground, permukaan, 3),
    border: ensureContrast(def.border, permukaan, 1.3),
    accentFill,
    accentText: ensureContrast(accentFill, permukaan, 4.5),
    accentForeground: readableOn(accentFill),
    radius: CORNER_RADIUS[cornerStyle],
    cornerStyle,
    fontPair,
    textScale,
    scale: SKALA_TEKS[textScale],
    backgroundStyle,
    // Gradien sengaja dibuat dari warna background itu sendiri, digeser tipis
    // ke arah aksen. Membiarkan merchant memilih dua warna bebas berarti
    // membiarkan kombinasi yang tidak ada warna teksnya bisa menyelamatkan.
    gradientTo: mixHex(background, accentFill, 0.14),
    backgroundImagePath: backgroundStyle === "IMAGE" ? pathGambar : null,
    backgroundOverlay:
      backgroundStyle === "IMAGE"
        ? Math.max(OVERLAY_MINIMUM, row?.background_overlay ?? OVERLAY_MINIMUM)
        : 0,
  };
}
