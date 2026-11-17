import { LEGAL_IDENTITY, LEGAL_PLACEHOLDER_PATTERN } from "@/lib/legal";

/**
 * Kanal kontak pemasaran Marky (landing dan kaki halaman).
 *
 * Nilai berkurung siku adalah PENANDA yang wajib diganti sebelum rilis, sama
 * seperti `legal.ts`. Penanda tidak pernah dirender: kanal yang belum terisi
 * dilewati, jadi tidak ada tautan mati atau alamat contoh yang tayang. Email
 * diambil dari `LEGAL_IDENTITY.contactEmail`.
 */
export const MARKETING_CONTACT: {
  whatsapp: string; // angka dengan kode negara, mis. 6281234567890
  instagram: string;
  threads: string;
  x: string;
  tiktok: string;
  discord: string; // URL undangan lengkap, mis. https://discord.gg/xxxx
} = {
  whatsapp: "[NOMOR WHATSAPP MARKY]",
  instagram: "[AKUN INSTAGRAM]",
  threads: "[AKUN THREADS]",
  x: "[AKUN X]",
  tiktok: "[AKUN TIKTOK]",
  discord: "[UNDANGAN DISCORD]",
};

export type ContactKind = "whatsapp" | "email" | "instagram" | "threads" | "x" | "tiktok" | "discord";

export type ContactLink = { kind: ContactKind; href: string; label: string };

export type ContactValues = typeof MARKETING_CONTACT & { email: string };

function isFilled(value: string): boolean {
  return value.length > 0 && !LEGAL_PLACEHOLDER_PATTERN.test(value);
}

/** Hanya undangan resmi Discord yang dianggap terisi; URL lain ditolak supaya tidak tayang tautan keliru. */
const DISCORD_INVITE = /^https:\/\/(discord\.gg|discord\.com\/invite)\/\S+$/;

function handle(value: string): string {
  return value.replace(/^@/, "");
}

const defaultValues = (): ContactValues => ({
  ...MARKETING_CONTACT,
  email: LEGAL_IDENTITY.contactEmail,
});

/** Tautan kontak yang sudah terisi, berurutan WhatsApp, Email, Instagram, Threads, X, TikTok, Discord. */
export function contactLinks(values: ContactValues = defaultValues()): ContactLink[] {
  const candidates: (ContactLink | null)[] = [
    isFilled(values.whatsapp)
      ? { kind: "whatsapp", href: `https://wa.me/${values.whatsapp}`, label: "WhatsApp Marky" }
      : null,
    isFilled(values.email)
      ? { kind: "email", href: `mailto:${values.email}`, label: "Email Marky" }
      : null,
    isFilled(values.instagram)
      ? {
          kind: "instagram",
          href: `https://www.instagram.com/${handle(values.instagram)}`,
          label: "Instagram Marky",
        }
      : null,
    isFilled(values.threads)
      ? {
          kind: "threads",
          href: `https://www.threads.net/@${handle(values.threads)}`,
          label: "Threads Marky",
        }
      : null,
    isFilled(values.x)
      ? { kind: "x", href: `https://x.com/${handle(values.x)}`, label: "X Marky" }
      : null,
    isFilled(values.tiktok)
      ? {
          kind: "tiktok",
          href: `https://www.tiktok.com/@${handle(values.tiktok)}`,
          label: "TikTok Marky",
        }
      : null,
    DISCORD_INVITE.test(values.discord)
      ? { kind: "discord", href: values.discord, label: "Discord Marky" }
      : null,
  ];
  return candidates.filter((link): link is ContactLink => link !== null);
}

/** True selama ada kanal yang masih berupa penanda (rilis belum siap). */
export function hasUnfilledMarketingContact(values: ContactValues = defaultValues()): boolean {
  return Object.values(values).some((value) => !isFilled(value));
}
