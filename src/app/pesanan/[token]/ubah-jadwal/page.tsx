import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BookingPageShell } from "@/components/booking-page/page-shell";
import { Button } from "@/components/ui/button";
import {
  bookingCode,
  customerManageErrorMessage,
  DEFAULT_MANAGE_SETTINGS,
  manageState,
  type ManageSettings,
} from "@/lib/booking/customer-manage";
import { buildDateStrip } from "@/lib/booking/schedule";
import { jakartaDateISO } from "@/lib/booking/slots";
import { ROUTES } from "@/lib/routes";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTheme } from "@/lib/theme/resolve";
import type { MerchantTheme, SubscriptionTier } from "@/types/database";

import { RescheduleForm } from "./reschedule-form";

// Sama seperti halaman status: tidak boleh ter-cache, kuota dan jadwal berubah.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ubah jadwal",
  robots: { index: false, follow: false },
};

// access_token sengaja tidak dipilih: hanya dipakai sebagai filter WHERE.
const BOOKING_COLUMNS =
  "id, merchant_id, service_name, start_datetime, status, attended_at, no_show_at, reschedule_count, amount_due_now, service_id, staff_id, paid_at" as const;

type MerchantRow = {
  username: string | null;
  subscription_tier: SubscriptionTier;
  merchant_themes?: MerchantTheme | MerchantTheme[] | null;
};

// Di luar komponen: react-hooks/purity melarang Date.now() saat render.
const nowMs = () => Date.now();

const REASON_ERROR = { OFF: "BK041", STATUS: "BK040", DEADLINE: "BK042", LIMIT: "BK043" } as const;

export default async function RescheduleBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("access_token", token)
    .maybeSingle();
  if (bookingError) {
    console.error("[ubah-jadwal] gagal memuat booking", { error: bookingError });
    throw new Error("Gagal memuat data booking.");
  }
  if (!booking) notFound();

  const [merchantRes, settingsRes, availabilityRes] = await Promise.all([
    admin
      .from("merchants")
      .select("username, subscription_tier, merchant_themes(*)")
      .eq("id", booking.merchant_id)
      .maybeSingle<MerchantRow>(),
    admin
      .from("merchant_settings")
      .select("allow_customer_reschedule, reschedule_min_hours, max_reschedules, allow_customer_cancel, cancel_min_hours, policy_text")
      .eq("merchant_id", booking.merchant_id)
      .maybeSingle<ManageSettings>(),
    admin.from("availability").select("day_of_week").eq("merchant_id", booking.merchant_id),
  ]);
  if (merchantRes.error || !merchantRes.data) {
    console.error("[ubah-jadwal] gagal memuat merchant", { merchantId: booking.merchant_id, error: merchantRes.error });
    throw new Error("Gagal memuat data merchant.");
  }
  if (settingsRes.error) console.error("[ubah-jadwal] gagal memuat setelan", { error: settingsRes.error });
  if (availabilityRes.error) console.error("[ubah-jadwal] gagal memuat jam buka", { error: availabilityRes.error });

  const merchant = merchantRes.data;
  const themeRaw = merchant.merchant_themes;
  const theme = resolveTheme(
    merchant.subscription_tier,
    Array.isArray(themeRaw) ? (themeRaw[0] ?? null) : (themeRaw ?? null),
  );
  const settings = settingsRes.data ?? DEFAULT_MANAGE_SETTINGS;
  const manage = manageState(booking, settings, nowMs());
  const code = bookingCode(booking.id);
  const backHref = ROUTES.bookingStatus(token);

  if (!manage.reschedule.allowed || !booking.service_id || !merchant.username) {
    const reason = manage.reschedule.allowed ? "STATUS" : manage.reschedule.reason;
    return (
      <BookingPageShell theme={theme}>
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            Jadwal booking ini tidak bisa diubah lewat halaman ini.
          </h1>
          <p className="text-muted-foreground text-sm text-pretty">
            {customerManageErrorMessage(REASON_ERROR[reason])}
          </p>
          <Button asChild variant="outline" className="min-h-11 w-full">
            <Link href={backHref}>Hubungi merchant</Link>
          </Button>
          <Button asChild className="min-h-11 w-full">
            <Link href={backHref}>Kembali ke booking</Link>
          </Button>
        </div>
      </BookingPageShell>
    );
  }

  const openDays = new Set((availabilityRes.data ?? []).map((row) => row.day_of_week));
  const strip = buildDateStrip(openDays, jakartaDateISO(new Date()));

  return (
    <BookingPageShell theme={theme}>
      <RescheduleForm
        token={token}
        username={merchant.username}
        serviceId={booking.service_id}
        staffId={booking.staff_id}
        serviceName={booking.service_name}
        code={code}
        currentStart={booking.start_datetime}
        earliestNewStart={manage.reschedule.earliestNewStart}
        left={manage.reschedule.left}
        max={settings.max_reschedules}
        paidAmount={booking.paid_at && Number(booking.amount_due_now) > 0 ? Number(booking.amount_due_now) : null}
        strip={strip}
      />
    </BookingPageShell>
  );
}
