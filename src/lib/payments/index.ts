import "server-only";

import type { PaymentProvider } from "@/types/database";

import { midtransAdapter } from "./midtrans";
import type { PaymentProviderAdapter } from "./types";
import { xenditAdapter } from "./xendit";

const ADAPTERS: Record<PaymentProvider, PaymentProviderAdapter> = {
  MIDTRANS: midtransAdapter,
  XENDIT: xenditAdapter,
};

/** Adapter provider payment gateway. Dipakai Task 8 untuk charge QRIS. */
export function getAdapter(provider: PaymentProvider): PaymentProviderAdapter {
  return ADAPTERS[provider];
}

export { ChargeRejectedError } from "./errors";
export { recordChargeRejection, recordChargeSuccess } from "./health";
export type {
  PaymentProviderAdapter,
  QrisCharge,
  QrisChargeParams,
  VerifyWebhookSignatureParams,
} from "./types";
