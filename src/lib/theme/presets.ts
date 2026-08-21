import type { CornerStyle, FontPair, ThemePreset } from "@/types/database";

export type ThemePresetDefinition = {
  label: string;
  /** Kalimat pendek untuk kartu pilihan di editor. */
  description: string;
  background: string;
  foreground: string;
  card: string;
  mutedForeground: string;
  border: string;
  accent: string;
  corner: CornerStyle;
  fontPair: FontPair;
};

/**
 * Enam preset. Masing-masing menyetel warna, sudut, dan pasangan font
 * sekaligus, sehingga tidak ada keadaan "setengah jadi": tema apa pun yang
 * dipilih merchant selalu utuh.
 */
export const THEME_PRESETS: Record<ThemePreset, ThemePresetDefinition> = {
  BERSIH: {
    label: "Bersih",
    description: "Netral dan rapi. Aman untuk bidang usaha apa pun.",
    background: "#ffffff",
    foreground: "#252525",
    card: "#ffffff",
    mutedForeground: "#8a8a8a",
    border: "#e4e4e4",
    accent: "#252525",
    corner: "LEMBUT",
    fontPair: "NETRAL",
  },
  HANGAT: {
    label: "Hangat",
    description: "Krem lembut dengan aksen terakota. Cocok untuk MUA dan katering.",
    background: "#faf4ea",
    foreground: "#453425",
    card: "#ffffff",
    mutedForeground: "#8d7a63",
    border: "#e8dcc9",
    accent: "#b8613a",
    corner: "BULAT",
    fontPair: "HANGAT",
  },
  MALAM: {
    label: "Malam",
    description: "Gelap dan tegas. Cocok untuk fotografer, barber, dan studio tato.",
    background: "#1a1a1c",
    foreground: "#f5f5f5",
    card: "#1a1a1c",
    mutedForeground: "#9a9a9e",
    border: "#3a3a3d",
    accent: "#f5f5f5",
    corner: "TAJAM",
    fontPair: "MODERN",
  },
  PASTEL: {
    label: "Pastel",
    description: "Mint lembut dan bulat. Cocok untuk nail art, spa, dan kelas anak.",
    background: "#e9f6f1",
    foreground: "#254a41",
    card: "#ffffff",
    mutedForeground: "#5f8579",
    border: "#cfe7de",
    accent: "#2f8f76",
    corner: "BULAT",
    fontPair: "RAPI",
  },
  BERANI: {
    label: "Berani",
    description: "Kontras tinggi dan bergaris tebal. Cocok untuk studio kreatif.",
    background: "#fdfbf3",
    foreground: "#141414",
    card: "#fdfbf3",
    mutedForeground: "#6b6b66",
    border: "#141414",
    accent: "#e35d24",
    corner: "TAJAM",
    fontPair: "TEGAS",
  },
  ELEGAN: {
    label: "Elegan",
    description:
      "Hitam dan emas dengan serif tinggi. Cocok untuk wedding dan salon premium.",
    background: "#191510",
    foreground: "#f0e6d2",
    card: "#191510",
    mutedForeground: "#a5977e",
    border: "#4a3f2e",
    accent: "#c9a961",
    corner: "TAJAM",
    fontPair: "KLASIK",
  },
};

/**
 * Tiga preset gratis dipilih agar menutup tiga kutub berbeda -- terang-netral,
 * terang-hangat, dan gelap. Merchant STARTER mana pun menemukan yang cocok,
 * sementara batasnya tetap terasa jelas. Kalau ketiganya varian terang yang
 * mirip, tidak ada yang merasa perlu upgrade.
 */
export const FREE_PRESETS: readonly ThemePreset[] = ["BERSIH", "HANGAT", "MALAM"];

export function isFreePreset(preset: ThemePreset): boolean {
  return FREE_PRESETS.includes(preset);
}

export const CORNER_RADIUS: Record<CornerStyle, string> = {
  TAJAM: "0rem",
  LEMBUT: "0.625rem",
  BULAT: "1.25rem",
};

export const CORNER_LABELS: Record<CornerStyle, string> = {
  TAJAM: "Tajam",
  LEMBUT: "Lembut",
  BULAT: "Bulat",
};
