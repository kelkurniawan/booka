// Aturan cara bayar yang dipakai UI dan API. Harus sama persis dengan
// create_booking (supabase/migrations/20261115000500_payment_mode_minimums.sql):
// aturan no-show (deposit_after_no_show) hanya ada di server, jadi modul ini
// tidak memegang data riwayat pelanggan.

import type { BookingStatus, MerchantSettings, OnSitePaymentMethod, PaymentMode, Service } from "@/types/database";
import { formatRupiah } from "@/lib/format";

/** Nominal QRIS terkecil (Rupiah), batas minimum QR Xendit. Sama dengan konstanta 1500 di create_booking. */
export const MIN_ONLINE_CHARGE = 1500;

export type PaymentSettings = Pick<MerchantSettings, "allow_pay_on_site" | "auto_confirm_on_site">;

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  allow_pay_on_site: true,
  auto_confirm_on_site: true,
};

/** Bawaan satu baris merchant_settings, sama dengan default kolomnya (migration 20261115000200). */
export const DEFAULT_MERCHANT_SETTINGS: Pick<
  MerchantSettings,
  "allow_pay_on_site" | "auto_confirm_on_site" | "max_active_per_phone" | "deposit_after_no_show"
> = {
  ...DEFAULT_PAYMENT_SETTINGS,
  max_active_per_phone: 2,
  deposit_after_no_show: false,
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
 * Nominal bayar sekarang dan di tempat untuk mode efektif tertentu. `discount`
 * adalah potongan voucher (0 bila tanpa voucher); harga efektif = harga - discount,
 * sama dengan 20261117000200. PERCENT
 * dibulatkan dengan Math.round (setengah ke atas), sama dengan round() di SQL
 * untuk nilai positif. DP tidak pernah di bawah MIN_ONLINE_CHARGE kecuali
 * harganya sendiri lebih kecil. `price` dan `deposit_value` dibungkus Number() karena
 * PostgREST bisa mengembalikan numeric sebagai string.
 */
export function computeAmounts(
  service: ServicePayment,
  mode: PaymentMode,
  discount?: number,
): { dueNow: number; dueOnSite: number } {
  const price = Number(service.price) - (discount ?? 0);
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
  if (price > 0 && service.deposit_type !== null && (mode === "DEPOSIT" || mode === "REQUEST")) {
    dueNow = Math.max(dueNow, Math.min(price, MIN_ONLINE_CHARGE));
  }
  return { dueNow, dueOnSite: price - dueNow };
}

/** Booking menunggu persetujuan merchant, bukan langsung terkonfirmasi. */
export function needsApproval(mode: PaymentMode, settings: PaymentSettings): boolean {
  if (mode === "REQUEST") return true;
  return mode === "ON_SITE" && !settings.auto_confirm_on_site;
}

/** Status awal booking, sama dengan create_booking: bayar sekarang 0 tidak pernah PENDING. */
export function initialBookingStatus(
  mode: PaymentMode,
  dueNow: number,
  settings: PaymentSettings,
): Extract<BookingStatus, "PENDING" | "CONFIRMED" | "REQUESTED"> {
  if (needsApproval(mode, settings)) return "REQUESTED";
  return mode !== "ON_SITE" && dueNow > 0 ? "PENDING" : "CONFIRMED";
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
