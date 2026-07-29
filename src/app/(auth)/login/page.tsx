import type { Metadata } from "next";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { sanitizeRedirect } from "@/lib/routes";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Masuk",
};

export default async function LoginPage({
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
              Gagal masuk lewat Google. Silakan coba lagi atau gunakan tautan email.
            </AlertDescription>
          </Alert>
        ) : null}
        <LoginForm next={next} />
      </CardContent>
    </Card>
  );
}
