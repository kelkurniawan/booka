import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { requireMerchant } from "@/lib/auth/session";
import { placementFromOrder } from "@/lib/funnel/link-placement";
import { createClient } from "@/lib/supabase/server";
import { resolveTheme } from "@/lib/theme/resolve";

import { LinksEditor } from "./links-editor";

export const metadata: Metadata = { title: "Tautan dan sosmed" };

export default async function LinksPage() {
  const { user, merchant } = await requireMerchant();
  const supabase = await createClient();

  const [themeResult, linksResult, profilResult, contactsResult] = await Promise.all([
    supabase.from("merchant_themes").select("*").eq("merchant_id", user.id).maybeSingle(),
    supabase
      .from("merchant_links")
      .select("id, label, url, is_visible")
      .eq("merchant_id", user.id)
      .order("sort_order", { ascending: true }),
    supabase.from("merchants").select("bio").eq("id", user.id).maybeSingle(),
    supabase.rpc("get_public_contacts", { p_merchant_id: user.id }),
  ]);

  const failure = themeResult.error ?? linksResult.error;
  if (failure) {
    console.error("[tautan] gagal memuat", { userId: user.id, error: failure });
    return (
      <p role="alert" className="text-muted-foreground text-sm">
        Tautan belum bisa dimuat. Muat ulang halaman sebentar lagi.
      </p>
    );
  }

  const theme = themeResult.data ?? null;
  return (
    <>
      <PageHeader
        title="Tautan dan sosmed"
        description="Satu halaman untuk bio Instagram dan TikTok: tautan penting Anda tampil di atas tombol booking."
      />
      <LinksEditor
        initialLinks={(linksResult.data ?? []).map((l) => ({ id: l.id, label: l.label, url: l.url, isVisible: l.is_visible }))}
        initialShowSocial={theme?.show_social_icons ?? true}
        initialPlacement={placementFromOrder(theme?.section_order)}
        theme={resolveTheme(merchant.subscription_tier, theme)}
        name={merchant.full_name ?? merchant.username ?? ""}
        bio={profilResult.data?.bio ?? null}
        avatarUrl={merchant.avatar_url}
        contacts={contactsResult.data?.[0] ?? null}
      />
    </>
  );
}
