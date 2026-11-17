import { z } from "zod";

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
