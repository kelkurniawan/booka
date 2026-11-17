import type { DiningTableShape, Service, TableMode } from "@/types/database";

/** Jarak antar jam mulai layanan reservasi (menit). Keputusan 11 F8. */
export const SEAT_SLOT_STEP_MINUTES = 30;
/** Ukuran kanvas denah dalam sel; wajib sama dengan constraint dining_tables_grid. */
export const FLOOR_COLS = 24;
export const FLOOR_ROWS = 22;
export const TABLE_MIN_CELLS = 3;
export const TABLE_MAX_CELLS = 12;
export const MAX_CUSTOMER_NOTE = 300;

export type TableStatus = "FREE" | "TAKEN" | "TOO_SMALL" | "TOO_LARGE";

export const TABLE_STATUS_LABEL: Record<TableStatus, string> = {
  FREE: "Tersedia",
  TAKEN: "Terisi",
  TOO_SMALL: "Kurang kursi",
  TOO_LARGE: "Untuk rombongan lebih besar",
};

/** Satu meja di pemilih pelanggan (respons GET /api/tables). */
export type PickerTable = {
  id: string;
  areaId: string;
  name: string;
  minSeats: number;
  maxSeats: number;
  shape: DiningTableShape;
  x: number;
  y: number;
  w: number;
  h: number;
  note: string | null;
  status: TableStatus;
};

export type TablePickerData = { areas: { id: string; name: string }[]; tables: PickerTable[] };

type GridBox = { grid_x: number; grid_y: number; grid_w: number; grid_h: number };

/** Layanan memakai kursi/meja bila mode restoran menyala dan lama duduk terisi (Keputusan 2). */
export function isSeatService(
  service: Pick<Service, "seat_duration_minutes">,
  tableMode: TableMode,
): boolean {
  return tableMode !== "NONE" && service.seat_duration_minutes !== null;
}

export function partyRangeLabel(service: Pick<Service, "party_min" | "party_max">): string | null {
  if (service.party_min === null || service.party_max === null) return null;
  return service.party_min === service.party_max
    ? `Untuk ${service.party_max} orang`
    : `Untuk ${service.party_min} sampai ${service.party_max} orang`;
}

export function seatRangeLabel(min: number, max: number): string {
  return min === max ? `${max} kursi` : `${min} sampai ${max} kursi`;
}

export function remainingLabel(remaining: number | null): string | null {
  return remaining !== null && remaining >= 1 && remaining <= 3 ? `Sisa ${remaining} meja` : null;
}

export function holdSentence(minutes: number): string | null {
  return minutes > 0 ? `Meja ditahan ${minutes} menit dari jam datang.` : null;
}

export function tableAriaLabel(
  table: { name: string; min_seats: number; max_seats: number; note: string | null },
  status: TableStatus,
  selected: boolean,
): string {
  const parts = [`Meja ${table.name}`, seatRangeLabel(table.min_seats, table.max_seats)];
  if (table.note) parts.push(table.note);
  parts.push(selected && status === "FREE" ? "dipilih" : TABLE_STATUS_LABEL[status].toLowerCase());
  return parts.join(", ");
}

const KEY_DELTA: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** Geser satu sel dengan tombol panah; null bila tombol lain. Tidak pernah keluar kanvas. */
export function moveTableByKey<T extends GridBox>(table: T, key: string): T | null {
  const delta = KEY_DELTA[key];
  if (!delta) return null;
  const grid_x = Math.min(Math.max(table.grid_x + delta[0], 0), FLOOR_COLS - table.grid_w);
  const grid_y = Math.min(Math.max(table.grid_y + delta[1], 0), FLOOR_ROWS - table.grid_h);
  return { ...table, grid_x, grid_y };
}

/** Langkah alur reservasi yang dibuka lagi setelah POST /api/bookings gagal dengan `code` ini. */
export function bookingErrorStep(code: string | undefined): "meja" | "jadwal" | null {
  if (code === "BK061") return "meja";
  if (code === "BK060" || code === "23P01" || code === "P0006") return "jadwal";
  return null;
}
