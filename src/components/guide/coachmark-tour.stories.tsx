import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Button } from "@/components/ui/button";
import { GUIDE_PAGES } from "@/lib/guide/content";
import { tourStepsFor, type TourStep } from "@/lib/guide/guide";

import { CoachmarkTour, findTourTarget } from "./coachmark-tour";

const meta = {
  title: "Panduan/Tur",
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo({
  viewport,
  without,
  steps: custom,
}: {
  viewport: "desktop" | "mobile";
  without?: string;
  steps?: TourStep[];
}) {
  const [open, setOpen] = React.useState(false);
  const [steps, setSteps] = React.useState<TourStep[]>([]);
  const start = () => {
    setSteps(
      custom ??
        tourStepsFor(GUIDE_PAGES.today.tour, viewport, (t) => findTourTarget(t) !== null),
    );
    setOpen(true);
  };
  const show = (name: string) => (name === without ? undefined : name);
  return (
    <div className="flex min-h-screen flex-col gap-4 p-6">
      <nav className="flex gap-3">
        <a href="#" data-tour={show("nav-today")} className="inline-flex min-h-11 items-center rounded-md border px-3">
          Hari ini
        </a>
        <a href="#" data-tour={show("nav-bookings")} className="inline-flex min-h-11 items-center rounded-md border px-3">
          Booking
        </a>
      </nav>
      <Button data-tour={show("page-guide")} className="min-h-11 w-fit" onClick={start}>
        Panduan halaman ini
      </Button>
      <CoachmarkTour steps={steps} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

export const Desktop: Story = { render: () => <Demo viewport="desktop" /> };
export const HP: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => <Demo viewport="mobile" />,
};
export const TargetHilang: Story = { render: () => <Demo viewport="desktop" without="nav-bookings" /> };
export const TanpaTarget: Story = {
  render: () => (
    <Demo
      viewport="desktop"
      steps={[
        { target: null, title: "Selamat datang", body: "Langkah tanpa target tampil di tengah." },
        { target: "nav-today", title: "Hari ini", body: "Langkah dengan target." },
      ]}
    />
  ),
};
