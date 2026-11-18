import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { manualBookingErrorMessage, manualBookingSchema, type ManualBookingInput, type ManualBookingResult } from "./manual-booking";

/** Isi createManualBooking tanpa sesi dan efek samping, supaya bisa diuji dengan klien palsu. */
export async function createManualBookingOp(
  supabase: Pick<SupabaseClient<Database>, "rpc">,
  input: ManualBookingInput,
): Promise<ManualBookingResult> {
  const parsed = manualBookingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Periksa lagi isian form." };

  const { data, error } = await supabase.rpc("create_manual_booking", {
    p_service_id: parsed.data.serviceId,
    p_start_datetime: parsed.data.startISO,
    p_customer_name: parsed.data.customerName,
    p_customer_whatsapp: parsed.data.customerWhatsapp,
    p_staff_id: parsed.data.staffId,
    p_party_size: parsed.data.partySize,
    p_table_id: parsed.data.tableId,
    p_customer_note: parsed.data.customerNote || null,
    p_court_id: parsed.data.courtId,
    p_duration_minutes: parsed.data.durationMinutes,
  });
  const id = data?.[0]?.id;
  if (error || !id) return { ok: false, message: manualBookingErrorMessage(error?.code) };
  return { ok: true, id };
}
