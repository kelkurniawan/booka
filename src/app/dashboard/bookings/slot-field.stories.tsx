import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { SlotField } from "./slot-field";

const sid = "5f0c4d3e-1b2a-4c5d-8e9f-0a1b2c3d4e5f";
const slots = ["09:00", "10:00", "13:00", "15:30", "19:00"].map((label) => ({
  label,
  startUtc: `2030-01-07T${label}:00.000Z`,
  endUtc: `2030-01-07T${label}:00.000Z`,
}));

/** Pasang fetch tiruan sebelum render; dipulihkan otomatis setelah story selesai. */
function mockFetch(impl: () => Promise<Response>) {
  return () => {
    const original = globalThis.fetch;
    globalThis.fetch = impl;
    return () => {
      globalThis.fetch = original;
    };
  };
}

const meta = {
  title: "Dashboard/SlotField",
  component: SlotField,
  args: { username: "demo", serviceId: sid, staffId: null, dateISO: "2030-01-07", value: null, onChange: () => {} },
} satisfies Meta<typeof SlotField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Terisi: Story = { beforeEach: mockFetch(async () => Response.json({ slots })) };
export const Memuat: Story = { beforeEach: mockFetch(() => new Promise<Response>(() => {})) };
export const Kosong: Story = { beforeEach: mockFetch(async () => Response.json({ slots: [] })) };
export const Gagal: Story = { beforeEach: mockFetch(async () => new Response("{}", { status: 500 })) };
export const BelumPilihLayanan: Story = { args: { serviceId: null } };
