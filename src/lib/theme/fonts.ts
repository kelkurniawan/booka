import {
  DM_Sans,
  Fraunces,
  Inter,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Space_Grotesk,
} from "next/font/google";

import { FONT_VARS } from "./font-pairs";

/**
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
 * -- `next/font/google` cuma berfungsi di dalam pipeline build Next, dan
 * mengimpornya membuat modul itu gagal di `npm run test:unit`. Data pasangan
 * fontnya ada di `font-pairs.ts`.
 */
// `subsets` sengaja BUKAN `as const`: next/font menuntut array yang bisa
// diubah, dan `as const` membuatnya readonly sehingga tipenya ditolak.
const opsi = {
  subsets: ["latin"] as ["latin"],
  display: "swap" as const,
  preload: false,
};

const plusJakarta = Plus_Jakarta_Sans({ ...opsi, variable: FONT_VARS.plusJakarta });
const inter = Inter({ ...opsi, variable: FONT_VARS.inter });
const dmSans = DM_Sans({ ...opsi, variable: FONT_VARS.dmSans });
const spaceGrotesk = Space_Grotesk({ ...opsi, variable: FONT_VARS.spaceGrotesk });
const playfair = Playfair_Display({ ...opsi, variable: FONT_VARS.playfair });
const fraunces = Fraunces({ ...opsi, variable: FONT_VARS.fraunces });

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
