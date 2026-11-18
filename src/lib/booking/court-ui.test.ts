import assert from "node:assert/strict";
import { test } from "node:test";

import { courtPrice, type CourtPriceRule } from "./court";
import {
  buildCourtOptions,
  buildCourtSlotRows,
  buildPriceRows,
  courtRangeLabel,
  courtSubmitErrorAction,
  courtSummaryLines,
  effectiveCourtTotal,
  pickConflictAlt,
  reconcileCourtVoucher,
  courtRateSummary,
  courtShort,
  courtStatus,
  venueAria,
  venueLayout,
  type CourtSlotDto,
} from "./court-ui";

const MON = "2026-11-23";
const rules: CourtPriceRule[] = [{ dayOfWeek: 1, start: "17:00", end: "22:00", pricePerHour: 250000 }];
const slot = (time: string, freeCount: number): CourtSlotDto => ({
  time,
  start: `${MON}T${time}:00+07:00`,
  full: freeCount === 0,
  freeCount,
  price: 0,
  courts: Array.from({ length: freeCount }, (_, i) => ({ id: `c${i + 1}`, name: `Lapangan ${i + 1}` })),
});
const rowsFor = (slots: CourtSlotDto[], selectedStart: string | null = null, durationMinutes = 90) =>
  buildCourtSlotRows({ slots, basePerHour: 150000, rules, dateISO: MON, durationMinutes, unitMinutes: 30, selectedStart });

test("buildCourtSlotRows: label, harga dari courtPrice, jumlah kosong, aria", () => {
  const [row] = rowsFor([slot("16:30", 3)]);
  assert.equal(row.label, "16.30");
  assert.equal(row.price, "Rp325.000");
  assert.equal(row.count, "3 kosong");
  assert.equal(row.full, false);
  assert.equal(row.aria, "16.30, Rp325.000, 3 lapangan kosong");
  // Harga tampil = harga ditagih: sama dengan courtPrice untuk input yang sama.
  const total = courtPrice({ basePerHour: 150000, rules, dateISO: MON, startHHMM: "16:30", durationMinutes: 90, unitMinutes: 30 }).total;
  assert.equal(row.price, `Rp${total.toLocaleString("id-ID")}`);
});

test("buildCourtSlotRows: jam penuh tidak bisa dipilih dan tidak pernah checked", () => {
  const start = slot("17:30", 0).start;
  const [row] = rowsFor([slot("17:30", 0)], start);
  assert.equal(row.full, true);
  assert.equal(row.checked, false);
  assert.equal(row.price, "Penuh");
  assert.equal(row.count, "");
  assert.equal(row.note, "Semua lapangan terisi");
  assert.equal(row.aria, "17.30, penuh");
});

test("buildCourtSlotRows: catatan harga biasa, campuran, dan jam ramai", () => {
  const rows = rowsFor([slot("15:00", 3), slot("16:30", 3), slot("17:00", 1)], slot("16:30", 3).start);
  assert.equal(rows[0].note, "Harga biasa");
  assert.equal(rows[1].note, "Sebagian masuk jam ramai mulai 17.00");
  assert.equal(rows[1].checked, true);
  assert.equal(rows[2].note, "Jam ramai");
});

test("buildCourtSlotRows: durasi 1 jam di 16.30 ikut campuran, 16.00 tidak", () => {
  const rows = rowsFor([slot("16:00", 2), slot("16:30", 2)], null, 60);
  assert.equal(rows[0].note, "Harga biasa");
  assert.equal(rows[1].note, "Sebagian masuk jam ramai mulai 17.00");
  assert.equal(rows[1].price, "Rp200.000");
});

test("buildCourtSlotRows: daftar kosong menghasilkan baris kosong", () => {
  assert.deepEqual(rowsFor([]), []);
});

const opts = [
  { id: "c1", name: "Lapangan 1", tags: "Indoor, kaca", description: "Utama.", photo: { path: "m/court/1.jpg", alt: "Foto 1" } },
  { id: "c2", name: "Lapangan 2", tags: "Indoor", description: "Dekat kantin.", photo: null },
];

