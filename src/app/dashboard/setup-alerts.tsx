import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireMerchant } from "@/lib/auth/session";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

import { getActivePaymentConnections, getQuotaUsage, getServiceCount } from "./queries";

/**
 * Alert kuota habis + daftar langkah setup yang belum selesai. Query jumlah
 * layanan, koneksi pembayaran, dan kuota dibagi lewat queries.ts (cache())
 * dengan OverviewStats, yang butuh angka yang sama persis -- lihat komentar
 * di queries.ts. Query jam kerja (availability) khusus dipakai di sini saja.
 */
export async function SetupAlerts() {
  const { user } = await requireMerchant();
  const supabase = await createClient();

  const [quota, services, availabilityCount, connections] = await Promise.all([
    getQuotaUsage(),
    getServiceCount(user.id),
    supabase
      .from("availability")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", user.id),
    getActivePaymentConnections(user.id),
  ]);

  const { used, limit } = quota;
  const quotaFull = limit !== null && used >= limit;
  const workingHours = availabilityCount.count ?? 0;
  const hasPayment = connections.length > 0;

  const setupSteps = [
    { done: services > 0, label: "Tambahkan minimal satu layanan", href: ROUTES.services },
    { done: workingHours > 0, label: "Atur jam kerja mingguan", href: ROUTES.availability },
    { done: hasPayment, label: "Hubungkan akun pembayaran", href: ROUTES.payments },
  ];
  const pendingSteps = setupSteps.filter((step) => !step.done);

  return (
    <>
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
    </>
  );
}
