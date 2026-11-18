import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { isSeatService, SEAT_SLOT_STEP_MINUTES } from "@/lib/booking/reservation";
import {
  computeFreeSlots,
  computeStaffSlots,
  jakartaWallClockToUtc,
  type SeatSlot,
} from "@/lib/booking/slots";
import { courtSlotsResponse, isCourtService, loadCourtData } from "@/lib/booking/court-loader";
import { loadPublicStaff } from "@/lib/booking/staff";
import { createClient as createSessionClient, createPublicClient } from "@/lib/supabase/server";
import { usernameSchema } from "@/lib/validations/merchant";

type PublicClient = ReturnType<typeof createPublicClient>;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const querySchema = z.object({
  username: usernameSchema,
  serviceId: z.uuid("serviceId tidak valid"),
  date: z.string().regex(DATE_PATTERN, "date harus berformat YYYY-MM-DD"),
  // Kosong/absen = "siapa saja" (merchant Studio) atau kalender tunggal.
  staffId: z.uuid("staffId tidak valid").nullable(),
  // Jumlah tamu: wajib hanya untuk layanan ber-party_max (dicek di bawah).
  party: z.coerce.number().int().min(1).max(200).nullable(),
  areaId: z.uuid("areaId tidak valid").nullable(),
});

/** Rentang booking milik merchant yang sedang login, dikecualikan dari "terpakai" saat jadwal ulang. */
export type OwnBooking = { courtId: string | null; start: string; end: string };
export type OwnBookingResolver = (bookingId: string, merchantId: string, serviceId: string) => Promise<OwnBooking | null>;

type SessionClient = Pick<Awaited<ReturnType<typeof createSessionClient>>, "auth" | "from">;

/**
 * `excludeBookingId` hanya berlaku bila sesi Supabase pemanggil adalah merchant
 * pemilik booking itu (route /api/* tidak lewat proxy, jadi diverifikasi di sini
 * lewat getUser()). Selain itu diabaikan diam-diam, supaya anon tidak bisa
 * menebak id booking.
 */
export async function ownBookingRange(
  bookingId: string,
  merchantId: string,
  serviceId: string,
  getClient: () => Promise<SessionClient> = createSessionClient,
): Promise<OwnBooking | null> {
  try {
    const supabase = await getClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.id !== merchantId) return null;
    const { data } = await supabase
      .from("bookings")
      .select("court_id, start_datetime, end_datetime")
      .eq("id", bookingId)
      .eq("merchant_id", merchantId)
      .eq("service_id", serviceId)
      .in("status", ["PENDING", "PAID", "CONFIRMED", "REQUESTED"])
      .maybeSingle();
    return data ? { courtId: data.court_id, start: data.start_datetime, end: data.end_datetime } : null;
  } catch (error) {
    console.error("[api/slots] gagal memeriksa excludeBookingId", { error });
    return null;
  }
}

const sameInstant = (a: string, b: string) => Date.parse(a) === Date.parse(b);

/**
 * GET /api/slots?username=&serviceId=&date=&staffId=
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
 *
 * Layanan reservasi (restoran, `isSeatService`) TIDAK memakai
 * `get_booked_ranges`: kandidat jamnya tiap 30 menit dari jam buka, lalu
 * `get_seat_availability` menentukan mana yang masih muat untuk `party`
 * tamu (Keputusan 5 F8). Respons: `{ slots: SeatSlot[] }`, hanya yang kosong.
 */
export const GET = (request: NextRequest) => handleSlots(request);