test("buildCourtOptions: Mana saja pertama, terisi saat jam dipilih, aria", () => {
  const out = buildCourtOptions({ courts: opts, freeIds: ["c2"], selectedCourtId: null });
  assert.equal(out[0].name, "Mana saja");
  assert.equal(out[0].isAny, true);
  assert.equal(out[0].checked, true);
  assert.equal(out[1].busy, true);
  assert.equal(out[1].tags, "Terisi di jam ini");
  assert.equal(out[1].aria, "Lapangan 1, terisi di jam ini, Utama.");
  assert.equal(out[2].busy, false);
  assert.equal(out[2].aria, "Lapangan 2, Indoor, Dekat kantin.");
});

test("buildCourtOptions: tanpa jam terpilih tidak ada yang terisi; pilihan spesifik checked", () => {
  const out = buildCourtOptions({ courts: opts, freeIds: null, selectedCourtId: "c2" });
  assert.equal(out.some((o) => o.busy), false);
  assert.equal(out[0].checked, false);
  assert.equal(out[2].checked, true);
});

test("courtRangeLabel", () => {
  assert.equal(courtRangeLabel("16:30", 90), "16.30 sampai 18.00");
  assert.equal(courtRangeLabel("23:00", 60), "23.00 sampai 24.00");
});

test("buildPriceRows: rincian L2 menjumlah tepat ke total courtPrice", () => {
  const { total, segments } = courtPrice({ basePerHour: 150000, rules, dateISO: MON, startHHMM: "16:30", durationMinutes: 90, unitMinutes: 30 });
  const r = buildPriceRows({ segments, total, voucher: null });
  assert.deepEqual(r.rows, [
    { label: "16.30 sampai 17.00, harga biasa", amount: "Rp75.000" },
    { label: "17.00 sampai 18.00, jam ramai", amount: "Rp250.000" },
  ]);
  assert.equal(r.totalNumber, 325000);
  assert.equal(r.voucherRow, null);
  assert.equal(r.total, "Rp325.000");
});

test("buildPriceRows: voucher mengurangi total sewa", () => {
  const { total, segments } = courtPrice({ basePerHour: 150000, rules, dateISO: MON, startHHMM: "16:30", durationMinutes: 90, unitMinutes: 30 });
  const r = buildPriceRows({ segments, total, voucher: { code: "MAINBARENG", discount: 30000 } });
  assert.deepEqual(r.voucherRow, { label: "Voucher MAINBARENG", amount: "-Rp30.000" });
  assert.equal(r.totalNumber, 295000);
  assert.equal(r.total, "Rp295.000");
});

test("buildPriceRows: pembulatan per baris tidak menggeser total", () => {
  // 30 menit di Rp100.001/jam: tiap unit 50.000,5; total dibulatkan sekali.
  const { total, segments } = courtPrice({ basePerHour: 100001, rules: [], dateISO: MON, startHHMM: "08:00", durationMinutes: 60, unitMinutes: 30 });
  const r = buildPriceRows({ segments, total, voucher: null });
  const sum = r.rows.reduce((s, row) => s + Number(row.amount.replace(/\D/g, "")), 0);
  assert.equal(sum, total);
  assert.equal(r.totalNumber, total);
});

test("courtShort dan courtStatus dan venueAria", () => {
  assert.equal(courtShort("Lapangan 2"), "L2");
  assert.equal(courtShort("Padel A"), "Pad");
  assert.equal(courtStatus("c1", ["c1"], "c1"), "Terisi");
  assert.equal(courtStatus("c2", ["c1"], "c2"), "Dipilih");
  assert.equal(courtStatus("c3", ["c1"], "c2"), "Kosong");
  assert.equal(venueAria("Lapangan 2", "Kosong", "Indoor"), "Lapangan 2, kosong, Indoor");
  assert.equal(venueAria("Lapangan 1", "Terisi", undefined), "Lapangan 1, terisi di jam ini");
});

