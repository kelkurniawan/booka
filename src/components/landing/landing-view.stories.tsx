import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { contactLinks } from "@/lib/marketing/contact";

import { LandingView } from "./landing-view";
import { withMarketing } from "./story-decorator";

const meta = {
  title: "Landing/Halaman depan",
  component: LandingView,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  decorators: [withMarketing],
  args: { host: "marky.id", contact: [] },
} satisfies Meta<typeof LandingView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  render: (args) => <div style={{ width: 1280 }}><LandingView {...args} /></div>,
};

export const HP: Story = {
  render: (args) => <div style={{ width: 390 }}><LandingView {...args} /></div>,
  globals: { viewport: { value: "hp", isRotated: false } },
};

/** NEXT_PUBLIC_APP_URL=https://booking.marky.id: tombol hero, kolom klaim, dan kartu contoh harus membungkus tanpa gulir horizontal. */
export const HostPanjang: Story = {
  args: { host: "booking.marky.id" },
  render: (args) => <div style={{ width: 390 }}><LandingView {...args} /></div>,
  globals: { viewport: { value: "hp", isRotated: false } },
};

export const KontakTerisi: Story = {
  args: {
    contact: contactLinks({
      whatsapp: "6281234567890",
      email: "halo@contoh.id",
      instagram: "akun",
      threads: "akun",
      x: "akun",
      tiktok: "akun",
      discord: "https://discord.gg/abc123",
    }),
  },
  render: (args) => <div style={{ width: 1280 }}><LandingView {...args} /></div>,
};
