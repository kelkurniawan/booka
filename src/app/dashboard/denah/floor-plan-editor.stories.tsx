import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { DiningTable } from "@/types/database";

import { FloorPlanEditor } from "./floor-plan-editor";

const aid = (n: number) =>
  `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const tid = (n: number) =>
  `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;

const AREAS = [
  { id: aid(1), name: "Dalam", sort_order: 0 },
  { id: aid(2), name: "Teras", sort_order: 1 },
];

const TABLES: Omit<DiningTable, "merchant_id" | "created_at" | "updated_at">[] = [
  {
    id: tid(1),
    area_id: aid(1),
    name: "D1",
    min_seats: 2,
    max_seats: 4,
    shape: "ROUND",
    grid_x: 1,
    grid_y: 1,
    grid_w: 3,
    grid_h: 3,
    note: null,
    bookable_online: true,
    joinable_with: [],
    sort_order: 1,
  },
  {
    id: tid(2),
    area_id: aid(1),
    name: "D2",
    min_seats: 2,
    max_seats: 4,
    shape: "ROUND",
    grid_x: 5,
    grid_y: 1,
    grid_w: 3,
    grid_h: 3,
    note: null,
    bookable_online: true,
    joinable_with: [],
    sort_order: 2,
  },
  {
    id: tid(3),
    area_id: aid(1),
    name: "D3",
    min_seats: 2,
    max_seats: 4,
    shape: "ROUND",
    grid_x: 9,
    grid_y: 1,
    grid_w: 3,
    grid_h: 3,
    note: null,
    bookable_online: true,
    joinable_with: [],
    sort_order: 3,
  },
  {
    id: tid(4),
    area_id: aid(1),
    name: "D4",
    min_seats: 2,
    max_seats: 4,
    shape: "ROUND",
    grid_x: 13,
    grid_y: 1,
    grid_w: 3,
    grid_h: 3,
    note: null,
    bookable_online: true,
    joinable_with: [],
    sort_order: 4,
  },
  {
    id: tid(5),
    area_id: aid(1),
    name: "D5",
    min_seats: 4,
    max_seats: 6,
    shape: "RECT",
    grid_x: 1,
    grid_y: 6,
    grid_w: 4,
    grid_h: 3,
    note: "Dekat jendela",
    bookable_online: true,
    joinable_with: [],
    sort_order: 5,
  },
  {
    id: tid(6),
    area_id: aid(1),
    name: "D6",
    min_seats: 4,
    max_seats: 6,
    shape: "RECT",
    grid_x: 6,
    grid_y: 6,
    grid_w: 4,
    grid_h: 3,
    note: null,
    bookable_online: true,
    joinable_with: [],
    sort_order: 6,
  },
  {
    id: tid(7),
    area_id: aid(1),
    name: "D7",
    min_seats: 6,
    max_seats: 8,
    shape: "RECT",
    grid_x: 11,
    grid_y: 6,
    grid_w: 4,
    grid_h: 3,
    note: null,
    bookable_online: true,
    joinable_with: [],
    sort_order: 7,
  },
  {
    id: tid(8),
    area_id: aid(1),
    name: "D8",
    min_seats: 2,
    max_seats: 2,
    shape: "ROUND",
    grid_x: 18,
    grid_y: 1,
    grid_w: 3,
    grid_h: 3,
    note: null,
    bookable_online: true,
    joinable_with: [],
    sort_order: 8,
  },
  {
    id: tid(9),
    area_id: aid(2),
    name: "T1",
    min_seats: 2,
    max_seats: 4,
    shape: "ROUND",
    grid_x: 1,
    grid_y: 12,
    grid_w: 3,
    grid_h: 3,
    note: null,
    bookable_online: true,
    joinable_with: [],
    sort_order: 9,
  },
  {
    id: tid(10),
    area_id: aid(2),
    name: "T2",
    min_seats: 2,
    max_seats: 4,
    shape: "ROUND",
    grid_x: 5,
    grid_y: 12,
    grid_w: 3,
    grid_h: 3,
    note: null,
    bookable_online: true,
    joinable_with: [],
    sort_order: 10,
  },
  {
    id: tid(11),
    area_id: aid(2),
    name: "T3",
    min_seats: 4,
    max_seats: 6,
    shape: "RECT",
    grid_x: 9,
    grid_y: 12,
    grid_w: 4,
    grid_h: 3,
    note: null,
    bookable_online: true,
    joinable_with: [],
    sort_order: 11,
  },
  {
    id: tid(12),
    area_id: aid(2),
    name: "T4",
    min_seats: 4,
    max_seats: 6,
    shape: "RECT",
    grid_x: 14,
    grid_y: 12,
    grid_w: 4,
    grid_h: 3,
    note: null,
    bookable_online: false,
    joinable_with: [],
    sort_order: 12,
  },
];

const meta = {
  title: "Dashboard/Denah meja/Editor denah",
  component: FloorPlanEditor,
  parameters: { nextjs: { appDirectory: true }, layout: "padded" },
  args: {
    initialAreas: AREAS,
    initialTables: TABLES,
    save: async (): Promise<{ ok: true } | { ok: false; error: string }> => ({
      ok: true,
    }),
  },
} satisfies Meta<typeof FloorPlanEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Contoh: Story = {};

export const Kosong: Story = { args: { initialAreas: [], initialTables: [] } };

export const AreaTanpaMeja: Story = {
  args: { initialAreas: AREAS, initialTables: [] },
};

/** Pilih "Lihat daftar" untuk alternatif tanpa kanvas. */
export const Daftar: Story = {
  play: async ({ canvasElement }) => {
    const btn = [...canvasElement.querySelectorAll("button")].find(
      (b) => b.textContent === "Lihat daftar",
    );
    btn?.click();
  },
};

export const GalatBK062: Story = {
  args: {
    save: async () => ({
      ok: false,
      error:
        "Meja atau area ini masih punya reservasi mendatang. Pindahkan reservasinya dulu, lalu hapus.",
    }),
  },
};
