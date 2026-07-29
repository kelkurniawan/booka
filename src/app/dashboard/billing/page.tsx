import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { PhasePlaceholder } from "@/components/layout/phase-placeholder";

export const metadata: Metadata = { title: "Langganan" };

export default function BillingPage() {
  return (
    <>
      <PageHeader
        title="Langganan"
        description="Paket sewa sistem Booka. Terpisah dari pembayaran DP pelanggan Anda."
      />
      <PhasePlaceholder
        phase="Phase 3"
        title="Halaman paket dan upgrade"
        scope={[
          "Starter gratis: 10 transaksi/bulan, 1 layanan, ada watermark",
          "Pro Rp 79.000/bln: transaksi & layanan tanpa batas, reminder WhatsApp, tanpa watermark",
          "Studio Rp 199.000/bln: multi-staff, analytics, domain kustom",
        ]}
      />
    </>
  );
}
