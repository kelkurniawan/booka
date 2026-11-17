// Aturan voucher untuk tampilan dan hitungan di sisi aplikasi. Harus sama dengan
// evaluate_voucher di supabase/migrations/20261117000100 (satu-satunya aturan kelayakan
// di SQL); bila keduanya berbeda, SQL yang menang.

import type { Service, Voucher } from "@/types/database";
import { formatRupiah } from "@/lib/format";

import { MIN_ONLINE_CHARGE } from "./payment-mode";

export type VoucherTerms = Pick<Voucher, "code" | "kind" | "value" | "max_discount" | "min_spend" | "service_ids">;

export const VOUCHER_CODE_PATTERN = /^[A-Z0-9]{4,16}$/;

// Intl id-ID menyisipkan spasi setelah "Rp"; teks voucher memakai "Rp500.000" tanpa spasi.
const rupiah = (value: number): string => formatRupiah(value).replace(/\s/g, "");

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // tanpa I, O, 0, 1 supaya tidak tertukar

export function normalizeVoucherCode(input: string): string {
  return input.trim().toUpperCase();
}

/**
 * Nominal diskon untuk harga tertentu (Keputusan 4). PERCENT dibulatkan setengah
 * ke atas lalu dibatasi max_discount. Diskon tidak pernah melebihi harga. Bila
 * harga >= MIN_ONLINE_CHARGE dan sisa harga jatuh di 1 sampai 1499, diskon
 * dikurangi sampai sisa tepat MIN_ONLINE_CHARGE. Sisa 0 tetap boleh.
 */
export function computeDiscount(voucher: VoucherTerms, price: number): number {
  const value = Number(voucher.value);
  let discount = voucher.kind === "PERCENT" ? Math.round((price * value) / 100) : value;
  if (voucher.max_discount != null) discount = Math.min(discount, Number(voucher.max_discount));
  discount = Math.min(discount, price);
  const remaining = price - discount;
  if (price >= MIN_ONLINE_CHARGE && remaining > 0 && remaining < MIN_ONLINE_CHARGE) {
    discount = price - MIN_ONLINE_CHARGE;
  }
  return discount;
}

/**
 * Alasan voucher publik belum bisa dipakai untuk layanan ini, atau null. Hanya
 * syarat yang boleh terlihat anon (layanan dan minimal belanja). Kuota, periode,
 * dan nomor pelanggan tidak dicek di sini.
 */
export function voucherIneligibleReason(
  voucher: VoucherTerms,
  service: Pick<Service, "id" | "price">,
  serviceNames: Record<string, string>,
): string | null {
  // shortcut: service_ids kosong dianggap tanpa batasan layanan, cocokkan dengan SQL saat diubah.
  if (voucher.service_ids?.length && !voucher.service_ids.includes(service.id)) {
    const names = voucher.service_ids.map((id) => serviceNames[id]).filter(Boolean).join(", ");
    return `Hanya untuk ${names}`;
  }
  if (voucher.min_spend != null && Number(service.price) < Number(voucher.min_spend)) {
    return `Belum bisa dipakai: minimal ${rupiah(Number(voucher.min_spend))}`;
  }
  return null;
}

/** "Diskon 20%, maks Rp100.000" | "Diskon 15%" | "Potongan Rp50.000" | "Potongan Rp50.000, min Rp500.000" */
export function voucherSummary(voucher: Pick<Voucher, "kind" | "value" | "max_discount" | "min_spend">): string {
  const head =
    voucher.kind === "PERCENT"
      ? `Diskon ${Number(voucher.value)}%${voucher.max_discount != null ? `, maks ${rupiah(Number(voucher.max_discount))}` : ""}`
      : `Potongan ${rupiah(Number(voucher.value))}`;
  return voucher.min_spend != null ? `${head}, min ${rupiah(Number(voucher.min_spend))}` : head;
}

export function randomVoucherCode(random: () => number = Math.random): string {
  return Array.from({ length: 8 }, () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]).join("");
}

export type VoucherStatus = "Aktif" | "Terjadwal" | "Berakhir" | "Habis";

export function voucherStatus(
  voucher: Pick<Voucher, "starts_at" | "ends_at" | "quota">,
  used: number,
  nowMs: number,
): VoucherStatus {
  if (voucher.starts_at && Date.parse(voucher.starts_at) > nowMs) return "Terjadwal";
  if (voucher.ends_at && Date.parse(voucher.ends_at) <= nowMs) return "Berakhir";
  if (voucher.quota != null && used >= voucher.quota) return "Habis";
  return "Aktif";
}
