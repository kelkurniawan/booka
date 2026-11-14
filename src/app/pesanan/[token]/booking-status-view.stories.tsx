import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { sampleBooking, sampleMerchant, sampleTheme } from "@/components/booking-page/fixtures";

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
