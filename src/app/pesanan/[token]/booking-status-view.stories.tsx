import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { sampleBooking, sampleMerchant, sampleTheme, sampleToken } from "@/components/booking-page/fixtures";

import { REQUEST_REJECT_REASON } from "@/lib/booking/payment-mode";

import { bookingCode, CUSTOMER_CANCEL_REASON, DEFAULT_MANAGE_SETTINGS, manageState, policyLines } from "@/lib/booking/customer-manage";

import { BookingStatusView, type BookingPageRow, type ReminderView } from "./booking-status-view";
import { PushPrompt } from "./push-prompt";
import { ContactSheet, type ContactData } from "./contact-sheet";

const NOW = Date.parse("2026-11-18T03:00:00Z");
const nama = sampleMerchant.full_name ?? "Merchant";
const base: BookingPageRow = {
  ...sampleBooking,
  service_id: null,
  staff_id: null,
  attended_at: null,
  no_show_at: null,
  reschedule_count: 0,
  party_size: null,
  table_label: null,
  customer_note: null,
  capacity_mode: "NONE" as const,
};
const aturan = {
  ...DEFAULT_MANAGE_SETTINGS,
  allow_customer_reschedule: true,
  allow_customer_cancel: true,
  policy_text: "DP tidak dikembalikan jika dibatalkan.",
};
const contact: ContactData = {
  whatsapp: { channel: "WHATSAPP", label: "WhatsApp", handle: "Paling cepat dibalas", href: "https://wa.me/6281234567890" },
  others: [
    { channel: "PHONE", label: "Telepon", handle: "+6281234567890", href: "tel:+6281234567890" },
    { channel: "EMAIL", label: "Email", handle: "halo@contoh.id", href: "mailto:halo@contoh.id" },
    { channel: "INSTAGRAM", label: "Instagram", handle: "@riasbysekar", href: "https://instagram.com/riasbysekar" },
  ],
  replyHours: "Jam balas pesan 09.00 sampai 20.00 WIB",
};
const reminders: ReminderView = {
  whatsapp: true,
  email: false,
  push: false,
  channelsOffered: { whatsapp: true, email: true, push: true },
  offsets: { dayBefore: true, sameDay: true },
};
/** Argumen yang diturunkan dari booking dan aturan, seperti page.tsx. */
function kelola(b: BookingPageRow, settings = aturan) {
  return {
    booking: b,
    code: bookingCode(b.id),
    manage: manageState(b, settings, NOW),
    policy: policyLines(b, settings, nama),
  };
}

// BookingLiveStatus memolling /api/bookings/[id]/status; di Storybook fetch itu
// gagal dan itu diterima.
const meta = {
  title: "Halaman publik/Booking Anda",
  component: BookingStatusView,
  // BookingLiveStatus memakai useRouter dari next/navigation.
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  globals: { viewport: { value: "hp", isRotated: false } },
  args: {
    token: sampleToken,
    merchantName: sampleMerchant.full_name ?? "Merchant",
    merchantUsername: sampleMerchant.username,
    theme: sampleTheme("HANGAT"),
    isExpiredPending: false,
    ...kelola(base),
    contact,
    reminders,
  },
} satisfies Meta<typeof BookingStatusView>;

export default meta;
type Story = StoryObj<typeof meta>;

const menunggu = { ...base, status: "PENDING" as const, paid_at: null };
const batal = {
  ...base,
  status: "CANCELLED" as const,
  paid_at: null,
  cancelled_at: "2026-11-20T09:00:00Z",
};

export const Lunas: Story = {};
export const LunasMalam: Story = { args: { theme: sampleTheme("MALAM") } };
export const MenungguBayar: Story = { args: { booking: menunggu } };
export const MenungguBayarMalam: Story = {
  args: { booking: menunggu, theme: sampleTheme("MALAM") },
};
export const Kedaluwarsa: Story = { args: { booking: menunggu, isExpiredPending: true } };
export const KedaluwarsaMalam: Story = {
  args: { booking: menunggu, isExpiredPending: true, theme: sampleTheme("MALAM") },
};
export const Dibatalkan: Story = { args: { booking: batal } };
export const DibatalkanMalam: Story = { args: { booking: batal, theme: sampleTheme("MALAM") } };

