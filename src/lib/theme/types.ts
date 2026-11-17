import type {
  BackgroundMotion,
  BackgroundStyle,
  ButtonStyle,
  ColorMode,
  CornerStyle,
  FontPair,
  MotionSpeed,
  TextScale,
  ThemePreset,
} from "@/types/database";

import type { PageSection } from "./sections";

/**
 * Tema yang sudah jadi: hasil menggabungkan preset dengan penimpaan merchant,
 * memangkas nilai premium, dan menegakkan kontras. Halaman publik maupun
 * preview dashboard hanya pernah melihat bentuk ini, tidak pernah baris mentah.
 */
export type ResolvedMotion = {
  preset: BackgroundMotion;
  speed: MotionSpeed;
  base: string;
  shapeA: string;
  shapeB: string;
  shapeC: string;
};

export type ResolvedTheme = {
  preset: ThemePreset;
  /** Diturunkan dari luminansi permukaan, bukan dipilih merchant. */
  colorMode: ColorMode;
  background: string;
  foreground: string;
  card: string;
  mutedForeground: string;
  border: string;
  /** Warna mentah pilihan merchant, untuk latar tombol dan blok. */
  accentFill: string;
  /** Versi yang dijamin terbaca di atas `background`. */
  accentText: string;
  /** Warna teks di ATAS `accentFill`. */
  accentForeground: string;
  radius: string;
  cornerStyle: CornerStyle;
  fontPair: FontPair;
  textScale: TextScale;
  /** Pengali ukuran teks yang diturunkan dari `textScale`. */
  scale: number;
  backgroundStyle: BackgroundStyle;
  /** Ujung bawah gradien saat `backgroundStyle` GRADIENT. */
  gradientTo: string;
  backgroundImagePath: string | null;
  backgroundOverlay: number;
  /** Semua paket. Menggantikan foto profil di kepala halaman bila ada. */
  logoPath: string | null;
  /** Null untuk STARTER. */
  coverPath: string | null;
  buttonStyle: ButtonStyle;
  /** Gaya satu aksi utama (StickyActionBar), bukan --primary. */
  buttonFill: string;
  buttonText: string;
  buttonBorder: string;
  sections: PageSection[];
  /** Terisi hanya bila backgroundStyle MOTION. */
  motion: ResolvedMotion | null;
};
