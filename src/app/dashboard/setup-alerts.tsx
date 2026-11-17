import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CHECKLIST_COPY } from "@/lib/guide/content";
import { buildChecklist } from "@/lib/guide/guide";
import { ROUTES } from "@/lib/routes";

import { getOnboardingState, getQuotaUsage } from "./queries";

/**
 * Alert kuota habis + langkah setup yang belum selesai. Daftar setup hanya
 * tampil setelah checklist "Panduan memulai" disembunyikan, supaya tidak
 * menggandakannya; aturannya sama (buildChecklist).
 */
export async function SetupAlerts() {
  const [quota, state] = await Promise.all([getQuotaUsage(), getOnboardingState()]);

  const { used, limit } = quota;
  const quotaFull = limit !== null && used >= limit;

  const pendingSteps =
    state && state.checklistDismissedAt !== null
      ? buildChecklist(state.facts, state.stepsCompleted).filter(
          (item) => !item.done && ["SERVICE", "HOURS", "PAYMENT"].includes(item.key),
        )
      : [];

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
                <li key={step.key}>
                  <Link
                    href={CHECKLIST_COPY[step.key].ctaHref ?? ROUTES.dashboard}
                    className="underline underline-offset-4"
                  >
                    {CHECKLIST_COPY[step.key].title}
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
