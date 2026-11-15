import assert from "node:assert/strict";
import { test } from "node:test";

import { endpointHash, isAllowedPushEndpoint, pushSubscriptionSchema } from "./push";

test("isAllowedPushEndpoint: layanan push resmi lolos", () => {
  for (const url of [
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/x",
    "https://web.push.apple.com/Q1",
    "https://wns2-par02p.notify.windows.com/w/?token=x",
  ]) {
    assert.equal(isAllowedPushEndpoint(url), true, url);
  }
});

test("isAllowedPushEndpoint: host lain, http, dan alamat internal ditolak", () => {
  for (const url of [
    "http://fcm.googleapis.com/x",
    "https://fcm.googleapis.com.evil.test/x",
    "https://evilfcm.googleapis.com.test/x",
    "https://169.254.169.254/latest",
    "https://localhost/x",
    "bukan url",
    "https://user:pw@fcm.googleapis.com/x",
    "https://fcm.googleapis.com:8443/x",
    "https://127.0.0.1/x",
    "https://[::1]/x",
  ]) {
    assert.equal(isAllowedPushEndpoint(url), false, url);
  }
});

const keys = { p256dh: "BNc", auth: "abc_-1" };

test("pushSubscriptionSchema: menolak endpoint terlalu panjang dan keys tanpa auth", () => {
  const long = "https://fcm.googleapis.com/" + "a".repeat(1001 - 27);
  assert.equal(long.length, 1001);
  assert.equal(pushSubscriptionSchema.safeParse({ endpoint: long, keys }).success, false);
  assert.equal(
    pushSubscriptionSchema.safeParse({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "BNc" } }).success,
    false,
  );
  assert.equal(
    pushSubscriptionSchema.safeParse({ endpoint: "https://fcm.googleapis.com/x", keys }).success,
    true,
  );
});

test("endpointHash: sha256 hex", () => {
  assert.equal(endpointHash("a"), "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb");
});
