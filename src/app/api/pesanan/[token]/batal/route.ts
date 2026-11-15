import { after, NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { customerManageErrorMessage } from "@/lib/booking/customer-manage";
import { notifyCustomerChange } from "@/lib/notify/dispatch";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/pesanan/[token]/batal
 *
 * Pelanggan membatalkan booking sendiri. Tanpa sesi: token akses 48 hex
 * adalah kuncinya (tak tertebak, jadi itulah penjaga penyalahgunaan, sama
 * seperti rute /bayar). /api/* TIDAK dicakup matcher proxy. Kebijakan dan
 * kunci baris ada di RPC cancel_booking_by_customer, yang mencari lewat
 * access_token; token tidak pernah dikembalikan.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[0-9a-f]{48}$/.test(token)) {
    return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
  }

  const { data, error } = await createAdminClient().rpc("cancel_booking_by_customer", { p_token: token });
  if (error) {
    const message = customerManageErrorMessage(error.code);
    if (message !== customerManageErrorMessage(undefined)) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    console.error("[api/pesanan/batal] RPC gagal", { code: error.code, message: error.message });
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const row = data?.[0];
  if (row) after(() => notifyCustomerChange(row.booking_id, { type: "CANCELLED" }));
  return NextResponse.json({ ok: true });
}
