import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ActionList } from "./action-list";
import { Agenda } from "./agenda";
import { ACTION_ITEMS, AGENDA_ROWS, NOW_MS, WEEK_SUMMARY } from "./fixtures";
import { OnSiteCard, WeekSummary } from "./side-cards";

const ok = async () => ({ ok: true });

const meta = {
  title: "Dashboard/Hari ini",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const TindakanBerisi: Story = {
  render: () => <ActionList items={ACTION_ITEMS} total={3} pastUnmarked={0} nowMs={NOW_MS} onDecide={ok} />,
};
export const TindakanKosong: Story = {
  render: () => <ActionList items={[]} total={0} pastUnmarked={0} nowMs={NOW_MS} onDecide={ok} />,
};
export const TindakanBelumDitandai: Story = {
  render: () => <ActionList items={ACTION_ITEMS} total={7} pastUnmarked={4} nowMs={NOW_MS} onDecide={ok} />,
};
export const AgendaGarisSekarang: Story = {
  render: () => <Agenda rows={AGENDA_ROWS} nowMs={NOW_MS} onAttend={ok} />,
};
export const AgendaKosong: Story = {
  render: () => <Agenda rows={[]} nowMs={NOW_MS} onAttend={ok} />,
};
export const DiTempatNol: Story = {
  render: () => <OnSiteCard totals={{ count: 0, total: 0, paid: 0 }} />,
};
export const DiTempatBerisi: Story = {
  render: () => <OnSiteCard totals={{ count: 3, total: 270000, paid: 70000 }} />,
};
export const TujuhHari: Story = {
  render: () => <WeekSummary summary={WEEK_SUMMARY} />,
};
