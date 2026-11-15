import type { NotificationChannel, NotificationKind, NotificationStatus } from "@/types/database";

const KIND_LABEL: Record<NotificationKind, string> = {
  BOOKING_PAID_MERCHANT: "Pemberitahuan ke Anda",
  BOOKING_PAID_CUSTOMER: "Konfirmasi ke pelanggan",
  REMINDER_CUSTOMER: "Reminder H-1 ke pelanggan",
  BOOKING_CONFIRMED_MERCHANT: "Pemberitahuan ke Anda",
  BOOKING_CONFIRMED_CUSTOMER: "Konfirmasi ke pelanggan",
  BOOKING_REQUESTED_MERCHANT: "Permintaan ke Anda",
  BOOKING_APPROVED_CUSTOMER: "Tautan bayar ke pelanggan",
  BOOKING_REJECTED_CUSTOMER: "Penolakan ke pelanggan",
};

const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  EMAIL: "email",
  WHATSAPP: "WhatsApp",
};

const STATUS_LABEL: Record<NotificationStatus, string> = {
  SENT: "terkirim",
  PENDING: "sedang dikirim",
  FAILED: "gagal",
  SKIPPED: "dilewati",
};

/** Satu baris riwayat pesan untuk BookingTimeline, mis. "Konfirmasi ke pelanggan lewat WhatsApp, terkirim". */
export function notificationLabel(kind: NotificationKind, channel: NotificationChannel, status: NotificationStatus): string {
  return `${KIND_LABEL[kind]} lewat ${CHANNEL_LABEL[channel]}, ${STATUS_LABEL[status]}`;
}
