import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { AGENDA_ROWS, NOW_MS, REQUEST_ROW, UNPAID_ROW } from "../_today/fixtures";
import type { BookingListItem } from "./booking-state";
import { BookingsTable } from "./bookings-table";

const meta = {
  title: "Dashboard/Booking/Tabel",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const TODAY = "2026-11-15";
const hrefFor = (id: string) => `/dashboard/bookings?b=${id}`;
const nextDay = (r: BookingListItem, i: number): BookingListItem => ({
  ...r,
  id: `n-${i}`,
  start_datetime: "2026-11-16T03:00:00Z",
  end_datetime: "2026-11-16T04:00:00Z",
});

export const AkanDatangDuaHari: Story = {
  render: () => (
    <BookingsTable
      rows={[...AGENDA_ROWS.slice(0, 2), ...AGENDA_ROWS.slice(0, 2).map(nextDay)]}
      nowMs={NOW_MS}
      todayISO={TODAY}
      selectedId={AGENDA_ROWS[1].id}
      hrefFor={hrefFor}
    />
  ),
};
export const PerluTindakan: Story = {
  render: () => (
    <BookingsTable rows={[REQUEST_ROW, UNPAID_ROW]} nowMs={NOW_MS} todayISO={TODAY} selectedId={null} hrefFor={hrefFor} />
  ),
};
export const Hp390: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
  decorators: [(Story) => <div style={{ width: 390 }}><Story /></div>],
  render: () => (
    <BookingsTable rows={AGENDA_ROWS.slice(0, 3)} nowMs={NOW_MS} todayISO={TODAY} selectedId={null} hrefFor={hrefFor} />
  ),
};
