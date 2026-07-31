import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = {
  title: "Password baru",
};

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Halaman ini sengaja tidak masuk daftar rute terproteksi di proxy: merchant
  // yang belum menyelesaikan onboarding tetap harus bisa mengganti password
  // tanpa dibelokkan ke /onboarding lebih dulu.
  if (!user) {
    redirect(ROUTES.forgotPassword);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Buat password baru</CardTitle>
        <CardDescription>
          Setelah disimpan, Anda langsung masuk memakai password ini.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <ResetPasswordForm />

        <p className="text-muted-foreground text-center text-sm">
          Berubah pikiran?{" "}
          <Link
            href={ROUTES.dashboard}
            className="text-foreground underline underline-offset-4"
          >
            Kembali ke dashboard
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
