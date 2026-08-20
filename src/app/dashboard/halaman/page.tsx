import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { requireMerchant } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Service, ServiceMedia } from "@/types/database";

import { AppearanceEditor } from "./appearance-editor";

export const metadata: Metadata = { title: "Halaman saya" };

export default async function AppearancePage() {
  const { user, merchant } = await requireMerchant();
  const supabase = await createClient();

  const [themeResult, profilResult, servicesResult, faqsResult] = await Promise.all([
    supabase.from("merchant_themes").select("*").eq("merchant_id", user.id).maybeSingle(),
    // requireMerchant() tidak membawa `bio`, sedangkan halaman publik
    // menampilkannya. Diambil di sini supaya preview tidak diam-diam berbeda
    // dari hasil akhir hanya karena satu kolom hilang.
    supabase.from("merchants").select("bio").eq("id", user.id).maybeSingle(),
    supabase
      .from("services")
      .select("*, service_media(*)")
      .eq("merchant_id", user.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("merchant_faqs")
      .select("*")
      .eq("merchant_id", user.id)
      .order("sort_order", { ascending: true }),
  ]);

  const servicesWithMedia = (servicesResult.data ?? []) as (Service & {
    service_media?: ServiceMedia[] | null;
  })[];
  const mediaByService: Record<string, ServiceMedia[]> = {};
  const services: Service[] = servicesWithMedia.map(({ service_media, ...service }) => {
    mediaByService[service.id] = service_media ?? [];
    return service;
  });

  return (
    <>
      <PageHeader
        title="Halaman saya"
        description="Atur tampilan halaman booking yang dilihat pelanggan."
      />
      <AppearanceEditor
        tier={merchant.subscription_tier}
        merchantId={user.id}
        username={merchant.username}
        name={merchant.full_name ?? merchant.username}
        bio={profilResult.data?.bio ?? null}
        avatarUrl={merchant.avatar_url}
        theme={themeResult.data ?? null}
        services={services}
        mediaByService={mediaByService}
        faqs={faqsResult.data ?? []}
      />
    </>
  );
}
