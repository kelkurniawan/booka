import type { FontPair } from "@/types/database";

/**
 * Nama CSS custom property tiap keluarga font.
 *
 * Modul ini sengaja MURNI -- tidak mengimpor `next/font/google`, yang cuma
 * berfungsi di dalam pipeline build Next dan membuat apa pun yang mengimpornya
 * mustahil diuji lewat `npm run test:unit`. Pemuat fontnya ada di `fonts.ts`
 * dan mengambil nama variabelnya dari sini, jadi keduanya tidak bisa berbeda.
 */
export const FONT_VARS = {
  plusJakarta: "--font-plus-jakarta",
  inter: "--font-inter",
  dmSans: "--font-dm-sans",
  spaceGrotesk: "--font-space-grotesk",
  playfair: "--font-playfair",
  fraunces: "--font-fraunces",
} as const;

const v = (nama: string) => `var(${nama})`;

/** Enam pasangan dari enam keluarga; tiap keluarga dipakai ulang. */
export const FONT_PAIR_VARS: Record<FontPair, { heading: string; body: string }> = {
  NETRAL: { heading: v(FONT_VARS.plusJakarta), body: v(FONT_VARS.plusJakarta) },
  KLASIK: { heading: v(FONT_VARS.playfair), body: v(FONT_VARS.inter) },
  MODERN: { heading: v(FONT_VARS.spaceGrotesk), body: v(FONT_VARS.dmSans) },
  HANGAT: { heading: v(FONT_VARS.fraunces), body: v(FONT_VARS.dmSans) },
  TEGAS: { heading: v(FONT_VARS.spaceGrotesk), body: v(FONT_VARS.spaceGrotesk) },
  RAPI: { heading: v(FONT_VARS.inter), body: v(FONT_VARS.inter) },
};

export const FONT_PAIR_LABELS: Record<FontPair, string> = {
  NETRAL: "Netral",
  KLASIK: "Klasik",
  MODERN: "Modern",
  HANGAT: "Hangat",
  TEGAS: "Tegas",
  RAPI: "Rapi",
};

export const FONT_PAIR_DESCRIPTIONS: Record<FontPair, string> = {
  NETRAL: "Satu huruf untuk judul dan isi. Tenang dan mudah dibaca.",
  KLASIK: "Judul berserif tinggi dengan isi yang bersih.",
  MODERN: "Judul bersudut tegas dengan isi yang ramah.",
  HANGAT: "Judul berserif lembut. Cocok untuk usaha yang personal.",
  TEGAS: "Satu huruf bersudut untuk judul dan isi. Berkarakter kuat.",
  RAPI: "Paling netral. Aman untuk teks panjang.",
};
