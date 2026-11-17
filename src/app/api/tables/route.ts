import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import type { PickerTable, TablePickerData } from "@/lib/booking/reservation";
import { createPublicClient } from "@/lib/supabase/server";
import { usernameSchema } from "@/lib/validations/merchant";

const querySchema = z.object({
  username: usernameSchema,
  serviceId: z.uuid("serviceId tidak valid"),
  start: z.iso.datetime({ message: "start harus berformat ISO-8601" }),
  party: z.coerce.number().int().min(1).max(200),
});

/**
 * GET /api/tables?username=&serviceId=&start=&party=
 *
 * Denah meja untuk pemilih pelanggan: area, meja online (kolom tata letak
 * saja, grant anon) dan status tiap meja dari RPC `get_table_status`.
 * `createPublicClient()` (anon): tidak membaca `bookings` dan tidak
 * mengembalikan data pelanggan. Mode selain TABLE menghasilkan daftar kosong
 * karena RLS dan RPC sama-sama diam.
 */
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    username: params.get("username") ?? "",
    serviceId: params.get("serviceId") ?? "",
    start: params.get("start") ?? "",
    party: params.get("party") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parameter tidak valid", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { username, serviceId, start, party } = parsed.data;

  const supabase = createPublicClient();

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (merchantError) {
    console.error("[api/tables] gagal memuat merchant", { username, error: merchantError });
    return NextResponse.json({ error: "Gagal memuat data merchant" }, { status: 500 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "Merchant tidak ditemukan" }, { status: 404 });
  }

  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("id")
    .eq("id", serviceId)
    .eq("merchant_id", merchant.id)
    .eq("is_active", true)
    .maybeSingle();
  if (serviceError) {
    console.error("[api/tables] gagal memuat layanan", { serviceId, error: serviceError });
    return NextResponse.json({ error: "Gagal memuat data layanan" }, { status: 500 });
  }
  if (!service) {
    return NextResponse.json({ error: "Layanan tidak ditemukan" }, { status: 404 });
  }

  const [areasRes, tablesRes, statusRes] = await Promise.all([
    supabase
      .from("dining_areas")
      .select("id, name")
      .eq("merchant_id", merchant.id)
      .order("sort_order")
      .order("name"),
    supabase
      .from("dining_tables")
      .select("id, area_id, name, min_seats, max_seats, shape, grid_x, grid_y, grid_w, grid_h, note")
      .eq("merchant_id", merchant.id)
      .order("sort_order")
      .order("name"),
    supabase.rpc("get_table_status", {
      p_username: username,
      p_service_id: serviceId,
      p_start: start,
      p_party_size: party,
    }),
  ]);

  const failure = areasRes.error ?? tablesRes.error ?? statusRes.error;
  if (failure) {
    console.error("[api/tables] gagal memuat denah", { username, error: failure });
    return NextResponse.json({ error: "Gagal memuat denah meja" }, { status: 500 });
  }

  const statusById = new Map((statusRes.data ?? []).map((r) => [r.table_id, r.status]));
  const tables: PickerTable[] = (tablesRes.data ?? []).flatMap((t) => {
    const status = statusById.get(t.id);
    // Tanpa baris status = meja tidak ditawarkan (offline atau mode bukan TABLE).
    return status
      ? [
          {
            id: t.id,
            areaId: t.area_id,
            name: t.name,
            minSeats: t.min_seats,
            maxSeats: t.max_seats,
            shape: t.shape,
            x: t.grid_x,
            y: t.grid_y,
            w: t.grid_w,
            h: t.grid_h,
            note: t.note,
            status,
          },
        ]
      : [];
  });

  const body: TablePickerData = { areas: areasRes.data ?? [], tables };
  return NextResponse.json(body);
}
