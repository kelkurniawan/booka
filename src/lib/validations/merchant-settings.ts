import { z } from "zod";

import { normalizeWhatsapp } from "@/lib/validations/merchant";
import type { ContactChannel } from "@/types/database";

/**
 * Mencerminkan kolom merchant_settings (migration 20261115000200):
 * max_active_per_phone null atau 1..10. Checkbox HTML hanya terkirim saat
 * dicentang ("on"), jadi absen berarti false.
 */
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const bookingSettingsSchema = z.object({
  allow_pay_on_site: checkbox,
  auto_confirm_on_site: checkbox,
  max_active_per_phone: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : v),
    z.coerce
      .number("Isi angka 1 sampai 10")
      .int("Isi angka 1 sampai 10")
      .min(1, "Isi angka 1 sampai 10")
      .max(10, "Isi angka 1 sampai 10")
      .nullable(),
  ),
  deposit_after_no_show: checkbox,
});

export type BookingSettingsValues = z.output<typeof bookingSettingsSchema>;

// ---- Kebijakan pelanggan, kontak, pengingat (migration 20261116000200) ----

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const hours = (msg: string) => z.coerce.number(msg).int(msg).min(0, msg).max(168, msg);

export const customerPolicySchema = z.object({
  allow_customer_reschedule: checkbox,
  reschedule_min_hours: hours("Isi jam 0 sampai 168"),
  max_reschedules: z.coerce.number("Isi angka 1 sampai 5").int("Isi angka 1 sampai 5")
    .min(1, "Isi angka 1 sampai 5").max(5, "Isi angka 1 sampai 5"),
  allow_customer_cancel: checkbox,
  cancel_min_hours: hours("Isi jam 0 sampai 168"),
  policy_text: z.preprocess(emptyToNull, z.string().trim().max(500, "Kebijakan maksimal 500 karakter").nullable()),
});

const phone = z.preprocess(
  emptyToNull,
  z.string().transform((v) => normalizeWhatsapp(v))
    .refine((v) => /^\+[1-9][0-9]{7,14}$/.test(v), "Nomor telepon tidak valid. Contoh: 0812-3456-7890").nullable(),
);
const email = z.preprocess(emptyToNull, z.string().trim().max(254, "Email terlalu panjang").pipe(z.email("Email tidak valid")).nullable());
const handle = (label: string) =>
  z.preprocess(
    (v) => emptyToNull(typeof v === "string" ? v.trim().replace(/^@/, "") : v),
    z.string().regex(/^[A-Za-z0-9._]{1,30}$/, `Nama pengguna ${label} tidak valid`).nullable(),
  );
const time = z.preprocess(emptyToNull, z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Jam harus berformat HH:MM").nullable());

export const HIDEABLE_CHANNELS: ContactChannel[] = ["WHATSAPP", "PHONE", "EMAIL", "INSTAGRAM", "THREADS", "X", "TIKTOK"];

export const contactSettingsSchema = z
  .object({
    contact_phone: phone,
    contact_email: email,
    contact_instagram: handle("Instagram"),
    contact_threads: handle("Threads"),
    contact_x: handle("X"),
    contact_tiktok: handle("TikTok"),
    reply_from: time,
    reply_until: time,
    ...Object.fromEntries(HIDEABLE_CHANNELS.map((c) => [`show_${c}`, checkbox])),
  })
  .superRefine((v, ctx) => {
    if ((v.reply_from === null) !== (v.reply_until === null)) {
      ctx.addIssue({ code: "custom", message: "Isi jam mulai dan jam selesai, atau kosongkan keduanya", path: ["reply_from"] });
    } else if (v.reply_from && v.reply_until && v.reply_from >= v.reply_until) {
      ctx.addIssue({ code: "custom", message: "Jam mulai harus lebih awal dari jam selesai", path: ["reply_until"] });
    }
  })
  .transform((v) => {
    const rec = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(rec)) if (!k.startsWith("show_")) out[k] = val;
    out.contact_hidden = HIDEABLE_CHANNELS.filter((c) => !rec[`show_${c}`]);
    return out as Omit<typeof v, `show_${ContactChannel}`> & { contact_hidden: ContactChannel[] };
  });

export const reminderSettingsSchema = z.object({
  reminder_whatsapp: checkbox,
  reminder_email: checkbox,
  reminder_push: checkbox,
  reminder_day_before: checkbox,
  reminder_same_day: checkbox,
});
