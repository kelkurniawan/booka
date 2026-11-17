import { z } from "zod";

import { FLOOR_COLS, FLOOR_ROWS, TABLE_MAX_CELLS, TABLE_MIN_CELLS } from "@/lib/booking/reservation";

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

const cell = (max: number) => z.number().int().min(0).max(max);

/** Cermin constraint dining_* (Task 1) dan aturan BK064 save_dining_layout (Task 3). */
export const diningLayoutSchema = z
  .object({
    areas: z
      .array(
        z.object({
          id: z.uuid(),
          name: z.string().trim().min(1, "Nama area wajib diisi").max(30, "Nama area maksimal 30 karakter"),
          sort_order: z.number().int(),
        }),
      )
      .max(10, "Maksimal 10 area"),
    tables: z
      .array(
        z.object({
          id: z.uuid(),
          area_id: z.uuid(),
          name: z.string().trim().min(1, "Nama meja wajib diisi").max(20, "Nama meja maksimal 20 karakter"),
          min_seats: z.number().int().min(1).max(50),
          max_seats: z.number().int().min(1).max(50),
          shape: z.enum(["ROUND", "RECT"]),
          grid_x: cell(FLOOR_COLS - TABLE_MIN_CELLS),
          grid_y: cell(FLOOR_ROWS - TABLE_MIN_CELLS),
          grid_w: z.number().int().min(TABLE_MIN_CELLS).max(TABLE_MAX_CELLS),
          grid_h: z.number().int().min(TABLE_MIN_CELLS).max(TABLE_MAX_CELLS),
          note: z.string().trim().min(1).max(60, "Catatan maksimal 60 karakter").nullable(),
          bookable_online: z.boolean(),
          joinable_with: z.array(z.uuid()).max(8),
          sort_order: z.number().int(),
        }),
      )
      .max(100, "Maksimal 100 meja"),
  })
  .superRefine((v, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    const dupe = (names: string[]) => new Set(names.map((n) => n.toLowerCase())).size !== names.length;
    if (dupe(v.areas.map((a) => a.name))) fail("Nama area tidak boleh sama");
    if (dupe(v.tables.map((t) => t.name))) fail("Nama meja tidak boleh sama");
    const areaIds = new Set(v.areas.map((a) => a.id));
    const byId = new Map(v.tables.map((t) => [t.id, t]));
    for (const t of v.tables) {
      if (!areaIds.has(t.area_id)) fail(`Meja ${t.name} tidak punya area`);
      if (t.min_seats > t.max_seats) fail(`Kursi minimum meja ${t.name} melebihi maksimum`);
      if (t.grid_x + t.grid_w > FLOOR_COLS || t.grid_y + t.grid_h > FLOOR_ROWS) {
        fail(`Meja ${t.name} keluar dari denah`);
      }
      for (const j of t.joinable_with) {
        if (j === t.id || byId.get(j)?.area_id !== t.area_id) fail(`Gabungan meja ${t.name} tidak cocok`);
      }
    }
  });

export type DiningLayoutInput = z.input<typeof diningLayoutSchema>;
