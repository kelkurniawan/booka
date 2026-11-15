import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BookingPageShell } from "@/components/booking-page/page-shell";
import { Button } from "@/components/ui/button";
import { clientEnv } from "@/lib/env/client";
import { DEFAULT_REMINDER_SETTINGS, reachableOffsets, REMINDER_TIERS } from "@/lib/notify/reminder-plan";
import { ROUTES } from "@/lib/routes";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTheme } from "@/lib/theme/resolve";
import type { BookingReminderPrefs, MerchantSettings, MerchantTheme, SubscriptionTier } from "@/types/database";

import { ReminderForm } from "./reminder-form";

// Sama seperti halaman status: pilihan pengingat berubah-ubah, jangan di-cache.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pengingat",
  robots: { index: false, follow: false },
};

// access_token sengaja tidak dipilih: hanya dipakai sebagai filter WHERE.
const BOOKING_COLUMNS = "id, merchant_id, service_name, start_datetime, end_datetime, status, customer_whatsapp" as const;

type SettingsRow = Pick<
  MerchantSettings,
  "reminder_whatsapp" | "reminder_email" | "reminder_push" | "reminder_day_before" | "reminder_same_day"
>;

type MerchantRow = {
  subscription_tier: SubscriptionTier;
  merchant_themes?: MerchantTheme | MerchantTheme[] | null;
};

// Di luar komponen: react-hooks/purity melarang Date.now() saat render.
const nowMs = () => Date.now();

export default async function ReminderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{48}$/.test(token)) notFound();
  const admin = createAdminClient();

  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("access_token", token)
    .maybeSingle();
  if (bookingError) {
    console.error("[pengingat] gagal memuat booking", { error: bookingError });
    throw new Error("Gagal memuat data booking.");
  }
  if (!booking) notFound();

  const [merchantRes, settingsRes, prefsRes, pushRes] = await Promise.all([
    admin
      .from("merchants")
      .select("subscription_tier, merchant_themes(*)")
      .eq("id", booking.merchant_id)
      .maybeSingle<MerchantRow>(),
    admin
      .from("merchant_settings")
      .select("reminder_whatsapp, reminder_email, reminder_push, reminder_day_before, reminder_same_day")
      .eq("merchant_id", booking.merchant_id)
      .maybeSingle<SettingsRow>(),
    admin
      .from("booking_reminder_prefs")
      .select("whatsapp, email, day_before, same_day")
      .eq("merchant_id", booking.merchant_id)
      .eq("booking_id", booking.id)
      .maybeSingle<Pick<BookingReminderPrefs, "whatsapp" | "email" | "day_before" | "same_day">>(),
    admin
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", booking.merchant_id)
      .eq("booking_id", booking.id),
  ]);
  if (merchantRes.error || !merchantRes.data) {
    console.error("[pengingat] gagal memuat merchant", { merchantId: booking.merchant_id, error: merchantRes.error });
    throw new Error("Gagal memuat data merchant.");
  }
  // Query tambahan gagal -> default, halaman tetap tampil.
  for (const [name, res] of [["merchant_settings", settingsRes], ["booking_reminder_prefs", prefsRes], ["push_subscriptions", pushRes]] as const) {
    if (res.error) console.error(`[pengingat] gagal memuat ${name}`, { merchantId: booking.merchant_id, error: res.error });
  }

  const merchant = merchantRes.data;
  const themeRaw = merchant.merchant_themes;
  const theme = resolveTheme(merchant.subscription_tier, Array.isArray(themeRaw) ? (themeRaw[0] ?? null) : (themeRaw ?? null));
  const settings = settingsRes.data ?? DEFAULT_REMINDER_SETTINGS;
  const prefs = prefsRes.data;
  const backHref = ROUTES.bookingStatus(token);
  const reachable = reachableOffsets(booking.start_datetime, booking.end_datetime, nowMs());

  const available =
    REMINDER_TIERS.includes(merchant.subscription_tier) &&
    (booking.status === "PAID" || booking.status === "CONFIRMED") &&
    Date.parse(booking.end_datetime) > nowMs() &&
    (settings.reminder_whatsapp || settings.reminder_email || settings.reminder_push);
  if (!available) {
    return (
      <BookingPageShell theme={theme}>
        <section className="border-border bg-card flex flex-col gap-4 rounded-[var(--radius)] border p-4">
          <h1 className="text-lg font-semibold text-balance">Pengingat tidak tersedia untuk booking ini.</h1>
          <Button asChild className="min-h-11 w-full">
            <Link href={backHref}>Kembali ke booking</Link>
          </Button>
        </section>
      </BookingPageShell>
    );
  }

  return (
    <BookingPageShell theme={theme}>
      <ReminderForm
        token={token}
        vapidPublicKey={clientEnv().vapidPublicKey}
        serviceName={booking.service_name}
        startISO={booking.start_datetime}
        phoneLast4={booking.customer_whatsapp.slice(-4)}
        offered={{ whatsapp: settings.reminder_whatsapp, email: settings.reminder_email, push: settings.reminder_push }}
        reachable={reachable}
        initial={{
          whatsapp: prefs?.whatsapp ?? true,
          email: prefs?.email ?? null,
          dayBefore: (prefs?.day_before ?? settings.reminder_day_before) && reachable.dayBefore,
          sameDay: (prefs?.same_day ?? settings.reminder_same_day) && reachable.sameDay,
          push: (pushRes.count ?? 0) > 0,
        }}
      />
    </BookingPageShell>
  );
}
