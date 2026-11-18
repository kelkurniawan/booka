"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireMerchant } from "@/lib/auth/session";
import { applyPlacement } from "@/lib/funnel/link-placement";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { saveLinksInputSchema } from "@/lib/validations/funnel";

export type SaveLinksInput = {
  links: { id?: string; label: string; url: string; isVisible: boolean }[];
  showSocialIcons: boolean;
  publicWhatsapp: boolean;
  placement: "BEFORE_SERVICES" | "AFTER_SERVICES" | "END";
};
export type SaveLinksResult = { ok: true } | { ok: false; message: string };

export async function saveMerchantLinks(input: SaveLinksInput): Promise<SaveLinksResult> {
  const { user, merchant } = await requireMerchant();
  const parsed = saveLinksInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Periksa kembali isian Anda" };

  const supabase = await createClient();
  const { data: theme, error: themeError } = await supabase
    .from("merchant_themes")
    .select("section_order")
    .eq("merchant_id", user.id)
    .maybeSingle();
  if (themeError) {
    console.error("[tautan] gagal memuat urutan bagian", themeError);
    return { ok: false, message: "Perubahan gagal disimpan. Coba lagi sebentar lagi." };
  }

  const { error } = await supabase.rpc("save_merchant_links", {
    p_links: parsed.data.links.map((l, i) => ({
      id: l.id ?? randomUUID(),
      label: l.label,
      url: l.url,
      sort_order: i,
      is_visible: l.isVisible,
    })),
    p_show_social_icons: parsed.data.showSocialIcons,
    p_public_whatsapp: parsed.data.publicWhatsapp,
    p_section_order: applyPlacement(theme?.section_order, parsed.data.placement),
  });
  if (error) {
    console.error("[tautan] gagal menyimpan", error);
    return { ok: false, message: "Perubahan gagal disimpan. Coba lagi sebentar lagi." };
  }

  if (merchant.username) revalidatePath(ROUTES.merchantPage(merchant.username));
  revalidatePath(ROUTES.links);
  revalidatePath(ROUTES.appearance);
  return { ok: true };
}
