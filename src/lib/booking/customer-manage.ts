// Modul murni kelola booking oleh pelanggan: kebijakan ubah jadwal dan batal,
// baris kebijakan di halaman, kode booking, dan pesan error. Cermin aturan RPC
// reschedule_booking dan cancel_booking_by_customer (Keputusan 3 dan 4 di
// rencana F4). Tanpa React dan tanpa akses data, supaya bisa diuji langsung.

import { formatDateTime } from "@/lib/format";
import type { Booking, MerchantSettings } from "@/types/database";

export const CUSTOMER_CANCEL_REASON = "Dibatalkan pelanggan";

export type ManageSettings = Pick<MerchantSettings,
  "allow_customer_reschedule" | "reschedule_min_hours" | "max_reschedules" |
  "allow_customer_cancel" | "cancel_min_hours" | "policy_text">;

// Default sama dengan kolom di migration: fitur mati sampai merchant menyalakannya.
export const DEFAULT_MANAGE_SETTINGS: ManageSettings = {
  allow_customer_reschedule: false,
  reschedule_min_hours: 24,
  max_reschedules: 1,
  allow_customer_cancel: false,
  cancel_min_hours: 24,
  policy_text: null,
};

export type ManageBooking = Pick<Booking,
  "id" | "status" | "start_datetime" | "attended_at" | "no_show_at" | "reschedule_count" | "amount_due_now">;

export type ManageState = {
  reschedule:
    | { allowed: true; deadline: string; left: number; earliestNewStart: string }
    | { allowed: false; reason: "OFF" | "STATUS" | "DEADLINE" | "LIMIT" };
  cancel:
    | { allowed: true; deadline: string | null }   // null untuk REQUESTED
    | { allowed: false; reason: "OFF" | "STATUS" | "DEADLINE" };
};

const HOUR_MS = 60 * 60 * 1000;

/** Cermin persis aturan RPC Task 1 (Keputusan 3 dan 4). Tanggal ISO UTC. */
export function manageState(b: ManageBooking, s: ManageSettings, nowMs: number): ManageState {
  const startMs = Date.parse(b.start_datetime);
  const hasAttendance = b.attended_at !== null || b.no_show_at !== null;
  // PAID/CONFIRMED tanpa catatan kehadiran: satu-satunya status yang bisa diubah atau dibatalkan mengikuti kebijakan.
  const active = (b.status === "PAID" || b.status === "CONFIRMED") && !hasAttendance;

  let reschedule: ManageState["reschedule"];
  const rescheduleDeadlineMs = startMs - s.reschedule_min_hours * HOUR_MS;
  const left = s.max_reschedules - b.reschedule_count;
  if (!active) reschedule = { allowed: false, reason: "STATUS" };
  else if (!s.allow_customer_reschedule) reschedule = { allowed: false, reason: "OFF" };
  else if (nowMs > rescheduleDeadlineMs) reschedule = { allowed: false, reason: "DEADLINE" };
  else if (left <= 0) reschedule = { allowed: false, reason: "LIMIT" };
  else reschedule = {
    allowed: true,
    deadline: new Date(rescheduleDeadlineMs).toISOString(),
    left,
    earliestNewStart: new Date(nowMs + s.reschedule_min_hours * HOUR_MS).toISOString(),
  };

  // Batal: REQUESTED yang belum mulai selalu boleh (tanpa tenggat). PAID/CONFIRMED mengikuti kebijakan.
  let cancel: ManageState["cancel"];
  const cancelDeadlineMs = startMs - s.cancel_min_hours * HOUR_MS;
  if (b.status === "REQUESTED" && !hasAttendance) {
    cancel = nowMs > startMs ? { allowed: false, reason: "STATUS" } : { allowed: true, deadline: null };
  } else if (!active) {
    cancel = { allowed: false, reason: "STATUS" };
  } else if (!s.allow_customer_cancel) {
    cancel = { allowed: false, reason: "OFF" };
  } else if (nowMs > cancelDeadlineMs) {
    cancel = { allowed: false, reason: "DEADLINE" };
  } else {
    cancel = { allowed: true, deadline: new Date(cancelDeadlineMs).toISOString() };
  }

  return { reschedule, cancel };
}

/** Baris kebijakan untuk halaman pelanggan. Tenggat dihitung dari setelan, meski booking sudah lewat tenggat. */
export function policyLines(b: ManageBooking, s: ManageSettings, merchantName: string): string[] {
  // REQUESTED boleh dibatalkan tanpa kebijakan (Keputusan 4): belum ada uang dan belum ada janji slot.
  if (b.status === "REQUESTED") return ["Belum ada pembayaran."];
  const startMs = Date.parse(b.start_datetime);
  const lines: string[] = [];
  if (s.allow_customer_reschedule) {
    const deadline = new Date(startMs - s.reschedule_min_hours * HOUR_MS).toISOString();
    lines.push(`Ubah jadwal gratis sampai ${formatDateTime(deadline)}, maksimal ${s.max_reschedules} kali.`);
  } else {
    lines.push(`Ubah jadwal lewat halaman ini tidak tersedia. Hubungi ${merchantName}.`);
  }
  if (s.allow_customer_cancel) {
    const deadline = new Date(startMs - s.cancel_min_hours * HOUR_MS).toISOString();
    lines.push(`Batal sendiri paling lambat ${formatDateTime(deadline)}.`);
  } else {
    lines.push(`Pembatalan lewat halaman ini tidak tersedia. Hubungi ${merchantName}.`);
  }
  if (s.policy_text) lines.push(s.policy_text);
  else if (b.amount_due_now > 0) lines.push(`Soal pengembalian pembayaran, hubungi ${merchantName}.`);
  return lines;
}

/** "BK-" + 6 hex pertama id tanpa tanda hubung, huruf besar. */
export function bookingCode(id: string): string {
  return `BK-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

const ERROR_MESSAGES = new Map<string, string>([
  ["BK040", "Booking ini tidak bisa diubah lagi."],
  ["BK041", "Merchant tidak mengizinkan ubah jadwal lewat halaman ini."],
  ["BK042", "Batas waktu ubah jadwal sudah lewat."],
  ["BK043", "Anda sudah memakai semua kesempatan ubah jadwal."],
  ["BK044", "Merchant tidak mengizinkan pembatalan lewat halaman ini."],
  ["BK045", "Batas waktu pembatalan sudah lewat."],
  ["BK046", "Jadwal baru terlalu dekat. Pilih jam yang lebih jauh."],
  ["BK003", "Staf untuk booking ini sudah tidak tersedia. Silakan hubungi merchant."],
  ["23P01", "Jam itu baru saja terisi. Pilih jam lain."],
  ["BK001", "Jam itu di luar jam buka. Pilih jam lain."],
  ["P0006", "Jam itu sudah lewat. Pilih jam lain."],
]);

/** Pesan aman untuk pelanggan; error Postgres mentah tidak pernah diteruskan. */
export function customerManageErrorMessage(code: string | undefined): string {
  return ERROR_MESSAGES.get(code ?? "") ?? "Gagal menyimpan. Coba lagi.";
}
