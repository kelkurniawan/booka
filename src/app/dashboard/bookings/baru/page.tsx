import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";

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
import type { CourtPriceRule } from "@/lib/booking/court";
import type { DayOfWeek } from "@/types/database";
import { requireMerchant } from "@/lib/auth/session";
import { jakartaDateISO } from "@/lib/booking/slots";
import { loadPublicStaff } from "@/lib/booking/staff";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

import { parseManualPrefill } from "../manual-booking";
import { ManualBookingForm } from "./manual-booking-form";

export const metadata: Metadata = { title: "Booking manual" };

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ court?: string; date?: string; time?: string }>;
}) {
  const prefillParams = parseManualPrefill(await searchParams);
  const { user, merchant } = await requireMerchant();
  const supabase = await createClient();

  const [servicesResult, staff, settingsResult, tablesResult, courtsResult, linksResult, rulesResult] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, duration_minutes, price, party_min, party_max, seat_duration_minutes, court_unit_minutes, court_max_minutes")
      .eq("merchant_id", user.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    loadPublicStaff(supabase, user.id, merchant.subscription_tier),
    supabase.from("merchant_settings").select("table_mode").eq("merchant_id", user.id).maybeSingle(),
    // Semua meja, termasuk yang tidak bisa dipesan online: booking manual boleh memakainya.
    supabase
      .from("dining_tables")
      .select("id, name, max_seats")
      .eq("merchant_id", user.id)
      .order("sort_order")
      .order("name"),
    supabase.from("courts").select("id, name").eq("merchant_id", user.id).eq("is_active", true).order("sort_order").order("name"),
    supabase.from("service_courts").select("service_id, court_id").eq("merchant_id", user.id),
    supabase
      .from("court_price_rules")
      .select("service_id, day_of_week, start_time, end_time, price_per_hour")
      .eq("merchant_id", user.id),
  ]);
  const courtError = courtsResult.error ?? linksResult.error ?? rulesResult.error;
  if (courtError) console.error("booking manual: muat lapangan gagal", { merchantId: user.id, error: courtError });
  const linksByService: Record<string, string[]> = {};
  for (const l of linksResult.data ?? []) (linksByService[l.service_id] ??= []).push(l.court_id);
  const rulesByService: Record<string, CourtPriceRule[]> = {};
  for (const r of rulesResult.data ?? []) {
    (rulesByService[r.service_id] ??= []).push({
      dayOfWeek: r.day_of_week as DayOfWeek,
      start: r.start_time.slice(0, 5),
      end: r.end_time.slice(0, 5),
      pricePerHour: Number(r.price_per_hour),
    });
  }
  const services = servicesResult.data ?? [];
  if (servicesResult.error) {
    console.error("booking manual: muat layanan gagal", { merchantId: user.id, error: servicesResult.error });
  }

  if (settingsResult.error || tablesResult.error) {
    console.error("booking manual: muat pengaturan meja gagal", {
      merchantId: user.id,
      error: settingsResult.error ?? tablesResult.error,
    });
  }

  return (
    <>
      <PageHeader
        title="Booking manual"
        description="Catat booking dari telepon atau pelanggan yang datang langsung."
      />
      {servicesResult.error ? (
        <p role="alert" className="text-muted-foreground rounded-xl border p-4 text-sm">
          Gagal memuat layanan. Muat ulang halaman.
        </p>
      ) : services.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardList />
            </EmptyMedia>
            <EmptyTitle>Tambahkan layanan dulu</EmptyTitle>
            <EmptyDescription>Booking manual butuh minimal satu layanan aktif.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href={ROUTES.services}>Ke menu Layanan</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ManualBookingForm
          username={merchant.username}
          todayISO={jakartaDateISO(new Date())}
          services={services}
          staff={staff.map((s) => ({ id: s.id, name: s.name }))}
          tableMode={settingsResult.data?.table_mode ?? "NONE"}
          tables={tablesResult.data ?? []}
          courtInfo={{ courts: courtsResult.data ?? [], linksByService, rulesByService }}
          prefill={{
            ...prefillParams,
            // Sel kosong jadwal membawa lapangan: pakai layanan sewa yang memuatnya.
            serviceId:
              (prefillParams.courtId &&
                services.find((s) => s.court_unit_minutes != null && (linksByService[s.id] ?? []).includes(prefillParams.courtId!))?.id) ||
              null,
          }}
        />
      )}
    </>
  );
}
