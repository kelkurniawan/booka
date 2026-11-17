import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { ContactChannel } from "@/types/database";
import { DEFAULT_MANAGE_SETTINGS } from "@/lib/booking/customer-manage";

import { ContactSettingsForm } from "./contact-settings-form";
import { CustomerPolicyForm } from "./customer-policy-form";
import { ReminderSettingsForm } from "./reminder-settings-form";

const contactOn = {
  contact_phone: "+6281298765432", contact_email: "halo@riasbysekar.id", contact_instagram: "riasbysekar",
  contact_threads: "riasbysekar", contact_x: "riasbysekar", contact_tiktok: "riasbysekar",
  contact_hidden: [] as ContactChannel[], reply_from: "09:00:00", reply_until: "20:00:00",
};
const contactOff = {
  contact_phone: null, contact_email: null, contact_instagram: null, contact_threads: null,
  contact_x: null, contact_tiktok: null, contact_hidden: [], reply_from: null, reply_until: null,
};
const policyOn = {
  allow_customer_reschedule: true, reschedule_min_hours: 24, max_reschedules: 2,
  allow_customer_cancel: true, cancel_min_hours: 48,
  policy_text: "DP tidak dikembalikan jika dibatalkan, tetapi bisa dipakai untuk jadwal baru.",
};
const remOn = { reminder_whatsapp: true, reminder_email: true, reminder_push: true, reminder_day_before: true, reminder_same_day: true };
const remOff = { reminder_whatsapp: false, reminder_email: false, reminder_push: false, reminder_day_before: false, reminder_same_day: false };

type Result = { status: "success" | "error"; message?: string };
const ok = async (): Promise<Result> => ({ status: "success" });
const fail = async (): Promise<Result> => ({ status: "error", message: "Gagal menyimpan pengaturan. Coba lagi." });

function Stack({ mode, tier = "PRO", action = ok }: { mode: "on" | "off"; tier?: "STARTER" | "PRO"; action?: () => Promise<Result> }) {
  const on = mode === "on";
  return (
    <div className="flex flex-col gap-6">
      <CustomerPolicyForm settings={on ? policyOn : DEFAULT_MANAGE_SETTINGS} action={action} />
      <ContactSettingsForm settings={on ? contactOn : contactOff} whatsapp={on ? "+6281234567890" : null} action={action} />
      <ReminderSettingsForm settings={on ? remOn : remOff} tier={tier} action={action} />
    </div>
  );
}

const meta = {
  title: "Dashboard/Pengaturan pelanggan",
  component: Stack,
  parameters: { nextjs: { appDirectory: true } },
} satisfies Meta<typeof Stack>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SemuaMenyala: Story = { args: { mode: "on" } };
export const SemuaMati: Story = { args: { mode: "off" } };
export const MerchantStarter: Story = { args: { mode: "off", tier: "STARTER" } };
export const ErrorSimpan: Story = { args: { mode: "on", action: fail } };
export const HP390: Story = {
  args: { mode: "on" },
  parameters: { viewport: { defaultViewport: "mobile1" }, chromatic: { viewports: [390] } },
  decorators: [(S) => <div style={{ width: 390 }}><S /></div>],
};
