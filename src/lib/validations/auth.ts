import { z } from "zod";

export const emailSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email wajib diisi")
    .max(254, "Email terlalu panjang")
    .toLowerCase()
    .pipe(z.email("Format email tidak valid")),
});

export type EmailInput = z.infer<typeof emailSchema>;
