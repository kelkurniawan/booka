import { test } from "node:test";
import assert from "node:assert/strict";

import {
  bookingErrorStep,
  holdSentence,
  isSeatService,
  moveTableByKey,
  partyRangeLabel,
  remainingLabel,
  seatRangeLabel,
  tableAriaLabel,
} from "./reservation";

const seat = { party_min: 1, party_max: 12, seat_duration_minutes: 90 };
const plain = { party_min: null, party_max: null, seat_duration_minutes: null };

test("isSeatService hanya bila mode menyala dan lama duduk terisi", () => {
  assert.equal(isSeatService(seat, "TABLE"), true);
  assert.equal(isSeatService(seat, "AREA"), true);
  assert.equal(isSeatService(seat, "NONE"), false);
  assert.equal(isSeatService(plain, "TABLE"), false);
});

test("label rentang tamu dan kursi tanpa tanda pisah", () => {
  assert.equal(partyRangeLabel(seat), "Untuk 1 sampai 12 orang");
  assert.equal(partyRangeLabel({ party_min: 4, party_max: 4 }), "Untuk 4 orang");
  assert.equal(partyRangeLabel(plain), null);
  assert.equal(seatRangeLabel(4, 6), "4 sampai 6 kursi");
  assert.equal(seatRangeLabel(2, 2), "2 kursi");
});

test("remainingLabel hanya untuk sisa 1 sampai 3", () => {
  assert.equal(remainingLabel(null), null);
  assert.equal(remainingLabel(4), null);
  assert.equal(remainingLabel(2), "Sisa 2 meja");
  assert.equal(remainingLabel(0), null);
});

test("holdSentence", () => {
  assert.equal(holdSentence(15), "Meja ditahan 15 menit dari jam datang.");
  assert.equal(holdSentence(0), null);
});

test("tableAriaLabel memuat nama, kursi, catatan, dan status", () => {
  assert.equal(
    tableAriaLabel({ name: "D5", min_seats: 4, max_seats: 6, note: "tengah ruangan" }, "FREE", true),
    "Meja D5, 4 sampai 6 kursi, tengah ruangan, dipilih",
  );
  assert.equal(
    tableAriaLabel({ name: "D2", min_seats: 2, max_seats: 2, note: null }, "TAKEN", false),
    "Meja D2, 2 kursi, terisi",
  );
});

test("moveTableByKey bergeser satu sel dan tidak keluar kanvas", () => {
  const t = { grid_x: 0, grid_y: 5, grid_w: 3, grid_h: 3 };
  assert.deepEqual(moveTableByKey(t, "ArrowRight"), { ...t, grid_x: 1 });
  assert.deepEqual(moveTableByKey(t, "ArrowLeft"), t);
  assert.deepEqual(moveTableByKey({ ...t, grid_x: 21 }, "ArrowRight"), { ...t, grid_x: 21 });
  assert.deepEqual(moveTableByKey({ ...t, grid_y: 19 }, "ArrowDown"), { ...t, grid_y: 19 });
  assert.equal(moveTableByKey(t, "Enter"), null);
});

test("bookingErrorStep mengarahkan pelanggan ke langkah yang bisa memperbaiki", () => {
  assert.equal(bookingErrorStep("BK061"), "meja");
  assert.equal(bookingErrorStep("BK060"), "jadwal");
  assert.equal(bookingErrorStep("23P01"), "jadwal");
  assert.equal(bookingErrorStep("P0006"), "jadwal");
  assert.equal(bookingErrorStep("BK063"), null);
  assert.equal(bookingErrorStep(undefined), null);
});
