import { z } from "zod";

export const serviceMediaSchema = z.object({
  service_id: z.uuid("Layanan tidak dikenal"),
  kind: z.enum(["IMAGE", "VIDEO"]),
  path: z.string().trim().min(1).max(400),
  poster_path: z
    .string()
    .trim()
    .max(400)
    .transform((nilai) => (nilai === "" ? null : nilai))
    .nullable()
    .default(null),
  alt: z
    .string()
    .trim()
    .max(120, "Teks alternatif maksimal 120 karakter")
    .transform((nilai) => (nilai === "" ? null : nilai))
    .nullable()
    .default(null),
  width: z.coerce.number().int().min(1).max(4096),
  height: z.coerce.number().int().min(1).max(4096),
  sort_order: z.coerce.number().int().min(0).max(99).default(0),
});

export type ServiceMediaInput = z.infer<typeof serviceMediaSchema>;
