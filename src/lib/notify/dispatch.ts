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
import { REQUEST_REJECT_REASON } from "@/lib/booking/payment-mode";

import {
  customerApprovedWhatsapp,
  customerConfirmedWhatsapp,
  customerPaidWhatsapp,
  customerRejectedWhatsapp,
  merchantConfirmedEmail,
  merchantConfirmedWhatsapp,
  merchantRequestedEmail,
  merchantRequestedWhatsapp,
  customerReminderEmail,
  customerReminderPush,
  customerReminderWhatsapp,
  merchantPaidEmail,
  merchantPaidWhatsapp,
  merchantCustomerCancelledEmail,
  merchantCustomerCancelledWhatsapp,
  merchantRescheduledEmail,
  merchantRescheduledWhatsapp,
  type BookingMessageData,
} from "./templates";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { pushConfig, sendPush, type StoredPushSubscription } from "./push";
import {
  DEFAULT_REMINDER_SETTINGS,
  REMINDER_KIND,
  REMINDER_TIERS,
  reminderChannels,
  type ReminderOffset,
  type ReminderPrefs,
  type ReminderSettings,
} from "./reminder-plan";
import { sendWhatsapp, type SendResult, type WhatsappConfig } from "./whatsapp";
import { sameDayRange, tomorrowJakartaRange } from "./window";

type Admin = SupabaseClient<Database>;
type BookingRow = Pick<
  Booking,
  | "id"
  | "merchant_id"
  | "service_name"
  | "service_price"
  | "start_datetime"
  | "end_datetime"
  | "customer_name"
  | "customer_whatsapp"
  | "access_token"
  | "staff_name"
  | "court_name"
  | "party_size"
  | "table_label"
  | "customer_note"
  | "status"
  | "expires_at"
  | "amount_due_now"
  | "amount_due_on_site"
  | "paid_on_site_at"
  | "cancel_reason"
>;
type MerchantRow = Pick<
  Merchant,
  "id" | "full_name" | "username" | "whatsapp_number" | "subscription_tier"
>;

const BOOKING_COLUMNS =
  "id, merchant_id, service_name, service_price, start_datetime, end_datetime, customer_name, customer_whatsapp, access_token, staff_name, court_name, party_size, table_label, customer_note, status, expires_at, amount_due_now, amount_due_on_site, paid_on_site_at, cancel_reason, source";

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
    bookingId: booking.id,
    merchantName: merchant.full_name ?? merchant.username ?? "Merchant",
    merchantWhatsapp: merchant.whatsapp_number,
    customerName: booking.customer_name,
    customerWhatsapp: booking.customer_whatsapp,
    serviceName: booking.service_name,
    servicePrice: booking.service_price,
    startDatetime: booking.start_datetime,
    endDatetime: booking.end_datetime,
    staffName: booking.staff_name,
    courtName: booking.court_name,
    partySize: booking.party_size,
    tableLabel: booking.table_label,
    customerNote: booking.customer_note,
    statusUrl: new URL(ROUTES.bookingStatus(booking.access_token), base).toString(),
    dashboardUrl: new URL(ROUTES.bookings, base).toString(),
    amountDueNow: booking.amount_due_now,
    amountDueOnSite: booking.amount_due_on_site,
    respondBefore: booking.status === "REQUESTED" || booking.status === "PENDING" ? booking.expires_at : null,
    paidOnSite: booking.paid_on_site_at !== null,
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

async function loadForNotify(bookingId: string) {
  const admin = createAdminClient();
  const { data: booking } = await admin.from("bookings").select(BOOKING_COLUMNS).eq("id", bookingId).maybeSingle();
  if (!booking) return null;
  const { data: merchant } = await admin
    .from("merchants")
    .select("id, full_name, username, whatsapp_number, subscription_tier")
    .eq("id", booking.merchant_id)
    .maybeSingle();
  if (!merchant) return null;
  return { admin, booking, merchant, data: messageData(booking, merchant), whatsapp: whatsappConfig() };
}

