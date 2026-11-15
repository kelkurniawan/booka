import type {
  BookingReminderPrefs,
  MerchantSettings,
  NotificationChannel,
  NotificationKind,
  SubscriptionTier,
} from "@/types/database";

/** Paket yang boleh mengirim pengingat ke pelanggan (Keputusan 12). */
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
