import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";

const paramsSchema = z.object({ id: z.uuid() });

/**
 * GET /api/bookings/[id]/status
 *
 * Endpoint polling Task 9 -- halaman publik `/[username]` memanggil ini
 * tiap 3 detik setelah booking dibuat, sampai `status` jadi `PAID` atau
 * booking kedaluwarsa/dibatalkan.
 *
 * SENGAJA hanya mengembalikan `status` dan `expires_at`. `id` booking ada
 * di URL yang bisa dibagikan/ditebak (bukan rahasia, tapi bukan tersegel),
 * jadi respons ini TIDAK BOLEH memuat `customer_name`/`customer_whatsapp`
 * ataupun `payment_reference` -- prinsipnya sama dengan alasan
 * `get_booked_ranges` hanya mengembalikan start/end datetime, lihat
 * docs/DECISIONS.md bagian 2. Dipakai `createAdminClient()` (bukan klien
 * publik + RLS) justru supaya kolom yang dibalas dikendalikan eksplisit di
 * sini lewat `.select()`, bukan bergantung pada GRANT per kolom `anon` yang
 * bisa saja suatu saat diubah untuk kebutuhan lain.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const parsed = paramsSchema.safeParse({ id: rawId });

  if (!parsed.success) {
    return NextResponse.json({ error: "Booking tidak ditemukan" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: booking, error } = await admin
    .from("bookings")
    .select("status, expires_at")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (error) {
    console.error("[api/bookings/status] gagal memuat booking", { id: parsed.data.id, error });
    return NextResponse.json({ error: "Gagal memuat status booking" }, { status: 500 });
  }

  if (!booking) {
    return NextResponse.json({ error: "Booking tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json({ status: booking.status, expires_at: booking.expires_at });
}
