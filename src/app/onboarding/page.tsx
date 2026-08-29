import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { serverEnv } from "@/lib/env/server";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { usernameSchema } from "@/lib/validations/merchant";

import { OnboardingWizard } from "./wizard";

export const metadata: Metadata = {
  title: "Lengkapi profil",
};

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  // `?u=` dikirim dari kolom klaim tautan di halaman depan.
  searchParams: Promise<{ u?: string }>;
}) {
  const { u } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Proxy sudah menjaga rute ini; pengecekan di sini menutup celah kalau
  // matcher berubah dan agar TypeScript tahu `user` tidak null.
  if (!user) {
    redirect(ROUTES.login);
  }

  const { data: merchant } = await supabase
    .from("merchants")
    .select("username, full_name")
    .eq("id", user.id)
    .maybeSingle();

  // Penjaga ini juga yang menutup jebakan muat-ulang di layar sukses: begitu
  // wizard selesai, merchant PUNYA username, jadi memuat ulang
  // `/onboarding?langkah=sukses` tidak pernah sampai ke wizard -- langsung ke
  // dashboard, bukan kembali ke form identitas yang sudah terkirim.
  if (merchant?.username) {
    redirect(ROUTES.dashboard);
  }

  const defaultFullName =
    merchant?.full_name ??
    (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "") ??
    "";

  return (
    <OnboardingWizard
      userId={user.id}
      appUrl={serverEnv().appUrl}
      defaultFullName={defaultFullName}
      defaultUsername={usernameSchema.safeParse(u).data ?? ""}
    />
  );
}
