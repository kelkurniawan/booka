import { getOnboardingState, getTabCounts } from "@/app/dashboard/queries";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { GuideProvider } from "@/components/guide/guide-provider";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { requireMerchant } from "@/lib/auth/session";
import { GUIDE_PAGE_KEYS } from "@/lib/guide/guide";

/**
 * Seluruh dashboard bergantung pada sesi merchant, jadi tidak boleh ada
 * satu pun segmennya yang di-prerender atau di-cache statis.
 */
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // requireMerchant() (lib/auth/session.ts) menangani redirect ke /masuk
  // atau /onboarding -- perilakunya persis sama dengan blok getUser() +
  // query merchants yang dulu ada di sini. Proxy juga menegakkan redirect
  // belum-onboarding untuk /dashboard/* (lihat komentar di proxy.ts), tapi
  // layout tetap memeriksa sendiri agar sidebar tidak pernah dirender tanpa
  // merchant yang valid.
  const [{ user, merchant }, counts, onboarding] = await Promise.all([
    requireMerchant(),
    getTabCounts(),
    getOnboardingState(),
  ]);
  const actionCount = counts?.action ?? null;

  return (
    // Gagal muat: semua halaman dianggap sudah dilihat, jadi tidak ada tur otomatis.
    <GuideProvider
      toursSeen={onboarding?.toursSeen ?? [...GUIDE_PAGE_KEYS]}
      checklistDismissed={
        onboarding ? onboarding.checklistDismissedAt !== null : true
      }
    >
      <SidebarProvider>
        <AppSidebar
          actionCount={actionCount}
          merchant={{
            username: merchant.username,
            fullName: merchant.full_name ?? "Merchant",
            email: user.email ?? "",
            avatarUrl: merchant.avatar_url,
            tier: merchant.subscription_tier,
          }}
        />
        <SidebarInset>
          <header className="hidden h-14 shrink-0 items-center md:flex gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <span className="text-sm font-medium">Dashboard</span>
          </header>
          <div className="flex flex-1 flex-col gap-6 p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:p-6 md:pb-6">
            {children}
          </div>
        </SidebarInset>
        <MobileNav actionCount={actionCount} />
      </SidebarProvider>
    </GuideProvider>
  );
}
