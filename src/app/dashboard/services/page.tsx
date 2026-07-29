import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { PhasePlaceholder } from "@/components/layout/phase-placeholder";

export const metadata: Metadata = { title: "Layanan" };

export default function ServicesPage() {
  return (
    <>
      <PageHeader
        title="Layanan"
        description="Daftar layanan yang bisa dipesan pelanggan beserta harga dan durasinya."
      />
      <PhasePlaceholder
        phase="Phase 3"
        title="CRUD layanan"
        scope={[
          "Tambah, ubah, dan nonaktifkan layanan",
          "Harga dan durasi per layanan",
          "Batas jumlah layanan mengikuti paket langganan",
        ]}
      />
    </>
  );
}
