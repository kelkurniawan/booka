import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { computeFreeSlots, jakartaWallClockToUtc } from "@/lib/booking/slots";
import { createPublicClient } from "@/lib/supabase/server";
import { usernameSchema } from "@/lib/validations/merchant";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const querySchema = z.object({
  username: usernameSchema,
  serviceId: z.uuid("serviceId tidak valid"),
  date: z.string().regex(DATE_PATTERN, "date harus berformat YYYY-MM-DD"),
});

/**
 * GET /api/slots?username=&serviceId=&date=
 *
 * Mengembalikan daftar slot kosong untuk satu layanan pada satu tanggal
 * kalender Jakarta (lihat src/lib/booking/slots.ts untuk algoritmanya dan
 * penjelasan kenapa Asia/Jakarta bisa dipakai dengan offset tetap).
 *
 * WAJIB `createPublicClient()` (peran anon) + RPC `get_booked_ranges` —
 * TIDAK PERNAH membaca tabel `bookings` langsung. `anon` memang tidak
 * diberi hak apa pun ke tabel itu (docs/DECISIONS.md bagian 1), dan
 * `get_booked_ranges` sengaja hanya mengembalikan start/end datetime tanpa
 * data pelanggan (docs/DECISIONS.md bagian 2).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    username: url.searchParams.get("username") ?? "",
    serviceId: url.searchParams.get("serviceId") ?? "",
    date: url.searchParams.get("date") ?? "",
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parameter tidak valid", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { username, serviceId, date } = parsed.data;

  // Tanggal lolos regex bisa saja tidak valid secara kalender (mis.
  // "2026-02-30"). new Date() JS akan diam-diam menormalkannya jadi tanggal
  // lain alih-alih menolak, jadi divalidasi eksplisit lewat round-trip di
  // sini sebelum dipakai untuk apa pun.
  const [year, month, day] = date.split("-").map(Number);
  const roundTrip = new Date(Date.UTC(year, month - 1, day));
  const isValidCalendarDate =
    roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() === month - 1 &&
    roundTrip.getUTCDate() === day;

  if (!isValidCalendarDate) {
    return NextResponse.json({ error: "Tanggal tidak valid" }, { status: 400 });
  }

  const supabase = createPublicClient();

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id, username")
    .eq("username", username)
    .maybeSingle();

  if (merchantError) {
    console.error("[api/slots] gagal memuat merchant", { username, error: merchantError });
    return NextResponse.json({ error: "Gagal memuat data merchant" }, { status: 500 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "Merchant tidak ditemukan" }, { status: 404 });
  }

  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("id, duration_minutes")
    .eq("id", serviceId)
    .eq("merchant_id", merchant.id)
    .eq("is_active", true)
    .maybeSingle();

  if (serviceError) {
    console.error("[api/slots] gagal memuat layanan", { serviceId, error: serviceError });
    return NextResponse.json({ error: "Gagal memuat data layanan" }, { status: 500 });
  }
  if (!service) {
    return NextResponse.json({ error: "Layanan tidak ditemukan" }, { status: 404 });
  }

  const { data: availability, error: availabilityError } = await supabase
    .from("availability")
    .select("day_of_week, start_time, end_time")
    .eq("merchant_id", merchant.id);

  if (availabilityError) {
    console.error("[api/slots] gagal memuat jam kerja", { username, error: availabilityError });
    return NextResponse.json({ error: "Gagal memuat jam kerja" }, { status: 500 });
  }

  // Rentang cek bentrok: satu hari kalender penuh di Jakarta, dikonversi ke
  // UTC untuk RPC get_booked_ranges (kolomnya timestamptz).
  const fromUtc = jakartaWallClockToUtc(date, "00:00");
  const nextDayISO = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  const toUtc = jakartaWallClockToUtc(nextDayISO, "00:00");

  const { data: bookedRanges, error: bookedError } = await supabase.rpc("get_booked_ranges", {
    p_username: username,
    p_from: fromUtc.toISOString(),
    p_to: toUtc.toISOString(),
  });

  if (bookedError) {
    console.error("[api/slots] gagal memuat rentang booked", { username, error: bookedError });
    return NextResponse.json({ error: "Gagal memuat jadwal" }, { status: 500 });
  }

  const slots = computeFreeSlots({
    dateISO: date,
    durationMinutes: service.duration_minutes,
    availability: availability ?? [],
    bookedRanges: bookedRanges ?? [],
  });

  return NextResponse.json({ slots });
}
