// Aturan cara bayar yang dipakai UI dan API. Harus sama persis dengan
// create_booking (supabase/migrations/20261115000300_create_booking_payment_modes.sql):
// aturan no-show (deposit_after_no_show) hanya ada di server, jadi modul ini
// tidak memegang data riwayat pelanggan.

import type { MerchantSettings, OnSitePaymentMethod, PaymentMode, Service } from "@/types/database";
import { formatRupiah } from "@/lib/format";

export type PaymentSettings = Pick<MerchantSettings, "allow_pay_on_site" | "auto_confirm_on_site">;

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  allow_pay_on_site: true,
  auto_confirm_on_site: true,
};

export type ServicePayment = Pick<Service, "price" | "payment_mode" | "deposit_type" | "deposit_value">;

/** Mode efektif: ON_SITE jatuh ke FULL bila merchant mematikan bayar di tempat. */
export function effectivePaymentMode(
  service: Pick<Service, "payment_mode">,
  settings: PaymentSettings,
): PaymentMode {
  if (service.payment_mode === "ON_SITE" && !settings.allow_pay_on_site) return "FULL";
  return service.payment_mode;
}

/**
 * Nominal bayar sekarang dan di tempat untuk mode efektif tertentu. PERCENT
 * dibulatkan dengan Math.round (setengah ke atas), sama dengan round() di SQL
 * untuk nilai positif. `price` dan `deposit_value` dibungkus Number() karena
 * PostgREST bisa mengembalikan numeric sebagai string.
 */
export function computeAmounts(
  service: ServicePayment,
  mode: PaymentMode,
): { dueNow: number; dueOnSite: number } {
  const price = Number(service.price);
  const depositValue = Number(service.deposit_value);
  let dueNow: number;
  if (mode === "ON_SITE") {
    dueNow = 0;
  } else if ((mode === "DEPOSIT" || mode === "REQUEST") && service.deposit_type === "PERCENT") {
    dueNow = Math.round((price * depositValue) / 100);
  } else if ((mode === "DEPOSIT" || mode === "REQUEST") && service.deposit_type === "FIXED") {
    dueNow = Math.min(depositValue, price);
  } else {
    dueNow = price;
  }
  return { dueNow, dueOnSite: price - dueNow };
}

/** Booking menunggu persetujuan merchant, bukan langsung terkonfirmasi. */
export function needsApproval(mode: PaymentMode, settings: PaymentSettings): boolean {
  if (mode === "REQUEST") return true;
  return mode === "ON_SITE" && !settings.auto_confirm_on_site;
}

/** Label singkat cara bayar untuk halaman publik dan daftar layanan (teks M1). */
export function paymentLabel(service: ServicePayment, settings: PaymentSettings): string {
  const mode = effectivePaymentMode(service, settings);
  switch (mode) {
    case "FULL":
      return "Lunas di muka";
    case "DEPOSIT":
      return service.deposit_type === "PERCENT"
        ? `DP ${Number(service.deposit_value)}% di muka`
        : `DP ${formatRupiah(Number(service.deposit_value))} di muka`;
    case "ON_SITE":
      return "Bayar di tempat";
    case "REQUEST":
      return "Ajukan dulu";
  }
}

export const PAYMENT_MODE_OPTIONS: { value: PaymentMode; title: string; description: string; fit: string }[] = [
  {
    value: "FULL",
    title: "Bayar penuh saat booking",
    description: "Seluruh harga dibayar lewat QRIS. Paling aman dari pembatalan mendadak.",
    fit: "kelas, sesi foto, tiket acara",
  },
  {
    value: "DEPOSIT",
    title: "DP saat booking, sisanya di tempat",
    description: "Pelanggan mengunci jadwal dengan sebagian harga.",
    fit: "MUA, salon, fotografer, sewa alat",
  },
  {
    value: "ON_SITE",
    title: "Bayar di tempat",
    description: "Reservasi gratis tanpa pembayaran online. Pelanggan langsung terkonfirmasi.",
    fit: "restoran, kafe, barbershop, klinik",
  },
  {
    value: "REQUEST",
    title: "Ajukan dulu, bayar setelah disetujui",
    description: "Pelanggan mengirim permintaan. Anda cek ketersediaan, lalu setujui atau tolak.",
    fit: "wedding, katering, sewa tempat",
  },
];

export const ON_SITE_METHOD_LABEL: Record<OnSitePaymentMethod, string> = {
  CASH: "Tunai",
  QRIS: "QRIS",
  TRANSFER: "Transfer",
};

// Harus sama persis dengan teks di SQL (Task 1 dan Task 3); dicocokkan lewat string.
export const REQUEST_REJECT_REASON = "Permintaan ditolak merchant";
export const REQUEST_EXPIRY_REASON = "Permintaan tidak dijawab dalam batas waktu";
