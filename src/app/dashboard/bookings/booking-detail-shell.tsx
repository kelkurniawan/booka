"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/**
 * Pembungkus panel detail: `aside` mulai lg, `Sheet` di bawahnya. Hanya satu
 * yang dirender sekaligus supaya state panel (form jadwal ulang) tidak ganda.
 * Snapshot server = desktop; di HP berganti ke Sheet setelah hidrasi.
 */
export function BookingDetailShell({ closeHref, children }: { closeHref: string; children: React.ReactNode }) {
  const router = useRouter();
  const isDesktop = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );

  if (isDesktop) {
    return (
      <aside aria-labelledby="booking-detail-title" className="relative border-l pl-6">
        <Button asChild variant="ghost" size="icon" className="absolute top-0 right-0 size-11">
          <Link href={closeHref} scroll={false} aria-label="Tutup detail">
            <X />
          </Link>
        </Button>
        {children}
      </aside>
    );
  }

  return (
    <Sheet open onOpenChange={(open) => !open && router.replace(closeHref, { scroll: false })}>
      <SheetContent
        side="right"
        showCloseButton={false}
        // Fokus dipindah panel sendiri ke judulnya.
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-full gap-0 overflow-y-auto p-4 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        <SheetTitle className="sr-only">Detail booking</SheetTitle>
        <SheetDescription className="sr-only">Informasi dan aksi untuk booking yang dipilih.</SheetDescription>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 size-11"
          aria-label="Tutup detail"
          onClick={() => router.replace(closeHref, { scroll: false })}
        >
          <X />
        </Button>
        {children}
      </SheetContent>
    </Sheet>
  );
}
