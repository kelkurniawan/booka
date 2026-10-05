import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env/server";
import { ROUTES } from "@/lib/routes";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Booking,
  Database,
  Merchant,
  NotificationChannel,
  NotificationKind,
} from "@/types/database";

import { sendEmail, type EmailConfig } from "./email";
import {
  customerPaidWhatsapp,
  customerReminderWhatsapp,
  merchantPaidEmail,
  merchantPaidWhatsapp,
  type BookingMessageData,
} from "./templates";
import { sendWhatsapp, type SendResult, type WhatsappConfig } from "./whatsapp";
import { tomorrowJakartaRange } from "./window";

type Admin = SupabaseClient<Database>;
type BookingRow = Pick<
  Booking,
  | "id"
  | "merchant_id"
  | "service_name"
  | "service_price"
  | "start_datetime"
  | "customer_name"
  | "customer_whatsapp"
  | "access_token"
>;
type MerchantRow = Pick<
  Merchant,
  "id" | "full_name" | "username" | "whatsapp_number" | "subscription_tier"
>;

const BOOKING_COLUMNS =
  "id, merchant_id, service_name, service_price, start_datetime, customer_name, customer_whatsapp, access_token";

/** Paket yang mendapat reminder H-1 (PRD bagian 1: "WhatsApp Reminder" di Pro). */
const REMINDER_TIERS: Merchant["subscription_tier"][] = ["PRO", "STUDIO"];

function emailConfig(): EmailConfig | null {
  const env = serverEnv();
  return env.resendApiKey && env.emailFrom ? { apiKey: env.resendApiKey, from: env.emailFrom } : null;
}

function whatsappConfig(): WhatsappConfig | null {
  const env = serverEnv();
  if (!env.whatsappProvider || !env.whatsappApiKey) return null;
  return {
    provider: env.whatsappProvider,
    apiUrl: env.whatsappApiUrl,
    apiKey: env.whatsappApiKey,
    session: env.whatsappSession,
  };
}

/**
 * Mengklaim satu pengiriman. Hanya pemanggil yang berhasil menyisipkan
 * baris (booking_id, kind, channel) yang boleh mengirim -- webhook yang
 * di-retry atau cron yang terpanggil dua kali mendapat `false`.
 */
async function claim(
  admin: Admin,
  booking: BookingRow,
  kind: NotificationKind,
  channel: NotificationChannel,
): Promise<string | null> {
  const { data, error } = await admin
    .from("notification_log")
    .upsert(
      { booking_id: booking.id, merchant_id: booking.merchant_id, kind, channel },
      { onConflict: "booking_id,kind,channel", ignoreDuplicates: true },
    )
    .select("id");
  if (error) {
    console.error("[notify] gagal mengklaim notifikasi", { bookingId: booking.id, kind, channel, error });
    return null;
  }
  return data?.[0]?.id ?? null;
}

async function settle(admin: Admin, logId: string, result: SendResult | { skipped: string }) {
  const update =
    "skipped" in result
      ? { status: "SKIPPED" as const, detail: result.skipped }
      : result.ok
        ? { status: "SENT" as const, detail: null }
        : { status: "FAILED" as const, detail: result.reason.slice(0, 300) };
  const { error } = await admin.from("notification_log").update(update).eq("id", logId);
  if (error) console.error("[notify] gagal mencatat hasil notifikasi", { logId, error });
}

/** Klaim, kirim, catat -- satu notifikasi untuk satu kanal. */
async function deliver(
  admin: Admin,
  booking: BookingRow,
  kind: NotificationKind,
  channel: NotificationChannel,
  send: () => Promise<SendResult | { skipped: string }>,
) {
  const logId = await claim(admin, booking, kind, channel);
  if (!logId) return;
  let result: SendResult | { skipped: string };
  try {
    result = await send();
  } catch (error) {
    result = { ok: false, reason: error instanceof Error ? error.message : "gagal mengirim" };
  }
  await settle(admin, logId, result);
}

function messageData(booking: BookingRow, merchant: MerchantRow): BookingMessageData {
  const base = serverEnv().appUrl;
  return {
    merchantName: merchant.full_name ?? merchant.username ?? "Merchant",
    merchantWhatsapp: merchant.whatsapp_number,
    customerName: booking.customer_name,
    customerWhatsapp: booking.customer_whatsapp,
    serviceName: booking.service_name,
    servicePrice: booking.service_price,
    startDatetime: booking.start_datetime,
    statusUrl: new URL(ROUTES.bookingStatus(booking.access_token), base).toString(),
    dashboardUrl: new URL(ROUTES.bookings, base).toString(),
  };
}

