import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { ManualBookingResult } from "../manual-booking";
import { ManualBookingForm } from "./manual-booking-form";

const services = [
  { id: "5f0c4d3e-1b2a-4c5d-8e9f-0a1b2c3d4e5f", name: "Potong rambut", duration_minutes: 45, price: 50000 },
  { id: "6a1d5e4f-2c3b-4d6e-9f0a-1b2c3d4e5f60", name: "Cukur jenggot", duration_minutes: 20, price: 25000 },
];

const slots = ["09:00", "10:00", "13:00", "15:30", "19:00"].map((label) => ({
  label,
  startUtc: `2030-01-07T${label}:00.000Z`,
  endUtc: `2030-01-07T${label}:00.000Z`,
}));

const meta = {
  title: "Dashboard/Booking manual",
  component: ManualBookingForm,
  parameters: { nextjs: { appDirectory: true } },
  beforeEach: () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => Response.json({ slots });
    return () => {
      globalThis.fetch = original;
    };
  },
  args: {
    username: "demo",
    todayISO: "2030-01-07",
    services,
    staff: [],
    action: async (): Promise<ManualBookingResult> => ({ ok: true, id: "x" }),
  },
} satisfies Meta<typeof ManualBookingForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TanpaStaf: Story = {};

export const DenganStaf: Story = {
  args: { staff: [{ id: "7b2e6f50-3d4c-4e7f-a01b-2c3d4e5f6071", name: "Dewi" }, { id: "8c3f7061-4e5d-4f80-b12c-3d4e5f607182", name: "Andi" }] },
};

export const GagalKuota: Story = {
  args: {
    action: async (): Promise<ManualBookingResult> => ({
      ok: false,
      message: "Kuota transaksi bulan ini sudah habis. Upgrade paket di menu Langganan untuk menambah booking.",
    }),
  },
};
