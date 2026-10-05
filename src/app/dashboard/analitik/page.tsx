import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3 } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { aggregateBookings, WEEKDAYS, type Bucket } from "@/lib/analytics/aggregate";
import { requireMerchant } from "@/lib/auth/session";
import { jakartaDateISO, jakartaWallClockToUtc } from "@/lib/booking/slots";
import { formatRupiah } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { ColumnChart } from "./column-chart";

export const metadata: Metadata = { title: "Analitik" };

const PERIODS = {
  "30": { label: "30 hari", days: 30, bucket: "day" },
  "90": { label: "90 hari", days: 90, bucket: "week" },
  "365": { label: "12 bulan", days: 365, bucket: "month" },
} as const satisfies Record<string, { label: string; days: number; bucket: Bucket }>;
type PeriodKey = keyof typeof PERIODS;

const DAY_MS = 24 * 60 * 60 * 1000;

function percent(value: number | null): string {
  return value === null ? "–" : `${Math.round(value * 100)}%`;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>;
}) {
  const { user, merchant } = await requireMerchant();
  const { periode } = await searchParams;
  const periodKey: PeriodKey = periode && periode in PERIODS ? (periode as PeriodKey) : "30";
  const period = PERIODS[periodKey];

  if (merchant.subscription_tier !== "STUDIO") {
    return (
      <>
        <PageHeader title="Analitik" description="Pendapatan, tingkat bayar, dan layanan terlaris." />
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BarChart3 />
            </EmptyMedia>
            <EmptyTitle>Fitur paket Studio</EmptyTitle>
            <EmptyDescription>
              Lihat pendapatan per minggu, layanan terlaris, hari tersibuk, dan pelanggan yang
              kembali, lengkap per staf.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href={ROUTES.billing}>Lihat paket Studio</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </>
    );
  }

  // Rentang berakhir di ujung hari ini (WIB) supaya batang terakhir adalah
  // hari ini, bukan "24 jam terakhir" yang memotong dua tanggal.
  const now = new Date();
  const tomorrowISO = jakartaDateISO(new Date(now.getTime() + DAY_MS));
  const to = jakartaWallClockToUtc(tomorrowISO, "00:00");
  const from = new Date(to.getTime() - period.days * DAY_MS);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "status, service_name, service_price, created_at, paid_at, start_datetime, customer_whatsapp, staff_name",
    )
    .eq("merchant_id", user.id)
    .or(`created_at.gte.${from.toISOString()},paid_at.gte.${from.toISOString()}`)
    .limit(20000);

  if (error) {
    console.error("[analitik] gagal memuat booking", { userId: user.id, error });
    throw new Error("Gagal memuat data analitik.");
  }

  const summary = aggregateBookings(data ?? [], { from, to }, period.bucket);
  const bucketWord = period.bucket === "day" ? "hari" : period.bucket === "week" ? "minggu" : "bulan";

  return (
    <>
      <PageHeader
        title="Analitik"
        description="Dihitung dari booking yang DP-nya sudah dibayar, dalam waktu Indonesia Barat."
      />

      <nav className="flex gap-1" aria-label="Periode">
        {(Object.keys(PERIODS) as PeriodKey[]).map((key) => (
          <Link
            key={key}
            href={`${ROUTES.analytics}?periode=${key}`}
            aria-current={key === periodKey ? "page" : undefined}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm",
              key === periodKey ? "bg-foreground text-background border-foreground" : "hover:bg-muted",
            )}
          >
            {PERIODS[key].label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Pendapatan DP" value={formatRupiah(summary.revenue)} hint={`${period.label} terakhir`} />
        <Stat label="Booking dibayar" value={`${summary.paidCount}`} hint={`dari ${summary.createdCount} pesanan dibuat`} />
        <Stat label="Tingkat bayar" value={percent(summary.payRate)} hint="Pesanan yang DP-nya dibayar" />
        <Stat label="Pelanggan kembali" value={percent(summary.repeatCustomerRate)} hint="Membayar lebih dari sekali" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pendapatan per {bucketWord}</CardTitle>
          <CardDescription>Menurut tanggal DP dibayar.</CardDescription>
        </CardHeader>
        <CardContent>
          <ColumnChart
            caption={`Pendapatan per ${bucketWord}, ${period.label} terakhir`}
            unit="rupiah"
            data={summary.series.map((point) => ({
              key: point.key,
              label: point.label,
              value: point.revenue,
              display: `${formatRupiah(point.revenue)} · ${point.count} booking`,
            }))}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Layanan terlaris</CardTitle>
            <CardDescription>Lima teratas menurut pendapatan.</CardDescription>
          </CardHeader>
          <CardContent>
            <BreakdownTable rows={summary.topServices} empty="Belum ada layanan yang dibayar." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hari tersibuk</CardTitle>
            <CardDescription>Jumlah booking dibayar menurut hari jadwalnya.</CardDescription>
          </CardHeader>
          <CardContent>
            <ColumnChart
              caption="Jumlah booking dibayar per hari dalam seminggu"
              height={120}
              unit="count"
              data={summary.byWeekday.map((count, index) => ({
                key: WEEKDAYS[index],
                label: WEEKDAYS[index],
                value: count,
                display: `${count} booking`,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      {summary.byStaff.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Per staf</CardTitle>
            <CardDescription>Booking dibayar yang ditangani tiap staf.</CardDescription>
          </CardHeader>
          <CardContent>
            <BreakdownTable rows={summary.byStaff} empty="" />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </CardContent>
    </Card>
  );
}

function BreakdownTable({
  rows,
  empty,
}: {
  rows: { name: string; count: number; revenue: number }[];
  empty: string;
}) {
  if (rows.length === 0) return <p className="text-muted-foreground text-sm">{empty}</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-muted-foreground text-left text-xs">
        <tr>
          <th className="pb-2 font-normal">Nama</th>
          <th className="pb-2 text-right font-normal">Booking</th>
          <th className="pb-2 text-right font-normal">Pendapatan</th>
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {rows.map((row) => (
          <tr key={row.name} className="border-t">
            <td className="py-2">{row.name}</td>
            <td className="py-2 text-right">{row.count}</td>
            <td className="py-2 text-right">{formatRupiah(row.revenue)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
