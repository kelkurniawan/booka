import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { requireMerchant } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { saveDiningLayout } from "./actions";
import { CapacitySettingsForm } from "./capacity-settings-form";
import { FloorPlanEditor } from "./floor-plan-editor";

export const metadata: Metadata = { title: "Denah meja" };

export default async function FloorPlanPage() {
  const { user } = await requireMerchant();
  const supabase = await createClient();

  const [settingsResult, reservationResult, areasResult, tablesResult] = await Promise.all([
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
      .from("dining_areas")
      .select("id, name, sort_order")
      .eq("merchant_id", user.id)
      .order("sort_order")
      .order("name"),
    supabase
      .from("dining_tables")
      .select(
        "id, area_id, name, min_seats, max_seats, shape, grid_x, grid_y, grid_w, grid_h, note, bookable_online, joinable_with, sort_order",
      )
      .eq("merchant_id", user.id)
      .order("sort_order")
      .order("name"),
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
      {settings.table_mode === "TABLE" ? (
        <FloorPlanEditor
          initialAreas={areasResult.data ?? []}
          initialTables={tablesResult.data ?? []}
          save={saveDiningLayout}
        />
      ) : null}
    </>
  );
}
