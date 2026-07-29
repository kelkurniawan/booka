import { format } from "date-fns";
import { id } from "date-fns/locale";

const RUPIAH = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function formatRupiah(value: number): string {
  return RUPIAH.format(value);
}

export function formatDateTime(value: string | Date): string {
  return format(new Date(value), "EEEE, d MMMM yyyy 'pukul' HH:mm", { locale: id });
}

export function formatDate(value: string | Date): string {
  return format(new Date(value), "d MMM yyyy", { locale: id });
}

export function formatTime(value: string | Date): string {
  return format(new Date(value), "HH:mm", { locale: id });
}

/** "90" -> "1 jam 30 menit" */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} menit`;
  if (rest === 0) return `${hours} jam`;
  return `${hours} jam ${rest} menit`;
}
