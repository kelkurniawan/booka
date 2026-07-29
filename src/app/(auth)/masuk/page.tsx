import type { Metadata } from "next";
import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ROUTES, sanitizeRedirect } from "@/lib/routes";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Masuk",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = sanitizeRedirect(params.next ?? null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Masuk ke Booka</CardTitle>
        <CardDescription>
          Kelola jadwal, layanan, dan pembayaran DP dari satu tempat.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {params.error === "oauth" ? (
          <Alert variant="destructive">
            <AlertDescription>
              Gagal masuk lewat Google. Silakan coba lagi atau gunakan email.
            </AlertDescription>
          </Alert>
        ) : null}

        <SignInForm next={next} />

        <p className="text-muted-foreground text-center text-sm">
          Belum punya akun?{" "}
          <Link
            href={ROUTES.signup}
            className="text-foreground underline underline-offset-4"
          >
            Daftar gratis
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
