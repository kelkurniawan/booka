// Modul murni tautan kontak merchant di sheet Hubungi. Kanal yang disembunyikan
// merchant atau kosong tidak menghasilkan tautan. Tanpa React.

import { formatDateTime } from "@/lib/format";
import { whatsappLink } from "@/lib/booking/dashboard";
import type { ContactChannel, MerchantSettings } from "@/types/database";

export type ContactLink = { channel: ContactChannel; label: string; handle: string; href: string };

export type ContactSettings = Pick<MerchantSettings,
  "contact_phone" | "contact_email" | "contact_instagram" | "contact_threads" |
  "contact_x" | "contact_tiktok" | "contact_hidden" | "reply_from" | "reply_until">;

/** Dipakai bila merchant belum punya baris merchant_settings (default kolom di migration). */
export const DEFAULT_CONTACT: ContactSettings = {
  contact_phone: null, contact_email: null, contact_instagram: null, contact_threads: null,
  contact_x: null, contact_tiktok: null, contact_hidden: [], reply_from: null, reply_until: null,
};

export function contactLinks(whatsapp: string | null, s: ContactSettings, whatsappText: string):
  { whatsapp: ContactLink | null; others: ContactLink[] } {
  const visible = (channel: ContactChannel, value: string | null) =>
    value !== null && !s.contact_hidden.includes(channel);

  const waLink: ContactLink | null = whatsapp !== null && !s.contact_hidden.includes("WHATSAPP")
    ? { channel: "WHATSAPP", label: "WhatsApp", handle: "Paling cepat dibalas", href: whatsappLink(whatsapp, whatsappText) }
    : null;

  const others: ContactLink[] = [];
  if (visible("PHONE", s.contact_phone)) {
    others.push({ channel: "PHONE", label: "Telepon", handle: s.contact_phone!, href: `tel:${s.contact_phone}` });
  }
  if (visible("EMAIL", s.contact_email)) {
    others.push({ channel: "EMAIL", label: "Email", handle: s.contact_email!, href: `mailto:${s.contact_email}` });
  }
  if (visible("INSTAGRAM", s.contact_instagram)) {
    const h = s.contact_instagram!;
    others.push({ channel: "INSTAGRAM", label: "Instagram", handle: `@${h}`, href: `https://instagram.com/${h}` });
  }
  if (visible("THREADS", s.contact_threads)) {
    const h = s.contact_threads!;
    others.push({ channel: "THREADS", label: "Threads", handle: `@${h}`, href: `https://www.threads.net/@${h}` });
  }
  if (visible("X", s.contact_x)) {
    const h = s.contact_x!;
    others.push({ channel: "X", label: "X", handle: `@${h}`, href: `https://x.com/${h}` });
  }
  if (visible("TIKTOK", s.contact_tiktok)) {
    const h = s.contact_tiktok!;
    others.push({ channel: "TIKTOK", label: "TikTok", handle: `@${h}`, href: `https://www.tiktok.com/@${h}` });
  }
  return { whatsapp: waLink, others };
}

/** Teks awal pesan WhatsApp ke merchant; pelanggan melanjutkan mengetik sendiri. */
export function contactWhatsappText(p: { merchantName: string; customerName: string; code: string; startISO: string }): string {
  const namaDepan = p.customerName.trim().split(/\s+/)[0];
  return `Halo ${p.merchantName}, saya ${namaDepan}. Soal booking ${p.code}, ${formatDateTime(p.startISO)}: `;
}

/** "09:00:00" -> "09.00" */
function jam(t: string): string {
  return t.slice(0, 5).replace(":", ".");
}

export function replyHoursLabel(s: Pick<ContactSettings, "reply_from" | "reply_until">): string | null {
  if (s.reply_from === null || s.reply_until === null) return null;
  return `Jam balas pesan ${jam(s.reply_from)} sampai ${jam(s.reply_until)} WIB`;
}
