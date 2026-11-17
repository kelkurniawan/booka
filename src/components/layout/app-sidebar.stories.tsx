import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { SidebarProvider } from "@/components/ui/sidebar";

import { AppSidebar } from "./app-sidebar";

const merchant = {
  username: "kopi-senja",
  fullName: "Kopi Senja",
  email: "halo@kopisenja.id",
  avatarUrl: null,
  tier: "STARTER",
} as const;

const meta = {
  title: "Dashboard/Sidebar",
  component: AppSidebar,
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/dashboard/bookings" } },
  },
  decorators: [
    (Story) => (
      <SidebarProvider>
        <Story />
      </SidebarProvider>
    ),
  ],
  args: { merchant },
} satisfies Meta<typeof AppSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PerluTindakan: Story = { args: { actionCount: 3 } };
export const Nol: Story = { args: { actionCount: 0 } };
export const Gagal: Story = { args: { actionCount: null } };
