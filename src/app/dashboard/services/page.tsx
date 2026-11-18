import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { DEFAULT_MERCHANT_SETTINGS } from "@/lib/booking/payment-mode";
import { groupRuleRows } from "@/lib/booking/court";
import type { CourtEnvironment, Service, ServiceMedia } from "@/types/database";

import { AddServiceButton } from "./add-service-button";
import type { CourtFormData } from "./court-data";
import { ServicesTable } from "./services-table";

export const metadata: Metadata = { title: "Layanan" };

const ENV_LABEL: Record<CourtEnvironment, string> = {
  INDOOR: "Indoor",
  OUTDOOR: "Outdoor",
  OUTDOOR_BERATAP: "Outdoor beratap",
};

/** Lapangan, tautan ke layanan, dan aturan jam ramai untuk form sewa. */
async function loadCourtData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  merchantId: string,
  rentals: Service[],
): Promise<CourtFormData> {
  const [courts, links, rules] = await Promise.all([
    supabase.from("courts").select("id, name, environment").eq("merchant_id", merchantId).order("sort_order").order("name"),
    supabase.from("service_courts").select("service_id, court_id").eq("merchant_id", merchantId),
    supabase
      .from("court_price_rules")
      .select("service_id, day_of_week, start_time, end_time, price_per_hour")
      .eq("merchant_id", merchantId)
      .order("start_time"),
  ]);
  const linksByService: CourtFormData["linksByService"] = {};
  const serviceNames = new Map(rentals.map((s) => [s.id, s.name]));
  const usedBy = new Map<string, string[]>();
  for (const l of links.data ?? []) {
    (linksByService[l.service_id] ??= []).push(l.court_id);
    usedBy.set(l.court_id, [...(usedBy.get(l.court_id) ?? []), serviceNames.get(l.service_id) ?? ""].filter(Boolean));
  }
  const grouped: Record<string, NonNullable<typeof rules.data>> = {};
  for (const r of rules.data ?? []) (grouped[r.service_id] ??= []).push(r);
  return {
    courts: (courts.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      note: [ENV_LABEL[c.environment], usedBy.get(c.id)?.length ? `dipakai ${usedBy.get(c.id)!.join(", ")}` : ""].filter(Boolean).join(", "),
    })),
    linksByService,
    rulesByService: Object.fromEntries(Object.entries(grouped).map(([id, rows]) => [id, groupRuleRows(rows)])),
  };
}

export default async function ServicesPage() {
  // requireMerchant() dibungkus cache() -- dashboard/layout.tsx sudah
  // memanggilnya di render pass yang sama, jadi baris ini TIDAK menambah
  // round-trip auth atau query merchants baru. subscription_tier sudah ada
  // di hasilnya, jadi query merchants terpisah yang dulu ada di sini
  // dihapus.
  const { user, merchant } = await requireMerchant();
  const supabase = await createClient();

  const servicesResult = await supabase
    .from("services")
    .select("*, service_media(*)")
    .eq("merchant_id", user.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const tier = merchant.subscription_tier;

  // Baris dibuat trigger/backfill; bila belum ada, pakai bawaan.
  const { data: settingsRow } = await supabase
    .from("merchant_settings")
    .select("allow_pay_on_site, auto_confirm_on_site, max_active_per_phone, deposit_after_no_show, table_mode")
    .eq("merchant_id", user.id)
    .maybeSingle();
  const settings = settingsRow ?? DEFAULT_MERCHANT_SETTINGS;
  const tableMode = settingsRow?.table_mode ?? "NONE";

  // `service_media` datang menempel di tiap baris lewat embedding; dipisah di
  // sini supaya komponen di bawah tetap menerima Service[] polos.
  const servicesWithMedia = (servicesResult.data ?? []) as (Service & {
    service_media?: ServiceMedia[] | null;
  })[];
  const mediaByService: Record<string, ServiceMedia[]> = {};
  const services: Service[] = servicesWithMedia.map(({ service_media, ...service }) => {
    mediaByService[service.id] = service_media ?? [];
    return service;
  });
  // Sama dengan batas yang diberlakukan trigger enforce_service_limit —
  // ditampilkan lebih awal di sini supaya merchant tidak perlu mencoba dulu
  // baru tahu kuotanya habis.
  const rentals = services.filter((s) => s.court_unit_minutes != null);
  const courtData = await loadCourtData(supabase, user.id, rentals);
  const limitReached = tier === "STARTER" && services.length >= 1;

  return (
    <>
      <PageHeader
        title="Layanan"
        description="Daftar layanan yang bisa dipesan pelanggan beserta harga dan durasinya."
        action={<AddServiceButton merchantId={user.id} tier={tier} settings={settings} tableMode={tableMode} courtData={courtData} />}
      />

      {limitReached ? (
        <Alert>
          <AlertTitle>Paket Starter dibatasi 1 layanan</AlertTitle>
          <AlertDescription>
            <Link href={ROUTES.billing} className="underline underline-offset-4">
              Naik ke paket Pro
            </Link>{" "}
            untuk menambahkan lebih dari satu layanan.
          </AlertDescription>
        </Alert>
      ) : null}

      {services.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Sparkles />
            </EmptyMedia>
            <EmptyTitle>Belum ada layanan</EmptyTitle>
            <EmptyDescription>
              Tambahkan layanan pertama Anda supaya pelanggan bisa mulai memesan lewat
              halaman booking Anda.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <AddServiceButton merchantId={user.id} tier={tier} settings={settings} tableMode={tableMode} courtData={courtData} />
          </EmptyContent>
        </Empty>
      ) : (
        <ServicesTable
          services={services}
          merchantId={user.id}
          tier={tier}
          mediaByService={mediaByService}
          settings={settings}
          tableMode={tableMode}
          courtData={courtData}
        />
      )}
    </>
  );
}
