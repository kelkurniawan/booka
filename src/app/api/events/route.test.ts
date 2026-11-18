// "server-only" aman dengan --conditions=react-server (lihat script test:unit).
import assert from "node:assert/strict";
import { before, test } from "node:test";

import type { EventDeps, handleEvent as HandleEvent } from "./route";

let handleEvent: typeof HandleEvent;
before(async () => {
  ({ handleEvent } = await import("./route"));
});

const M = "11111111-1111-4111-8111-111111111111";
const body = {
  merchantId: M,
  sessionId: "22222222-2222-4222-8222-222222222222",
  kind: "VIEW" as const,
  attribution: { adLinkSlug: "ig-bio", utmSource: null, utmMedium: null, utmCampaign: null, referrerHost: null },
};

function deps(over: Partial<EventDeps> = {}) {
  const rows: Record<string, unknown>[] = [];
  const seenViews = new Set<string>();
  const d: EventDeps = {
    merchantExists: async () => true,
    allowed: async () => true,
    adLinkId: async () => "33333333-3333-4333-8333-333333333333",
    insert: async (row) => {
      if (row.kind === "VIEW") {
        const k = `${row.merchant_id}:${row.session_id}`;
        if (seenViews.has(k)) return { code: "23505" };
        seenViews.add(k);
      }
      rows.push(row);
      return null;
    },
    ...over,
  };
  return { d, rows };
}

test("merchant tidak ada -> 404, tanpa insert", async () => {
  const { d, rows } = deps({ merchantExists: async () => false });
  assert.equal((await handleEvent(body, "h", d)).status, 404);
  assert.equal(rows.length, 0);
});

test("lewat batas laju -> 429, tanpa insert", async () => {
  const { d, rows } = deps({ allowed: async () => false });
  assert.equal((await handleEvent(body, "h", d)).status, 429);
  assert.equal(rows.length, 0);
});

test("VIEW ganda satu sesi -> dua kali 204, satu baris, merchant_id dari body", async () => {
  const { d, rows } = deps();
  assert.equal((await handleEvent(body, "h", d)).status, 204);
  assert.equal((await handleEvent(body, "h", d)).status, 204);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].merchant_id, M);
  assert.equal(rows[0].ad_link_id, "33333333-3333-4333-8333-333333333333");
});

test("FK merchant lain (23503) -> 204 tanpa error", async () => {
  const { d } = deps({ insert: async () => ({ code: "23503" }) });
  assert.equal((await handleEvent({ ...body, kind: "SERVICE" }, "h", d)).status, 204);
});

test("body tidak valid ditolak schema (400 di POST)", async () => {
  const { eventBodySchema } = await import("@/lib/validations/funnel");
  assert.equal(eventBodySchema.safeParse({ ...body, kind: "X" }).success, false);
});
