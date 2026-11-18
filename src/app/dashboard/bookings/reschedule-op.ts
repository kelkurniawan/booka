import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { cancelBookingSchema } from "@/lib/validations/booking";
import type { Database } from "@/types/database";

import { rescheduleErrorMessage } from "./manual-booking";

/** Isi rescheduleBooking tanpa sesi dan efek samping, supaya bisa diuji dengan klien palsu. */
export async function rescheduleBookingOp(
  supabase: Pick<SupabaseClient<Database>, "rpc">,
  id: string,
  newStartISO: string,
  courtId: string | null = null,
): Promise<{ ok: boolean; message?: string }> {
  const parsed = cancelBookingSchema.safeParse({ id });
  const start = z.iso.datetime({ offset: true }).safeParse(newStartISO);
  const court = z.uuid().nullable().safeParse(courtId);
  if (!parsed.success || !start.success || !court.success) return { ok: false, message: "Jadwal tidak valid." };

  const { error } = await supabase.rpc("reschedule_booking_by_merchant", {
    p_booking_id: parsed.data.id,
    p_new_start: start.data,
    p_court_id: court.data,
  });
  if (error) return { ok: false, message: rescheduleErrorMessage(error.code) };
  return { ok: true };
}

type CourtLink = { courts: { id: string; name: string; is_active: boolean; sort_order: number } | { id: string; name: string; is_active: boolean; sort_order: number }[] | null };

/** Rapikan hasil join: hanya lapangan aktif, urut sort_order lalu nama. */
export function courtsFromLinks(rows: CourtLink[]): { id: string; name: string }[] {
  return rows
    .flatMap((r) => (Array.isArray(r.courts) ? r.courts : r.courts ? [r.courts] : []))
    .filter((c) => c.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((c) => ({ id: c.id, name: c.name }));
}
