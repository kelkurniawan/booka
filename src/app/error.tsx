"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ROUTES } from "@/lib/routes";

/**
 * Error boundary root -- tangkapan terakhir kalau sebuah Server/Client
 * Component melempar tanpa error boundary lokal sendiri. Tanpa file ini,
 * Next.js menampilkan halaman "Application error" bawaan berbahasa Inggris
 * -- satu-satunya titik berbahasa Inggris di aplikasi yang seluruhnya
 * berbahasa Indonesia (AGENTS.md).
 *
 * WAJIB "use client" -- error.tsx Next.js selalu Client Component (App
 * Router mensyaratkan ini supaya bisa menangkap error dari boundary React
 * di sisi klien maupun re-throw dari Server Component).
 *
 * Sengaja minimal (jaring pengaman, bukan fitur) -- memakai visual yang
 * sama dengan empty state lain di aplikasi ini (komponen Empty, max-w-md).
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error-boundary]", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-10">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AlertTriangle />
          </EmptyMedia>
          <EmptyTitle>Terjadi kesalahan</EmptyTitle>
          <EmptyDescription>
            Maaf, ada masalah saat memuat halaman ini. Coba lagi, atau kembali ke beranda.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row gap-2">
          <Button variant="outline" onClick={reset}>
            Coba lagi
          </Button>
          <Button asChild>
            <Link href={ROUTES.home}>Kembali ke beranda</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
