import Link from "next/link";
import { Compass } from "lucide-react";

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
 * 404 default Next.js berbahasa Inggris ("This page could not be found") --
 * satu-satunya halaman berbahasa Inggris di aplikasi yang seluruhnya
 * berbahasa Indonesia (AGENTS.md), termasuk untuk pelanggan yang salah
 * ketik token di /pesanan/[token]. Diletakkan di root src/app supaya
 * berlaku untuk semua rute yang tidak punya not-found.tsx sendiri.
 *
 * Sengaja minimal (jaring pengaman, bukan fitur) -- memakai visual yang
 * sama dengan empty state lain di aplikasi ini (komponen Empty, max-w-md).
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-10">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Compass />
          </EmptyMedia>
          <EmptyTitle>Halaman tidak ditemukan</EmptyTitle>
          <EmptyDescription>
            Tautan yang Anda buka mungkin salah ketik atau sudah tidak berlaku.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href={ROUTES.home}>Kembali ke beranda</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
