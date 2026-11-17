/**
 * Tipe state form banner, dipisah dari `banner-actions.ts`: file "use server" hanya
 * boleh mengekspor fungsi async.
 */

import type { ResolvedTheme } from "@/lib/theme/types";
import type { BannerFormInput } from "@/lib/validations/banner";
import type { BannerColor } from "@/types/database";

export type BannerFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<keyof BannerFormInput, string>>;
};

export const INITIAL_BANNER_FORM_STATE: BannerFormState = { status: "idle" };

/** Warna lingkaran pilihan dan thumbnail, diambil dari tema merchant yang sudah di-resolve. */
export function themeSwatch(theme: ResolvedTheme, color: BannerColor): string {
  return color === "ACCENT" ? theme.accentFill : color === "DARK" ? theme.foreground : theme.card;
}
