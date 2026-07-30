import { z } from "zod";

import type { PaymentEnvironment, PaymentProvider } from "@/types/database";

export const PAYMENT_PROVIDERS = ["MIDTRANS", "XENDIT"] as const satisfies readonly PaymentProvider[];
export const PAYMENT_ENVIRONMENTS = [
  "SANDBOX",
  "PRODUCTION",
] as const satisfies readonly PaymentEnvironment[];

/** Form "Hubungkan dengan Server Key manual" — jalur yang benar-benar aktif hari ini. */
export const manualKeySchema = z.object({
  provider: z.enum(PAYMENT_PROVIDERS, "Provider tidak dikenal"),
  serverKey: z
    .string()
    .trim()
    .min(10, "Server Key terlalu pendek — periksa lagi dari dashboard provider Anda")
    .max(500, "Server Key terlalu panjang"),
  environment: z.enum(PAYMENT_ENVIRONMENTS, "Pilih Sandbox atau Production"),
});

export type ManualKeyInput = z.input<typeof manualKeySchema>;
export type ManualKeyValues = z.output<typeof manualKeySchema>;

/**
 * Tampilkan maksimal 4 karakter terakhir kredensial — TIDAK PERNAH kirim
 * Server Key/token penuh ke browser. Pemanggil wajib memberi plaintext yang
 * sudah didekripsi di server; hasil fungsi ini yang boleh diteruskan ke
 * komponen client.
 */
export function maskCredential(value: string): string {
  const last4 = value.slice(-4);
  return `••••${last4}`;
}
