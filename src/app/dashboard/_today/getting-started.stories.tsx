import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { GuideProvider } from "@/components/guide/guide-provider";
import { GUIDE_PAGE_KEYS } from "@/lib/guide/guide";

import {
  CHECKLIST_BARU,
  CHECKLIST_HAMPIR,
  CHECKLIST_SELESAI,
} from "./fixtures";
import { GettingStarted } from "./getting-started";

const ok = async () => ({ ok: true });
const gagal = async () => ({
  ok: false,
  message: "Gagal menyimpan. Coba lagi.",
});

const meta = {
  title: "Dashboard/Hari ini/Panduan memulai",
  parameters: { layout: "padded", nextjs: { appDirectory: true } },
  // Semua halaman sudah dilihat supaya tur tidak mulai sendiri.
  decorators: [
    (Story) => (
      <GuideProvider
        toursSeen={[...GUIDE_PAGE_KEYS]}
        checklistDismissed={false}
      >
        <Story />
      </GuideProvider>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const base = { pagePath: "/contoh", onMarkStep: ok, onDismiss: ok };

export const Baru: Story = {
  render: () => <GettingStarted {...base} items={CHECKLIST_BARU} />,
};
export const HampirSelesai: Story = {
  render: () => <GettingStarted {...base} items={CHECKLIST_HAMPIR} />,
};
export const Selesai: Story = {
  render: () => <GettingStarted {...base} items={CHECKLIST_SELESAI} />,
};
export const HP: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => <GettingStarted {...base} items={CHECKLIST_BARU} />,
};
export const GagalSimpan: Story = {
  render: () => (
    <GettingStarted
      {...base}
      items={CHECKLIST_BARU}
      onMarkStep={gagal}
      onDismiss={gagal}
    />
  ),
};