const terkonfirmasi = {
  ...base,
  status: "CONFIRMED" as const,
  paid_at: null,
  payment_mode: "ON_SITE" as const,
  amount_due_now: 0,
  amount_due_on_site: 105000,
};
const dpSisa = {
  ...base,
  payment_mode: "DEPOSIT" as const,
  amount_due_now: 50000,
  amount_due_on_site: 55000,
};
const permintaan = {
  ...base,
  status: "REQUESTED" as const,
  paid_at: null,
  payment_mode: "REQUEST" as const,
  amount_due_now: 50000,
  amount_due_on_site: 55000,
  expires_at: "2026-11-22T03:00:00Z",
};
const disetujui = { ...permintaan, status: "PENDING" as const, expires_at: "2026-11-22T08:00:00Z" };
const ditolak = {
  ...permintaan,
  status: "CANCELLED" as const,
  cancelled_at: "2026-11-20T09:00:00Z",
  cancel_reason: REQUEST_REJECT_REASON,
};

const reservasi = {
  ...terkonfirmasi,
  party_size: 4,
  table_label: "D5",
  customer_note: "Dekat jendela, ada kursi bayi.",
  capacity_mode: "TABLE" as const,
  service_name: "Reservasi meja",
};
export const ReservasiTerkonfirmasi: Story = { args: { booking: reservasi } };
export const ReservasiMenungguTanpaMeja: Story = {
  args: { booking: { ...permintaan, party_size: 6, capacity_mode: "AREA" as const, service_name: "Reservasi meja" } },
};

export const Terkonfirmasi: Story = { args: { booking: terkonfirmasi } };
export const TerkonfirmasiMalam: Story = {
  args: { booking: terkonfirmasi, theme: sampleTheme("MALAM") },
};
export const DpSisaDiTempat: Story = { args: { booking: dpSisa } };
export const DpSisaDiTempatMalam: Story = { args: { booking: dpSisa, theme: sampleTheme("MALAM") } };
export const MenungguPersetujuan: Story = { args: { booking: permintaan } };
export const MenungguPersetujuanMalam: Story = {
  args: { booking: permintaan, theme: sampleTheme("MALAM") },
};
export const Disetujui: Story = { args: { booking: disetujui } };
export const DisetujuiMalam: Story = { args: { booking: disetujui, theme: sampleTheme("MALAM") } };
export const Ditolak: Story = { args: { booking: ditolak } };
export const DitolakMalam: Story = { args: { booking: ditolak, theme: sampleTheme("MALAM") } };

export const TerkonfirmasiSemuaAksi: Story = {
  args: {
    ...kelola({ ...terkonfirmasi, start_datetime: "2026-11-21T03:00:00Z" }),
    reminders: { ...reminders, email: true },
  },
};
const lewatTenggat = { ...dpSisa, start_datetime: "2026-11-19T03:00:00Z", end_datetime: "2026-11-19T04:30:00Z" };
export const DpLewatTenggat: Story = { args: kelola(lewatTenggat) };
export const MenungguPersetujuanBisaBatal: Story = { args: kelola(permintaan) };
export const DibatalkanPelanggan: Story = {
  args: kelola({ ...batal, cancel_reason: CUSTOMER_CANCEL_REASON }),
};
export const PaketStarter: Story = { args: { reminders: null } };
export const TanpaKontak: Story = {
  args: { contact: { whatsapp: null, others: [], replyHours: null } },
};

const pesan = "Halo Rias by Sekar, saya Dewi. Soal booking BK-0000B1, Sabtu, 21 November 2026 pukul 10:00: ";
export const SheetHubungi: StoryObj<typeof ContactSheet> = {
  render: () => (
    <ContactSheet merchantName={nama} whatsappText={pesan} contact={contact} open onOpenChange={() => {}} />
  ),
};
export const SheetHubungiTanpaWhatsapp: StoryObj<typeof ContactSheet> = {
  render: () => (
    <ContactSheet
      merchantName={nama}
      whatsappText={pesan}
      contact={{ ...contact, whatsapp: null }}
      open
      onOpenChange={() => {}}
    />
  ),
};

export const AjakanNotifikasiHp: Story = {
  args: {
    pushPrompt: (
      <PushPrompt
        token={sampleToken}
        bookingId="b-1"
        vapidPublicKey="BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U"
        offsets={{ dayBefore: true, sameDay: true }}
      />
    ),
  },
};
