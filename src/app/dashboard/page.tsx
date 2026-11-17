import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requireMerchant } from "@/lib/auth/session";
import { formatLongDate } from "@/lib/format";
import { ROUTES } from "@/lib/routes";

import { CopyLinkButton } from "./_today/copy-link-button";
import {
  ActionSection,
  ActionSkeleton,
  AgendaSection,
  AgendaSkeleton,
  GettingStartedSection,
  GettingStartedSkeleton,
  OnSiteSection,
  SideSkeleton,
  WeekSection,
} from "./_today/sections";
import { ProfileNudge } from "./profile-nudge";
import { SetupAlerts } from "./setup-alerts";

export const metadata: Metadata = { title: "Hari ini" };

export default async function DashboardPage() {
  const { merchant } = await requireMerchant();
  const pagePath = ROUTES.merchantPage(merchant.username);

  return (
    <>
      <PageHeader
        title="Hari ini"
        description={formatLongDate(new Date())}
        action={
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              className="hidden h-11 md:inline-flex"
            >
              <Link href={pagePath} target="_blank" rel="noopener noreferrer">
                Lihat halaman
              </Link>
            </Button>
            <Button asChild className="hidden h-11 md:inline-flex">
              <Link href={ROUTES.newBooking}>Booking manual</Link>
            </Button>
            <CopyLinkButton path={pagePath} />
          </div>
        }
      />

      <Suspense fallback={null}>
        <SetupAlerts />
      </Suspense>

      <Suspense fallback={<GettingStartedSkeleton />}>
        <GettingStartedSection />
      </Suspense>

      <Suspense fallback={null}>
        <ProfileNudge />
      </Suspense>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Suspense fallback={<ActionSkeleton />}>
            <ActionSection />
          </Suspense>
          <Suspense fallback={<AgendaSkeleton />}>
            <AgendaSection />
          </Suspense>
        </div>
        <div className="space-y-6">
          <Suspense fallback={<SideSkeleton />}>
            <OnSiteSection />
          </Suspense>
          <Suspense fallback={<SideSkeleton />}>
            <WeekSection />
          </Suspense>
        </div>
      </div>
    </>
  );
}
