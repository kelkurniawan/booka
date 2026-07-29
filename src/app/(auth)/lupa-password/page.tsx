import type { Metadata } from "next";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ROUTES } from "@/lib/routes";

import { ForgotPasswordForm } from "./forgot-form";

export const metadata: Metadata = {
  title: "Lupa password",
};

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lupa password</CardTitle>
        <CardDescription>
          Masukkan email akun Anda. Kami kirimkan tautan untuk membuat password
          baru.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <ForgotPasswordForm />

        <p className="text-muted-foreground text-center text-sm">
          Ingat password Anda?{" "}
          <Link
            href={ROUTES.login}
            className="text-foreground underline underline-offset-4"
          >
            Kembali ke halaman masuk
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
