// Keadaan masuk dari tautan iklan (?t=) atau ?kode=. Murni, supaya bisa diuji.

export type EntryNotice = "VOUCHER_APPLIED" | "VOUCHER_EXPIRED" | "SERVICE_GONE";

export type Entry = {
  serviceId: string | null;
  voucherCode: string | null;
  notice: EntryNotice | null;
};

export const NO_ENTRY: Entry = { serviceId: null, voucherCode: null, notice: null };

/** Hasil cek kode ke server; null = belum diperiksa. */
export type VoucherState = "VALID" | "EXPIRED" | null;

export function resolveEntry(
  link: { serviceId: string | null; voucherCode: string | null } | null,
  services: { id: string }[],
  voucherState: VoucherState,
): Entry {
  if (!link) return NO_ENTRY;
  const gone = link.serviceId !== null && !services.some((s) => s.id === link.serviceId);
  const serviceId = gone ? null : link.serviceId;
  if (voucherState === "EXPIRED") {
    return { serviceId, voucherCode: null, notice: gone ? "SERVICE_GONE" : "VOUCHER_EXPIRED" };
  }
  const notice = gone ? "SERVICE_GONE" : voucherState === "VALID" ? "VOUCHER_APPLIED" : null;
  return { serviceId, voucherCode: link.voucherCode, notice };
}
