import type { Availability, DayOfWeek } from "@/types/database";

/**
 * Semua perhitungan slot dipatok ke Asia/Jakarta (WIB), bukan zona waktu
 * server. WIB tidak mengenal DST — offset-nya tetap UTC+7 sepanjang tahun
 * (IANA tzdata hanya punya satu aturan permanen untuk Asia/Jakarta sejak
 * 1932/1963). Karena offset-nya tetap, konversi wall-clock Jakarta -> instant
 * UTC bisa dilakukan dengan menempelkan "+07:00" langsung ke string ISO,
 * tanpa perlu library timezone tambahan (date-fns-tz tidak terpasang di
 * project ini). Kalau aturan ini pernah berubah, ganti JAKARTA_UTC_OFFSET di
 * satu tempat ini.
 */
const JAKARTA_UTC_OFFSET = "+07:00";
const JAKARTA_TIME_ZONE = "Asia/Jakarta";

/** Format "en-CA" menghasilkan "YYYY-MM-DD" langsung, tanpa parsing manual. */
const jakartaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: JAKARTA_TIME_ZONE,
});

/** Tanggal kalender (YYYY-MM-DD) di Jakarta untuk sebuah instant UTC. */
export function jakartaDateISO(instant: Date): string {
  return jakartaDateFormatter.format(instant);
}

/**
 * Mengonversi jam dinding Jakarta ("HH:MM") pada tanggal kalender tertentu
 * ("YYYY-MM-DD") menjadi instant UTC.
 */
export function jakartaWallClockToUtc(dateISO: string, timeHHMM: string): Date {
  return new Date(`${dateISO}T${timeHHMM}:00${JAKARTA_UTC_OFFSET}`);
}

/**
 * Hari dalam seminggu ISO (1=Senin..7=Minggu, sesuai `extract(isodow from ...)`
 * Postgres) untuk tanggal kalender "YYYY-MM-DD". SENGAJA bukan `Date.getDay()`
 * JS biasa (0=Minggu..6=Sabtu) — kolom `availability.day_of_week` memakai
 * konvensi ISO/Postgres, jadi konversinya harus eksplisit di sini.
 */
export function isoDayOfWeek(dateISO: string): DayOfWeek {
  const [year, month, day] = dateISO.split("-").map(Number);
  // Date.UTC dipakai murni sebagai kalkulator kalender (bukan instant nyata)
  // supaya hasilnya tidak tergantung zona waktu proses Node yang menjalankan
  // kode ini.
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Minggu..6=Sabtu
  return (jsDay === 0 ? 7 : jsDay) as DayOfWeek;
}

function minutesToHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (totalMinutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export type AvailabilityWindow = Pick<Availability, "day_of_week" | "start_time" | "end_time">;

/** Bentuk minimal hasil `get_booked_ranges` yang dibutuhkan algoritma ini. */
export type BookedRange = { start_datetime: string; end_datetime: string };

/** Slot reservasi: `remaining` = sisa meja yang cocok (null di mode kursi). */
export type SeatSlot = FreeSlot & { remaining: number | null };

export type FreeSlot = {
  /** Instant mulai slot dalam UTC, ISO-8601 — inilah yang dikirim ke checkout. */
  startUtc: string;
  /** Instant selesai slot dalam UTC, ISO-8601. */
  endUtc: string;
  /** Jam dinding Jakarta untuk ditampilkan, mis. "09:00". */
  label: string;
};

/**
 * Fungsi murni: availability + rentang yang sudah dibooking + durasi layanan
 * -> daftar slot kosong untuk satu tanggal kalender Jakarta.
 *
 * Tidak melakukan I/O sama sekali supaya mudah diuji lewat unit test biasa —
 * `now` sengaja bisa disuntikkan (default `new Date()`) supaya pengujian
 * "slot yang sudah lewat" tidak bergantung pada jam sistem saat test jalan.
 */
export function computeFreeSlots(params: {
  dateISO: string;
  durationMinutes: number;
  /** Jarak antar jam mulai; default = durasi (perilaku lama). */
  stepMinutes?: number;
  availability: AvailabilityWindow[];
  bookedRanges: BookedRange[];
  now?: Date;
}): FreeSlot[] {
  const { dateISO, durationMinutes, availability, bookedRanges } = params;
  const stepMinutes = params.stepMinutes ?? durationMinutes;
  const now = params.now ?? new Date();
  const nowMs = now.getTime();

  const dayOfWeek = isoDayOfWeek(dateISO);

  const bookedIntervals = bookedRanges.map((range) => ({
    start: new Date(range.start_datetime).getTime(),
    end: new Date(range.end_datetime).getTime(),
  }));

  const slots: FreeSlot[] = [];

  for (const window of availability) {
    if (window.day_of_week !== dayOfWeek) continue;

    const [startH, startM] = window.start_time.slice(0, 5).split(":").map(Number);
    const [endH, endM] = window.end_time.slice(0, 5).split(":").map(Number);
    const windowStartMinutes = startH * 60 + startM;
    const windowEndMinutes = endH * 60 + endM;

    for (
      let minutes = windowStartMinutes;
      minutes + durationMinutes <= windowEndMinutes;
      minutes += stepMinutes
    ) {
      const label = minutesToHHMM(minutes);
      const slotStartMs = jakartaWallClockToUtc(dateISO, label).getTime();
      const slotEndMs = jakartaWallClockToUtc(dateISO, minutesToHHMM(minutes + durationMinutes)).getTime();

      // Slot yang mulainya sudah lewat (termasuk seluruh tanggal yang sudah
      // lewat, karena instant-nya otomatis lebih kecil dari `now`) dibuang.
      const isPast = slotStartMs <= nowMs;

      // Batas setengah terbuka '[)' sama seperti constraint
      // bookings_no_overlap di database: slot yang berakhir TEPAT saat
      // booking lain mulai dianggap TIDAK beririsan, jadi tetap kosong.
      const overlapsBooking = bookedIntervals.some(
        (booked) => slotStartMs < booked.end && slotEndMs > booked.start,
      );

      if (!isPast && !overlapsBooking) {
        slots.push({
          startUtc: new Date(slotStartMs).toISOString(),
          endUtc: new Date(slotEndMs).toISOString(),
          label,
        });
      }
    }
  }

  return slots;
}

/** Jam kerja satu staf. `availability` kosong berarti ikut jam kerja usaha. */
export type StaffSchedule = { id: string; availability: AvailabilityWindow[] };

export type StaffBookedRange = BookedRange & { staff_id: string | null };

/**
 * Slot kosong dengan memperhitungkan staf (paket Studio). Aturannya cermin
 * persis `create_booking` di migration 20261005180027_staff.sql:
 *
 *   - Tanpa staf: satu kalender seperti `computeFreeSlots` biasa.
 *   - `staffId` diisi: jam kerja staf itu (atau jam usaha bila ia tidak
 *     punya jam sendiri), dikurangi booking staf itu saja.
 *   - `staffId` null ("siapa saja"): slot kosong bila SETIDAKNYA satu staf
 *     kosong di jam itu -- gabungan slot semua staf.
 *
 * Booking tanpa staf (sebelum merchant memakai staf) tidak mengunci kalender
 * staf mana pun, sama seperti exclusion constraint per (merchant, staf).
 */
export function computeStaffSlots(params: {
  dateISO: string;
  durationMinutes: number;
  merchantAvailability: AvailabilityWindow[];
  staff: StaffSchedule[];
  bookedRanges: StaffBookedRange[];
  staffId: string | null;
  now?: Date;
}): FreeSlot[] {
  const { staff, staffId, bookedRanges, merchantAvailability } = params;

  if (staff.length === 0) {
    return computeFreeSlots({
      dateISO: params.dateISO,
      durationMinutes: params.durationMinutes,
      availability: merchantAvailability,
      bookedRanges,
      now: params.now,
    });
  }

  const candidates = staffId ? staff.filter((member) => member.id === staffId) : staff;
  const byStart = new Map<string, FreeSlot>();

  for (const member of candidates) {
    const slots = computeFreeSlots({
      dateISO: params.dateISO,
      durationMinutes: params.durationMinutes,
      availability: member.availability.length > 0 ? member.availability : merchantAvailability,
      bookedRanges: bookedRanges.filter((range) => range.staff_id === member.id),
      now: params.now,
    });
    for (const slot of slots) byStart.set(slot.startUtc, slot);
  }

  return [...byStart.values()].sort((a, b) => a.startUtc.localeCompare(b.startUtc));
}

export const ANY_STAFF_KEY = "any";
export const NEAREST_SLOT_DAYS = 14;
export type NearestSlot = FreeSlot & { dateISO: string };

/**
 * Jam kosong terdekat per staf (kunci: id staf) plus "siapa saja"
 * (ANY_STAFF_KEY). Tanpa staf hanya ada ANY_STAFF_KEY. null = tidak ada
 * jam kosong dalam `days` hari sejak `fromDateISO`.
 */
export function nearestStaffSlots(params: {
  fromDateISO: string;
  days: number;
  durationMinutes: number;
  merchantAvailability: AvailabilityWindow[];
  staff: StaffSchedule[];
  bookedRanges: StaffBookedRange[];
  now?: Date;
}): Record<string, NearestSlot | null> {
  const keys = [ANY_STAFF_KEY, ...params.staff.map((member) => member.id)];
  const result: Record<string, NearestSlot | null> = Object.fromEntries(keys.map((key) => [key, null]));
  const startMs = Date.parse(`${params.fromDateISO}T12:00:00Z`);

  for (let i = 0; i < params.days; i++) {
    const dateISO = new Date(startMs + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    for (const key of keys) {
      if (result[key]) continue;
      const [first] = computeStaffSlots({
        dateISO,
        durationMinutes: params.durationMinutes,
        merchantAvailability: params.merchantAvailability,
        staff: params.staff,
        bookedRanges: params.bookedRanges,
        staffId: key === ANY_STAFF_KEY ? null : key,
        now: params.now,
      });
      if (first) result[key] = { ...first, dateISO };
    }
    if (keys.every((key) => result[key])) break;
  }
  return result;
}
