import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { requireMerchant } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env/server";
import { createClient } from "@/lib/supabase/server";

import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Pengaturan" };

export default async function SettingsPage() {
  // requireMerchant() dibungkus cache() -- dashboard/layout.tsx sudah
  // memanggilnya di render pass yang sama, jadi baris ini TIDAK menambah
  // round-trip auth baru. full_name dan username sudah ada di hasilnya;
  // bio dan whatsapp_number TIDAK ada di SessionMerchant (kolom itu cuma
  // dibutuhkan halaman ini), jadi masih perlu satu query tambahan khusus
  // untuk keduanya -- bukan query merchants penuh seperti sebelumnya.
  const { user, merchant } = await requireMerchant();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("merchants")
    .select("bio, whatsapp_number")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <>
      <PageHeader
        title="Pengaturan"
        description="Profil publik dan identitas halaman booking Anda."
      />
      <SettingsForm
        appUrl={serverEnv().appUrl}
        defaultFullName={merchant.full_name ?? ""}
        defaultBio={profile?.bio ?? ""}
        defaultWhatsapp={profile?.whatsapp_number ?? ""}
        defaultUsername={merchant.username}
      />
    </>
  );
}
