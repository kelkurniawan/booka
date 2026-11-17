import type { Metadata } from "next";

import { requireMerchant } from "@/lib/auth/session";
import { voucherStatus } from "@/lib/booking/voucher";
import { createClient } from "@/lib/supabase/server";

import { PromoUpsell } from "../promo-upsell";
import { VoucherList, type VoucherRow } from "./voucher-list";

export const metadata: Metadata = { title: "Voucher" };

// Di luar komponen supaya lint kemurnian tidak menandai Date.now().
const currentMs = () => Date.now();

export default async function VoucherPage() {
  const { user, merchant } = await requireMerchant();
  if (merchant.subscription_tier === "STARTER") return <PromoUpsell />;

  const supabase = await createClient();
  const [vouchersResult, statsResult, servicesResult] = await Promise.all([
    supabase
      .from("vouchers")
      .select("*")
      .eq("merchant_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.rpc("voucher_stats"),
    supabase
      .from("services")
      .select("id, name, price")
      .eq("merchant_id", user.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (vouchersResult.error || statsResult.error || servicesResult.error) {
    console.error("[promosi/voucher] gagal memuat voucher", {
      userId: user.id,
      error: vouchersResult.error ?? statsResult.error ?? servicesResult.error,
    });
    return (
      <p role="alert" className="text-muted-foreground text-sm">
        Voucher belum bisa dimuat. Muat ulang halaman sebentar lagi.
      </p>
    );
  }

  const stats = statsResult.data ?? [];
  const now = currentMs();
  const rows: VoucherRow[] = (vouchersResult.data ?? []).map((voucher) => {
    const used = stats.find((s) => s.voucher_id === voucher.id)?.used ?? 0;
    return { voucher, used, status: voucherStatus(voucher, used, now) };
  });

  return (
    <VoucherList
      rows={rows}
      services={servicesResult.data ?? []}
      monthDiscount={stats.reduce((sum, s) => sum + Number(s.month_discount), 0)}
      monthBookings={stats.reduce((sum, s) => sum + s.month_bookings, 0)}
    />
  );
}
