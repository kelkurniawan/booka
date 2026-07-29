import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Tautan tidak berlaku",
};

const REASON_MESSAGES: Record<string, string> = {
  missing_code: "Tautan yang Anda buka tidak lengkap.",
  access_denied: "Proses masuk dibatalkan.",
  otp_expired: "Tautan sudah kedaluwarsa.",
};

export default async function AuthCodeErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const message =
    (reason && REASON_MESSAGES[reason]) ??
    "Tautan sudah kedaluwarsa atau pernah dipakai sebelumnya.";

  return (
    <div className="flex min-h-svh items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Tautan tidak berlaku</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href={ROUTES.login}>Minta tautan baru</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
