import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { requireMerchant } from "@/lib/auth/session";
import { adLinkUrls } from "@/lib/funnel/attribution";
import { ROUTES } from "@/lib/routes";
import { siteUrl } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { AdLinkForm } from "./ad-link-form";
import { AdLinkTable, type AdLinkRow } from "./ad-link-table";
import { PixelForm } from "./pixel-form";

export const metadata: Metadata = { title: "Iklan" };

const DAY_MS = 86_400_000;
// Di luar komponen supaya lint kemurnian tidak menandai Date.now().
const currentMs = () => Date.now();

const TABS = [
  { label: "Tautan iklan", href: ROUTES.ads, pixel: false },
  { label: "Pixel", href: `${ROUTES.ads}?tab=pixel`, pixel: true },
];

export default async function AdsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const isPixel = tab === "pixel";
  const { user, merchant } = await requireMerchant();
  const supabase = await createClient();

  // Domain sendiri yang sudah aktif dipakai sebagai asal tautan.
  const { data: domain } = await supabase
    .from("merchant_domains")
    .select("domain")
    .eq("merchant_id", user.id)
    .eq("status", "ACTIVE")
    .maybeSingle();
  const origin = domain ? `https://${domain.domain}` : siteUrl().origin;
  const username = merchant.username ?? "";

  return (
    <>
      <PageHeader
        title="Iklan"
        description={
          isPixel
            ? "Pasang pixel supaya Meta, TikTok, dan Google tahu iklan mana yang menghasilkan booking."
            : "Satu tautan per iklan atau kanal, supaya Anda tahu mana yang menghasilkan booking."
        }
      />
      <nav aria-label="Iklan" className="mt-6 flex gap-1 border-b">
        {TABS.map((t) => {
          const active = t.pixel === isPixel;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex min-h-11 items-center border-b-2 px-4 text-sm font-medium",
                active ? "border-primary text-foreground" : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-6">{isPixel ? await PixelTab(user.id, origin, username) : await LinksTab(user.id, origin, username)}</div>
    </>
  );
}

const loadError = (what: string) => (
  <p role="alert" className="text-muted-foreground text-sm">
    {what} belum bisa dimuat. Muat ulang halaman sebentar lagi.
  </p>
);

async function PixelTab(userId: string, origin: string, username: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("merchant_tracking").select("*").eq("merchant_id", userId).maybeSingle();
  if (error) {
    console.error("[iklan] gagal memuat pixel", { userId, error });
    return loadError("Pengaturan pixel");
  }
  return (
    <PixelForm
      initial={{
        metaPixelId: data?.meta_pixel_id ?? "",
        tiktokPixelId: data?.tiktok_pixel_id ?? "",
        ga4MeasurementId: data?.ga4_measurement_id ?? "",
        metaEnabled: data?.meta_enabled ?? false,
        tiktokEnabled: data?.tiktok_enabled ?? false,
        ga4Enabled: data?.ga4_enabled ?? false,
      }}
      pageUrl={username ? `${origin}/${username}` : null}
    />
  );
}

async function LinksTab(userId: string, origin: string, username: string) {
  const supabase = await createClient();
  const now = currentMs();
  const [linksResult, statsResult, servicesResult, vouchersResult] = await Promise.all([
    supabase
      .from("ad_links")
      .select("id, slug, name, channel")
      .eq("merchant_id", userId)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    supabase.rpc("ad_link_stats", { p_from: new Date(now - 30 * DAY_MS).toISOString(), p_to: new Date(now).toISOString() }),
    supabase
      .from("services")
      .select("id, name")
      .eq("merchant_id", userId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("vouchers")
      .select("code, kind, value")
      .eq("merchant_id", userId)
      .order("created_at", { ascending: false }),
  ]);
  const failure = linksResult.error ?? statsResult.error ?? servicesResult.error ?? vouchersResult.error;
  if (failure) {
    console.error("[iklan] gagal memuat tautan", { userId, error: failure });
    return loadError("Tautan iklan");
  }

  const stats = new Map((statsResult.data ?? []).map((s) => [s.ad_link_id, s]));
  const rows: AdLinkRow[] = (linksResult.data ?? []).map((l) => {
    const s = stats.get(l.id);
    return {
      id: l.id,
      name: l.name,
      slug: l.slug,
      channel: l.channel,
      shortUrl: adLinkUrls({ origin, username, slug: l.slug, channel: l.channel }).short,
      views: s?.views ?? 0,
      booked: s?.booked ?? 0,
      paid: s?.paid ?? 0,
      revenue: Number(s?.revenue ?? 0),
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <AdLinkForm
        origin={origin}
        username={username}
        services={servicesResult.data ?? []}
        vouchers={(vouchersResult.data ?? []).map((v) => ({
          code: v.code,
          label: `${v.code}, diskon ${v.kind === "PERCENT" ? `${v.value}%` : `Rp${v.value.toLocaleString("id-ID")}`}`,
        }))}
      />
      <AdLinkTable rows={rows} />
    </div>
  );
}
