import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { MarkyLoader, MarkyLogo, MarkyMark } from "./marky-mark";

const meta = {
  title: "Brand/Logo Marky",
  component: MarkyLogo,
} satisfies Meta<typeof MarkyLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Simbol: Story = {
  render: () => (
    <div className="flex items-end gap-6">
      <MarkyMark className="size-4" />
      <MarkyMark className="size-8" />
      <MarkyMark className="size-16" title="Marky" />
    </div>
  ),
};

export const Logo: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <MarkyLogo className="text-lg" />
      <MarkyLogo className="text-3xl" />
      <MarkyLogo className="text-5xl" />
    </div>
  ),
};

export const LatarGelap: Story = {
  render: () => (
    <div className="flex items-center gap-6 rounded-xl bg-neutral-900 p-8 text-neutral-50">
      <MarkyMark className="size-8" />
      <MarkyLogo className="text-3xl" />
    </div>
  ),
};

export const Loader: Story = { render: () => <MarkyLoader /> };
export const LoaderBerlabel: Story = {
  render: () => <MarkyLoader label="Menyiapkan halaman booking Anda" />,
};
