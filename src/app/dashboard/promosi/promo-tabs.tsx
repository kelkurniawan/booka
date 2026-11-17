"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/routes";

const TABS = [
  { label: "Banner", href: ROUTES.promoBanners },
  { label: "Voucher", href: ROUTES.promoVouchers },
];

export function PromoTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Promosi" className="flex gap-1 border-b" data-tour="promo-tabs">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex min-h-11 items-center border-b-2 px-4 text-sm font-medium",
              active
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
