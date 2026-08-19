import { CalendarClock, Sparkles, Wallet } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import { requireMerchant } from "@/lib/auth/session";

import { getActivePaymentConnections, getQuotaUsage, getServiceCount } from "./queries";

/**
 * Tiga kartu statistik halaman Ringkasan: kuota transaksi, layanan aktif,
 * dan koneksi pembayaran. Query jumlah layanan, koneksi pembayaran, dan
 * kuota dibagi lewat queries.ts (cache()) dengan SetupAlerts, yang butuh
 * angka yang sama persis -- lihat komentar di queries.ts.
 */
export async function OverviewStats() {
  const { user, merchant } = await requireMerchant();

  const [quota, services, connections] = await Promise.all([
    getQuotaUsage(),
    getServiceCount(user.id),
    getActivePaymentConnections(user.id),
  ]);

  const tier = merchant.subscription_tier;
  const { used, limit } = quota;
  const quotaFull = limit !== null && used >= limit;
  const hasPayment = connections.length > 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Reveal delay={0}>
        <StatCard
          icon={<CalendarClock className="size-4" />}
          label="Transaksi bulan ini"
          value={limit === null ? `${used}` : `${used} / ${limit}`}
          hint={
            limit === null
              ? "Tanpa batas"
              : quotaFull
                ? "Kuota habis — pesanan baru ditolak"
                : `Sisa ${limit - used} pesanan bulan ini`
          }
        />
      </Reveal>
      <Reveal delay={40}>
        <StatCard
          icon={<Sparkles className="size-4" />}
          label="Layanan aktif"
          value={`${services}`}
          hint={tier === "STARTER" ? "Paket Starter: maks. 1 layanan" : "Tanpa batas"}
        />
      </Reveal>
      <Reveal delay={80}>
        <StatCard
          icon={<Wallet className="size-4" />}
          label="Pembayaran"
          value={hasPayment ? "Terhubung" : "Belum terhubung"}
          hint={
            hasPayment
              ? connections.map((c) => c.provider).join(", ")
              : "DP masuk langsung ke akun Anda"
          }
        />
      </Reveal>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          {icon}
          {label}
        </CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </CardContent>
    </Card>
  );
}
