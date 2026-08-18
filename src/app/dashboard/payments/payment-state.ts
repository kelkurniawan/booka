/**
 * Bentuk state form Server Key manual, dipisah dari `actions.ts`.
 *
 * File bertanda "use server" hanya boleh mengekspor async function -- lihat
 * catatan yang sama di src/app/dashboard/services/service-state.ts.
 */

type FieldName = "provider" | "serverKey" | "environment" | "webhookToken";

export type ManualKeyFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<FieldName, string>>;
};

export const INITIAL_MANUAL_KEY_FORM_STATE: ManualKeyFormState = { status: "idle" };

export const PROVIDER_META: Record<
  "MIDTRANS" | "XENDIT",
  { name: string; description: string }
> = {
  MIDTRANS: {
    name: "Midtrans",
    description: "Terima DP QRIS lewat akun Midtrans Anda sendiri.",
  },
  XENDIT: {
    name: "Xendit",
    description: "Terima DP QRIS lewat akun Xendit Anda sendiri.",
  },
};
