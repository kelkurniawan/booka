import assert from "node:assert/strict";
import { test } from "node:test";

import { scrubEvent, scrubText } from "./scrub";

test("token di path /pesanan/ disensor, query dan sisa path tetap", () => {
  assert.equal(
    scrubText("https://booka.id/pesanan/Ab_c-123XYZ?x=1"),
    "https://booka.id/pesanan/[token]?x=1",
  );
});

test("nomor WhatsApp dan email di pesan error disensor", () => {
  assert.equal(
    scrubText("gagal kirim ke +6281234567890 / rina@contoh.id"),
    "gagal kirim ke [nomor] / [email]",
  );
});

test("scrubEvent membersihkan url, transaksi, breadcrumb, dan membuang data request", () => {
  const event = scrubEvent({
    request: {
      url: "https://booka.id/pesanan/rahasia",
      headers: { cookie: "sb=..." },
      data: { customer_whatsapp: "+6281234567890" },
    },
    transaction: "GET /pesanan/rahasia",
    breadcrumbs: [{ message: "navigasi", data: { to: "/pesanan/rahasia" } }],
    user: { ip_address: "1.2.3.4" },
  });
  assert.equal(event.request?.url, "https://booka.id/pesanan/[token]");
  assert.equal(event.request?.headers, undefined);
  assert.equal(event.request?.data, undefined);
  assert.equal(event.transaction, "GET /pesanan/[token]");
  assert.equal(event.breadcrumbs?.[0].data?.to, "/pesanan/[token]");
  assert.equal(event.user, undefined);
});
