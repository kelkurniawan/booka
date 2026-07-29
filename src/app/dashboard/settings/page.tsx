import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { PhasePlaceholder } from "@/components/layout/phase-placeholder";

export const metadata: Metadata = { title: "Pengaturan" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Pengaturan"
        description="Profil publik dan identitas halaman booking Anda."
      />
      <PhasePlaceholder
        phase="Phase 3"
        title="Profil merchant"
        scope={[
          "Ubah nama usaha, bio, dan foto profil",
          "Ganti username (tautan halaman booking)",
          "Nomor WhatsApp untuk notifikasi",
        ]}
      />
    </>
  );
}
