import { usernameSchema } from "@/lib/validations/merchant";

export type UsernameCheckStatus =
  | "available"
  | "taken"
  | "reserved"
  | "invalid"
  | "rate_limited"
  | "error";
export type UsernameCheckResult = { status: UsernameCheckStatus; message: string };
/** Membungkus RPC `check_username_claim`; melempar bila RPC gagal. */
export type ClaimRpc = (username: string) => Promise<string>;

export const USERNAME_CHECK_MESSAGES: Record<Exclude<UsernameCheckStatus, "invalid">, string> = {
  available: "Tautan ini masih tersedia.",
  taken: "Sudah dipakai usaha lain. Coba nama lain.",
  reserved: "Nama ini dipakai sistem Marky. Coba nama lain.",
  rate_limited: "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.",
  error:
    "Ketersediaan belum bisa dicek. Anda tetap bisa lanjut, kami cek lagi saat pendaftaran.",
};

const RPC_STATUSES = ["available", "taken", "reserved", "rate_limited"] as const;

function result(status: Exclude<UsernameCheckStatus, "invalid">): UsernameCheckResult {
  return { status, message: USERNAME_CHECK_MESSAGES[status] };
}

/** Format divalidasi di sini; masukan tidak valid tidak menyentuh RPC (tidak memakan kuota). */
export async function checkUsernameClaim(raw: string, rpc: ClaimRpc): Promise<UsernameCheckResult> {
  const parsed = usernameSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "invalid", message: parsed.error.issues[0].message };
  }
  try {
    const value = await rpc(parsed.data);
    const status = RPC_STATUSES.find((s) => s === value);
    return result(status ?? "error");
  } catch {
    return result("error");
  }
}

export function httpStatusFor(status: UsernameCheckStatus): 200 | 429 | 503 {
  return status === "rate_limited" ? 429 : status === "error" ? 503 : 200;
}
