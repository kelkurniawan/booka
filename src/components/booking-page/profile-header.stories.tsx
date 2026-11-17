import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { BackgroundMotion } from "@/types/database";

import { sampleTheme } from "./fixtures";
import { BookingPageShell } from "./page-shell";
import { BookingProfileHeader } from "./profile-header";

const meta = {
  title: "Halaman publik/Kepala profil",
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "hp", isRotated: false } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Kepala({ preset = "HANGAT", ubah = {} }: { preset?: "HANGAT" | "MALAM"; ubah?: Parameters<typeof sampleTheme>[1] }) {
  const theme = sampleTheme(preset, ubah);
  return (
    <BookingPageShell theme={theme}>
      <BookingProfileHeader name="Salon Rina" bio="Rias dan perawatan." avatarUrl={null} theme={theme} />
    </BookingPageShell>
  );
}

export const Polos: Story = { render: () => <Kepala /> };
// publicMediaUrl menerima path bucket; story memakai path palsu, jadi gambar
// tampil sebagai kotak rusak kecuali Supabase tersedia. Dipakai untuk memeriksa tata letak.
export const DenganLogo: Story = { render: () => <Kepala ubah={{ logo_path: "contoh/logo.webp" }} /> };
export const DenganSampul: Story = { render: () => <Kepala ubah={{ cover_path: "contoh/sampul.webp" }} /> };
export const LogoDanSampul: Story = {
  render: () => <Kepala ubah={{ logo_path: "contoh/logo.webp", cover_path: "contoh/sampul.webp" }} />,
};

const POLA: BackgroundMotion[] = ["BENTUK", "GELOMBANG", "AURORA", "PARTIKEL"];
const gerak = (m: BackgroundMotion) => ({
  background_style: "MOTION" as const,
  background_motion: m,
  cover_path: "contoh/sampul.webp",
});

export const GerakBentuk: Story = { render: () => <Kepala ubah={gerak(POLA[0])} /> };
export const GerakGelombang: Story = { render: () => <Kepala ubah={gerak(POLA[1])} /> };
export const GerakAurora: Story = { render: () => <Kepala ubah={gerak(POLA[2])} /> };
export const GerakPartikel: Story = { render: () => <Kepala ubah={gerak(POLA[3])} /> };
export const GerakMalam: Story = { render: () => <Kepala preset="MALAM" ubah={gerak("BENTUK")} /> };
