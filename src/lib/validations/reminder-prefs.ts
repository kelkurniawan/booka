import { z } from "zod";

/** Pilihan pengingat pelanggan untuk satu booking. Email kosong berarti mati. */
export const reminderPrefsSchema = z.object({
  whatsapp: z.boolean(),
  email: z.preprocess(
    (v) => (v === "" ? null : v),
    z.email("Alamat email tidak valid.").max(254, "Alamat email terlalu panjang.").nullable(),
  ),
  day_before: z.boolean(),
  same_day: z.boolean(),
});

export type ReminderPrefsInput = z.infer<typeof reminderPrefsSchema>;
