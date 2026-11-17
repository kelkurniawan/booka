import { z } from "zod";

import { normalizeVoucherCode, VOUCHER_CODE_PATTERN } from "@/lib/booking/voucher";
import { usernameSchema, whatsappSchema } from "./merchant";

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

/** Kode voucher: dinormalkan (trim + kapital) lalu dicocokkan polanya. */
export const voucherCodeSchema = z
  .string()
  .transform(normalizeVoucherCode)
  .pipe(z.string().regex(VOUCHER_CODE_PATTERN, "Kode voucher 4 sampai 16 huruf atau angka"));

/** Body POST /api/vouchers/check. */
export const checkVoucherRequestSchema = z.object({
  username: usernameSchema,
  serviceId: z.uuid("Layanan tidak valid"),
  code: voucherCodeSchema,
});

/**
 * Input form checkout Task 7. `serviceId` dan `startUtc` berasal dari slot
 * yang dipilih pelanggan (bukan diketik), tapi tetap divalidasi supaya form
 * tidak bisa disubmit dengan state yang belum lengkap.
 *
 * Field ini akan menjadi body `POST /api/bookings` di Task 8 — lihat
 * `BookingFlow` di src/app/[username]/booking-flow.tsx untuk pemakainya.
 */
export const checkoutSchema = z.object({
  serviceId: z.uuid("Layanan tidak valid"),
  // Null = "siapa saja" atau merchant tanpa staf. Database yang memutuskan.
  staffId: z.uuid("Staf tidak valid").nullable().default(null),
  startUtc: z.iso.datetime({ message: "Slot tidak valid, silakan pilih ulang" }),
  customer_name: customerNameSchema,
  customer_whatsapp: customerWhatsappSchema,
  partySize: z.number().int().min(1).max(200).nullable().default(null),
  areaId: z.uuid().nullable().default(null),
  tableId: z.uuid().nullable().default(null),
  customerNote: z
    .string()
    .trim()
    .max(300, "Catatan maksimal 300 karakter")
    .transform((v) => v || null)
    .nullable()
    .default(null),
});

export type CheckoutInput = z.input<typeof checkoutSchema>;
export type CheckoutValues = z.output<typeof checkoutSchema>;

/**
 * Body `POST /api/bookings` (Task 8). Sama seperti `checkoutSchema` (dipakai
 * `src/app/[username]/booking-flow.tsx` untuk validasi form sebelum submit), ditambah
 * `username` -- route resolve `merchant_id` sendiri lewat username, sama
 * seperti `GET /api/slots`, bukan memercayai `merchantId` yang dikirim
 * klien meski nilainya sendiri bukan rahasia (halaman `/[username]` publik).
 * `startUtc` sengaja tetap dipakai sebagai nama field (bukan `slotStartUtc`)
 * supaya field-nya identik dengan `checkoutSchema` yang sudah dipakai
 * `src/app/[username]/booking-flow.tsx` sejak Task 7 -- tidak ada alasan menduplikasi bentuk
 * payload untuk field yang sama persis.
 */
export const createBookingRequestSchema = z.object({
  username: usernameSchema,
  serviceId: z.uuid("Layanan tidak valid"),
  staffId: z.uuid("Staf tidak valid").nullable().default(null),
  startUtc: z.iso.datetime({ message: "Slot tidak valid, silakan pilih ulang" }),
  customer_name: customerNameSchema,
  customer_whatsapp: customerWhatsappSchema,
  voucherCode: voucherCodeSchema.nullable().default(null),
  partySize: z.number().int().min(1).max(200).nullable().default(null),
  areaId: z.uuid().nullable().default(null),
  tableId: z.uuid().nullable().default(null),
  customerNote: z
    .string()
    .trim()
    .max(300, "Catatan maksimal 300 karakter")
    .transform((v) => v || null)
    .nullable()
    .default(null),
});

export type CreateBookingRequest = z.output<typeof createBookingRequestSchema>;

// --- /dashboard/bookings (Task 2, Phase 5-6) --------------------------------

/**
 * Kolom pencarian ledger merchant (`?q=`) -- nama pelanggan atau nomor
 * WhatsApp, dicocokkan lewat `.or()` + `ilike` PostgREST. Karakter di bawah
 * ini punya arti khusus dalam sintaks filter PostgREST -- koma memisahkan
 * beberapa kondisi `.or()`, titik memisahkan `kolom.operator.nilai`, kurung
 * mengelompokkan kondisi (termasuk `and()`/`or()` bersarang), persen adalah
 * wildcard `ilike`, dan backslash dipakai untuk escape. MENOLAK karakter ini
 * (bukan mencoba meng-escape-nya) jauh lebih aman daripada menulis ulang
 * aturan escaping PostgREST sendiri -- nama pelanggan atau nomor WhatsApp
 * sungguhan hampir tidak pernah butuh karakter-karakter ini, jadi menolaknya
 * tidak mengorbankan kegunaan pencarian.
 */
export const bookingSearchSchema = z
  .string()
  .trim()
  .max(80, "Pencarian maksimal 80 karakter")
  .refine(
    (value) => !/[,.()%"\\]/.test(value),
    "Pencarian tidak boleh mengandung karakter , . ( ) % \" atau \\",
  );

/** Body Server Action `cancelBooking` di src/app/dashboard/bookings/actions.ts. */
export const cancelBookingSchema = z.object({
  id: z.uuid("Booking tidak valid"),
});
