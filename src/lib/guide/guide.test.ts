import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildChecklist, CHECKLIST_ORDER, GUIDE_PAGE_KEYS, guidePageForPath, placeTip, tourStepsFor, type OnboardingFacts } from "./guide";

const NONE: OnboardingFacts = { hasService: false, hasHours: false, hasActivePayment: false, needsOnlinePayment: false, pageCustomized: false, hasOnlineBooking: false };
const done = (facts: Partial<OnboardingFacts>, steps: ("PAGE" | "SHARE")[] = []) =>
  Object.fromEntries(buildChecklist({ ...NONE, ...facts }, steps).map((i) => [i.key, i.done]));

describe("buildChecklist", () => {
  it("urutan tetap dan hanya PAGE/SHARE yang manual", () => {
    const items = buildChecklist(NONE, []);
    assert.deepEqual(items.map((i) => i.key), [...CHECKLIST_ORDER]);
    assert.deepEqual(items.filter((i) => i.manual).map((i) => i.key), ["PAGE", "SHARE"]);
    assert.ok(items.every((i) => !i.done));
  });
  it("sesudah wizard: layanan lunas dan jam ada, pembayaran belum", () => {
    assert.deepEqual(done({ hasService: true, hasHours: true, needsOnlinePayment: true }),
      { SERVICE: true, HOURS: true, PAYMENT: false, PAGE: false, SHARE: false, BOOKING: false });
  });
  it("hanya bayar di tempat: pembayaran selesai tanpa gateway", () => {
    assert.equal(done({ hasService: true, needsOnlinePayment: false }).PAYMENT, true);
  });
  it("tanpa layanan: pembayaran belum selesai walau tidak butuh online", () => {
    assert.equal(done({ hasService: false, needsOnlinePayment: false }).PAYMENT, false);
  });
  it("gateway aktif: pembayaran selesai", () => {
    assert.equal(done({ hasService: true, needsOnlinePayment: true, hasActivePayment: true }).PAYMENT, true);
  });
  it("tampilan: data atau tanda manual", () => {
    assert.equal(done({ pageCustomized: true }).PAGE, true);
    assert.equal(done({}, ["PAGE"]).PAGE, true);
  });
  it("booking online menyelesaikan bagikan dan booking; tanda SHARE saja tidak", () => {
    assert.deepEqual([done({ hasOnlineBooking: true }).SHARE, done({ hasOnlineBooking: true }).BOOKING], [true, true]);
    assert.deepEqual([done({}, ["SHARE"]).SHARE, done({}, ["SHARE"]).BOOKING], [true, false]);
  });
});

describe("guidePageForPath", () => {
  it("memetakan rute dashboard", () => {
    assert.equal(GUIDE_PAGE_KEYS.length, 16);
    assert.equal(new Set(GUIDE_PAGE_KEYS).size, 16);
    assert.equal(guidePageForPath("/dashboard"), "today");
    assert.equal(guidePageForPath("/dashboard/bookings"), "bookings");
    assert.equal(guidePageForPath("/dashboard/bookings/baru"), "bookings");
    assert.equal(guidePageForPath("/dashboard/promosi/voucher"), "promo");
    assert.equal(guidePageForPath("/dashboard/denah"), "floor_plan");
    assert.equal(guidePageForPath("/dashboard/analitik"), "analytics");
    assert.equal(guidePageForPath("/dashboard/settings/ekspor"), "settings");
    assert.equal(guidePageForPath("/dashboard/tautan"), "links");
    assert.equal(guidePageForPath("/dashboard/iklan"), "ads");
    assert.equal(guidePageForPath("/dashboard/lapangan"), "courts");
    assert.equal(guidePageForPath("/dashboard/servicesx"), null);
    assert.equal(guidePageForPath("/onboarding"), null);
  });
});

describe("tourStepsFor", () => {
  const steps = [
    { target: null, viewport: undefined },
    { target: "a", viewport: undefined },
    { target: "b", viewport: "desktop" as const },
    { target: "c", viewport: "mobile" as const },
    { target: "hilang", viewport: undefined },
  ];
  const has = (t: string) => t !== "hilang";
  it("menyaring viewport dan target yang hilang, null tetap", () => {
    assert.deepEqual(tourStepsFor(steps, "desktop", has).map((s) => s.target), [null, "a", "b"]);
    assert.deepEqual(tourStepsFor(steps, "mobile", has).map((s) => s.target), [null, "a", "c"]);
    assert.deepEqual(tourStepsFor(steps, "mobile", () => false).map((s) => s.target), [null]);
  });
});

describe("placeTip", () => {
  const vp = { width: 1280, height: 800 };
  const tip = { width: 300, height: 160 };
  it("item sidebar: di kanan target", () => {
    assert.deepEqual(placeTip({ top: 112, left: 12, width: 216, height: 40 }, tip, vp), { top: 112, left: 240 });
  });
  it("tombol kanan atas: di bawah, dijepit ke dalam layar", () => {
    assert.deepEqual(placeTip({ top: 26, left: 1126, width: 134, height: 44 }, tip, vp), { top: 82, left: 964 });
  });
  it("tombol kanan bawah: di atas", () => {
    assert.deepEqual(placeTip({ top: 740, left: 1100, width: 120, height: 44 }, tip, vp), { top: 568, left: 964 });
  });
  it("tanpa target: tengah", () => {
    assert.deepEqual(placeTip(null, tip, vp), { top: 320, left: 490 });
  });
  it("layar terlalu kecil: bawah, dijepit dua sumbu", () => {
    assert.deepEqual(placeTip({ top: 10, left: 10, width: 20, height: 20 }, tip, { width: 320, height: 200 }), { top: 24, left: 16 });
  });
});
