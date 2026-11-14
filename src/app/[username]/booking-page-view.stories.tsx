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
