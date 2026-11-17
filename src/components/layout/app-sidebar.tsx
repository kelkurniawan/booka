"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarClock,
  CreditCard,
  ExternalLink,
  Globe,
  LayoutGrid,
  LayoutList,
  Megaphone,
  Palette,
  Settings,
  Sparkles,
  Sun,
  Users,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { ROUTES } from "@/lib/routes";
import type { SubscriptionTier } from "@/types/database";

import { ActionBadge } from "./mobile-nav";
import { NavUser } from "./nav-user";

const NAV_GROUPS = [
  {
    label: null,
    items: [
      { title: "Hari ini", href: ROUTES.dashboard, icon: Sun, exact: true, tour: "nav-today" },
      { title: "Booking", href: ROUTES.bookings, icon: LayoutList, badge: true, tour: "nav-bookings" },
      { title: "Analitik", href: ROUTES.analytics, icon: BarChart3 },
    ],
  },
  {
    label: "Atur usaha",
    items: [
      { title: "Layanan", href: ROUTES.services, icon: Sparkles },
      { title: "Jam buka", href: ROUTES.availability, icon: CalendarClock },
      { title: "Denah meja", href: ROUTES.floorPlan, icon: LayoutGrid },
      { title: "Staf", href: ROUTES.staff, icon: Users },
      { title: "Pembayaran", href: ROUTES.payments, icon: Wallet },
    ],
  },
  {
    label: "Halaman booking",
    items: [
      { title: "Tampilan", href: ROUTES.appearance, icon: Palette },
      { title: "Promosi", href: ROUTES.promoBanners, icon: Megaphone },
      { title: "Domain", href: ROUTES.domain, icon: Globe },
    ],
  },
  {
    label: "Akun",
    items: [
      { title: "Langganan", href: ROUTES.billing, icon: CreditCard },
      { title: "Pengaturan", href: ROUTES.settings, icon: Settings },
    ],
  },
] as const;

const TIER_LABEL: Record<SubscriptionTier, string> = {
  STARTER: "Starter",
  PRO: "Pro",
  STUDIO: "Studio",
};

export function AppSidebar({
  merchant,
  actionCount,
}: {
  actionCount: number | null;
  merchant: {
    username: string;
    fullName: string;
    email: string;
    avatarUrl: string | null;
    tier: SubscriptionTier;
  };
}) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <Link href={ROUTES.dashboard}>
                <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg text-sm font-semibold">
                  M
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">Marky</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {TIER_LABEL[merchant.tier]}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label ?? "utama"}>
            {group.label ? <SidebarGroupLabel>{group.label}</SidebarGroupLabel> : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active =
                    "exact" in item
                      ? pathname === item.href
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                      data-tour={"tour" in item ? item.tour : undefined}
                      className="max-md:h-11"
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    {"badge" in item ? (
                      <ActionBadge count={actionCount} className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 group-data-[collapsible=icon]:hidden" />
                    ) : null}
                  </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Lihat halaman booking" data-tour="page-link">
                  <a
                    href={ROUTES.merchantPage(merchant.username)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink />
                    <span className="truncate">/{merchant.username}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {merchant.tier === "STARTER" ? (
          <div className="group-data-[collapsible=icon]:hidden">
            <Link
              href={ROUTES.billing}
              className="bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80 flex flex-col gap-1 rounded-lg p-3 text-xs transition-colors"
            >
              <Badge variant="secondary" className="w-fit">
                Paket Starter
              </Badge>
              <span className="text-muted-foreground">
                Batas 10 transaksi/bulan dan 1 layanan. Upgrade untuk membuka semuanya.
              </span>
            </Link>
          </div>
        ) : null}
        <NavUser
          name={merchant.fullName}
          email={merchant.email}
          avatarUrl={merchant.avatarUrl}
        />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
