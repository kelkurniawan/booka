import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { requireMerchant } from "@/lib/auth/session";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

import { StaffManager } from "./staff-manager";

export const metadata: Metadata = { title: "Staf" };

export default async function StaffPage() {
  const { user, merchant } = await requireMerchant();

  if (merchant.subscription_tier !== "STUDIO") {
    return (
      <>
        <PageHeader title="Staf" description="Jadwal dan booking terpisah untuk tiap staf." />
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>Fitur paket Studio</EmptyTitle>
            <EmptyDescription>
              Pelanggan bisa memilih staf favoritnya, tiap staf punya jam kerja sendiri, dan dua
              staf bisa melayani di jam yang sama. Staf yang pernah Anda tambahkan tetap
              tersimpan dan aktif kembali saat upgrade.
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

  const supabase = await createClient();
  const [staffResult, hoursResult] = await Promise.all([
    supabase
      .from("staff")
      .select("id, name, is_active, sort_order")
      .eq("merchant_id", user.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("staff_availability")
      .select("staff_id, day_of_week, start_time, end_time")
      .eq("merchant_id", user.id),
  ]);

  if (staffResult.error || hoursResult.error) {
    console.error("[staf] gagal memuat staf", {
      userId: user.id,
      error: staffResult.error ?? hoursResult.error,
    });
    throw new Error("Gagal memuat data staf.");
  }

  const staff = (staffResult.data ?? []).map((member) => ({
    ...member,
    hours: (hoursResult.data ?? [])
      .filter((row) => row.staff_id === member.id)
      .map((row) => ({
        day_of_week: row.day_of_week,
        start_time: row.start_time.slice(0, 5),
        end_time: row.end_time.slice(0, 5),
      })),
  }));

  return (
    <>
      <PageHeader
        title="Staf"
        description="Pelanggan bisa memilih staf atau 'Siapa saja'. Dua staf boleh melayani di jam yang sama."
      />
      <StaffManager staff={staff} />
    </>
  );
}
