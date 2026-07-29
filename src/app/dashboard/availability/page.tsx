import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { PhasePlaceholder } from "@/components/layout/phase-placeholder";

export const metadata: Metadata = { title: "Jam kerja" };

export default function AvailabilityPage() {
  return (
    <>
      <PageHeader
        title="Jam kerja"
        description="Rentang jam per hari yang tersedia untuk dipesan."
      />
      <PhasePlaceholder
        phase="Phase 3"
        title="Pengaturan jam kerja mingguan"
        scope={[
          "Rentang jam per hari, Senin sampai Minggu",
          "Beberapa rentang dalam satu hari (misal sebelum dan sesudah istirahat)",
          "Database menolak rentang yang saling tumpang tindih",
        ]}
      />
    </>
  );
}
