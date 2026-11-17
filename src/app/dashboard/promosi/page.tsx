import type { Metadata } from "next";

import { requireMerchant } from "@/lib/auth/session";
import { bannerStatus } from "@/lib/promo/banner";
import { createClient } from "@/lib/supabase/server";
import { resolveTheme } from "@/lib/theme/resolve";

import { BannerList, type BannerRow } from "./banner-list";
import { PromoUpsell } from "./promo-upsell";

export const metadata: Metadata = { title: "Banner" };

// Di luar komponen supaya lint kemurnian tidak menandai Date.now().
const currentMs = () => Date.now();

export default async function BannerPage() {
  const { user, merchant } = await requireMerchant();
  if (merchant.subscription_tier === "STARTER") return <PromoUpsell />;

  const supabase = await createClient();
  const [bannersResult, vouchersResult, servicesResult, themeResult] = await Promise.all([
    supabase
      .from("merchant_banners")
      .select("*")
      .eq("merchant_id", user.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    // Hanya voucher PUBLIC yang boleh jadi target banner.
    supabase
      .from("vouchers")
      .select("id, code")
      .eq("merchant_id", user.id)
      .eq("visibility", "PUBLIC")
      .order("created_at", { ascending: false }),
    supabase
      .from("services")
      .select("id, name")
      .eq("merchant_id", user.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase.from("merchant_themes").select("*").eq("merchant_id", user.id).maybeSingle(),
  ]);

  const failure = bannersResult.error ?? vouchersResult.error ?? servicesResult.error ?? themeResult.error;
  if (failure) {
    console.error("[promosi/banner] gagal memuat banner", { userId: user.id, error: failure });
    return (
      <p role="alert" className="text-muted-foreground text-sm">
        Banner belum bisa dimuat. Muat ulang halaman sebentar lagi.
      </p>
    );
  }

  const now = currentMs();
  const rows: BannerRow[] = (bannersResult.data ?? []).map((banner) => ({
    banner,
    status: bannerStatus(banner, now),
  }));

  return (
    <BannerList
      rows={rows}
      vouchers={vouchersResult.data ?? []}
      services={servicesResult.data ?? []}
      theme={resolveTheme(merchant.subscription_tier, themeResult.data ?? null)}
      merchantId={user.id}
      merchantName={merchant.full_name ?? merchant.username ?? ""}
    />
  );
}
