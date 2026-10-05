import type { Metadata } from "next";
import { Check, MessageCircle } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireMerchant } from "@/lib/auth/session";
import { clientEnv } from "@/lib/env/client";
import { COMING_SOON_LABEL, PLANS } from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Langganan" };

export default async function BillingPage() {
  // requireMerchant() dibungkus cache() -- dashboard/layout.tsx sudah
  // memanggilnya di render pass yang sama, jadi baris ini TIDAK menambah
  // round-trip auth atau query merchants baru. subscription_tier sudah ada
  // di hasilnya, jadi query merchants terpisah yang dulu ada di sini
  // dihapus.
  const { merchant } = await requireMerchant();
  const supabase = await createClient();

  // Angka kuota diambil dari fungsi yang sama dengan yang dipakai trigger
  // penegak batas -- lihat src/app/dashboard/page.tsx.
  const quotaResult = await supabase.rpc("my_quota_usage");

  const tier = merchant.subscription_tier;
  const quotaRow = quotaResult.data?.[0];
  const used = quotaRow?.used ?? 0;
  const quota = quotaRow?.quota ?? null;
  const quotaFull = quota !== null && used >= quota;

  // Nomor WhatsApp tim Booka -- opsional, tombol upgrade disembunyikan kalau
  // tidak diisi supaya tidak pernah menampilkan tautan yang rusak.
  const supportWhatsappDigits = (clientEnv().supportWhatsapp ?? "").replace(/\D/g, "");
  const waLink = supportWhatsappDigits
    ? `https://wa.me/${supportWhatsappDigits}?text=${encodeURIComponent(
        `Halo, saya mau tanya soal upgrade paket Booka. Paket saya saat ini: ${tier}.`,
      )}`
    : null;

  return (
    <>
      <PageHeader
        title="Langganan"
        description="Paket sewa sistem Booka. Terpisah dari pembayaran DP pelanggan Anda."
      />

      <Card>
        <CardHeader>
          <CardTitle>Pemakaian bulan ini</CardTitle>
          <CardDescription>
            {quota === null
              ? "Paket Anda tidak membatasi jumlah transaksi."
              : "Kuota dihitung ulang setiap awal bulan."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">
            {quota === null ? `${used} transaksi` : `${used} / ${quota} transaksi`}
          </p>
          {quotaFull ? (
            <p className="text-destructive mt-1 text-sm">
              Kuota sudah habis. Halaman booking Anda menolak pesanan baru sampai bulan depan.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => (
          <Card
            key={plan.tier}
            className={plan.tier === tier ? "border-foreground border-2" : undefined}
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                {plan.name}
                {plan.tier === tier ? <Badge>Paket Anda</Badge> : null}
              </CardTitle>
              <CardDescription>
                <span className="text-foreground text-2xl font-semibold">{plan.price}</span>{" "}
                <span className="text-xs">{plan.period}</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2 text-sm">
                {plan.features.map((feature) => (
                  <li
                    key={feature.label}
                    className={feature.comingSoon ? "text-muted-foreground flex gap-2" : "flex gap-2"}
                  >
                    <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                      {feature.label}
                      {feature.comingSoon ? (
                        <Badge variant="outline" className="ml-1.5">
                          {COMING_SOON_LABEL}
                        </Badge>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      {waLink ? (
        <Card>
          <CardHeader>
            <CardTitle>Mau upgrade atau downgrade paket?</CardTitle>
            <CardDescription>
              Perubahan paket masih ditangani manual oleh tim kami, bukan lewat pembayaran
              otomatis. Hubungi kami lewat WhatsApp dan kami bantu prosesnya.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild>
              <a href={waLink} target="_blank" rel="noopener noreferrer">
                <MessageCircle /> Hubungi kami di WhatsApp
              </a>
            </Button>
          </CardFooter>
        </Card>
      ) : null}
    </>
  );
}
