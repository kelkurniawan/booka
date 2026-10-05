import type { Metadata } from "next";
import Link from "next/link";
import { Globe } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { ownershipRecord, vercelConfig } from "@/lib/domains/config";
import { apexOf, dnsInstruction } from "@/lib/domains/vercel";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

import { DomainManager } from "./domain-manager";

export const metadata: Metadata = { title: "Domain" };

export default async function DomainPage() {
  const { user, merchant } = await requireMerchant();

  if (merchant.subscription_tier !== "STUDIO") {
    return (
      <>
        <PageHeader title="Domain" description="Halaman booking di alamat Anda sendiri." />
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Globe />
            </EmptyMedia>
            <EmptyTitle>Fitur paket Studio</EmptyTitle>
            <EmptyDescription>
              Pakai alamat seperti booking.salonanda.id untuk halaman booking Anda, tanpa
              tautan booka di depannya.
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
  const { data: row } = await supabase
    .from("merchant_domains")
    .select("domain, status, verification_token")
    .eq("merchant_id", user.id)
    .maybeSingle();

  // Nama record ditampilkan relatif terhadap domain utama, seperti yang
  // diminta kebanyakan panel DNS ("booking", bukan "booking.salon.id").
  const relative = (fqdn: string, apex: string) =>
    fqdn === apex ? "@" : fqdn.slice(0, -(apex.length + 1));
  const records = row
    ? (() => {
        const apex = apexOf(row.domain);
        const txt = ownershipRecord(row.domain, row.verification_token);
        return [dnsInstruction(row.domain), { ...txt, name: relative(txt.name, apex) }];
      })()
    : [];

  return (
    <>
      <PageHeader
        title="Domain"
        description="Halaman booking Anda di alamat sendiri, mis. booking.salonanda.id."
      />
      {vercelConfig() ? null : (
        <Alert>
          <AlertTitle>Belum diaktifkan</AlertTitle>
          <AlertDescription>
            Fitur ini butuh konfigurasi dari admin Booka (VERCEL_API_TOKEN dan
            VERCEL_PROJECT_ID). Hubungi kami bila Anda melihat pesan ini.
          </AlertDescription>
        </Alert>
      )}
      <DomainManager
        domain={row?.domain ?? null}
        status={row?.status ?? null}
        records={records}
        username={merchant.username}
      />
    </>
  );
}