/**
 * Notifikasi "DP sudah dibayar": email + WA ke merchant, WA ke pelanggan.
 *
 * Dipanggil lewat `after()` dari webhook, jadi TIDAK BOLEH melempar --
 * kegagalan apa pun cukup tercatat di notification_log dan log server.
 */
export async function notifyBookingPaid(bookingId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: booking } = await admin
      .from("bookings")
      .select(BOOKING_COLUMNS)
      .eq("id", bookingId)
      .eq("status", "PAID")
      .maybeSingle();
    if (!booking) return;

    const { data: merchant } = await admin
      .from("merchants")
      .select("id, full_name, username, whatsapp_number, subscription_tier")
      .eq("id", booking.merchant_id)
      .maybeSingle();
    if (!merchant) return;

    const data = messageData(booking, merchant);
    const email = emailConfig();
    const whatsapp = whatsappConfig();

    await Promise.all([
      deliver(admin, booking, "BOOKING_PAID_MERCHANT", "EMAIL", async () => {
        if (!email) return { skipped: "Email belum dikonfigurasi" };
        const { data: authUser } = await admin.auth.admin.getUserById(booking.merchant_id);
        const to = authUser.user?.email;
        if (!to) return { skipped: "Merchant tidak punya email" };
        return sendEmail(email, to, merchantPaidEmail(data));
      }),
      deliver(admin, booking, "BOOKING_PAID_MERCHANT", "WHATSAPP", async () => {
        if (!whatsapp) return { skipped: "WhatsApp belum dikonfigurasi" };
        if (!merchant.whatsapp_number) return { skipped: "Merchant belum mengisi nomor WhatsApp" };
        return sendWhatsapp(whatsapp, merchant.whatsapp_number, merchantPaidWhatsapp(data));
      }),
      deliver(admin, booking, "BOOKING_PAID_CUSTOMER", "WHATSAPP", async () => {
        if (!whatsapp) return { skipped: "WhatsApp belum dikonfigurasi" };
        return sendWhatsapp(whatsapp, booking.customer_whatsapp, customerPaidWhatsapp(data));
      }),
    ]);
  } catch (error) {
    console.error("[notify] notifyBookingPaid gagal", { bookingId, error });
  }
}

/** Jeda antarpesan supaya gateway WhatsApp tidak terlihat seperti bot spam. */
const REMINDER_GAP_MS = 1500;

/**
 * Reminder H-1 ke pelanggan untuk semua booking PAID yang jadwalnya besok
 * (hari kalender WIB), khusus merchant Pro/Studio. Dipanggil cron harian.
 */
export async function sendDayBeforeReminders(
  now: Date = new Date(),
): Promise<{ candidates: number }> {
  const whatsapp = whatsappConfig();
  const admin = createAdminClient();
  const { from, to } = tomorrowJakartaRange(now);

  const { data: bookings, error } = await admin
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("status", "PAID")
    .gte("start_datetime", from.toISOString())
    .lt("start_datetime", to.toISOString())
    .order("start_datetime", { ascending: true })
    .limit(1000);
  if (error) throw error;
  if (!bookings || bookings.length === 0) return { candidates: 0 };

  const merchantIds = [...new Set(bookings.map((b) => b.merchant_id))];
  const { data: merchants, error: merchantsError } = await admin
    .from("merchants")
    .select("id, full_name, username, whatsapp_number, subscription_tier")
    .in("id", merchantIds)
    .in("subscription_tier", REMINDER_TIERS);
  if (merchantsError) throw merchantsError;

  const merchantById = new Map((merchants ?? []).map((m) => [m.id, m]));
  const eligible = bookings.filter((b) => merchantById.has(b.merchant_id));
  for (const booking of eligible) {
    const merchant = merchantById.get(booking.merchant_id)!;
    const data = messageData(booking, merchant);
    await deliver(admin, booking, "REMINDER_CUSTOMER", "WHATSAPP", async () => {
      if (!whatsapp) return { skipped: "WhatsApp belum dikonfigurasi" };
      const result = await sendWhatsapp(whatsapp, booking.customer_whatsapp, customerReminderWhatsapp(data));
      await new Promise((resolve) => setTimeout(resolve, REMINDER_GAP_MS));
      return result;
    });
  }

  return { candidates: eligible.length };
}
