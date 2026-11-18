import assert from "node:assert/strict";
import { test } from "node:test";

import { channelLabel, summarizeFunnel, type FunnelRow } from "./funnel";

const row = (channel: string, a: number[], revenue = 0): FunnelRow => ({
  channel, views: a[0], service_views: a[1], checkouts: a[2], booked: a[3], paid: a[4], revenue,
});

test("angka papan F5: terburuk di Booking dibuat, 21%", () => {
  const r = summarizeFunnel([row("IG_BIO", [1240, 610, 302, 64, 41])], "ALL");
  assert.deepEqual(r.steps.map((s) => s.count), [1240, 610, 302, 64, 41]);
  assert.equal(r.worstStep, "booked");
  assert.equal(Math.round(r.steps[3].rateFromPrev! * 100), 21);
});

test("kosong: worstStep null", () => {
  const r = summarizeFunnel([row("LANGSUNG", [0, 0, 0, 0, 0])], "ALL");
  assert.equal(r.worstStep, null);
  assert.equal(summarizeFunnel([], "ALL").worstStep, null);
});

test("pemetaan dan penggabungan kanal, filter kanal", () => {
  assert.equal(channelLabel("tiktok"), "Iklan TikTok");
  assert.equal(channelLabel("OTHER"), "Langsung atau lainnya");
  const rows = [row("IG_BIO", [10, 5, 3, 2, 1], 100), row("instagram", [10, 5, 3, 2, 1], 100), row("LANGSUNG", [4, 2, 1, 1, 0]), row("OTHER", [1, 0, 0, 0, 0])];
  const all = summarizeFunnel(rows, "ALL");
  assert.equal(all.channels.length, 2);
  assert.equal(all.channels[0].views, 20);
  assert.equal(all.channels[0].revenue, 200);
  assert.equal(all.channels[1].views, 5);
  assert.equal(summarizeFunnel(rows, "Bio Instagram").steps[0].count, 20);
});

test("rate dibatasi 100% saat booked melebihi views", () => {
  const r = summarizeFunnel([row("IG_BIO", [1, 1, 1, 3, 3])], "ALL");
  assert.equal(r.steps[3].rateFromPrev, 1);
  assert.equal(r.channels[0].conversion, 1);
});
