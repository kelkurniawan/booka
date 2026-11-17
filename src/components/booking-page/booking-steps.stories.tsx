import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type ReactNode } from "react";

import { buildDateStrip } from "@/lib/booking/schedule";
import type { ResolvedTheme } from "@/lib/theme/types";

import { BookingSummary } from "./booking-summary";
import { DateStrip } from "./date-strip";
import { fixtureTablePicker, sampleSeatSlots, sampleServices, sampleSlots, sampleTheme } from "./fixtures";
import { GuestStepper } from "./guest-stepper";
import { ReservationCard } from "./reservation-card";
import { TablePicker, type TablePickerMode } from "./table-picker";
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
            paymentLabel="Bayar saat booking"
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

export const RingkasanDpSisaDiTempat: Story = {
  render: () => (
    <Bingkai>
      <BookingSummary
        rows={[
          { label: "Layanan", value: "Makeup Wisuda" },
          { label: "Jadwal", value: "Jumat, 20 November 2026, 09:30" },
          { label: "Harga layanan", value: "Rp 105.000" },
        ]}
        total="Rp 50.000"
        onSite="Rp 55.000"
      />
    </Bingkai>
  ),
};

export const RingkasanBayarDiTempat: Story = {
  render: () => (
    <Bingkai theme={sampleTheme("MALAM")}>
      <BookingSummary
        rows={[
          { label: "Layanan", value: "Makeup Wisuda" },
          { label: "Harga layanan", value: "Rp 105.000" },
        ]}
        total="Rp 0"
        onSite="Rp 105.000"
      />
    </Bingkai>
  ),
};

export const IndikatorReservasi: Story = {
  render: () => (
    <Bingkai>
      <BookingStepIndicator current={2} labels={["Jadwal", "Meja", "Data diri"]} />
    </Bingkai>
  ),
};

export const JamDenganSisaMeja: Story = {
  render: () => <Jam state={{ kind: "ready", slots: sampleSeatSlots }} awal={sampleSeatSlots[6].startUtc} />,
};

function Tamu({ awal, min, max, theme }: { awal: number; min: number; max: number; theme?: ResolvedTheme }) {
  const [n, setN] = useState(awal);
  return (
    <Bingkai theme={theme}>
      <GuestStepper value={n} min={min} max={max} onChange={setN} hint="Untuk 1 sampai 12 orang." />
    </Bingkai>
  );
}

export const TamuDiBatasMin: Story = { render: () => <Tamu awal={1} min={1} max={12} /> };
export const TamuDiTengah: Story = { render: () => <Tamu awal={4} min={1} max={12} theme={sampleTheme("MALAM")} /> };
export const TamuDiBatasMax: Story = { render: () => <Tamu awal={12} min={1} max={12} /> };

export const KartuReservasi: Story = {
  render: () => (
    <Bingkai>
      <ReservationCard
        title="Reservasi meja"
        partyLabel="Untuk 1 sampai 12 orang"
        holdText="Meja ditahan 15 menit dari jam datang."
        paymentLabel="Bayar DP saat booking"
        onStart={() => {}}
      />
    </Bingkai>
  ),
};

export const KartuReservasiTanpaTahan: Story = {
  render: () => (
    <Bingkai theme={sampleTheme("BERANI")}>
      <ReservationCard
        title="Reservasi meja"
        partyLabel={null}
        holdText={null}
        paymentLabel="Bayar di tempat"
        onStart={() => {}}
      />
    </Bingkai>
  ),
};

function Meja({
  data = fixtureTablePicker,
  state = "ready",
  awalMode = "pick",
  awalMeja = "d5",
  theme,
}: {
  data?: typeof fixtureTablePicker | null;
  state?: "loading" | "ready" | "error";
  awalMode?: TablePickerMode;
  awalMeja?: string | null;
  theme?: ResolvedTheme;
}) {
  const [mode, setMode] = useState<TablePickerMode>(awalMode);
  const [meja, setMeja] = useState<string | null>(awalMeja);
  return (
    <Bingkai theme={theme}>
      <TablePicker
        data={data}
        state={state}
        mode={mode}
        selectedTableId={meja}
        guests={4}
        onModeChange={setMode}
        onSelect={setMeja}
        onRetry={() => {}}
      />
    </Bingkai>
  );
}

export const MejaOtomatis: Story = { render: () => <Meja awalMode="auto" awalMeja={null} /> };
export const MejaDenah: Story = { render: () => <Meja /> };
export const MejaDenahMalam: Story = { render: () => <Meja theme={sampleTheme("MALAM")} /> };
export const MejaDenahBerani: Story = { render: () => <Meja theme={sampleTheme("BERANI")} /> };
export const MejaSatuArea: Story = {
  render: () => (
    <Meja
      data={{
        areas: [fixtureTablePicker.areas[0]],
        tables: fixtureTablePicker.tables.filter((t) => t.areaId === "area-dalam"),
      }}
    />
  ),
};
export const MejaMemuat: Story = { render: () => <Meja data={null} state="loading" awalMeja={null} /> };
export const MejaGagal: Story = { render: () => <Meja data={null} state="error" awalMeja={null} /> };
export const MejaKosong: Story = {
  render: () => <Meja data={{ areas: [], tables: [] }} awalMeja={null} />,
};
