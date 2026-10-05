import assert from "node:assert/strict";
import { test } from "node:test";

import { domainSchema, normalizeDomain } from "@/lib/validations/domain";

import { addProjectDomain, apexOf, dnsInstruction, getDomainStatus } from "./vercel";

const config = { token: "t", projectId: "prj_1", teamId: "team_1" };

function fakeFetch(responses: Record<string, Response>, calls: string[]): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(input).replace("https://api.vercel.com", "").replace("?teamId=team_1", "")}`;
    calls.push(key);
    return responses[key] ?? Response.json({ error: { code: "not_mocked" } }, { status: 500 });
  }) as typeof fetch;
}

test("normalizeDomain menerima salinan dari address bar", () => {
  assert.equal(normalizeDomain(" https://Booking.Salon.id/jadwal?x=1 "), "booking.salon.id");
  assert.equal(domainSchema.safeParse("localhost").success, false);
  assert.equal(domainSchema.safeParse("salon anda.id").success, false);
});

test("apex dan instruksi DNS, termasuk domain .co.id", () => {
  assert.equal(apexOf("booking.salon.co.id"), "salon.co.id");
  assert.deepEqual(dnsInstruction("salon.id"), { type: "A", name: "@", value: "76.76.21.21" });
  assert.deepEqual(dnsInstruction("salon.co.id"), { type: "A", name: "@", value: "76.76.21.21" });
  assert.deepEqual(dnsInstruction("jadwal.booking.salon.id"), {
    type: "CNAME",
    name: "jadwal.booking",
    value: "cname.vercel-dns.com",
  });
});

test("addProjectDomain: domain yang sudah terpasang di proyek ini bukan kegagalan", async () => {
  const calls: string[] = [];
  const result = await addProjectDomain(
    config,
    "booking.salon.id",
    fakeFetch(
      {
        "POST /v10/projects/prj_1/domains": Response.json(
          { error: { code: "domain_already_in_use_by_project" } },
          { status: 400 },
        ),
      },
      calls,
    ),
  );
  assert.deepEqual(result, { ok: true, value: null });
});

test("getDomainStatus: terverifikasi dan DNS benar", async () => {
  const calls: string[] = [];
  const result = await getDomainStatus(
    config,
    "booking.salon.id",
    fakeFetch(
      {
        "GET /v9/projects/prj_1/domains/booking.salon.id": Response.json({ verified: true }),
        "GET /v6/domains/booking.salon.id/config": Response.json({ misconfigured: false }),
      },
      calls,
    ),
  );
  assert.deepEqual(result, { ok: true, value: { verified: true, misconfigured: false, verification: [] } });
  // Domain yang sudah terverifikasi tidak memicu POST verify.
  assert.equal(calls.some((c) => c.includes("/verify")), false);
});

test("getDomainStatus: belum terverifikasi mencoba verify dan meneruskan record TXT", async () => {
  const txt = { type: "TXT", domain: "_vercel.salon.id", value: "vc-domain-verify=x" };
  const result = await getDomainStatus(
    config,
    "booking.salon.id",
    fakeFetch(
      {
        "GET /v9/projects/prj_1/domains/booking.salon.id": Response.json({ verified: false, verification: [txt] }),
        "POST /v9/projects/prj_1/domains/booking.salon.id/verify": Response.json(
          { error: { code: "missing_txt_record" } },
          { status: 400 },
        ),
        "GET /v6/domains/booking.salon.id/config": Response.json({ misconfigured: true }),
      },
      [],
    ),
  );
  assert.deepEqual(result, { ok: true, value: { verified: false, misconfigured: true, verification: [txt] } });
});
