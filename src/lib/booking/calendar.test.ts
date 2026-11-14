import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBookingIcs } from "./calendar";

test("buildBookingIcs menghasilkan VEVENT UTC dengan CRLF", () => {
  const ics = buildBookingIcs({
    uid: "abc",
    title: "Makeup Wisuda, Rias; by Sekar",
    startUtc: "2026-11-21T03:00:00.000Z",
    endUtc: "2026-11-21T04:30:00.000Z",
  });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.includes("UID:abc@marky.id\r\n"));
  assert.ok(ics.includes("DTSTART:20261121T030000Z\r\n"));
  assert.ok(ics.includes("DTEND:20261121T043000Z\r\n"));
  // Koma dan titik koma wajib di-escape (RFC 5545 bagian 3.3.11).
  assert.ok(ics.includes("SUMMARY:Makeup Wisuda\\, Rias\\; by Sekar\r\n"));
  assert.ok(ics.trimEnd().endsWith("END:VCALENDAR"));
});

test("buildBookingIcs meng-escape backslash lebih dulu lalu baris baru", () => {
  const ics = buildBookingIcs({
    uid: "x",
    title: "a\\b\nc",
    startUtc: "2026-11-21T03:00:00.000Z",
    endUtc: "2026-11-21T04:30:00.000Z",
  });
  // Backslash jadi "\\", baris baru jadi "\n", tanpa escape ganda.
  assert.ok(ics.includes("SUMMARY:a\\\\b\\nc\r\n"));
});

test("buildBookingIcs tidak bisa disisipi baris lewat CR tunggal atau karakter kontrol", () => {
  const ics = buildBookingIcs({
    uid: "x",
    title: "Potong\rATTENDEE:mailto:x@y.z\u0000",
    startUtc: "2026-11-21T03:00:00.000Z",
    endUtc: "2026-11-21T04:30:00.000Z",
  });
  assert.ok(ics.includes("SUMMARY:Potong\\nATTENDEE:mailto:x@y.z\r\n"));
  // Setiap baris dipisah CRLF; tidak ada CR atau LF yatim di dalam isi.
  assert.ok(ics.split("\r\n").every((line) => !/[\r\n\u0000]/.test(line)));
});
