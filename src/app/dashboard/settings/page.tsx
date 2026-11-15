import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { requireMerchant } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env/server";
import { createClient } from "@/lib/supabase/server";

import { DEFAULT_MERCHANT_SETTINGS } from "@/lib/booking/payment-mode";

import { DEFAULT_MANAGE_SETTINGS } from "@/lib/booking/customer-manage";

import { AccountSection } from "./account-section";
import { BookingSettingsForm } from "./booking-settings-form";
import { ContactSettingsForm } from "./contact-settings-form";
import { CustomerPolicyForm } from "./customer-policy-form";
import { ReminderSettingsForm } from "./reminder-settings-form";
import { SettingsForm } from "./settings-form";

// Sama dengan default kolom di migration 20261116000200 bila baris belum ada.
const DEFAULT_CONTACT = {
  contact_phone: null, contact_email: null, contact_instagram: null, contact_threads: null,
  contact_x: null, contact_tiktok: null, contact_hidden: [], reply_from: null, reply_until: null,
};
const DEFAULT_REMINDERS = {
  reminder_whatsapp: true, reminder_email: true, reminder_push: true, reminder_day_before: true, reminder_same_day: false,
};

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
      .select(
        "allow_pay_on_site, auto_confirm_on_site, max_active_per_phone, deposit_after_no_show, allow_customer_reschedule, reschedule_min_hours, max_reschedules, allow_customer_cancel, cancel_min_hours, policy_text, contact_phone, contact_email, contact_instagram, contact_threads, contact_x, contact_tiktok, contact_hidden, reply_from, reply_until, reminder_whatsapp, reminder_email, reminder_push, reminder_day_before, reminder_same_day",
      )
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
        settings={settingsRow ?? DEFAULT_MERCHANT_SETTINGS}
        onSiteServices={onSite ?? []}
      />
      <CustomerPolicyForm settings={{ ...DEFAULT_MANAGE_SETTINGS, ...settingsRow }} />
      <ContactSettingsForm
        settings={{ ...DEFAULT_CONTACT, ...settingsRow }}
        whatsapp={profile?.whatsapp_number ?? null}
      />
      <ReminderSettingsForm
        settings={{ ...DEFAULT_REMINDERS, ...settingsRow }}
        tier={merchant.subscription_tier}
      />
      <AccountSection username={merchant.username} />
    </>
  );
}
