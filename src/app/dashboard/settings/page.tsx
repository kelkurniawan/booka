import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { requireMerchant } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env/server";
import { createClient } from "@/lib/supabase/server";

import { DEFAULT_PAYMENT_SETTINGS } from "@/lib/booking/payment-mode";

import { AccountSection } from "./account-section";
import { BookingSettingsForm } from "./booking-settings-form";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Pengaturan" };

export default async function SettingsPage() {
  // requireMerchant() dibungkus cache() -- dashboard/layout.tsx sudah
  // memanggilnya di render pass yang sama, jadi baris ini TIDAK menambah
  // round-trip auth baru. full_name dan username sudah ada di hasilnya;
  // bio dan whatsapp_number TIDAK ada di SessionMerchant (kolom itu cuma
  // dibutuhkan halaman ini), jadi masih perlu satu query tambahan khusus
  // untuk keduanya -- bukan query merchants penuh seperti sebelumnya.
  const { user, merchant } = await requireMerchant();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("merchants")
    .select("bio, whatsapp_number")
    .eq("id", user.id)
    .maybeSingle();

  const [{ data: settingsRow }, { data: onSite }] = await Promise.all([
    supabase
      .from("merchant_settings")
      .select("allow_pay_on_site, auto_confirm_on_site, max_active_per_phone, deposit_after_no_show")
      .eq("merchant_id", user.id)
      .maybeSingle(),
    supabase
      .from("services")
      .select("id, name")
      .eq("merchant_id", user.id)
      .eq("payment_mode", "ON_SITE")
      .order("sort_order", { ascending: true }),
  ]);

  return (
    <>
      <PageHeader
        title="Pengaturan"
        description="Profil publik dan identitas halaman booking Anda."
      />
      <SettingsForm
        appUrl={serverEnv().appUrl}
        defaultFullName={merchant.full_name ?? ""}
        defaultBio={profile?.bio ?? ""}
        defaultWhatsapp={profile?.whatsapp_number ?? ""}
        defaultUsername={merchant.username}
      />
      <BookingSettingsForm
        settings={
          settingsRow ?? {
            ...DEFAULT_PAYMENT_SETTINGS,
            max_active_per_phone: null,
            deposit_after_no_show: false,
          }
        }
        onSiteServices={onSite ?? []}
      />
      <AccountSection username={merchant.username} />
    </>
  );
}
