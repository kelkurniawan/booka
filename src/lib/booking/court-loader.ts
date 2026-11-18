import { NextResponse } from "next/server";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, DayOfWeek } from "@/types/database";

import {
  computeCourtSlots,
  courtPrice,
  durationOptions,
  type CourtPriceRule,
} from "./court";
import type { AvailabilityWindow } from "./slots";

export type CourtServiceInfo = {
  price: number;
  court_unit_minutes: 30 | 60;
  court_max_minutes: number;
  duration_minutes: number;
};

export type CourtData = {
  courts: { id: string; name: string; sortOrder: number }[];
  rules: CourtPriceRule[];
  booked: { courtId: string; start_datetime: string; end_datetime: string }[];
};

/** Kode galat stabil + pesan Indonesia untuk jalur sewa (dicek di court-loader.test.ts). */
export const COURT_API_ERRORS = {
  duration_required: { status: 400, message: "Lama main wajib dipilih untuk layanan sewa lapangan." },
  duration_invalid: { status: 400, message: "Lama main tidak valid untuk layanan ini." },
  court_service_not_supported: {
    status: 400,
    message: "Layanan sewa lapangan tidak memakai jam terdekat. Pilih tanggal dan lama main.",
  },
  court_load_failed: { status: 500, message: "Gagal memuat jadwal lapangan." },
} as const;
export type CourtApiErrorCode = keyof typeof COURT_API_ERRORS;

export function courtApiError(code: CourtApiErrorCode) {
  const { status, message } = COURT_API_ERRORS[code];
  return NextResponse.json({ error: code, message }, { status });
}

/** True bila layanan adalah sewa lapangan (kolom unit terisi). */
export const isCourtService = (s: { court_unit_minutes: number | null }): boolean =>
  s.court_unit_minutes !== null;

/**
 * Memuat lapangan terkait layanan, aturan jam ramai, dan rentang terpakai
 * satu tanggal. Hanya klien anon: get_court_profiles, get_court_price_rules,
 * dan get_court_availability tidak mengembalikan data pelanggan. Melempar bila
 * salah satu RPC gagal.
 */
export async function loadCourtData(
  supabase: SupabaseClient<Database>,
  merchantId: string,
  serviceId: string,
  dateISO: string,
): Promise<CourtData> {
  const [profiles, rules, busy] = await Promise.all([
    supabase.rpc("get_court_profiles", { p_merchant_id: merchantId }),
    supabase.rpc("get_court_price_rules", { p_merchant_id: merchantId, p_service_id: serviceId }),
    supabase.rpc("get_court_availability", { p_merchant_id: merchantId, p_service_id: serviceId, p_date: dateISO }),
  ]);
  const failed = profiles.error ?? rules.error ?? busy.error;
  if (failed) throw failed;

  return {
    courts: (profiles.data?.[0]?.courts ?? [])
      .filter((c) => c.service_ids.includes(serviceId))
      .map((c) => ({ id: c.id, name: c.name, sortOrder: c.sort_order })),
    rules: (rules.data ?? []).map((r) => ({
      dayOfWeek: r.day_of_week as DayOfWeek,
      start: r.start_time.slice(0, 5),
      end: r.end_time.slice(0, 5),
      pricePerHour: Number(r.price_per_hour),
    })),
    booked: (busy.data ?? []).map((b) => ({
      courtId: b.court_id,
      start_datetime: b.start_datetime,
      end_datetime: b.end_datetime,
    })),
  };
}

export type CourtSlotsInput = {
  service: CourtServiceInfo;
  availability: AvailabilityWindow[];
  dateISO: string;
  /** Nilai mentah query `durationMinutes` (null bila tidak dikirim). */
  durationRaw: string | null;
  now: Date;
  load: () => Promise<CourtData>;
};

/** Respons GET /api/slots untuk layanan sewa. `load` disuntikkan supaya bisa diuji tanpa DB. */
export async function courtSlotsResponse(input: CourtSlotsInput): Promise<NextResponse> {
  const { service, availability, dateISO, durationRaw, now } = input;
  const durations = durationOptions({
    minMinutes: service.duration_minutes,
    maxMinutes: service.court_max_minutes,
    unitMinutes: service.court_unit_minutes,
  });

  if (durationRaw === null || durationRaw.trim() === "") return courtApiError("duration_required");
  const durationMinutes = Number(durationRaw);
  if (!durations.includes(durationMinutes)) return courtApiError("duration_invalid");

  let data: CourtData;
  try {
    data = await input.load();
  } catch (error) {
    console.error("[api/slots] gagal memuat data lapangan", { error });
    return courtApiError("court_load_failed");
  }

  const slots = computeCourtSlots({
    dateISO,
    availability,
    courts: data.courts,
    booked: data.booked,
    unitMinutes: service.court_unit_minutes,
    durationMinutes,
    now,
  }).map((s) => ({
    time: s.time,
    start: s.start,
    full: s.full,
    freeCount: s.free.length,
    price: courtPrice({
      basePerHour: service.price,
      rules: data.rules,
      dateISO,
      startHHMM: s.time,
      durationMinutes,
      unitMinutes: service.court_unit_minutes,
    }).total,
    courts: s.free.map((f) => ({ id: f.courtId, name: f.name })),
  }));

  return NextResponse.json({
    courtService: true,
    slots,
    courts: data.courts.map((c) => ({ id: c.id, name: c.name })),
    durations,
  });
}
