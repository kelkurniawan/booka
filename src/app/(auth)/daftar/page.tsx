import type { Metadata } from "next";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ROUTES, sanitizeRedirect } from "@/lib/routes";

import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = {
  title: "Daftar",
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  // Merchant yang datang dari kolom klaim tautan di halaman depan membawa
  // `?next=/onboarding?u=…`; sisanya langsung ke onboarding.
  const next = sanitizeRedirect(params.next ?? null, ROUTES.onboarding);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Buat akun Booka</CardTitle>
        <CardDescription>
          Gratis selamanya untuk 10 transaksi per bulan. Tanpa kartu kredit.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <SignUpForm next={next} />

        <p className="text-muted-foreground text-center text-sm">
          Sudah punya akun?{" "}
          <Link
            href={ROUTES.login}
            className="text-foreground underline underline-offset-4"
          >
            Masuk
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
