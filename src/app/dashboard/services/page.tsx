import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
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
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

import { AddServiceButton } from "./add-service-button";
import { ServicesTable } from "./services-table";

export const metadata: Metadata = { title: "Layanan" };

export default async function ServicesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(ROUTES.login);
  }

  const [merchantResult, servicesResult] = await Promise.all([
    supabase.from("merchants").select("subscription_tier").eq("id", user.id).maybeSingle(),
    supabase
      .from("services")
      .select("*")
      .eq("merchant_id", user.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  const tier = merchantResult.data?.subscription_tier ?? "STARTER";
  const services = servicesResult.data ?? [];
  // Sama dengan batas yang diberlakukan trigger enforce_service_limit —
  // ditampilkan lebih awal di sini supaya merchant tidak perlu mencoba dulu
  // baru tahu kuotanya habis.
  const limitReached = tier === "STARTER" && services.length >= 1;

  return (
    <>
      <PageHeader
        title="Layanan"
        description="Daftar layanan yang bisa dipesan pelanggan beserta harga dan durasinya."
        action={<AddServiceButton />}
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
            <AddServiceButton />
          </EmptyContent>
        </Empty>
      ) : (
        <ServicesTable services={services} />
      )}
    </>
  );
}
