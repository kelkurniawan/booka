import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { ResolvedTheme } from "@/lib/theme/types";
import type { BackgroundMotion, MotionSpeed } from "@/types/database";

import { sampleTheme } from "./fixtures";
import { MotionBackground } from "./motion-background";
import { BookingPageShell } from "./page-shell";

const meta = {
  title: "Halaman publik/Latar bergerak",
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "hp", isRotated: false } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Bingkai({
  theme,
  motion,
  speed = "SLOW",
  forceStatic,
}: {
  theme?: ResolvedTheme;
  motion: BackgroundMotion;
  speed?: MotionSpeed;
  forceStatic?: boolean;
}) {
  const t =
    theme ??
    sampleTheme("HANGAT", {
      background_style: "MOTION",
      background_motion: motion,
      background_motion_speed: speed,
    });
  return (
    <BookingPageShell theme={t}>
      <div className="relative h-64">
        <MotionBackground preset={motion} speed={speed} forceStatic={forceStatic} />
      </div>
    </BookingPageShell>
  );
}

export const Bentuk: Story = { render: () => <Bingkai motion="BENTUK" /> };
export const Gelombang: Story = { render: () => <Bingkai motion="GELOMBANG" /> };
export const Aurora: Story = { render: () => <Bingkai motion="AURORA" /> };
export const Partikel: Story = { render: () => <Bingkai motion="PARTIKEL" /> };
export const Malam: Story = {
  render: () => (
    <Bingkai
      motion="BENTUK"
      theme={sampleTheme("MALAM", { background_style: "MOTION", background_motion: "BENTUK" })}
    />
  ),
};
export const Normal: Story = { render: () => <Bingkai motion="BENTUK" speed="NORMAL" /> };
export const ReducedMotion: Story = { render: () => <Bingkai motion="BENTUK" forceStatic /> };
