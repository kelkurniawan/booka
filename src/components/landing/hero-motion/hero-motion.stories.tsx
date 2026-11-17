import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { withMarketing } from "../story-decorator";
import { HeroMotion } from "./hero-motion";

const meta = {
  title: "Landing/HeroMotion",
  component: HeroMotion,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  decorators: [withMarketing],
} satisfies Meta<typeof HeroMotion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Lebar: Story = {
  args: { layout: "wide", paused: false },
  render: (args) => <div style={{ width: 1280 }}><HeroMotion {...args} /></div>,
};

export const Ringkas: Story = {
  args: { layout: "compact", paused: false },
  render: (args) => <div style={{ width: 390 }}><HeroMotion {...args} /></div>,
};

export const Dijeda: Story = {
  args: { layout: "compact", paused: true },
  render: (args) => <div style={{ width: 390 }}><HeroMotion {...args} /></div>,
};
