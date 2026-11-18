import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { mapBookingError } from "@/lib/booking/errors";
import { extractClientIp, hashClientIp } from "@/lib/booking/rate-limit";
import type { CheckVoucherResult } from "@/lib/booking/voucher";
import { readBodyText } from "@/lib/http/read-body";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkVoucherRequestSchema } from "@/lib/validations/booking";

const MAX_BODY_BYTES = 1024;

/**
 * POST /api/vouchers/check
 *
 * Cek kode voucher untuk satu layanan (Keputusan 11). Tidak menerima nomor
 * WhatsApp, jadi tidak bisa dipakai menebak riwayat pelanggan. Rate limit
 * 10 per ip+merchant per 15 menit; gagal memeriksa rate limit = ditolak (503).
 */
export async function POST(request: NextRequest) {
  const text = await readBodyText(request, MAX_BODY_BYTES);
  let json: unknown = null;
  try {
    json = text === null ? null : JSON.parse(text);
  } catch {
    // json tetap null -> ditolak schema
  }
  const parsed = checkVoucherRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Data kode voucher tidak valid" }, { status: 400 });
  }
  const { username, serviceId, code, startUtc, durationMinutes } = parsed.data;

  const supabase = createAdminClient();

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (merchantError) {
    console.error("[api/vouchers/check] gagal memuat merchant", { error: merchantError });
    return NextResponse.json({ error: "Gagal memuat data merchant" }, { status: 500 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "Merchant tidak ditemukan" }, { status: 404 });
  }

  const ipHash = hashClientIp(extractClientIp(request.headers));
  const { data: allowed, error: rateError } = await supabase.rpc("check_voucher_rate_limit", {
    p_ip_hash: ipHash,
    p_merchant_id: merchant.id,
  });
  if (rateError) {
    console.error("[api/vouchers/check] rate limit gagal, menolak (fail-closed)", {
      merchantId: merchant.id,
      error: rateError,
    });
    return NextResponse.json(
      { error: "Pemeriksaan kode sedang gangguan. Coba lagi sebentar." },
      { status: 503 },
    );
  }
  if (!allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan kode. Coba lagi beberapa menit lagi." },
      { status: 429 },
    );
  }

  const { data, error } = await supabase.rpc("check_voucher", {
    p_merchant_id: merchant.id,
    p_code: code,
    p_service_id: serviceId,
    // Hanya dipakai layanan sewa: min_spend dan diskon dihitung dari total sewa.
    p_start_datetime: startUtc ?? undefined,
    p_duration_minutes: durationMinutes ?? undefined,
  });
  const row = data?.[0];
  if (error || !row) {
    console.error("[api/vouchers/check] check_voucher gagal", { merchantId: merchant.id, error });
    return NextResponse.json({ error: "Pemeriksaan kode sedang gangguan. Coba lagi sebentar." }, { status: 503 });
  }
  if (row.reason !== null) {
    const mapped = mapBookingError(row.reason);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }

  // Kolom syarat terisi bila reason null (lihat check_voucher).
  const result: CheckVoucherResult = {
    code: row.code!,
    kind: row.kind!,
    value: row.value!,
    max_discount: row.max_discount,
    min_spend: row.min_spend,
    service_ids: row.service_ids,
    discount: Number(row.discount),
  };
  return NextResponse.json(result);
}
