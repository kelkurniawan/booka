import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { SidebarProvider } from "@/components/ui/sidebar";

import { MobileNav } from "./mobile-nav";

const meta = {
  title: "Dashboard/Nav bawah HP",
  component: MobileNav,
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "hp", isRotated: false } },
  decorators: [
    (Story) => (
      <SidebarProvider>
        <div className="h-[600px]">
          <Story />
        </div>
      </SidebarProvider>
    ),
  ],
} satisfies Meta<typeof MobileNav>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HariIni: Story = {
  args: { actionCount: 3 },
  parameters: { nextjs: { navigation: { pathname: "/dashboard" } } },
};

export const Booking: Story = {
  args: { actionCount: 3 },
  parameters: { nextjs: { navigation: { pathname: "/dashboard/bookings" } } },
};
