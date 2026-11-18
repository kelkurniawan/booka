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

const NORMAL_PRICE = "Booking tetap bisa dilanjutkan dengan harga normal.";
const EXPIRED_MESSAGES = new Set([
  "Kode voucher tidak ditemukan atau sudah tidak berlaku.",
  "Voucher ini belum berlaku atau sudah berakhir.",
]);

/**
 * Pesan saat kode dari tautan gagal dipasang. `Error` dari rute cek membawa
 * alasan server; hanya kode hilang/berakhir yang memakai teks papan "tidak
 * berlaku". Selain Error (jaringan putus) dipakai teks netral.
 */
export function voucherFailureMessage(error: unknown, code: string): { title: string; body: string } {
  if (!(error instanceof Error) || error instanceof TypeError) {
    return { title: "Voucher belum bisa dicek.", body: NORMAL_PRICE };
  }
  if (EXPIRED_MESSAGES.has(error.message)) {
    return { title: `Kode ${code} sudah tidak berlaku.`, body: NORMAL_PRICE };
  }
  return { title: `Kode ${code} belum dipasang.`, body: `${error.message.replace(/\.$/, "")}. ${NORMAL_PRICE}` };
}
