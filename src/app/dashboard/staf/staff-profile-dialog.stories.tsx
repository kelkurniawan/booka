import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { sampleTheme } from "@/components/booking-page/fixtures";
import { themeToCssVars } from "@/lib/theme/css";

import { StaffProfileDialog, type StaffProfileRow } from "./staff-profile-dialog";

const ok = async () => ({ ok: true as const });

const KOSONG: StaffProfileRow = {
  id: "s1",
  name: "Sekar",
  role: null,
  bio: null,
  tags: [],
  photo_path: null,
  motion_path: null,
  show_motion: true,
};

const meta = {
  title: "Dashboard/Profil staf",
  component: StaffProfileDialog,
  parameters: { layout: "fullscreen" },
  args: {
    merchantId: "m1",
    member: KOSONG,
    themeStyle: themeToCssVars(sampleTheme("HANGAT")),
    saveProfile: ok,
    removeClip: ok,
    onClose: () => {},
  },
} satisfies Meta<typeof StaffProfileDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Kosong: Story = {};

export const Lengkap: Story = {
  args: {
    member: {
      ...KOSONG,
      role: "Penata rias",
      bio: "Sepuluh tahun merias pengantin dan acara keluarga.",
      tags: ["Pengantin", "Natural", "Hijab"],
      photo_path: "m1/staff/s1/photo-contoh.webp",
      motion_path: "m1/staff/s1/clip-contoh.mp4",
    },
  },
};

export const MemprosesKlip: Story = { args: { initialClip: { busy: true } } };

export const GagalKlip: Story = {
  args: { initialClip: { error: "Durasi klip maksimal 5 detik." } },
};