/** Email + WA ke merchant (kanal dikonfigurasi di sini), bentuk sama dengan notifyBookingPaid. */
function toMerchant(
  ctx: NonNullable<Awaited<ReturnType<typeof loadForNotify>>>,
  kind: NotificationKind,
  emailMessage: (d: BookingMessageData) => ReturnType<typeof merchantPaidEmail>,
  whatsappMessage: (d: BookingMessageData) => string,
) {
  const { admin, booking, merchant, data, whatsapp } = ctx;
  const email = emailConfig();
  return [
    deliver(admin, booking, kind, "EMAIL", async () => {
      if (!email) return { skipped: "Email belum dikonfigurasi" };
      const { data: authUser } = await admin.auth.admin.getUserById(booking.merchant_id);
      const to = authUser.user?.email;
      if (!to) return { skipped: "Merchant tidak punya email" };
      return sendEmail(email, to, emailMessage(data));
    }),
    deliver(admin, booking, kind, "WHATSAPP", async () => {
      if (!whatsapp) return { skipped: "WhatsApp belum dikonfigurasi" };
      if (!merchant.whatsapp_number) return { skipped: "Merchant belum mengisi nomor WhatsApp" };
      return sendWhatsapp(whatsapp, merchant.whatsapp_number, whatsappMessage(data));
    }),
  ];
}

function toCustomer(
  ctx: NonNullable<Awaited<ReturnType<typeof loadForNotify>>>,
  kind: NotificationKind,
  message: (d: BookingMessageData) => string,
) {
  const { admin, booking, data, whatsapp } = ctx;
  return deliver(admin, booking, kind, "WHATSAPP", async () => {
    if (!whatsapp) return { skipped: "WhatsApp belum dikonfigurasi" };
    return sendWhatsapp(whatsapp, booking.customer_whatsapp, message(data));
  });
}

/** Booking baru lewat jalur tanpa pembayaran awal: CONFIRMED (bayar di tempat) atau REQUESTED. Tidak pernah melempar. */
export async function notifyBookingCreated(bookingId: string): Promise<void> {
  try {
    const ctx = await loadForNotify(bookingId);
    if (!ctx) return;
    const { status } = ctx.booking;
    if (status === "CONFIRMED") {
      // Booking manual: merchant sendiri yang mencatat, jadi hanya pelanggan yang diberi tahu.
      const merchantMessages =
        ctx.booking.source === "MANUAL"
          ? []
          : toMerchant(ctx, "BOOKING_CONFIRMED_MERCHANT", merchantConfirmedEmail, merchantConfirmedWhatsapp);
      await Promise.all([...merchantMessages, toCustomer(ctx, "BOOKING_CONFIRMED_CUSTOMER", customerConfirmedWhatsapp)]);
    } else if (status === "REQUESTED") {
      await Promise.all(
        toMerchant(ctx, "BOOKING_REQUESTED_MERCHANT", merchantRequestedEmail, merchantRequestedWhatsapp),
      );
    }
  } catch (error) {
    console.error("[notify] notifyBookingCreated gagal", { bookingId, error });
  }
}

/** Keputusan merchant atas permintaan (setuju, setuju tanpa bayar, tolak). Tidak pernah melempar. */
export async function notifyRequestDecided(bookingId: string): Promise<void> {
  try {
    const ctx = await loadForNotify(bookingId);
    if (!ctx) return;
    const { status, cancel_reason } = ctx.booking;
    if (status === "PENDING") await toCustomer(ctx, "BOOKING_APPROVED_CUSTOMER", customerApprovedWhatsapp);
    else if (status === "CONFIRMED") await toCustomer(ctx, "BOOKING_CONFIRMED_CUSTOMER", customerConfirmedWhatsapp);
    else if (status === "CANCELLED" && cancel_reason === REQUEST_REJECT_REASON)
      await toCustomer(ctx, "BOOKING_REJECTED_CUSTOMER", customerRejectedWhatsapp);
  } catch (error) {
    console.error("[notify] notifyRequestDecided gagal", { bookingId, error });
  }
}

