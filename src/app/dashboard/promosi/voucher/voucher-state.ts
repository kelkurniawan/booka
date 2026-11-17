/**
 * Tipe state form voucher, dipisah dari `actions.ts`: file "use server" hanya
 * boleh mengekspor fungsi async.
 */

import type { VoucherFormInput } from "@/lib/validations/voucher";

export type VoucherFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<keyof VoucherFormInput, string>>;
};

export const INITIAL_VOUCHER_FORM_STATE: VoucherFormState = { status: "idle" };
