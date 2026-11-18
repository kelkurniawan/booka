"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarRange, Ellipsis, LayoutList, Palette, Plus, Sun, type LucideIcon } from "lucide-react";

import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/routes";

/** Lingkaran hitam jumlah booking yang perlu tindakan. Hilang bila 0 atau null. */
export function ActionBadge({
  count,
  className,
}: {
  count: number | null;
  className?: string;
}) {
  if (!count) return null;
  return (
    <span
      className={cn(
        "bg-primary text-primary-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] leading-none font-medium tabular-nums",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
      <span className="sr-only"> perlu tindakan</span>
    </span>
  );
}

const ITEM =
  "relative flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px] focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset";

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  badge,
  tour,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  badge?: React.ReactNode;
  tour?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      data-tour={tour}
      className={cn(ITEM, active ? "text-foreground font-semibold" : "text-muted-foreground")}
    >
      <span className="relative">
        <Icon className="size-5" />
        {badge}
      </span>
      {label}
    </Link>
  );
}

export function MobileNav({ actionCount, showCourts = false }: { actionCount: number | null; showCourts?: boolean }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const onBookings =
    pathname === ROUTES.bookings || (pathname.startsWith(`${ROUTES.bookings}/`) && pathname !== ROUTES.newBooking);
  const onAppearance = pathname === ROUTES.appearance || pathname.startsWith(`${ROUTES.appearance}/`);

  return (
    <nav
      aria-label="Navigasi utama"
      className="bg-background fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <NavLink href={ROUTES.dashboard} label="Hari ini" icon={Sun} active={pathname === ROUTES.dashboard} tour="nav-today" />
      <NavLink
        href={ROUTES.bookings}
        label="Booking"
        icon={LayoutList}
        active={onBookings}
        tour="nav-bookings"
        badge={<ActionBadge count={actionCount} className="absolute -top-1.5 -right-2.5" />}
      />
      <div className="flex items-center justify-center">
        <Link
          href={ROUTES.newBooking}
          aria-label="Tambah booking manual"
          aria-current={pathname === ROUTES.newBooking ? "page" : undefined}
          data-tour="new-booking"
          className="bg-primary text-primary-foreground focus-visible:ring-ring focus-visible:ring-offset-background -mt-4 flex size-12 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <Plus className="size-6" />
        </Link>
      </div>
      {showCourts ? (
        // Papan L4: tab Lapangan menggantikan "Halaman" (tetap terjangkau lewat Lainnya).
        <NavLink
          href={ROUTES.courts}
          label="Lapangan"
          icon={CalendarRange}
          active={pathname === ROUTES.courts || pathname.startsWith(`${ROUTES.courts}/`)}
          tour="nav-courts"
        />
      ) : (
        <NavLink href={ROUTES.appearance} label="Halaman" icon={Palette} active={onAppearance} />
      )}
      <button
        type="button"
        onClick={() => setOpenMobile(true)}
        className={cn(ITEM, "text-muted-foreground")}
      >
        <Ellipsis className="size-5" />
        Lainnya
      </button>
    </nav>
  );
}
