export type BookingIcsInput = {
  uid: string;
  title: string;
  startUtc: string;
  endUtc: string;
  location?: string;
  description?: string;
};

/** Format tanggal iCalendar UTC, mis. "20261121T030000Z". */
function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Escape teks iCalendar sesuai RFC 5545 bagian 3.3.11. */
function icsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\;")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Berkas .ics satu VEVENT. DTSTAMP diambil dari startUtc supaya keluaran
 * deterministik. shortcut: baris tidak dilipat ke 75 oktet (RFC 5545 bagian
 * 3.1), aman untuk teks pendek; tambahkan pelipatan bila deskripsi sering panjang.
 */
export function buildBookingIcs(input: BookingIcsInput): string {
  const stamp = icsDate(input.startUtc);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Marky//Booking//ID",
    "BEGIN:VEVENT",
    `UID:${input.uid}@marky.id`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${stamp}`,
    `DTEND:${icsDate(input.endUtc)}`,
    `SUMMARY:${icsText(input.title)}`,
  ];
  if (input.location) lines.push(`LOCATION:${icsText(input.location)}`);
  if (input.description) lines.push(`DESCRIPTION:${icsText(input.description)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
