import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import {
  sampleFaqs,
  sampleMerchant,
  sampleServices,
  sampleTheme,
} from "@/components/booking-page/fixtures";

import { BookingPageView } from "./booking-page-view";

const meta = {
  title: "Halaman publik/BookingPageView",
  component: BookingPageView,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true },
  },
  globals: { viewport: { value: "hp", isRotated: false } },
  args: {
    merchant: sampleMerchant,
    theme: sampleTheme("HANGAT"),
    services: sampleServices,
    mediaByService: {},
    // Senin sampai Sabtu buka.
    availability: [1, 2, 3, 4, 5, 6].map((day_of_week) => ({
      day_of_week: day_of_week as 1 | 2 | 3 | 4 | 5 | 6,
    })),
    staff: [],
    faqs: sampleFaqs,
  },
} satisfies Meta<typeof BookingPageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Hangat: Story = {};

export const Malam: Story = { args: { theme: sampleTheme("MALAM") } };

export const Berani: Story = { args: { theme: sampleTheme("BERANI") } };

export const TanpaLayanan: Story = { args: { services: [] } };

export const TanpaFaq: Story = { args: { faqs: [] } };

const win = (day_of_week: 1 | 2 | 5) => ({ day_of_week, start_time: "09:00", end_time: "17:00" });

export const SatuLayanan: Story = { args: { services: sampleServices.slice(0, 1) } };

export const DenganStaf: Story = {
  args: {
    staff: [
      { id: "s1", name: "Sekar", availability: [win(1), win(2)] },
      { id: "s2", name: "Dewi", availability: [win(5)] },
    ],
  },
};
