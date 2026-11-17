import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { DEFAULT_PAYMENT_SETTINGS } from "@/lib/booking/payment-mode";
import {
  sampleFaqs,
  sampleMerchant,
  sampleServices,
  sampleTheme,
} from "@/components/booking-page/fixtures";

import type { Service } from "@/types/database";

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
    paymentSettings: DEFAULT_PAYMENT_SETTINGS,
    restaurant: { tableMode: "NONE", holdMinutes: 15, areas: [] },
    banners: [],
    vouchers: [],
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

const staf = { role: null, bio: null, tags: [], photoPath: null, motionPath: null };

export const DenganStaf: Story = {
  args: {
    staff: [
      { ...staf, id: "s1", name: "Sekar", role: "Penata rias", availability: [win(1), win(2)] },
      { ...staf, id: "s2", name: "Dewi", role: null, availability: [win(5)] },
    ],
  },
};

const campuran: Service[] = [
  { ...sampleServices[0], payment_mode: "FULL" },
  { ...sampleServices[1], payment_mode: "DEPOSIT", deposit_type: "PERCENT", deposit_value: 30 },
  { ...sampleServices[2], payment_mode: "ON_SITE" },
  { ...sampleServices[0], id: "00000000-0000-4000-8000-0000000000a4", name: "Makeup Akad", payment_mode: "REQUEST", deposit_type: "FIXED", deposit_value: 200000 },
];

export const CaraBayarCampuran: Story = { args: { services: campuran } };

export const FaqDiAtas: Story = {
  args: { theme: sampleTheme("HANGAT", { section_order: ["FAQ", "SERVICES", "PROMO"] }) },
};

export const TanpaPromo: Story = {
  args: { theme: sampleTheme("HANGAT", { hidden_sections: ["PROMO"] }) },
};

export const TombolGaris: Story = {
  args: { theme: sampleTheme("HANGAT", { button_style: "OUTLINE" }) },
};

export const TombolLembut: Story = {
  args: { theme: sampleTheme("HANGAT", { button_style: "SOFT" }) },
};

export const LatarBergerak: Story = {
  args: { theme: sampleTheme("HANGAT", { background_style: "MOTION", background_motion: "AURORA" }) },
};

const layananRestoran: Service[] = [
  {
    ...sampleServices[0],
    id: "svc-reservasi",
    name: "Reservasi meja",
    price: 0,
    payment_mode: "ON_SITE",
    duration_minutes: 90,
    party_min: 1,
    party_max: 12,
    seat_duration_minutes: 90,
  },
  {
    ...sampleServices[0],
    id: "svc-ultah",
    name: "Paket Ulang Tahun",
    price: 1500000,
    party_min: 15,
    party_max: 25,
  },
];

export const RestoranDenahMeja: Story = {
  args: {
    services: layananRestoran,
    restaurant: {
      tableMode: "TABLE",
      holdMinutes: 15,
      areas: [
        { id: "a1", name: "Dalam" },
        { id: "a2", name: "Teras" },
      ],
    },
  },
};

export const RestoranTotalKursi: Story = {
  args: {
    services: layananRestoran,
    restaurant: { tableMode: "AREA", holdMinutes: 15, areas: [] },
  },
};
