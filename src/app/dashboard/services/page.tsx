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
import type { Service, ServiceMedia } from "@/types/database";

import { AddServiceButton } from "./add-service-button";
import { ServicesTable } from "./services-table";

export const metadata: Metadata = { title: "Layanan" };

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
  const limitReached = tier === "STARTER" && services.length >= 1;

  return (
    <>
      <PageHeader
        title="Layanan"
        description="Daftar layanan yang bisa dipesan pelanggan beserta harga dan durasinya."
        action={<AddServiceButton merchantId={user.id} tier={tier} />}
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
            <AddServiceButton merchantId={user.id} tier={tier} />
          </EmptyContent>
        </Empty>
      ) : (
        <ServicesTable
          services={services}
          merchantId={user.id}
          tier={tier}
          mediaByService={mediaByService}
        />
      )}
    </>
  );
}
