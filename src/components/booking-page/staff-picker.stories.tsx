import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type ReactNode } from "react";

import type { ResolvedTheme } from "@/lib/theme/types";

import { sampleStaff, sampleStaffProfile, sampleTheme } from "./fixtures";
import { BookingPageShell } from "./page-shell";
import { StaffPicker, type NearestState, type StaffOption } from "./staff-picker";

const meta = {
  title: "Halaman publik/Pilihan staf",
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "hp", isRotated: false } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const TODAY = "2026-11-16";
const slot = (dateISO: string, label: string) => ({ dateISO, label, startUtc: "", endUtc: "" });
const nearestIsi: NearestState = {
  any: slot(TODAY, "14:00"),
  s1: slot(TODAY, "14:00"),
  s2: slot("2026-11-17", "09:00"),
  s3: null,
};

function Demo({
  staff = sampleStaff,
  nearest = nearestIsi,
  theme = sampleTheme("HANGAT"),
  forceStatic,
  initial = null,
}: {
  staff?: StaffOption[];
  nearest?: NearestState;
  theme?: ResolvedTheme;
  forceStatic?: boolean;
  initial?: string | null;
}): ReactNode {
  const [selected, setSelected] = useState<string | null>(initial);
  return (
    <BookingPageShell theme={theme}>
      <StaffPicker
        staff={staff}
        selectedId={selected}
        onSelect={setSelected}
        nearest={nearest}
        todayISO={TODAY}
        forceStatic={forceStatic}
      />
    </BookingPageShell>
  );
}

export const Default: Story = { render: () => <Demo /> };
export const TanpaFoto: Story = { render: () => <Demo staff={sampleStaff.map((s) => ({ ...s, photoUrl: null }))} /> };
export const Memuat: Story = { render: () => <Demo nearest="loading" /> };
export const Gagal: Story = { render: () => <Demo nearest="error" /> };
export const DenganProfil: Story = {
  render: () => <Demo staff={[sampleStaffProfile, ...sampleStaff.slice(1)]} initial="s1" />,
};
export const ReducedMotion: Story = {
  render: () => <Demo staff={[sampleStaffProfile, ...sampleStaff.slice(1)]} initial="s1" forceStatic />,
};
export const Malam: Story = {
  render: () => <Demo theme={sampleTheme("MALAM")} staff={[sampleStaffProfile, ...sampleStaff.slice(1)]} initial="s1" />,
};
