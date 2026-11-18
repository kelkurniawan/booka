import assert from "node:assert/strict";
import { test } from "node:test";

import { eventBodySchema, trackingSchema } from "../validations/funnel";
import { PIXEL_EVENTS } from "./events";

test("PIXEL_EVENTS sesuai spec", () => {
  assert.equal(PIXEL_EVENTS.PAID.tiktok, "CompletePayment");
  assert.equal(PIXEL_EVENTS.BOOKED.ga4, "generate_lead");
  assert.equal(PIXEL_EVENTS.VIEW.meta, "PageView");
});

const id = "11111111-1111-4111-8111-111111111111";
const attribution = { adLinkSlug: null, utmSource: null, utmMedium: null, utmCampaign: null, referrerHost: null };

test("eventBodySchema", () => {
  assert.ok(eventBodySchema.safeParse({ merchantId: id, sessionId: id, kind: "VIEW", attribution }).success);
  assert.ok(!eventBodySchema.safeParse({ merchantId: id, sessionId: id, kind: "BOOKED", attribution }).success);
  assert.ok(!eventBodySchema.safeParse({ merchantId: id, sessionId: id, kind: "VIEW", attribution: { ...attribution, utmSource: "a".repeat(65) } }).success);
});

test("trackingSchema: pixel aktif butuh ID valid", () => {
  const off = { metaPixelId: "", tiktokPixelId: null, ga4MeasurementId: null, metaEnabled: false, tiktokEnabled: false, ga4Enabled: false };
  assert.ok(trackingSchema.safeParse(off).success);
  assert.ok(!trackingSchema.safeParse({ ...off, metaEnabled: true }).success);
  assert.ok(!trackingSchema.safeParse({ ...off, metaPixelId: "12345-678" }).success);
  assert.ok(trackingSchema.safeParse({ ...off, metaPixelId: "1234567890123456", metaEnabled: true }).success);
});