export type CustomerChange = { type: "RESCHEDULED"; oldStart: string } | { type: "CANCELLED" };

/** Pelanggan mengubah jadwal atau membatalkan sendiri: kabari merchant lewat email + WA. Tidak pernah melempar. */
export async function notifyCustomerChange(bookingId: string, change: CustomerChange): Promise<void> {
  try {
    const ctx = await loadForNotify(bookingId);
    if (!ctx) return;
    const messages =
      change.type === "RESCHEDULED"
        ? toMerchant(
            ctx,
            "BOOKING_RESCHEDULED_MERCHANT",
            (d) => merchantRescheduledEmail(d, change.oldStart),
            (d) => merchantRescheduledWhatsapp(d, change.oldStart),
          )
        : toMerchant(ctx, "BOOKING_CANCELLED_MERCHANT", merchantCustomerCancelledEmail, merchantCustomerCancelledWhatsapp);
    await Promise.all(messages);
  } catch (error) {
    console.error("[notify] notifyCustomerChange gagal", { bookingId, error });
  }
}

/** Jeda antarpesan supaya gateway WhatsApp tidak terlihat seperti bot spam. */
const REMINDER_GAP_MS = 1500;

type ReminderBooking = BookingRow;

const REMINDER_BATCH_LIMIT = 1000;

async function loadWindow(admin: Admin, offset: ReminderOffset, now: Date) {
  const { from, to } = offset === "DAY_BEFORE" ? tomorrowJakartaRange(now) : sameDayRange(now);
  if (from >= to) return null;
  const { data: bookings, error } = await admin
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .in("status", ["PAID", "CONFIRMED"])
    .gte("start_datetime", from.toISOString())
    .lt("start_datetime", to.toISOString())
    .order("start_datetime", { ascending: true })
    .limit(REMINDER_BATCH_LIMIT);
  if (error) throw error;
  if (!bookings || bookings.length === 0) return null;
  if (bookings.length >= REMINDER_BATCH_LIMIT) {
    console.warn("[reminders] batas booking per jalan tercapai, sisanya tidak dikirim", { offset, limit: REMINDER_BATCH_LIMIT });
  }

  const merchantIds = [...new Set(bookings.map((b) => b.merchant_id))];
  const bookingIds = bookings.map((b) => b.id);
  const [merchants, settings, prefs, subs] = await Promise.all([
    admin
      .from("merchants")
      .select("id, full_name, username, whatsapp_number, subscription_tier")
      .in("id", merchantIds)
      .in("subscription_tier", REMINDER_TIERS),
    admin
      .from("merchant_settings")
      .select("merchant_id, reminder_whatsapp, reminder_email, reminder_push, reminder_day_before, reminder_same_day")
      .in("merchant_id", merchantIds),
    admin
      .from("booking_reminder_prefs")
      .select("booking_id, whatsapp, email, day_before, same_day")
      .in("booking_id", bookingIds)
      .in("merchant_id", merchantIds),
    admin
      .from("push_subscriptions")
      .select("id, booking_id, merchant_id, subscription_enc")
      .in("booking_id", bookingIds)
      .in("merchant_id", merchantIds),
  ]);
  for (const r of [merchants, settings, prefs, subs]) if (r.error) throw r.error;

  const merchantById = new Map((merchants.data ?? []).map((m) => [m.id, m]));
  const settingsById = new Map<string, ReminderSettings>((settings.data ?? []).map((x) => [x.merchant_id, x]));
  const prefsById = new Map<string, ReminderPrefs>((prefs.data ?? []).map((x) => [x.booking_id, x]));
  const subsById = new Map<string, NonNullable<typeof subs.data>>();
  for (const sub of subs.data ?? []) subsById.set(sub.booking_id, [...(subsById.get(sub.booking_id) ?? []), sub]);

  return bookings.flatMap((booking) => {
    const merchant = merchantById.get(booking.merchant_id);
    if (!merchant) return [];
    const bookingSubs = subsById.get(booking.id) ?? [];
    const channels = reminderChannels(
      offset,
      settingsById.get(booking.merchant_id) ?? DEFAULT_REMINDER_SETTINGS,
      prefsById.get(booking.id) ?? null,
      bookingSubs.length > 0,
    );
    if (channels.length === 0) return [];
    return [{ booking, merchant, channels, email: prefsById.get(booking.id)?.email ?? null, subs: bookingSubs }];
  });
}

