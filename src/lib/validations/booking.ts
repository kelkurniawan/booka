import { z } from "zod";

import { whatsappSchema } from "./merchant";

/**
 * Sama persis dengan constraint `bookings_customer_name_length` di
 * supabase/migrations/20260729000100_init_schema.sql (2..80 karakter,
 * trim). Kebetulan berbagi angka dengan `merchants_full_name_length`
 * (`fullNameSchema` di ./merchant), tapi dipisah sendiri di sini karena
 * field-nya beda (nama pelanggan, bukan nama usaha) sehingga pesan errornya
 * juga harus sesuai konteks checkout.
 */
export const customerNameSchema = z
  .string()
  .trim()
  .min(2, "Nama minimal 2 karakter")
  .max(80, "Nama maksimal 80 karakter");

/**
 * `bookings_customer_whatsapp_format` memakai pola E.164 yang persis sama
 * dengan `merchants.whatsapp_number`, jadi dipakai ulang langsung —
 * termasuk normalisasi `normalizeWhatsapp` ke dalamnya.
 */
export const customerWhatsappSchema = whatsappSchema;

/**
 * Input form checkout Task 7. `serviceId` dan `startUtc` berasal dari slot
 * yang dipilih pelanggan (bukan diketik), tapi tetap divalidasi supaya form
 * tidak bisa disubmit dengan state yang belum lengkap.
 *
 * Field ini akan menjadi body `POST /api/bookings` di Task 8 — lihat
 * `BookingCheckoutSeam` di booking-picker.tsx untuk seam-nya.
 */
export const checkoutSchema = z.object({
  serviceId: z.uuid("Layanan tidak valid"),
  startUtc: z.iso.datetime({ message: "Slot tidak valid, silakan pilih ulang" }),
  customer_name: customerNameSchema,
  customer_whatsapp: customerWhatsappSchema,
});

export type CheckoutInput = z.input<typeof checkoutSchema>;
export type CheckoutValues = z.output<typeof checkoutSchema>;
