import { jakartaDateISO, jakartaWallClockToUtc } from "@/lib/booking/slots";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Rentang [from, to) dalam UTC yang mencakup SATU hari kalender WIB penuh,
 * yaitu "besok" dihitung dari `now`. Dipakai cron reminder H-1: dijalankan
 * pagi hari WIB, mengingatkan semua jadwal di hari berikutnya.
 *
 * WIB tetap UTC+7 tanpa DST (DECISIONS.md #17), jadi sehari selalu 24 jam.
 */
export function tomorrowJakartaRange(now: Date): { from: Date; to: Date } {
  const tomorrow = jakartaDateISO(new Date(now.getTime() + DAY_MS));
  const from = jakartaWallClockToUtc(tomorrow, "00:00");
  return { from, to: new Date(from.getTime() + DAY_MS) };
}
