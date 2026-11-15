import { after, NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { customerManageErrorMessage } from "@/lib/booking/customer-manage";
import { notifyCustomerChange } from "@/lib/notify/dispatch";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({ startUtc: z.iso.datetime({ offset: true }) });

/**
 * POST /api/pesanan/[token]/ubah-jadwal
 *
 * Pelanggan memindahkan jadwal sendiri. Tanpa sesi: token akses 48 hex adalah
 * kuncinya (tak tertebak, jadi itulah penjaga penyalahgunaan, sama seperti
 * rute /bayar). /api/* TIDAK dicakup matcher proxy. Seluruh aturan kebijakan,
 * kunci baris, dan filter merchant ada di RPC reschedule_booking, yang
 * mencari lewat access_token; token tidak pernah dikembalikan.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[0-9a-f]{48}$/.test(token)) {
    return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Jadwal baru tidak valid" }, { status: 400 });
  }

  const { data, error } = await createAdminClient().rpc("reschedule_booking", {
    p_token: token,
    p_new_start: body.data.startUtc,
  });
  if (error) {
    const message = customerManageErrorMessage(error.code);
    if (message !== customerManageErrorMessage(undefined)) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    console.error("[api/pesanan/ubah-jadwal] RPC gagal", { code: error.code, message: error.message });
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const row = data?.[0];
  if (row) after(() => notifyCustomerChange(row.booking_id, { type: "RESCHEDULED", oldStart: row.old_start }));
  return NextResponse.json({ ok: true });
}
