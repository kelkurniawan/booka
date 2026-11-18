/**
 * Bentuk state form layanan, dipisah dari `actions.ts`.
 *
 * File bertanda `"use server"` hanya boleh mengekspor async function — setiap
 * export lain, termasuk konstanta objek seperti INITIAL_SERVICE_FORM_STATE,
 * membuat Next.js melempar "A 'use server' file can only export async
 * functions". Karena itu tipe dan nilai awalnya tinggal di modul biasa ini.
 */

type FieldName = "name" | "description" | "price" | "duration_minutes" | "deposit_type" | "deposit_value" | "partyMin" | "partyMax" | "seatDurationMinutes";

export type ServiceFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<FieldName, string>>;
  /** Error P0001 dari trigger enforce_service_limit — tampilkan ajakan upgrade. */
  limitReached?: boolean;
  /** Galat bidang sewa lapangan (jam ramai, lapangan, lama main). */
  courtError?: string;
  /** Id layanan yang baru dibuat. Dipakai klien untuk melampirkan media. */
  serviceId?: string;
};

export const INITIAL_SERVICE_FORM_STATE: ServiceFormState = { status: "idle" };

/** Hasil aksi "Tambah lapangan" di form layanan. */
export type AddCourtResult = {
  status: "success" | "error";
  message?: string;
  court?: { id: string; name: string; note: string };
};
