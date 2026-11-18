import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { sampleTheme } from "@/components/booking-page/fixtures";
import type { PageSection } from "@/lib/theme/sections";
import type { BackgroundMotion, ButtonStyle, MotionSpeed } from "@/types/database";

import { BrandFields } from "./brand-fields";
import { ButtonStyleField } from "./button-style-field";
import { MotionFields } from "./motion-fields";
import { SectionOrderField } from "./section-order-field";

const meta = {
  title: "Dashboard/Editor tampilan",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const noop = () => {};
const gambar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'><rect width='120' height='40' fill='%23999'/></svg>";

export const MerekKosong: Story = {
  render: () => (
    <BrandFields logoUrl={null} coverUrl={null} busy={null} coverLocked={false} onUpload={noop} onRemove={noop} />
  ),
};
export const MerekTerisi: Story = {
  render: () => (
    <BrandFields logoUrl={gambar} coverUrl={gambar} busy={null} coverLocked={false} onUpload={noop} onRemove={noop} />
  ),
};
export const MerekMengunggah: Story = {
  render: () => (
    <BrandFields logoUrl={null} coverUrl={null} busy="cover" coverLocked={false} onUpload={noop} onRemove={noop} />
  ),
};
export const SampulTerkunci: Story = {
  render: () => (
    <BrandFields logoUrl={gambar} coverUrl={gambar} busy={null} coverLocked onUpload={noop} onRemove={noop} />
  ),
};

function GayaTombol({ awal, aksen }: { awal: ButtonStyle; aksen?: string }) {
  const [nilai, setNilai] = useState<ButtonStyle>(awal);
  const theme = sampleTheme("HANGAT", { accent: aksen ?? null, button_style: nilai });
  return <ButtonStyleField value={nilai} locked={false} theme={theme} onChange={setNilai} />;
}
export const GayaPenuh: Story = { render: () => <GayaTombol awal="FILLED" /> };
export const GayaGaris: Story = { render: () => <GayaTombol awal="OUTLINE" /> };
export const GayaLembut: Story = { render: () => <GayaTombol awal="SOFT" /> };
export const AksenPucatDisesuaikan: Story = {
  render: () => <GayaTombol awal="OUTLINE" aksen="#ffe600" />,
};

export const Gerak: Story = {
  render: function Render() {
    const [m, setM] = useState<BackgroundMotion>("BENTUK");
    const [s, setS] = useState<MotionSpeed>("SLOW");
    return <MotionFields motion={m} speed={s} onMotionChange={setM} onSpeedChange={setS} />;
  },
};

const HINTS: Record<PageSection, string> = {
  LINKS: "3 tautan",
  PROMO: "2 banner tayang",
  SERVICES: "Selalu tampil",
  FAQ: "3 pertanyaan",
};
function Susunan({ awal, tersembunyi = [] }: { awal: PageSection[]; tersembunyi?: PageSection[] }) {
  const [s, setS] = useState({ order: awal, hidden: tersembunyi });
  return <SectionOrderField order={s.order} hidden={s.hidden} hints={HINTS} onChange={setS} />;
}
export const SusunanBawaan: Story = { render: () => <Susunan awal={["PROMO", "SERVICES", "FAQ"]} /> };
export const FaqDiAtas: Story = { render: () => <Susunan awal={["FAQ", "PROMO", "SERVICES"]} /> };
export const PromoDisembunyikan: Story = {
  render: () => <Susunan awal={["PROMO", "SERVICES", "FAQ"]} tersembunyi={["PROMO"]} />,
};
