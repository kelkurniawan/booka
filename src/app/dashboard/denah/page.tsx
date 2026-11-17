import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { requireMerchant } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { CapacitySettingsForm } from "./capacity-settings-form";

export const metadata: Metadata = { title: "Denah meja" };

export default async function FloorPlanPage() {
  const { user } = await requireMerchant();
  const supabase = await createClient();

  const [settingsResult, reservationResult, tablesResult] = await Promise.all([
    supabase
      .from("merchant_settings")
      .select("table_mode, seats_per_slot, table_hold_minutes, auto_join_tables")
      .eq("merchant_id", user.id)
      .maybeSingle(),
    supabase
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", user.id)
      .not("seat_duration_minutes", "is", null),
    supabase
      .from("dining_tables")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", user.id),
  ]);

  const settings = settingsResult.data ?? {
    table_mode: "NONE" as const,
    seats_per_slot: null,
    table_hold_minutes: 15,
    auto_join_tables: false,
  };

  return (
    <>
      <PageHeader
        title="Denah meja"
        description="Atur area dan meja agar reservasi tidak melebihi tempat yang ada."
      />
      <CapacitySettingsForm settings={settings} hasReservationService={(reservationResult.count ?? 0) > 0} />
      {/* Task 9 menaruh editor denah di sini bila mode tersimpan TABLE. */}
      {settings.table_mode === "TABLE" && (tablesResult.count ?? 0) === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Belum ada meja</EmptyTitle>
            <EmptyDescription>Tambahkan area dan meja pertama Anda agar pelanggan bisa memilih tempat.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
    </>
  );
}
