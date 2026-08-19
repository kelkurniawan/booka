const RUPIAH = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function formatRupiah(value: number): string {
  return RUPIAH.format(value);
}

/**
 * Semua fungsi format tanggal/jam di bawah ini WAJIB menampilkan zona waktu
 * Asia/Jakarta (WIB) -- TIDAK PERNAH zona waktu proses yang merendernya.
 * Sebelumnya fungsi-fungsi ini memakai `date-fns/format` polos, yang selalu
 * memakai zona waktu HOST (server produksi bisa UTC, dev lokal bisa WIB,
 * browser pelanggan bisa di mana saja) -- itu membuat jam yang ditampilkan
 * salah 7 jam begitu di-deploy ke server yang bukan WIB, sekaligus membuat
 * server (SSR) dan klien (hydration) berpotensi menampilkan angka berbeda
 * untuk instant yang sama persis, walau label di UI-nya statis menulis
 * "WIB". Lihat docs/DECISIONS.md butir 17.
 *
 * Asia/Jakarta adalah UTC+7 TETAP, tanpa DST (Indonesia tidak pernah
 * menerapkan pergantian musim untuk WIB) -- jadi menggeser instant UTC-nya
 * 7 jam lalu membaca komponen kalender lewat getter UTC sudah presisi untuk
 * semua tanggal yang relevan di aplikasi ini (booking, bukan arsip
 * historis). Pola yang sama (geser +7 jam, baca lewat getter UTC) sudah
 * dipakai `startOfMonthJakartaIso` di src/app/dashboard/bookings/page.tsx --
 * dipertahankan konsisten di sini, bukan ditulis ulang dengan cara lain
 * (mis. Intl.DateTimeFormat + timeZone) supaya tidak ada dua sumber
 * kebenaran soal "bagaimana caranya menghitung waktu Jakarta" di codebase
 * ini, dan supaya nama hari/bulan singkatnya (mis. "Agt", bukan "Agu")
 * persis sama dengan yang sebelumnya dihasilkan date-fns/locale/id -- CLDR
 * yang dipakai Intl memakai singkatan berbeda untuk locale id-ID.
 */
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

const WEEKDAYS_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MONTHS_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
const MONTHS_ID_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agt",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

type JakartaWallClock = {
  /** 0 = Minggu .. 6 = Sabtu */
  weekday: number;
  year: number;
  /** 0-11 */
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function toJakartaWallClock(value: string | Date): JakartaWallClock {
  const shifted = new Date(new Date(value).getTime() + JAKARTA_OFFSET_MS);
  return {
    weekday: shifted.getUTCDay(),
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatDateTime(value: string | Date): string {
  const p = toJakartaWallClock(value);
  return `${WEEKDAYS_ID[p.weekday]}, ${p.day} ${MONTHS_ID[p.month]} ${p.year} pukul ${pad2(p.hour)}:${pad2(p.minute)}`;
}

export function formatDate(value: string | Date): string {
  const p = toJakartaWallClock(value);
  return `${p.day} ${MONTHS_ID_SHORT[p.month]} ${p.year}`;
}

export function formatTime(value: string | Date): string {
  const p = toJakartaWallClock(value);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** "90" -> "1 jam 30 menit" */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} menit`;
  if (rest === 0) return `${hours} jam`;
  return `${hours} jam ${rest} menit`;
}
