import type { createClient } from "@/lib/supabase/server";
import type { CourtServiceValues, ServiceValues } from "@/lib/validations/service";

import { mapCourtError } from "./court-errors";
import type { ServiceFormState } from "./service-state";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Pesan ramah untuk error P0001 yang dilempar trigger enforce_service_limit. */
const LIMIT_MESSAGE =
  "Paket Starter hanya mengizinkan 1 layanan. Upgrade paket untuk menambah layanan lagi.";

/** Pesan ramah untuk constraint check services_deposit_* (23514). */
const DEPOSIT_MESSAGE =
  "Besar DP tidak valid. Persen 1 sampai 90, atau nominal tetap yang lebih kecil dari harga.";

const NEUTRAL_CHECK_MESSAGE = "Isian layanan tidak valid. Periksa harga, DP, dan pengaturan sewa.";

/** 23514: PostgREST menyebut nama constraint di message; tanpa itu, layanan sewa memakai pesan netral. */
function checkMessage(error: { message?: string }, rental: boolean): string {
  if (/services_deposit/.test(error.message ?? "")) return DEPOSIT_MESSAGE;
  if (/services_court/.test(error.message ?? "")) return mapCourtError("23514");
  return rental ? NEUTRAL_CHECK_MESSAGE : DEPOSIT_MESSAGE;
}

const courtFail = (code: string | undefined): ServiceFormState => ({
  status: "error",
  message: mapCourtError(code),
  courtError: mapCourtError(code),
  fieldErrors: {},
});

/** Kolom layanan biasa; durasi layanan sewa ditulis save_court_service, bukan di sini. */
function baseColumns(v: ServiceValues) {
  return {
    name: v.name,
    description: v.description,
    price: v.price,
    payment_mode: v.payment_mode,
    deposit_type: v.deposit_type,
    deposit_value: v.deposit_value,
    party_min: v.partyMin,
    party_max: v.partyMax,
    seat_duration_minutes: v.seatDurationMinutes,
  };
}

/** Satu transaksi di database: kolom sewa, tautan lapangan, dan aturan jam ramai (atau pembersihannya). */
function saveCourtService(supabase: Supabase, serviceId: string, court: CourtServiceValues | null, activate = false) {
  return supabase.rpc("save_court_service", {
    p_service_id: serviceId,
    p_rental: court !== null,
    p_unit: court?.unit ?? null,
    p_max: court?.maxMinutes ?? null,
    p_duration: court?.minMinutes ?? null,
    p_court_ids: court?.courtIds ?? [],
    p_activate: activate,
    p_rules: (court?.rules ?? []).flatMap((r) =>
      r.days.map((day) => ({ day_of_week: day, start_time: r.start, end_time: r.end, price_per_hour: r.pricePerHour })),
    ),
  });
}

/**
 * Layanan sewa dibuat NONAKTIF sebagai layanan biasa (selalu valid), lalu save_court_service
 * menjadikannya sewa dan mengaktifkannya dalam satu transaksi. Jadi tidak pernah tayang di
 * halaman publik dengan harga per jam sebelum lengkap. Bila langkah sewa gagal, layanan baru
 * dihapus lagi; kalau penghapusan pun gagal, ia tetap nonaktif.
 */
export async function createServiceRecord(
  supabase: Supabase,
  userId: string,
  v: ServiceValues,
  court: CourtServiceValues | null,
): Promise<ServiceFormState> {
  const { data, error } = await supabase
    .from("services")
    .insert({
      merchant_id: userId,
      ...baseColumns(v),
      duration_minutes: court?.minMinutes ?? v.duration_minutes,
      ...(court ? { is_active: false } : {}),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "P0001") return { status: "error", message: LIMIT_MESSAGE, limitReached: true };
    if (error.code === "23514") return { status: "error", message: checkMessage(error, court !== null) };
    return { status: "error", message: "Gagal menyimpan layanan. Coba lagi." };
  }

  if (court && data) {
    const { error: rentalError } = await saveCourtService(supabase, data.id, court, true);
    if (rentalError) {
      const { error: rollbackError } = await supabase
        .from("services")
        .delete()
        .eq("id", data.id)
        .eq("merchant_id", userId);
      if (rollbackError) console.error("[services] rollback layanan sewa gagal", rollbackError);
      return courtFail(rentalError.code);
    }
  }
  return { status: "success", serviceId: data?.id };
}

/** Layanan biasa selalu memanggil RPC dengan p_rental=false: membersihkan tautan dan aturan sisa, idempoten, tak bergantung isian form. */
export async function updateServiceRecord(
  supabase: Supabase,
  userId: string,
  id: string,
  v: ServiceValues,
  court: CourtServiceValues | null,
): Promise<ServiceFormState> {
  const { error } = await supabase
    .from("services")
    .update({
      ...baseColumns(v),
      // Layanan biasa wajib mengosongkan kolom sewa di update yang sama (CHECK services_court_xor_seat).
      ...(court ? {} : { duration_minutes: v.duration_minutes, court_unit_minutes: null, court_max_minutes: null }),
    })
    .eq("id", id)
    // RLS sudah membatasi ke merchant pemilik, tapi filter eksplisit ini
    // membuat maksudnya jelas terbaca di kode dan bukan hanya bergantung
    // pada policy database.
    .eq("merchant_id", userId);

  if (error) {
    if (error.code === "23514") return { status: "error", message: checkMessage(error, court !== null) };
    return { status: "error", message: "Gagal menyimpan perubahan. Coba lagi." };
  }

  const { error: rentalError } = await saveCourtService(supabase, id, court);
  if (rentalError) {
    // Update dasar sudah tersimpan; katakan terus terang agar merchant tidak mengira semuanya gagal.
    const reason = mapCourtError(rentalError.code);
    return {
      status: "error",
      message: `Nama dan harga tersimpan, tapi pengaturan sewa gagal disimpan: ${reason}`,
      courtError: reason,
      fieldErrors: {},
    };
  }
  return { status: "success" };
}
