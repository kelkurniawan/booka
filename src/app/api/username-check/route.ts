import { NextResponse, type NextRequest } from "next/server";

import { extractClientIp, hashClientIp } from "@/lib/booking/rate-limit";
import {
  checkUsernameClaim,
  httpStatusFor,
  type UsernameCheckResult,
} from "@/lib/marketing/username-check";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/username-check?u=<slug> -- publik, tanpa sesi (matcher proxy tidak
 * mencakup /api/*). Admin client hanya untuk RPC ini; RPC tidak membaca data
 * milik merchant tertentu. Beban dijaga rate limit di dalam RPC.
 */
export async function GET(request: NextRequest): Promise<NextResponse<UsernameCheckResult>> {
  // Batas ukuran masukan sebelum validasi (username paling panjang 30).
  const raw = (request.nextUrl.searchParams.get("u") ?? "").slice(0, 64);

  const result = await checkUsernameClaim(raw, async (username) => {
    const ip = extractClientIp(request.headers);
    // IP kosong dikirim kosong (bukan hash) supaya RPC membiarkannya lewat.
    const { data, error } = await createAdminClient().rpc("check_username_claim", {
      p_username: username,
      p_ip_hash: ip ? hashClientIp(ip) : "",
    });
    if (error) {
      console.error("[api/username-check] RPC gagal", { code: error.code });
      throw new Error("rpc");
    }
    return data;
  });

  return NextResponse.json(result, {
    status: httpStatusFor(result.status),
    headers: { "Cache-Control": "no-store" },
  });
}
