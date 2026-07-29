import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { serverEnv } from "@/lib/env/server";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = {
  title: "Lengkapi profil",
};

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
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

  if (merchant?.username) {
    redirect(ROUTES.dashboard);
  }

  const defaultFullName =
    merchant?.full_name ??
    (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "") ??
    "";

  return (
    <div className="flex min-h-svh items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Satu langkah lagi</CardTitle>
          <CardDescription>
            Tentukan tautan booking Anda. Pelanggan cukup membuka tautan ini untuk
            memesan jadwal dan membayar DP.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingForm
            appUrl={serverEnv().NEXT_PUBLIC_APP_URL}
            defaultFullName={defaultFullName}
          />
        </CardContent>
      </Card>
    </div>
  );
}
