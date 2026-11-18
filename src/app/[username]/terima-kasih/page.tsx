import type { Metadata } from "next";
import Link from "next/link";

import { BookingPageShell } from "@/components/booking-page/page-shell";
import { ROUTES } from "@/lib/routes";
import { createPublicClient } from "@/lib/supabase/server";
import { resolveTheme } from "@/lib/theme/resolve";
import type { MerchantTheme } from "@/types/database";

import { ThankYouClient } from "./thank-you-client";

// Halaman ini memuat pixel: tidak boleh diindeks dan tidak boleh memuat token.
export const metadata: Metadata = { title: "Terima kasih", robots: { index: false }, referrer: "no-referrer" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ThankYouPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ e?: string | string[] }>;
}) {
  const { username } = await params;
  const { e } = await searchParams;
  const eventId = typeof e === "string" && UUID.test(e) ? e.toLowerCase() : null;

  const supabase = createPublicClient();
  const { data: merchant } = await supabase
    .from("merchants")
    .select("id, full_name, subscription_tier, merchant_themes(*)")
    .eq("username", username)
    .maybeSingle();
  const themeRaw = (merchant as { merchant_themes?: MerchantTheme | MerchantTheme[] | null } | null)?.merchant_themes;
  const theme = resolveTheme(merchant?.subscription_tier ?? "STARTER", Array.isArray(themeRaw) ? (themeRaw[0] ?? null) : (themeRaw ?? null));

  const { data: paidRows } = eventId ? await supabase.rpc("get_paid_event", { p_event_id: eventId }) : { data: null };
  const paid = paidRows?.[0];
  // Event milik merchant lain diperlakukan sama dengan tidak ditemukan.
  const valid = Boolean(merchant && eventId && paid && paid.merchant_id === merchant.id);

  let ids = { meta: null as string | null, tiktok: null as string | null, ga4: null as string | null };
  if (valid && merchant) {
    const { data: tracking } = await supabase.rpc("get_public_tracking", { p_merchant_id: merchant.id });
    const t = tracking?.[0];
    if (t) ids = { meta: t.meta_pixel_id, tiktok: t.tiktok_pixel_id, ga4: t.ga4_measurement_id };
  }

  return (
    <BookingPageShell theme={theme}>
      <div className="flex flex-col gap-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {valid ? "Terima kasih, pembayaran diterima" : "Pembayaran sudah tercatat"}
        </h1>
        {valid && paid ? (
          <p className="text-muted-foreground text-sm text-pretty">
            {paid.service_name}
            {merchant?.full_name ? ` di ${merchant.full_name}` : ""} sudah terkonfirmasi.
          </p>
        ) : null}
        {valid && paid && eventId ? (
          <ThankYouClient eventId={eventId} value={Number(paid.amount)} serviceName={paid.service_name} ids={ids} />
        ) : null}
        <Link
          href={ROUTES.merchantPage(username)}
          className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
        >
          Kembali ke halaman {merchant?.full_name ?? username}
        </Link>
      </div>
    </BookingPageShell>
  );
}
