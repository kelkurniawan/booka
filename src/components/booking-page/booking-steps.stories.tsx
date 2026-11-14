import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type ReactNode } from "react";

import { buildDateStrip } from "@/lib/booking/schedule";
import type { ResolvedTheme } from "@/lib/theme/types";

import { BookingSummary } from "./booking-summary";
import { DateStrip } from "./date-strip";
import { sampleServices, sampleSlots, sampleTheme } from "./fixtures";
import { BookingPageShell } from "./page-shell";
import { ServiceOptionCard } from "./service-option-card";
import { BookingStepIndicator } from "./step-indicator";
import { StickyActionBar } from "./sticky-action-bar";
import { TimeSlotPicker, type TimeSlotState } from "./time-slot-picker";

const meta = {
  title: "Halaman publik/Langkah booking",
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "hp", isRotated: false } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Bingkai({ theme = sampleTheme("HANGAT"), children }: { theme?: ResolvedTheme; children: ReactNode }) {
  return <BookingPageShell theme={theme}>{children}</BookingPageShell>;
}

export const Indikator: Story = {
  render: () => (
    <Bingkai>
      <BookingStepIndicator current={2} />
    </Bingkai>
  ),
};

function KartuLayanan({ theme, awal }: { theme?: ResolvedTheme; awal: string | null }) {
  const [dipilih, setDipilih] = useState(awal);
  return (
    <Bingkai theme={theme}>
      <div className="flex flex-col gap-3">
        {sampleServices.map((s) => (
          <ServiceOptionCard
            key={s.id}
            service={s}
            checked={dipilih === s.id}
            onSelect={() => setDipilih(s.id)}
            paymentLabel="DP 30% dibayar saat memesan"
          />
        ))}
      </div>
    </Bingkai>
  );
}

export const KartuLayananHangat: Story = {
  render: () => <KartuLayanan awal={sampleServices[0].id} />,
};

export const KartuLayananTerpilihMalam: Story = {
  render: () => <KartuLayanan theme={sampleTheme("MALAM")} awal={sampleServices[1].id} />,
};

export const BilahAksi: Story = {
  render: () => (
    <Bingkai>
      <div className="flex-1" />
      <StickyActionBar summary="Makeup Wisuda, Rp 105.000" actionLabel="Lanjut" />
    </Bingkai>
  ),
};

const hari = buildDateStrip(new Set([1, 2, 3, 4, 5, 6]), "2026-11-16");

function Tanggal() {
  const [dipilih, setDipilih] = useState<string | null>("2026-11-18");
  return (
    <Bingkai>
      <DateStrip days={hari} selected={dipilih} onSelect={setDipilih} />
    </Bingkai>
  );
}

export const StripTanggal: Story = { render: () => <Tanggal /> };

function Jam({ state, awal = null }: { state: TimeSlotState; awal?: string | null }) {
  const [dipilih, setDipilih] = useState<string | null>(awal);
  return (
    <Bingkai>
      <TimeSlotPicker
        state={state}
        selected={dipilih}
        onSelect={(s) => setDipilih(s.startUtc)}
        onRetry={() => {}}
        onPickDate={() => {}}
      />
    </Bingkai>
  );
}

export const JamIdle: Story = { render: () => <Jam state={{ kind: "idle" }} /> };
export const JamMemuat: Story = { render: () => <Jam state={{ kind: "loading" }} /> };
export const JamGagal: Story = { render: () => <Jam state={{ kind: "error" }} /> };
export const JamPenuh: Story = {
  render: () => <Jam state={{ kind: "empty", nextDate: "2026-11-21" }} />,
};
export const JamTersedia: Story = {
  render: () => <Jam state={{ kind: "ready", slots: sampleSlots }} awal={sampleSlots[1].startUtc} />,
};

export const Ringkasan: Story = {
  render: () => (
    <Bingkai>
      <BookingSummary
        rows={[
          { label: "Layanan", value: "Makeup Wisuda" },
          { label: "Jadwal", value: "Jumat, 20 November 2026, 09:30" },
          { label: "Dengan", value: "Rias by Sekar" },
        ]}
        total="Rp 105.000"
      />
    </Bingkai>
  ),
};
