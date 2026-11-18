import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { extractClientIp, hashClientIp } from "@/lib/booking/rate-limit";
import { readBodyText } from "@/lib/http/read-body";
import { createAdminClient } from "@/lib/supabase/admin";
import { eventBodySchema } from "@/lib/validations/funnel";

const MAX_BODY_BYTES = 2048;

type EventBody = ReturnType<typeof eventBodySchema.parse>;

/** Seam test: route.test.ts menyuntik versi palsu, tanpa DB. */
export type EventDeps = {
  merchantExists: (merchantId: string) => Promise<boolean>;
  allowed: (ipHash: string, merchantId: string) => Promise<boolean>;
  /** Mengembalikan kode error Postgres bila gagal. */
  insert: (row: Record<string, unknown>) => Promise<{ code?: string } | null>;
  adLinkId: (merchantId: string, slug: string) => Promise<string | null>;
};

const defaultDeps = (): EventDeps => {
  const admin = createAdminClient();
  return {
    async merchantExists(id) {
      // Belum onboarding = belum punya username.
      const { data } = await admin.from("merchants").select("id").eq("id", id).not("username", "is", null).maybeSingle();
      return !!data;
    },
    async allowed(ipHash, merchantId) {
      const { data, error } = await admin.rpc("check_event_rate_limit", { p_ip_hash: ipHash, p_merchant_id: merchantId });
      // Fail-open: analitik tidak boleh memblokir apa pun.
      if (error) {
        console.error("[api/events] rate limit gagal, melanjutkan", { error });
        return true;
      }
      return !!data;
    },
    async insert(row) {
      const { error } = await admin.from("funnel_events").insert(row as never);
      return error ? { code: error.code } : null;
    },
    async adLinkId(merchantId, slug) {
      const { data } = await admin
        .from("ad_links")
        .select("id")
        .eq("merchant_id", merchantId)
        .eq("slug", slug)
        .maybeSingle();
      return data?.id ?? null;
    },
  };
};

export async function handleEvent(body: EventBody, ipHash: string, deps: EventDeps): Promise<NextResponse> {
  const { merchantId, attribution: a } = body;
  if (!(await deps.merchantExists(merchantId))) {
    return NextResponse.json({ error: "Merchant tidak ditemukan" }, { status: 404 });
  }
  if (!(await deps.allowed(ipHash, merchantId))) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  const failure = await deps.insert({
    merchant_id: merchantId,
    session_id: body.sessionId,
    kind: body.kind,
    ad_link_id: a.adLinkSlug ? await deps.adLinkId(merchantId, a.adLinkSlug) : null,
    utm_source: a.utmSource,
    utm_medium: a.utmMedium,
    utm_campaign: a.utmCampaign,
    referrer_host: a.referrerHost,
    service_id: body.serviceId ?? null,
    merchant_link_id: body.merchantLinkId ?? null,
  });
  // 23505: VIEW ganda. 23503/23514: id milik merchant lain atau nilai di luar batas.
  // Semuanya no-op; hanya error lain yang dicatat.
  if (failure && !["23505", "23503", "23514"].includes(failure.code ?? "")) {
    console.error("[api/events] insert gagal", { merchantId, code: failure.code });
  }
  return new NextResponse(null, { status: 204 });
}

/** POST /api/events: kejadian funnel publik (anon), ditulis lewat service role dengan merchant_id dari body tervalidasi. */
export async function POST(request: NextRequest) {
  const text = await readBodyText(request, MAX_BODY_BYTES);
  let json: unknown = null;
  try {
    json = text === null ? null : JSON.parse(text);
  } catch {
    // json tetap null -> ditolak schema
  }
  const parsed = eventBodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Data kejadian tidak valid" }, { status: 400 });
  return handleEvent(parsed.data, hashClientIp(extractClientIp(request.headers)), defaultDeps());
}
