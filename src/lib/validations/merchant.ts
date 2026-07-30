import { z } from "zod";

/**
 * Aturan username harus persis sama dengan constraint
 * `merchants_username_format` di supabase/migrations. Validasi di sini hanya
 * untuk pesan error yang ramah — database tetap penjaga terakhirnya.
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/;

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(USERNAME_MIN, `Minimal ${USERNAME_MIN} karakter`)
  .max(USERNAME_MAX, `Maksimal ${USERNAME_MAX} karakter`)
  .regex(
    USERNAME_PATTERN,
    "Hanya huruf kecil, angka, dan tanda hubung. Tidak boleh diawali atau diakhiri tanda hubung.",
  );

/**
 * Menormalkan nomor telepon Indonesia ke format E.164 (+62...).
 * Menerima 08xx, 8xx, 62xx, +62xx, dengan atau tanpa spasi/tanda hubung.
 * Nomor negara lain diterima apa adanya selama sudah diawali '+'.
 */
export function normalizeWhatsapp(input: string): string {
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (!digits) return "";
  if (hasPlus && !digits.startsWith("62")) return `+${digits}`;
  if (digits.startsWith("62")) return `+${digits}`;
  if (digits.startsWith("0")) return `+62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `+62${digits}`;
  return `+${digits}`;
}

export const whatsappSchema = z
  .string()
  .trim()
  .min(1, "Nomor WhatsApp wajib diisi")
  .transform(normalizeWhatsapp)
  .refine(
    (value) => /^\+[1-9][0-9]{7,14}$/.test(value),
    "Nomor tidak valid. Contoh: 0812-3456-7890",
  );

/** Harus sama dengan constraint `merchants_full_name_length`. */
export const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Nama usaha minimal 2 karakter")
  .max(80, "Nama usaha maksimal 80 karakter");

/** Harus sama dengan constraint `merchants_bio_length`. */
export const BIO_MAX = 300;

/** Textarea kosong dianggap "tanpa bio" (null), sama seperti description layanan. */
export const bioSchema = z
  .string()
  .max(BIO_MAX, `Bio maksimal ${BIO_MAX} karakter`)
  .transform((value) => value.trim())
  .transform((value) => (value.length > 0 ? value : null));

export const onboardingSchema = z.object({
  full_name: fullNameSchema,
  username: usernameSchema,
  whatsapp_number: whatsappSchema,
});

export type OnboardingInput = z.input<typeof onboardingSchema>;
export type OnboardingValues = z.output<typeof onboardingSchema>;

/** Dipakai halaman Pengaturan untuk mengubah profil merchant sekaligus. */
export const settingsSchema = z.object({
  full_name: fullNameSchema,
  bio: bioSchema,
  whatsapp_number: whatsappSchema,
  username: usernameSchema,
});

export type SettingsInput = z.input<typeof settingsSchema>;
export type SettingsValues = z.output<typeof settingsSchema>;

/** Saran username dari nama usaha, misal "Studio Mawar!" -> "studio-mawar". */
export function suggestUsername(fullName: string): string {
  return fullName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, USERNAME_MAX)
    .replace(/-+$/g, "");
}
