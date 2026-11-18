import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import {
  NEAREST_SLOT_DAYS,
  jakartaDateISO,
  jakartaWallClockToUtc,
  nearestStaffSlots,
} from "@/lib/booking/slots";
import { courtApiError, isCourtService } from "@/lib/booking/court-loader";
import { loadPublicStaff } from "@/lib/booking/staff";
import { createPublicClient } from "@/lib/supabase/server";
import { usernameSchema } from "@/lib/validations/merchant";

const querySchema = z.object({
  username: usernameSchema,
  serviceId: z.uuid("serviceId tidak valid"),
});

/**
 * GET /api/slots/nearest?username=&serviceId=
 *
 * Jam kosong terdekat (14 hari) per staf plus "siapa saja", untuk kartu
 * "Dengan siapa?". Sama seperti /api/slots: klien anon dan RPC
 * `get_booked_ranges`, tidak pernah membaca tabel `bookings` langsung.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    username: url.searchParams.get("username") ?? "",
    serviceId: url.searchParams.get("serviceId") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Parameter tidak valid" }, { status: 400 });
  }
  const { username, serviceId } = parsed.data;

  const supabase = createPublicClient();

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id, username, subscription_tier")
    .eq("username", username)
    .maybeSingle();
  if (merchantError) {
    console.error("[api/slots/nearest] gagal memuat merchant", { username, error: merchantError });
    return NextResponse.json({ error: "Gagal memuat data merchant" }, { status: 500 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "Merchant tidak ditemukan" }, { status: 404 });
  }

  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("id, duration_minutes, court_unit_minutes")
    .eq("id", serviceId)
    .eq("merchant_id", merchant.id)
    .eq("is_active", true)
    .maybeSingle();
  if (serviceError) {
    console.error("[api/slots/nearest] gagal memuat layanan", { serviceId, error: serviceError });
    return NextResponse.json({ error: "Gagal memuat data layanan" }, { status: 500 });
  }
  if (!service) {
    return NextResponse.json({ error: "Layanan tidak ditemukan" }, { status: 404 });
  }
  // Keputusan 8 spec: sewa lapangan tidak punya "jam terdekat".
  if (isCourtService(service)) return courtApiError("court_service_not_supported");

  const { data: availability, error: availabilityError } = await supabase
    .from("availability")
    .select("day_of_week, start_time, end_time")
    .eq("merchant_id", merchant.id);
  if (availabilityError) {
    console.error("[api/slots/nearest] gagal memuat jam kerja", { username, error: availabilityError });
    return NextResponse.json({ error: "Gagal memuat jam kerja" }, { status: 500 });
  }

  const now = new Date();
  const todayISO = jakartaDateISO(now);
  const endISO = new Date(Date.parse(`${todayISO}T12:00:00Z`) + NEAREST_SLOT_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data: bookedRanges, error: bookedError } = await supabase.rpc("get_booked_ranges", {
    p_username: username,
    p_from: jakartaWallClockToUtc(todayISO, "00:00").toISOString(),
    p_to: jakartaWallClockToUtc(endISO, "00:00").toISOString(),
  });
  if (bookedError) {
    console.error("[api/slots/nearest] gagal memuat rentang booked", { username, error: bookedError });
    return NextResponse.json({ error: "Gagal memuat jadwal" }, { status: 500 });
  }

  let staff;
  try {
    staff = await loadPublicStaff(supabase, merchant.id, merchant.subscription_tier);
  } catch (staffError) {
    console.error("[api/slots/nearest] gagal memuat staf", { username, error: staffError });
    return NextResponse.json({ error: "Gagal memuat jadwal staf" }, { status: 500 });
  }

  const nearest = nearestStaffSlots({
    fromDateISO: todayISO,
    days: NEAREST_SLOT_DAYS,
    durationMinutes: service.duration_minutes,
    merchantAvailability: availability ?? [],
    staff,
    bookedRanges: bookedRanges ?? [],
    now,
  });

  return NextResponse.json({ nearest });
}
