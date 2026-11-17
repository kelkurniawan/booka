import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { BookingSettingsForm } from "./booking-settings-form";

const meta = {
  title: "Dashboard/Pengaturan booking",
  component: BookingSettingsForm,
  parameters: { nextjs: { appDirectory: true } },
  args: {
    settings: {
      allow_pay_on_site: true,
      auto_confirm_on_site: true,
      max_active_per_phone: 2,
      deposit_after_no_show: true,
    },
    onSiteServices: [
      { id: "1", name: "Potong rambut" },
      { id: "2", name: "Cukur jenggot" },
    ],
    action: async () => ({ status: "success" as const }),
  },
} satisfies Meta<typeof BookingSettingsForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Menyala: Story = {};

export const BayarDiTempatMati: Story = {
  args: {
    settings: {
      allow_pay_on_site: false,
      auto_confirm_on_site: false,
      max_active_per_phone: null,
      deposit_after_no_show: false,
    },
  },
};
