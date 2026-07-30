import type { Service } from "@/types/database";

/**
 * Props yang dibutuhkan Task 7 untuk memasang pemilih tanggal/jam dan form
 * checkout: id serta username merchant (dipakai memanggil RPC
 * `get_booked_ranges` dan endpoint `POST /api/bookings`), dan daftar layanan
 * aktif untuk dipilih pelanggan.
 */
export type BookingSeamProps = {
  merchantId: string;
  username: string;
  services: Service[];
};

/**
 * Placeholder tempat komponen client date/time picker Task 7 akan mount.
 * Sengaja tidak dibuat interaktif — hanya menjaga struktur dan tipe props
 * supaya Task 7 tinggal menggantinya, bukan membangun ulang halaman ini.
 */
export function BookingSeam({ services }: BookingSeamProps) {
  if (services.length === 0) {
    return null;
  }

  return (
    <div className="border-border text-muted-foreground border border-dashed p-5 text-sm text-pretty">
      Pemilihan tanggal dan jam akan tampil di sini.
    </div>
  );
}
