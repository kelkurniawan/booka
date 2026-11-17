import { z } from "zod";

/** Pengaturan kapasitas reservasi (merchant_settings.table_mode dan kawan-kawan). */
export const capacitySettingsSchema = z
  .object({
    tableMode: z.enum(["NONE", "AREA", "TABLE"]),
    seatsPerSlot: z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.coerce
        .number("Kapasitas harus berupa angka")
        .int("Kapasitas harus bilangan bulat")
        .min(1, "Kapasitas minimal 1 kursi")
        .max(1000, "Kapasitas maksimal 1000 kursi")
        .nullable(),
    ),
    tableHoldMinutes: z.coerce
      .number("Waktu tahan harus berupa angka")
      .int("Waktu tahan harus bilangan bulat")
      .min(0, "Waktu tahan minimal 0 menit")
      .max(120, "Waktu tahan maksimal 120 menit"),
    autoJoinTables: z.boolean(),
  })
  .refine((v) => v.tableMode !== "AREA" || v.seatsPerSlot !== null, {
    path: ["seatsPerSlot"],
    message: "Isi kapasitas kursi per jam",
  });

export type CapacitySettingsInput = z.input<typeof capacitySettingsSchema>;
