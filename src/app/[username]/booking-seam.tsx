import type { Availability, Service } from "@/types/database";

import { BookingPicker } from "./booking-picker";

/**
 * Props yang dibutuhkan pemilih tanggal/jam dan form checkout: id serta
 * username merchant (dipakai memanggil RPC `get_booked_ranges` lewat
 * `GET /api/slots`, dan nantinya `POST /api/bookings` di Task 8), daftar
 * layanan aktif untuk dipilih pelanggan, dan jam kerja (dipakai menentukan
 * hari mana yang buka sebelum memanggil `/api/slots`).
 */
export type BookingSeamProps = {
  merchantId: string;
  username: string;
  services: Service[];
  availability: Pick<Availability, "day_of_week">[];
};

/** Memasang `BookingPicker` (client) — lihat booking-picker.tsx untuk Task 7. */
export function BookingSeam({ merchantId, username, services, availability }: BookingSeamProps) {
  if (services.length === 0) {
    return null;
  }

  return (
    <BookingPicker
      merchantId={merchantId}
      username={username}
      services={services}
      availability={availability}
    />
  );
}
