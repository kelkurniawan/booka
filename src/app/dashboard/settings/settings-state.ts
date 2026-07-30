/**
 * Bentuk state form pengaturan profil, dipisah dari `actions.ts`.
 *
 * File bertanda `"use server"` hanya boleh mengekspor async function — setiap
 * export lain, termasuk konstanta objek seperti INITIAL_SETTINGS_FORM_STATE,
 * membuat Next.js melempar "A 'use server' file can only export async
 * functions". Karena itu tipe dan nilai awalnya tinggal di modul biasa ini.
 */

type FieldName = "full_name" | "bio" | "whatsapp_number" | "username";

export type SettingsFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<FieldName, string>>;
};

export const INITIAL_SETTINGS_FORM_STATE: SettingsFormState = { status: "idle" };
