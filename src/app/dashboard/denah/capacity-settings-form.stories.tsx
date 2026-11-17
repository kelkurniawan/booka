import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { CapacitySettingsForm } from "./capacity-settings-form";

const meta = {
  title: "Dashboard/Denah meja/Kapasitas",
  component: CapacitySettingsForm,
  parameters: { nextjs: { appDirectory: true } },
  args: {
    settings: { table_mode: "NONE", seats_per_slot: null, table_hold_minutes: 15, auto_join_tables: false },
    hasReservationService: true,
    save: async (): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true }),
  },
} satisfies Meta<typeof CapacitySettingsForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mati: Story = {};

export const TotalKursi: Story = {
  args: { settings: { table_mode: "AREA", seats_per_slot: 40, table_hold_minutes: 15, auto_join_tables: false } },
};

export const PakaiDenah: Story = {
  args: {
    settings: { table_mode: "TABLE", seats_per_slot: null, table_hold_minutes: 15, auto_join_tables: true },
    hasReservationService: false,
  },
};

export const GagalSimpan: Story = {
  args: {
    settings: { table_mode: "AREA", seats_per_slot: 40, table_hold_minutes: 15, auto_join_tables: false },
    save: async () => ({ ok: false as const, error: "Gagal menyimpan pengaturan. Coba lagi." }),
  },
};
