import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(ROUTES.login);
  }

  const { data: merchant } = await supabase
    .from("merchants")
    .select("username, full_name, avatar_url, subscription_tier")
    .eq("id", user.id)
    .maybeSingle();

  // Proxy sudah menangani ini, tapi layout tetap memeriksa sendiri agar
  // sidebar tidak pernah dirender tanpa username.
  if (!merchant?.username) {
    redirect(ROUTES.onboarding);
  }

  return (
    <SidebarProvider>
      <AppSidebar
        merchant={{
          username: merchant.username,
          fullName: merchant.full_name ?? "Merchant",
          email: user.email ?? "",
          avatarUrl: merchant.avatar_url,
          tier: merchant.subscription_tier,
        }}
      />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm font-medium">Dashboard</span>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