test("venueLayout: hanya lapangan berposisi, persen dalam 0..100, rotasi menukar sisi", () => {
  const out = venueLayout({
    courts: [
      { id: "a", name: "L1", pos_x: 100, pos_y: 100, rotation: 0 },
      { id: "b", name: "L2", pos_x: 300, pos_y: 100, rotation: 90 },
      { id: "c", name: "L3", pos_x: null, pos_y: null, rotation: 0 },
    ],
    areas: [{ id: "g", label: "Gedung", pos_x: 80, pos_y: 80, width: 300, height: 260 }],
    markers: [{ id: "k", label: "Kantin", pos_x: 80, pos_y: 360, width: 100, height: 40 }],
  });
  assert.equal(out.items.filter((i) => i.kind === "court").length, 2);
  for (const i of out.items) {
    assert.ok(i.left >= 0 && i.top >= 0 && i.left + i.width <= 100.0001 && i.top + i.height <= 100.0001, i.id);
  }
  const a = out.items.find((i) => i.id === "a")!;
  const b = out.items.find((i) => i.id === "b")!;
  assert.ok(a.height > a.width, "tegak");
  assert.ok(b.width > b.height, "putar 90");
  assert.ok(out.aspect > 0);
});

test("venueLayout: tanpa lapangan berposisi kosong", () => {
  const out = venueLayout({ courts: [{ id: "c", name: "L3", pos_x: null, pos_y: null, rotation: 0 }], areas: [], markers: [] });
  assert.deepEqual(out.items, []);
});

test("courtRateSummary: tanpa aturan, satu harga ramai, dan rentang", () => {
  assert.equal(courtRateSummary(150000, []), "Rp150.000 per jam");
  assert.equal(courtRateSummary(150000, rules), "Rp150.000 per jam, jam ramai Rp250.000");
  assert.equal(
    courtRateSummary(150000, [...rules, { dayOfWeek: 6, start: "08:00", end: "12:00", pricePerHour: 200000 }]),
    "Rp150.000 per jam, jam ramai Rp200.000 sampai Rp250.000",
  );
});

import { courtSlotsToFree } from "./court-ui";

test("courtSlotsToFree: Mana saja memakai semua jam yang tidak penuh", () => {
  const slots = [
    { time: "10:00", start: "2026-11-21T03:00:00.000Z", full: false, freeCount: 2, price: 1, courts: [{ id: "a", name: "A" }, { id: "b", name: "B" }] },
    { time: "10:30", start: "2026-11-21T03:30:00.000Z", full: true, freeCount: 0, price: 1, courts: [] },
    { time: "11:00", start: "2026-11-21T04:00:00.000Z", full: false, freeCount: 1, price: 1, courts: [{ id: "b", name: "B" }] },
  ];
  assert.deepEqual(courtSlotsToFree(slots, 90, null).map((s) => s.label), ["10:00", "11:00"]);
  assert.equal(courtSlotsToFree(slots, 90, null)[0].endUtc, "2026-11-21T04:30:00.000Z");
});

test("courtSlotsToFree: lapangan tertentu hanya jam yang lapangan itu kosong", () => {
  const slots = [
    { time: "10:00", start: "2026-11-21T03:00:00.000Z", full: false, freeCount: 1, price: 1, courts: [{ id: "a", name: "A" }] },
    { time: "11:00", start: "2026-11-21T04:00:00.000Z", full: false, freeCount: 1, price: 1, courts: [{ id: "b", name: "B" }] },
  ];
  assert.deepEqual(courtSlotsToFree(slots, 60, "b").map((s) => s.label), ["11:00"]);
  assert.deepEqual(courtSlotsToFree(slots, 60, "zzz"), []);
});

// --- ronde perbaikan 1 ---

test("effectiveCourtTotal: server menang bila beda, klien dipakai bila sama atau tanpa harga server", () => {
  assert.equal(effectiveCourtTotal(325000, 325000), 325000);
  assert.equal(effectiveCourtTotal(325000, 330000), 330000);
  assert.equal(effectiveCourtTotal(325000, 0), 325000);
  assert.equal(effectiveCourtTotal(325000, Number.NaN), 325000);
});

