import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { PhasePlaceholder } from "@/components/layout/phase-placeholder";

export const metadata: Metadata = { title: "Pembayaran" };

export default function PaymentsPage() {
  return (
    <>
      <PageHeader
        title="Pembayaran"
        description="Hubungkan akun payment gateway Anda. DP pelanggan masuk langsung ke akun tersebut, bukan ke Booka."
      />
      <PhasePlaceholder
        phase="Phase 3"
        title="OAuth Connect Midtrans & Xendit"
        scope={[
          "Tombol Connect untuk Midtrans dan Xendit",
          "Token merchant disimpan terenkripsi di schema private",
          "Status koneksi, pemutusan, dan refresh token otomatis",
        ]}
      />
    </>
  );
}
