import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { sampleSlots, sampleTheme, sampleToken } from "@/components/booking-page/fixtures";
import { BookingPageShell } from "@/components/booking-page/page-shell";
import { buildDateStrip } from "@/lib/booking/schedule";
import type { DayOfWeek } from "@/types/database";

import { RescheduleForm } from "./reschedule-form";

// Tanggal tetap (bukan hari ini) supaya story stabil; Minggu tutup.
const strip = buildDateStrip(new Set<DayOfWeek>([1, 2, 3, 4, 5, 6]), "2026-11-18");
const firstOpen = strip.find((d) => d.open)!.dateISO;
const slots = sampleSlots;

function fakeFetch(save: { ok: boolean; error?: string }) {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/slots")) return Response.json({ slots });
    return save.ok ? Response.json({ ok: true }) : Response.json({ error: save.error }, { status: 409 });
  }) as typeof fetch;
}

const meta = {
  title: "Halaman publik/Ubah jadwal",
  component: RescheduleForm,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  globals: { viewport: { value: "hp", isRotated: false } },
  decorators: [
    (Story) => (
      <BookingPageShell theme={sampleTheme("HANGAT")}>
        <Story />
      </BookingPageShell>
    ),
  ],
  args: {
    token: sampleToken,
    username: "riasbysekar",
    serviceId: "svc-1",
    staffId: null,
    serviceName: "Makeup Wisuda",
    code: "BK-7F3A21",
    currentStart: "2026-11-21T03:00:00Z",
    earliestNewStart: "2026-11-19T03:00:00Z",
    left: 2,
    max: 2,
    paidAmount: 350000,
    strip,
  },
} satisfies Meta<typeof RescheduleForm>;

export default meta;
type Story = StoryObj<typeof meta>;

async function pilihJam(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole("radio", { name: new RegExp(`${Number(firstOpen.slice(8))}`) }));
  await userEvent.click(await canvas.findByLabelText("11:00"));
  return canvas;
}

export const MemuatSlot: Story = {
  beforeEach: () => { globalThis.fetch = fakeFetch({ ok: true }); },
  play: async ({ canvasElement }) => { await pilihJam(canvasElement); },
};

export const KesempatanTerakhir: Story = {
  args: { left: 1, max: 1 },
  beforeEach: () => { globalThis.fetch = fakeFetch({ ok: true }); },
};

export const GagalBentrok: Story = {
  beforeEach: () => { globalThis.fetch = fakeFetch({ ok: false, error: "Jam itu baru saja terisi. Pilih jam lain." }); },
  play: async ({ canvasElement }) => {
    const canvas = await pilihJam(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Simpan jadwal baru" }));
    await expect(await canvas.findByRole("alert")).toBeInTheDocument();
  },
};

export const Sukses: Story = {
  beforeEach: () => { globalThis.fetch = fakeFetch({ ok: true }); },
  play: async ({ canvasElement }) => {
    const canvas = await pilihJam(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Simpan jadwal baru" }));
    await expect(await canvas.findByRole("status")).toBeInTheDocument();
  },
};

export const TanpaPembayaranOnline: Story = { args: { paidAmount: null } };
