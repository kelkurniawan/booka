import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { serverEnv } from "@/lib/env/server";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Pengaturan" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(ROUTES.login);
  }

  const { data: merchant } = await supabase
    .from("merchants")
    .select("full_name, bio, whatsapp_number, username")
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
        defaultFullName={merchant?.full_name ?? ""}
        defaultBio={merchant?.bio ?? ""}
        defaultWhatsapp={merchant?.whatsapp_number ?? ""}
        defaultUsername={merchant?.username ?? ""}
      />
    </>
  );
}
