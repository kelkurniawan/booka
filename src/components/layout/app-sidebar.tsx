"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  CreditCard,
  ExternalLink,
  LayoutList,
  Palette,
  Settings,
  Sparkles,
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

import { NavUser } from "./nav-user";

const NAV_GROUPS = [
  {
    label: "Operasional",
    items: [
      { title: "Booking masuk", href: ROUTES.bookings, icon: LayoutList },
      // Sebelum "Layanan": merchant memikirkan halamannya sebelum memikirkan
      // isinya.
      { title: "Halaman saya", href: ROUTES.appearance, icon: Palette },
      { title: "Layanan", href: ROUTES.services, icon: Sparkles },
      { title: "Jam kerja", href: ROUTES.availability, icon: CalendarClock },
    ],
  },
  {
    label: "Akun",
    items: [
      { title: "Pembayaran", href: ROUTES.payments, icon: Wallet },
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
}: {
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
                  B
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">Booka</span>
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
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                      tooltip={item.title}
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Lihat halaman booking">
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
