/**
 * Bentuk state form auth, dipisah dari `actions.ts`.
 *
 * File bertanda `"use server"` hanya boleh mengekspor async function — setiap
 * export lain, termasuk konstanta objek seperti INITIAL_AUTH_STATE, membuat
 * Next.js melempar "A 'use server' file can only export async functions".
 * Karena itu tipe dan nilai awalnya tinggal di modul biasa ini.
 */

type FieldName = "email" | "password" | "confirmPassword";

export type AuthState = {
  /**
   * `sent`    — email tautan masuk / pemulihan sudah dikirim
   * `confirm` — akun dibuat, menunggu konfirmasi email
   */
  status: "idle" | "error" | "sent" | "confirm";
  message?: string;
  fieldErrors?: Partial<Record<FieldName, string>>;
};

export const INITIAL_AUTH_STATE: AuthState = { status: "idle" };
