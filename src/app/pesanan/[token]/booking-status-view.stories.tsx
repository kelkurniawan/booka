import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { sampleBooking, sampleMerchant, sampleTheme, sampleToken } from "@/components/booking-page/fixtures";

import { REQUEST_REJECT_REASON } from "@/lib/booking/payment-mode";

import { BookingStatusView } from "./booking-status-view";

// BookingLiveStatus memolling /api/bookings/[id]/status; di Storybook fetch itu
// gagal dan itu diterima.
const meta = {
  title: "Halaman publik/Booking Anda",
  component: BookingStatusView,
  // BookingLiveStatus memakai useRouter dari next/navigation.
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  globals: { viewport: { value: "hp", isRotated: false } },
  args: {
    token: sampleToken,
    booking: sampleBooking,
    merchantName: sampleMerchant.full_name ?? "Merchant",
    merchantUsername: sampleMerchant.username,
    theme: sampleTheme("HANGAT"),
    isExpiredPending: false,
  },
} satisfies Meta<typeof BookingStatusView>;

export default meta;
type Story = StoryObj<typeof meta>;

const menunggu = { ...sampleBooking, status: "PENDING" as const, paid_at: null };
const batal = {
  ...sampleBooking,
  status: "CANCELLED" as const,
  paid_at: null,
  cancelled_at: "2026-11-20T09:00:00Z",
};

export const Lunas: Story = {};
export const LunasMalam: Story = { args: { theme: sampleTheme("MALAM") } };
export const MenungguBayar: Story = { args: { booking: menunggu } };
export const MenungguBayarMalam: Story = {
  args: { booking: menunggu, theme: sampleTheme("MALAM") },
};
export const Kedaluwarsa: Story = { args: { booking: menunggu, isExpiredPending: true } };
export const KedaluwarsaMalam: Story = {
  args: { booking: menunggu, isExpiredPending: true, theme: sampleTheme("MALAM") },
};
export const Dibatalkan: Story = { args: { booking: batal } };
export const DibatalkanMalam: Story = { args: { booking: batal, theme: sampleTheme("MALAM") } };

const terkonfirmasi = {
  ...sampleBooking,
  status: "CONFIRMED" as const,
  paid_at: null,
  payment_mode: "ON_SITE" as const,
  amount_due_now: 0,
  amount_due_on_site: 105000,
};
const dpSisa = {
  ...sampleBooking,
  payment_mode: "DEPOSIT" as const,
  amount_due_now: 50000,
  amount_due_on_site: 55000,
};
const permintaan = {
  ...sampleBooking,
  status: "REQUESTED" as const,
  paid_at: null,
  payment_mode: "REQUEST" as const,
  amount_due_now: 50000,
  amount_due_on_site: 55000,
  expires_at: "2026-11-22T03:00:00Z",
};
const disetujui = { ...permintaan, status: "PENDING" as const, expires_at: "2026-11-22T08:00:00Z" };
const ditolak = {
  ...permintaan,
  status: "CANCELLED" as const,
  cancelled_at: "2026-11-20T09:00:00Z",
  cancel_reason: REQUEST_REJECT_REASON,
};

export const Terkonfirmasi: Story = { args: { booking: terkonfirmasi } };
export const TerkonfirmasiMalam: Story = {
  args: { booking: terkonfirmasi, theme: sampleTheme("MALAM") },
};
export const DpSisaDiTempat: Story = { args: { booking: dpSisa } };
export const DpSisaDiTempatMalam: Story = { args: { booking: dpSisa, theme: sampleTheme("MALAM") } };
export const MenungguPersetujuan: Story = { args: { booking: permintaan } };
export const MenungguPersetujuanMalam: Story = {
  args: { booking: permintaan, theme: sampleTheme("MALAM") },
};
export const Disetujui: Story = { args: { booking: disetujui } };
export const DisetujuiMalam: Story = { args: { booking: disetujui, theme: sampleTheme("MALAM") } };
export const Ditolak: Story = { args: { booking: ditolak } };
export const DitolakMalam: Story = { args: { booking: ditolak, theme: sampleTheme("MALAM") } };
