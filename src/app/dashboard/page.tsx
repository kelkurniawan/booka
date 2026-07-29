import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, Sparkles, Wallet } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Ringkasan",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(ROUTES.login);
  }

  const now = new Date();

  const [merchantResult, quotaResult, upcoming, serviceCount, availabilityCount, connections] =
    await Promise.all([
      supabase
        .from("merchants")
        .select("username, subscription_tier")
        .eq("id", user.id)
        .maybeSingle(),
      // Angka kuota diambil dari fungsi yang sama dengan yang dipakai trigger
      // penegak batas, supaya yang ditampilkan di sini persis sama dengan yang
      // benar-benar diberlakukan saat booking masuk.
      supabase.rpc("my_quota_usage"),
      supabase
        .from("bookings")
        .select("id, service_name, customer_name, start_datetime, status")
        .eq("merchant_id", user.id)
        .eq("status", "PAID")
        .gte("start_datetime", now.toISOString())
        .order("start_datetime", { ascending: true })
        .limit(5),
      supabase
        .from("services")
        .select("id", { count: "exact", head: true })
        .eq("merchant_id", user.id),
      supabase
        .from("availability")
        .select("id", { count: "exact", head: true })
        .eq("merchant_id", user.id),
      supabase
        .from("payment_connections")
        .select("provider, status")
        .eq("merchant_id", user.id)
        .eq("status", "ACTIVE"),
    ]);

  const tier = merchantResult.data?.subscription_tier ?? "STARTER";
  const quotaRow = quotaResult.data?.[0];
  const used = quotaRow?.used ?? 0;
  const limit = quotaRow?.quota ?? null;
  const quotaFull = limit !== null && used >= limit;
  const services = serviceCount.count ?? 0;
  const workingHours = availabilityCount.count ?? 0;
  const hasPayment = (connections.data?.length ?? 0) > 0;

  const setupSteps = [
    { done: services > 0, label: "Tambahkan minimal satu layanan", href: ROUTES.services },
    { done: workingHours > 0, label: "Atur jam kerja mingguan", href: ROUTES.availability },
    { done: hasPayment, label: "Hubungkan akun pembayaran", href: ROUTES.payments },
  ];
  const pendingSteps = setupSteps.filter((step) => !step.done);

  return (
    <>
      <PageHeader
        title="Ringkasan"
        description="Kondisi akun dan jadwal terdekat Anda."
      />

      {/* Momen upgrade paling kuat: merchant sedang kehilangan pesanan. */}
      {quotaFull ? (
        <Alert variant="destructive">
          <AlertTitle>Kuota {limit} transaksi bulan ini sudah habis</AlertTitle>
          <AlertDescription>
            Halaman booking Anda menolak pesanan baru sampai bulan depan.{" "}
            <Link href={ROUTES.billing} className="underline underline-offset-4">
              Naik ke paket Pro
            </Link>{" "}
            untuk menerima pesanan tanpa batas.
          </AlertDescription>
        </Alert>
      ) : null}

      {pendingSteps.length > 0 ? (
        <Alert>
          <AlertTitle>Halaman booking Anda belum siap menerima pesanan</AlertTitle>
          <AlertDescription>
            <ul className="space-y-1">
              {pendingSteps.map((step) => (
                <li key={step.href}>
                  <Link href={step.href} className="underline underline-offset-4">
                    {step.label}
                  </Link>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <StatCard
          icon={<Sparkles className="size-4" />}
          label="Layanan aktif"
          value={`${services}`}
          hint={tier === "STARTER" ? "Paket Starter: maks. 1 layanan" : "Tanpa batas"}
        />
        <StatCard
          icon={<Wallet className="size-4" />}
          label="Pembayaran"
          value={hasPayment ? "Terhubung" : "Belum terhubung"}
          hint={
            hasPayment
              ? (connections.data ?? []).map((c) => c.provider).join(", ")
              : "DP masuk langsung ke akun Anda"
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Jadwal terdekat</CardTitle>
          <CardDescription>Booking berbayar yang belum berlangsung.</CardDescription>
        </CardHeader>
        <CardContent>
          {(upcoming.data?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground text-sm">
              Belum ada jadwal. Booking yang sudah dibayar akan muncul di sini.
            </p>
          ) : (
            <ul className="divide-y">
              {upcoming.data?.map((booking) => (
                <li key={booking.id} className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
                  <span className="text-sm font-medium">
                    {booking.customer_name} — {booking.service_name}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {formatDateTime(booking.start_datetime)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div>
        <Button asChild variant="outline">
          <Link href={ROUTES.bookings}>Lihat semua booking</Link>
        </Button>
      </div>
    </>
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
