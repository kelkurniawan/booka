import Link from "next/link";

import { BOOKING_TABS, type BookingTab } from "@/lib/booking/dashboard";
import { cn } from "@/lib/utils";

import { buildBookingsHref } from "./booking-state";

/**
 * Tab kelompok booking. Tautan biasa (server): pindah tab mereset `page` dan
 * `b`, tetapi mempertahankan `q` dan `size`. Jumlah hanya untuk dua tab yang
 * butuh perhatian; disembunyikan bila `counts` null (RPC gagal).
 */
export function BookingTabs({
  active,
  counts,
  q,
  size,
}: {
  active: BookingTab;
  counts: { action: number; upcoming: number } | null;
  q: string;
  size: number;
}) {
  return (
    <nav aria-label="Kelompok booking" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-5 border-b">
        {BOOKING_TABS.map(({ tab, label }) => {
          const count = tab === "ACTION" ? counts?.action : tab === "UPCOMING" ? counts?.upcoming : undefined;
          const isActive = tab === active;
          return (
            <li key={tab}>
              <Link
                href={buildBookingsHref({ tab, q, page: 1, size })}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-11 items-center gap-1.5 border-b-2 text-sm whitespace-nowrap",
                  isActive
                    ? "border-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {label}
                {count !== undefined ? (
                  <span className="text-muted-foreground tabular-nums">{count}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