/** Kirim push ke semua langganan; ok bila minimal satu berhasil, langganan mati dihapus. */
async function sendPushToAll(
  admin: Admin,
  booking: ReminderBooking,
  subs: { id: string; subscription_enc: string }[],
  payload: ReturnType<typeof customerReminderPush>,
): Promise<SendResult | { skipped: string }> {
  const config = pushConfig();
  if (!config) return { skipped: "Notifikasi HP belum dikonfigurasi" };
  let delivered = false;
  let lastReason = "tidak ada langganan";
  for (const row of subs) {
    let sub: StoredPushSubscription;
    try {
      sub = JSON.parse(
        decryptSecret(row.subscription_enc, {
          merchantId: booking.merchant_id,
          bookingId: booking.id,
          field: "push_subscription",
        }),
      );
    } catch {
      await admin.from("push_subscriptions").delete().eq("id", row.id).eq("merchant_id", booking.merchant_id);
      lastReason = "push: langganan tidak terbaca";
      continue;
    }
    const result = await sendPush(config, sub, payload);
    if (result.ok) delivered = true;
    else {
      lastReason = result.reason;
      if (result.gone) {
        await admin.from("push_subscriptions").delete().eq("id", row.id).eq("merchant_id", booking.merchant_id);
      }
    }
  }
  return delivered ? { ok: true } : { ok: false, reason: lastReason };
}

/**
 * Pengingat ke pelanggan untuk dua offset (H-1 dan pagi hari jadwal) lewat
 * WhatsApp, email, dan push, hanya booking PAID/CONFIRMED milik merchant
 * Pro/Studio. Dipanggil cron harian; idempoten lewat notification_log.
 */
export async function sendReminders(
  now: Date = new Date(),
): Promise<{ candidates: number; pruned: number }> {
  const admin = createAdminClient();
  const { data: prunedCount, error: pruneError } = await admin.rpc("prune_push_subscriptions");
  if (pruneError) console.error("[notify] gagal memangkas langganan push", { error: pruneError });
  const pruned = pruneError ? 0 : (prunedCount ?? 0);

  const whatsapp = whatsappConfig();
  const email = emailConfig();
  const candidateIds = new Set<string>();

  for (const offset of ["DAY_BEFORE", "SAME_DAY"] as const) {
    const items = await loadWindow(admin, offset, now);
    for (const { booking, merchant, channels, email: to, subs } of items ?? []) {
      candidateIds.add(booking.id);
      const data = messageData(booking, merchant);
      const kind = REMINDER_KIND[offset];
      for (const channel of channels) {
        if (channel === "WHATSAPP") {
          await deliver(admin, booking, kind, channel, async () => {
            if (!whatsapp) return { skipped: "WhatsApp belum dikonfigurasi" };
            const result = await sendWhatsapp(
              whatsapp,
              booking.customer_whatsapp,
              customerReminderWhatsapp(data, offset),
            );
            await new Promise((resolve) => setTimeout(resolve, REMINDER_GAP_MS));
            return result;
          });
        } else if (channel === "EMAIL") {
          await deliver(admin, booking, kind, channel, async () => {
            if (!email) return { skipped: "Email belum dikonfigurasi" };
            if (!to) return { skipped: "Pelanggan tidak punya email" };
            return sendEmail(email, to, customerReminderEmail(data, offset));
          });
        } else {
          await deliver(admin, booking, kind, channel, () =>
            sendPushToAll(admin, booking, subs, customerReminderPush(data, offset)),
          );
        }
      }
    }
  }

  return { candidates: candidateIds.size, pruned };
}
