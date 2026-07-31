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

/**
 * Kode sebab dikirim src/app/auth/callback/route.ts. Jangan mencocokkan
 * pesan mentah supabase-js di sini: teksnya bahasa Inggris dan bisa berubah,
 * sehingga tidak akan pernah cocok dan semua kegagalan tampil sebagai
 * "kedaluwarsa" — persis bug yang membuat sebab aslinya tidak terlihat.
 */
const REASON_MESSAGES: Record<string, string> = {
  missing_code: "Tautan yang Anda buka tidak lengkap.",
  access_denied: "Proses masuk dibatalkan.",
  otp_expired: "Tautan sudah kedaluwarsa. Tautan masuk hanya berlaku 1 jam.",
  code_used: "Tautan ini sudah pernah dipakai. Setiap tautan hanya sekali pakai.",
  // Sebab paling sering, dan satu-satunya yang bisa langsung diperbaiki
  // pengguna — karena itu penjelasannya dibuat sekonkret mungkin.
  pkce_verifier_missing:
    "Tautan ini harus dibuka di browser yang sama dengan tempat Anda memintanya. " +
    "Kalau Anda meminta tautan di laptop lalu membuka emailnya di HP, tautannya tidak akan berfungsi.",
  exchange_failed: "Tautan tidak bisa diverifikasi.",
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
