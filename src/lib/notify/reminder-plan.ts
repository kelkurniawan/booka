import type {
  BookingReminderPrefs,
  MerchantSettings,
  NotificationChannel,
  NotificationKind,
  SubscriptionTier,
} from "@/types/database";

import { jakartaDateISO, jakartaWallClockToUtc } from "@/lib/booking/slots";

/** Paket yang boleh mengirim pengingat ke pelanggan (Keputusan 16). */
export const REMINDER_TIERS: SubscriptionTier[] = ["PRO", "STUDIO"];

export type ReminderOffset = "DAY_BEFORE" | "SAME_DAY";

export const REMINDER_KIND: Record<ReminderOffset, NotificationKind> = {
  DAY_BEFORE: "REMINDER_CUSTOMER",
  SAME_DAY: "REMINDER_CUSTOMER_SAME_DAY",
};

export type ReminderSettings = Pick<
  MerchantSettings,
  "reminder_whatsapp" | "reminder_email" | "reminder_push" | "reminder_day_before" | "reminder_same_day"
>;

/** Dipakai bila merchant belum punya baris merchant_settings. */
export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  reminder_whatsapp: true,
  reminder_email: true,
  reminder_push: true,
  reminder_day_before: true,
  reminder_same_day: false,
};

export type ReminderPrefs = Pick<BookingReminderPrefs, "whatsapp" | "email" | "day_before" | "same_day">;

/**
 * Keputusan 17: kanal mana yang dipakai untuk satu booking dan satu offset.
 * Offset mati (prefs menimpa merchant bila tidak null) -> []. Kanal yang
 * dimatikan merchant tidak pernah dipakai. WhatsApp default hidup tanpa prefs;
 * email butuh alamat di prefs; push butuh langganan.
 */
export function reminderChannels(
  offset: ReminderOffset,
  s: ReminderSettings,
  p: ReminderPrefs | null,
  hasPush: boolean,
): NotificationChannel[] {
  const offsetOn =
    offset === "DAY_BEFORE" ? (p?.day_before ?? s.reminder_day_before) : (p?.same_day ?? s.reminder_same_day);
  if (!offsetOn) return [];
  const channels: NotificationChannel[] = [];
  if (s.reminder_whatsapp && (p?.whatsapp ?? true)) channels.push("WHATSAPP");
  if (s.reminder_email && p?.email) channels.push("EMAIL");
  if (s.reminder_push && hasPush) channels.push("PUSH");
  return channels;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SEND_TIME = "08:00"; // cron harian 01:00 UTC (Keputusan 1)
const SAME_DAY_LEAD_MS = 30 * 60 * 1000; // sama dengan sameDayRange di window.ts

/**
 * Offset yang MASIH bisa terkirim untuk satu booking pada waktu `nowMs`.
 * H-1: jam kirim 08.00 WIB di hari sebelumnya harus belum lewat. Hari H: jam
 * kirim 08.00 WIB hari itu belum lewat dan booking mulai paling cepat 08.30.
 * Booking yang sudah selesai tidak punya offset terjangkau.
 */
export function reachableOffsets(
  startISO: string,
  endISO: string,
  nowMs: number,
): { dayBefore: boolean; sameDay: boolean } {
  const startMs = Date.parse(startISO);
  if (Date.parse(endISO) <= nowMs) return { dayBefore: false, sameDay: false };
  const dayBeforeSend = jakartaWallClockToUtc(jakartaDateISO(new Date(startMs - DAY_MS)), SEND_TIME).getTime();
  const sameDaySend = jakartaWallClockToUtc(jakartaDateISO(new Date(startMs)), SEND_TIME).getTime();
  return {
    dayBefore: dayBeforeSend > nowMs,
    sameDay: sameDaySend > nowMs && startMs >= sameDaySend + SAME_DAY_LEAD_MS,
  };
}
