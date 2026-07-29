import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { PhasePlaceholder } from "@/components/layout/phase-placeholder";

export const metadata: Metadata = { title: "Booking masuk" };

export default function BookingsPage() {
  return (
    <>
      <PageHeader
        title="Booking masuk"
        description="Semua pesanan yang masuk lewat halaman booking Anda."
      />
      <PhasePlaceholder
        phase="Phase 5–6"
        title="Ledger booking"
        scope={[
          "Tabel booking dengan filter status PENDING / PAID / CANCELLED",
          "Detail pelanggan dan tautan pembayaran",
          "Pembatalan manual oleh merchant",
        ]}
      />
    </>
  );
}
