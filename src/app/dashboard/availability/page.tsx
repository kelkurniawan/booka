import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

import { ALL_DAYS, DAY_LABELS } from "./availability-state";
import { DayCard } from "./day-card";

export const metadata: Metadata = { title: "Jam kerja" };

export default async function AvailabilityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(ROUTES.login);
  }

  const { data } = await supabase
    .from("availability")
    .select("*")
    .eq("merchant_id", user.id)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });

  const slots = data ?? [];

  return (
    <>
      <PageHeader
        title="Jam kerja"
        description="Rentang jam per hari yang tersedia untuk dipesan. Rentang yang tumpang tindih pada hari yang sama tidak diperbolehkan."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {ALL_DAYS.map((day) => (
          <DayCard
            key={day}
            day={day}
            label={DAY_LABELS[day]}
            slots={slots.filter((slot) => slot.day_of_week === day)}
          />
        ))}
      </div>
    </>
  );
}
