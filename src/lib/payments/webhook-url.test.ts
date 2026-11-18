import assert from "node:assert/strict";
import { test } from "node:test";

import { isDeliverableWebhookUrl, paymentWebhookUrl } from "./webhook-url";

test("paymentWebhookUrl: path huruf kecil sesuai rute /api/webhooks/[provider]", () => {
  assert.equal(paymentWebhookUrl("https://marky.id", "MIDTRANS"), "https://marky.id/api/webhooks/midtrans");
  assert.equal(paymentWebhookUrl("https://marky.id/", "XENDIT"), "https://marky.id/api/webhooks/xendit");
});

test("paymentWebhookUrl: path di APP_URL tidak ikut tergandakan", () => {
  assert.equal(
    paymentWebhookUrl("https://booka-azure.vercel.app/dashboard", "MIDTRANS"),
    "https://booka-azure.vercel.app/api/webhooks/midtrans",
  );
});

test("isDeliverableWebhookUrl: hanya https publik", () => {
  assert.equal(isDeliverableWebhookUrl("https://marky.id/api/webhooks/midtrans"), true);
  assert.equal(isDeliverableWebhookUrl("http://marky.id/api/webhooks/midtrans"), false);
  assert.equal(isDeliverableWebhookUrl("http://localhost:3000/api/webhooks/midtrans"), false);
  assert.equal(isDeliverableWebhookUrl("https://localhost/api/webhooks/midtrans"), false);
  assert.equal(isDeliverableWebhookUrl("https://127.0.0.1/api/webhooks/midtrans"), false);
});