test("buildCourtSlotRows: harga server dipakai saat beda dari courtPrice", () => {
  const s = { ...slot("16:30", 3), price: 330000 };
  assert.equal(rowsFor([s])[0].price, "Rp330.000");
  assert.equal(rowsFor([s])[0].aria, "16.30, Rp330.000, 3 lapangan kosong");
});

test("courtSummaryLines: Mana saja tidak menebak nama lapangan", () => {
  const sel = { dateLabel: "Sabtu 21 Nov", time: "16:30", durationLabel: "1,5 jam", total: 325000 };
  assert.deepEqual(courtSummaryLines({ ...sel, courtName: null }), {
    top: "Sabtu 21 Nov, 16.30 WIB, 1,5 jam",
    main: "Rp325.000, Mana saja",
  });
  assert.equal(courtSummaryLines({ ...sel, courtName: "Lapangan 3" }).main, "Rp325.000, Lapangan 3");
});

test("courtSummaryLines: belum ada jam", () => {
  assert.deepEqual(courtSummaryLines(null), { top: "Belum ada jam dipilih", main: "Pilih jam dulu" });
});

const terms = { kind: "FIXED" as const, value: 30000, max_discount: null, min_spend: 300000, service_ids: null, code: "MAINBARENG", source: "PUBLIC" as const };
const svc = { id: "s1", price: 150000 };

test("reconcileCourtVoucher: tetap bila total sewa memenuhi syarat", () => {
  assert.deepEqual(reconcileCourtVoucher(terms, svc, 325000, {}), { keep: true, notice: null });
});

test("reconcileCourtVoucher: dilepas dengan alasan bila total sewa di bawah minimal", () => {
  const r = reconcileCourtVoucher(terms, svc, 150000, {});
  assert.equal(r.keep, false);
  assert.equal(r.notice, "Voucher MAINBARENG dilepas. Belum bisa dipakai: minimal Rp300.000.");
});

test("reconcileCourtVoucher: dilepas bila bukan untuk layanan ini", () => {
  const r = reconcileCourtVoucher({ ...terms, service_ids: ["lain"] }, svc, 325000, { lain: "Potong rambut" });
  assert.equal(r.keep, false);
  assert.equal(r.notice, "Voucher MAINBARENG dilepas. Hanya untuk Potong rambut.");
});

test("pickConflictAlt: lapangan lain yang kosong, bukan yang diambil", () => {
  const s = slot("16:30", 3);
  assert.deepEqual(pickConflictAlt(s, "c1"), { id: "c2", name: "Lapangan 2" });
  assert.deepEqual(pickConflictAlt(s, "c2"), { id: "c1", name: "Lapangan 1" });
});

test("pickConflictAlt: tidak ada alternatif bila jam penuh, hilang, atau hanya yang diambil", () => {
  assert.equal(pickConflictAlt(slot("16:30", 0), "c1"), null);
  assert.equal(pickConflictAlt(undefined, "c1"), null);
  assert.equal(pickConflictAlt(slot("16:30", 1), "c1"), null);
});

test("courtSubmitErrorAction: BK070 konflik, BK071 dan BK072 muat ulang jadwal, lainnya toast", () => {
  assert.equal(courtSubmitErrorAction("BK070", true), "conflict");
  assert.equal(courtSubmitErrorAction("BK071", true), "reload-schedule");
  assert.equal(courtSubmitErrorAction("BK072", true), "reload-schedule");
  for (const code of ["BK054", "23P01", "42501", undefined]) assert.equal(courtSubmitErrorAction(code, true), "toast", String(code));
});

test("courtSubmitErrorAction: layanan non-sewa selalu toast", () => {
  for (const code of ["BK070", "BK071", "BK072"]) assert.equal(courtSubmitErrorAction(code, false), "toast");
});
