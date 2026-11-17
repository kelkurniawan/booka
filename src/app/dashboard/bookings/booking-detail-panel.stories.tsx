import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { AGENDA_ROWS, NOW_MS, REQUEST_ROW } from "../_today/fixtures";
import type { BookingListItem } from "./booking-state";
import { BookingDetailPanel, type BookingDetailActions } from "./booking-detail-panel";
import { BookingDetailShell } from "./booking-detail-shell";

const ok = async () => ({ ok: true });
const actions: BookingDetailActions = { cancel: ok, decide: ok, markPaid: ok, attend: ok, reschedule: ok };

const NOTIFICATIONS = [
  { kind: "BOOKING_PAID_CUSTOMER" as const, channel: "WHATSAPP", status: "SENT", created_at: "2026-11-14T03:01:00Z" },
  { kind: "REMINDER_CUSTOMER" as const, channel: "WHATSAPP", status: "FAILED", created_at: "2026-11-14T10:00:00Z" },
];

// Jam sudah lewat 1 jam dari NOW_MS (10:30 WIB): semua aksi kehadiran tampil.
const ON_SITE_UNPAID: BookingListItem = {
  ...AGENDA_ROWS[3],
  id: "o-1",
  status: "CONFIRMED",
  payment_mode: "ON_SITE",
  amount_due_now: 0,
  amount_due_on_site: 100000,
  paid_at: null,
  start_datetime: "2026-11-15T02:30:00Z",
  end_datetime: "2026-11-15T03:30:00Z",
  customer_name: "Contoh Lani",
};
const PAID_DEPOSIT: BookingListItem = {
  ...AGENDA_ROWS[3],
  id: "p-1",
  customer_name: "Contoh Maya",
  start_datetime: "2026-11-17T03:00:00Z",
  end_datetime: "2026-11-17T04:00:00Z",
  merchant_reschedule_count: 1,
};
const CANCELLED: BookingListItem = {
  ...PAID_DEPOSIT,
  id: "c-1",
  status: "CANCELLED",
  cancelled_at: "2026-11-15T01:00:00Z",
  cancel_reason: "Dibatalkan oleh merchant",
};
const MANUAL: BookingListItem = { ...ON_SITE_UNPAID, id: "m-1", source: "MANUAL", start_datetime: "2026-11-18T03:00:00Z", end_datetime: "2026-11-18T04:00:00Z", customer_name: "Contoh Nina" };

function panel(booking: BookingListItem, notifications: typeof NOTIFICATIONS | null = NOTIFICATIONS) {
  return (
    <div style={{ width: 340 }}>
      <BookingDetailPanel booking={booking} nowMs={NOW_MS} username="demo" notifications={notifications} actions={actions} />
    </div>
  );
}

const meta = { title: "Dashboard/Booking/Panel detail", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const PermintaanBerbayar: Story = { render: () => panel(REQUEST_ROW, []) };
export const BayarDiTempatBelumLunas: Story = { render: () => panel(ON_SITE_UNPAID) };
export const DpDenganSisaLunas: Story = { render: () => panel(PAID_DEPOSIT) };
export const Dibatalkan: Story = { render: () => panel(CANCELLED) };
export const Manual: Story = { render: () => panel(MANUAL, []) };
export const RiwayatPesanGagal: Story = { render: () => panel(PAID_DEPOSIT, null) };
export const Hp390DiDalamSheet: Story = {
  globals: { viewport: { value: "hp", isRotated: false } },
  render: () => (
    <BookingDetailShell closeHref="/dashboard/bookings">
      <BookingDetailPanel booking={ON_SITE_UNPAID} nowMs={NOW_MS} username="demo" notifications={NOTIFICATIONS} actions={actions} />
    </BookingDetailShell>
  ),
};