/** Isi GET; klien Supabase disuntikkan supaya cabang sewa bisa diuji tanpa DB. */
export async function handleSlots(
  request: Request,
  createClient: () => PublicClient = createPublicClient,
  resolveOwn: OwnBookingResolver = ownBookingRange,
) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    username: url.searchParams.get("username") ?? "",
    serviceId: url.searchParams.get("serviceId") ?? "",
    date: url.searchParams.get("date") ?? "",
    staffId: url.searchParams.get("staffId") || null,
    party: url.searchParams.get("party") || null,
    areaId: url.searchParams.get("areaId") || null,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parameter tidak valid", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { username, serviceId, date, staffId, party, areaId } = parsed.data;
  const excludeRaw = url.searchParams.get("excludeBookingId");
  const excludeId = excludeRaw && z.uuid().safeParse(excludeRaw).success ? excludeRaw : null;

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

  const supabase = createClient();

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id, username, subscription_tier")
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
    .select("id, price, duration_minutes, party_max, seat_duration_minutes, court_unit_minutes, court_max_minutes")
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

  const own = excludeId ? await resolveOwn(excludeId, merchant.id, serviceId) : null;

  // Sewa lapangan: grid unit, lapangan, dan harga jam ramai (court-loader.ts).
  // Melewati staf, kursi, dan `party`.
  if (isCourtService(service)) {
    return courtSlotsResponse({
      service: {
        price: Number(service.price),
        court_unit_minutes: service.court_unit_minutes as 30 | 60,
        court_max_minutes: service.court_max_minutes!,
        duration_minutes: service.duration_minutes,
      },
      availability: availability ?? [],
      dateISO: date,
      durationRaw: url.searchParams.get("durationMinutes"),
      now: new Date(),
      load: async () => {
        const data = await loadCourtData(supabase, merchant.id, serviceId, date);
        if (!own) return data;
        return {
          ...data,
          booked: data.booked.filter(
            (b) => !(b.courtId === own.courtId && sameInstant(b.start_datetime, own.start) && sameInstant(b.end_datetime, own.end)),
          ),
        };
      },
    });
  }

  // Tidak ada baris merchant_settings = mode NONE (grant anon: Task 1 F8).
  const { data: settings, error: settingsError } = await supabase
    .from("merchant_settings")
    .select("table_mode")
    .eq("merchant_id", merchant.id)
    .maybeSingle();

  if (settingsError) {
    console.error("[api/slots] gagal memuat pengaturan", { username, error: settingsError });
    return NextResponse.json({ error: "Gagal memuat pengaturan merchant" }, { status: 500 });
  }

  if (service.party_max !== null && party === null) {
    return NextResponse.json({ error: "Jumlah tamu wajib diisi" }, { status: 400 });
  }

  if (isSeatService(service, settings?.table_mode ?? "NONE")) {
    const candidates = computeFreeSlots({
      dateISO: date,
      durationMinutes: service.seat_duration_minutes!,
      stepMinutes: SEAT_SLOT_STEP_MINUTES,
      availability: availability ?? [],
      bookedRanges: [],
    });
    if (candidates.length === 0) return NextResponse.json({ slots: [] });

    const { data: seats, error: seatsError } = await supabase.rpc("get_seat_availability", {
      p_username: username,
      p_service_id: serviceId,
      p_party_size: party!,
      p_area_id: areaId,
      p_starts: candidates.map((c) => c.startUtc),
    });
    if (seatsError) {
      console.error("[api/slots] gagal memuat ketersediaan kursi", { username, error: seatsError });
      return NextResponse.json({ error: "Gagal memuat jadwal" }, { status: 500 });
    }

    const byStart = new Map((seats ?? []).map((r) => [new Date(r.start_datetime).getTime(), r]));
    const slots: SeatSlot[] = candidates.flatMap((c) => {
      const row = byStart.get(new Date(c.startUtc).getTime());
      return row?.available ? [{ ...c, remaining: row.tables_left }] : [];
    });
    return NextResponse.json({ slots });
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

  let staff;
  try {
    staff = await loadPublicStaff(supabase, merchant.id, merchant.subscription_tier);
  } catch (staffError) {
    console.error("[api/slots] gagal memuat staf", { username, error: staffError });
    return NextResponse.json({ error: "Gagal memuat jadwal staf" }, { status: 500 });
  }

  // Hanya satu rentang yang sama persis dilepas (booking staf lain di jam sama tetap menahan).
  const ownIdx = own ? (bookedRanges ?? []).findIndex((r) => sameInstant(r.start_datetime, own.start) && sameInstant(r.end_datetime, own.end)) : -1;
  const effectiveBooked = (bookedRanges ?? []).filter((_, i) => i !== ownIdx);

  const slots = computeStaffSlots({
    dateISO: date,
    durationMinutes: service.duration_minutes,
    merchantAvailability: availability ?? [],
    staff,
    bookedRanges: effectiveBooked,
    staffId,
  });

  return NextResponse.json({ slots });
}
