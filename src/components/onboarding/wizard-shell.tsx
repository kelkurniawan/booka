import type * as React from "react";
import Link from "next/link";

import { MarkyLogo } from "@/components/brand/marky-mark";
import { ROUTES } from "@/lib/routes";

import { WizardProgress } from "./wizard-progress";

/**
 * Kerangka layar penuh untuk tiap langkah wizard onboarding: progres di atas,
 * judul + deskripsi, konten, lalu footer lengket berisi tombol kembali/lanjut.
 * Mobile-first: satu kolom, lebar dibatasi supaya tetap nyaman dibaca di layar
 * besar, footer bawaan warna solid supaya konten yang tergulir tidak menembusnya.
 */
export function WizardShell({
  progress,
  title,
  description,
  children,
  footer,
}: {
  progress: number | null;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col px-4 py-8">
      <Link href={ROUTES.home} aria-label="Marky, beranda" className="mb-6 self-start text-xl">
        <MarkyLogo />
      </Link>
      <WizardProgress current={progress} />

      <header className="mt-8 flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </header>

      <main className="mt-6 flex-1">{children}</main>

      {footer ? (
        <footer className="bg-background sticky bottom-0 mt-8 flex items-center justify-between gap-3 border-t py-4">
          {footer}
        </footer>
      ) : null}
    </div>
  );
}
