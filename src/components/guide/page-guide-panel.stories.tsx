import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { PageGuidePanel } from "./page-guide-panel";

const ok = async () => ({ ok: true });

const meta = {
  title: "Panduan/Panel",
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const base = {
  open: true,
  onOpenChange: () => {},
  onStartTour: () => {},
  checklistDismissed: false,
  onRestoreChecklist: ok,
};

export const Layanan: Story = { render: () => <PageGuidePanel {...base} page="services" /> };
export const StafDenganCatatanPaket: Story = {
  render: () => <PageGuidePanel {...base} page="staff" />,
};
export const HariIniChecklistDisembunyikan: Story = {
  render: () => <PageGuidePanel {...base} page="today" checklistDismissed />,
};
