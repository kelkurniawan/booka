import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { sampleTheme, sampleToken } from "@/components/booking-page/fixtures";
import { BookingPageShell } from "@/components/booking-page/page-shell";

import { ReminderForm } from "./reminder-form";

const meta = {
  title: "Halaman publik/Atur pengingat",
  component: ReminderForm,
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
    vapidPublicKey: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
    serviceName: "Makeup Wisuda",
    startISO: "2026-11-21T03:00:00Z",
    phoneLast4: "7890",
    offered: { whatsapp: true, email: true, push: true },
    initial: { whatsapp: true, email: null, dayBefore: true, sameDay: false, push: false },
  },
} satisfies Meta<typeof ReminderForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SemuaKanal: Story = {};
export const TanpaPush: Story = { args: { vapidPublicKey: undefined } };
export const SemuaKanalMalam: Story = {
  decorators: [
    (Story) => (
      <BookingPageShell theme={sampleTheme("MALAM")}>
        <Story />
      </BookingPageShell>
    ),
  ],
};

/** Storybook berjalan di desktop; user agent iPhone meniru iOS yang belum dipasang ke Layar Utama. */
export const IphoneBelumDipasang: Story = {
  beforeEach: () => {
    const original = Object.getOwnPropertyDescriptor(Navigator.prototype, "userAgent");
    Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", configurable: true });
    const pushManager = Object.getOwnPropertyDescriptor(window, "PushManager");
    // @ts-expect-error simulasi iOS tanpa PushManager
    delete window.PushManager;
    return () => {
      delete (navigator as { userAgent?: string }).userAgent;
      if (original) Object.defineProperty(Navigator.prototype, "userAgent", original);
      if (pushManager) Object.defineProperty(window, "PushManager", pushManager);
    };
  },
};

export const EmailAlamatTidakValid: Story = {
  args: { initial: { whatsapp: true, email: "bukan-email", dayBefore: true, sameDay: false, push: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Simpan pengingat" }));
    await expect(await canvas.findByText("Alamat email tidak valid.")).toBeInTheDocument();
  },
};

export const GagalSimpan: Story = {
  beforeEach: () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      Response.json({ error: "Pengingat tidak tersedia untuk booking ini." }, { status: 409 })) as typeof fetch;
    return () => {
      globalThis.fetch = original;
    };
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Simpan pengingat" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Pengingat tidak tersedia untuk booking ini.");
  },
};
