import {
  DM_Sans,
  Fraunces,
  Inter,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Space_Grotesk,
} from "next/font/google";

import type { FONT_VARS } from "./font-pairs";

/**
 * Pemuat enam keluarga font tema.
 *
 * Seluruh argumen ditulis sebagai literal, TIDAK di-spread dan tidak mengambil
 * nilai dari konstanta: next/font menolaknya dengan "Font loader values must be
 * explicitly written literals" karena nilainya dibaca saat build oleh plugin
 * SWC, bukan saat program berjalan. Konsekuensinya nama variabel CSS di sini
 * terduplikasi dari font-pairs.ts -- `PeriksaNamaFontVar` di bawah yang menjaga
 * keduanya tidak bisa berbeda diam-diam.
 *
 * `preload: false` disengaja. Tanpa itu, Next menyisipkan <link rel=preload>
 * untuk keenam keluarga di setiap halaman publik, padahal tema mana pun cuma
 * memakai satu atau dua. Dengan preload dimatikan, hanya aturan @font-face yang
 * ikut di CSS rute -- murni teks, murah -- dan berkas woff2 baru diunduh untuk
 * keluarga yang benar-benar dirujuk `--font-sans` / `--font-heading`.
 *
 * `weight` sengaja tidak disebut: keenamnya variable font di Google Fonts,
 * jadi seluruh rentang beratnya ikut dalam satu berkas.
 *
 * Modul ini hanya boleh diimpor komponen. Jangan mengimpornya dari kode murni
 * -- next/font/google cuma berfungsi di dalam pipeline build Next, dan
 * mengimpornya membuat modul itu gagal di `npm run test:unit`.
 */
const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-plus-jakarta",
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-inter",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-dm-sans",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-space-grotesk",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-playfair",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-fraunces",
});

/**
 * Gagal typecheck kalau salah satu literal `variable:` di atas menyimpang dari
 * FONT_VARS di font-pairs.ts. `A extends B` pada dua tipe literal hanya benar
 * kalau keduanya persis sama.
 */
type SamaDengan<A extends B, B extends string> = A;
export type PeriksaNamaFontVar = [
  SamaDengan<"--font-plus-jakarta", typeof FONT_VARS.plusJakarta>,
  SamaDengan<"--font-inter", typeof FONT_VARS.inter>,
  SamaDengan<"--font-dm-sans", typeof FONT_VARS.dmSans>,
  SamaDengan<"--font-space-grotesk", typeof FONT_VARS.spaceGrotesk>,
  SamaDengan<"--font-playfair", typeof FONT_VARS.playfair>,
  SamaDengan<"--font-fraunces", typeof FONT_VARS.fraunces>,
];

/**
 * Dipasang BookingPageShell, bukan root layout, supaya dashboard dan landing
 * tidak ikut menanggung aturan @font-face yang tidak mereka pakai.
 */
export const BOOKING_FONT_CLASSNAMES = [
  plusJakarta.variable,
  inter.variable,
  dmSans.variable,
  spaceGrotesk.variable,
  playfair.variable,
  fraunces.variable,
].join(" ");
