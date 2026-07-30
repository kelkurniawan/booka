"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";

import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { availabilitySchema } from "@/lib/validations/availability";
import type { DayOfWeek } from "@/types/database";

import { DAY_LABELS, WEEKDAYS } from "./availability-state";
import type { AvailabilityFormState, CopyToWeekdaysResult } from "./availability-state";

/** Pesan ramah untuk error 23P01 (exclusion violation) dari constraint availability_no_overlap. */
const OVERLAP_MESSAGE =
  "Rentang jam ini tumpang tindih dengan rentang yang sudah ada di hari itu.";

function toFieldErrors(error: z.ZodError): AvailabilityFormState {
  const fieldErrors: AvailabilityFormState["fieldErrors"] = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (key === "day_of_week" || key === "start_time" || key === "end_time") {
      fieldErrors[key] ??= issue.message;
    }
  }
  return { status: "error", message: "Periksa kembali isian Anda", fieldErrors };
}

export async function addSlot(
  _prevState: AvailabilityFormState,
  formData: FormData,
): Promise<AvailabilityFormState> {
  const parsed = availabilitySchema.safeParse({
    day_of_week: formData.get("day_of_week"),
    start_time: formData.get("start_time"),
    end_time: formData.get("end_time"),
  });
  if (!parsed.success) return toFieldErrors(parsed.error);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(ROUTES.login);

  const { error } = await supabase.from("availability").insert({
    merchant_id: user.id,
    // Zod sudah memvalidasi rentang 1..7 (availability_day_range); cast ini
    // hanya menyempitkan tipe number -> DayOfWeek, bukan melewati validasi.
    day_of_week: parsed.data.day_of_week as DayOfWeek,
    start_time: parsed.data.start_time,
    end_time: parsed.data.end_time,
  });

  if (error) {
    // 23P01 — exclusion violation dari constraint availability_no_overlap.
    if (error.code === "23P01") {
      return { status: "error", message: OVERLAP_MESSAGE };
    }
    return { status: "error", message: "Gagal menyimpan jam kerja. Coba lagi." };
  }

  revalidatePath(ROUTES.availability);
  return { status: "success" };
}

export async function removeSlot(id: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(ROUTES.login);

  const { error } = await supabase
    .from("availability")
    .delete()
    .eq("id", id)
    // RLS sudah membatasi ke merchant pemilik, tapi filter eksplisit ini
    // membuat maksudnya jelas terbaca di kode dan bukan hanya bergantung
    // pada policy database.
    .eq("merchant_id", user.id);

  if (error) {
    return { ok: false, message: "Gagal menghapus jam kerja. Coba lagi." };
  }

  revalidatePath(ROUTES.availability);
  return { ok: true };
}

/**
 * Menyalin seluruh rentang jam pada `sourceDay` ke semua hari kerja lain
 * (Senin-Jumat, day_of_week 1..5).
 *
 * Satu hari kerja bisa punya beberapa rentang jam, dan tiap hari target bisa
 * sudah punya rentang yang bentrok dengan sebagian (bukan semua) rentang yang
 * disalin. Supaya operasi ini tidak gagal total gara-gara satu hari bentrok,
 * setiap hari target di-insert lewat SATU statement INSERT berisi semua
 * rentang sekaligus — Postgres memvalidasi seluruh baris dalam satu statement
 * secara atomik, jadi tiap hari target "semua rentang tersalin" atau "tidak
 * ada yang tersalin sama sekali" (23P01), tidak pernah tersalin sebagian.
 * Hari yang bentrok dilewati dan dilaporkan, sisanya tetap lanjut.
 *
 * Insert per hari ini TIDAK dibungkus satu transaksi lintas hari, jadi kalau
 * ada error selain 23P01 di tengah loop (mis. koneksi terputus), hari-hari
 * sebelumnya yang sudah berhasil TETAP tersimpan di database — fungsi ini
 * selalu memanggil `revalidatePath` dan melaporkan hari mana yang sudah
 * tersalin sebelum berhenti, bukan menyiratkan seluruh operasi gagal total.
 */
export async function copyToWeekdays(sourceDay: DayOfWeek): Promise<CopyToWeekdaysResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(ROUTES.login);

  const { data: sourceSlots, error: fetchError } = await supabase
    .from("availability")
    .select("start_time, end_time")
    .eq("merchant_id", user.id)
    .eq("day_of_week", sourceDay);

  if (fetchError) {
    return {
      ok: false,
      skippedDays: [],
      message: "Gagal membaca jam kerja hari ini. Coba lagi.",
    };
  }

  if (!sourceSlots || sourceSlots.length === 0) {
    return {
      ok: false,
      skippedDays: [],
      message: "Belum ada rentang jam pada hari ini untuk disalin.",
    };
  }

  const targetDays = WEEKDAYS.filter((day) => day !== sourceDay);
  const skippedDays: DayOfWeek[] = [];
  const copiedDays: DayOfWeek[] = [];

  for (const day of targetDays) {
    const rows = sourceSlots.map((slot) => ({
      merchant_id: user.id,
      day_of_week: day,
      start_time: slot.start_time,
      end_time: slot.end_time,
    }));

    const { error } = await supabase.from("availability").insert(rows);
    if (error) {
      if (error.code === "23P01") {
        skippedDays.push(day);
        continue;
      }

      // Error selain exclusion violation (mis. koneksi terputus di tengah
      // jalan) — hari-hari di `copiedDays` sebelum titik ini SUDAH benar-benar
      // tersimpan di database (tiap insert per hari sudah commit sendiri-sendiri,
      // tidak ada transaksi lintas hari). revalidatePath wajib tetap dipanggil
      // di sini juga, bukan hanya di jalur sukses di bawah, supaya halaman
      // tidak menampilkan data basi. Pesannya juga harus mengakui hari yang
      // sudah tersalin, bukan menyiratkan seluruh operasi gagal total.
      if (copiedDays.length > 0) {
        revalidatePath(ROUTES.availability);
      }
      return {
        ok: copiedDays.length > 0,
        skippedDays,
        message:
          copiedDays.length > 0
            ? `Disalin ke ${copiedDays.map((d) => DAY_LABELS[d]).join(", ")}, tapi gagal menyalin ke ${DAY_LABELS[day]}. Coba lagi untuk hari yang tersisa.`
            : "Gagal menyalin jam kerja. Coba lagi.",
      };
    }
    copiedDays.push(day);
  }

  revalidatePath(ROUTES.availability);

  if (skippedDays.length === targetDays.length) {
    return {
      ok: false,
      skippedDays,
      message: "Semua hari kerja lain sudah punya rentang jam yang tumpang tindih.",
    };
  }

  if (skippedDays.length > 0) {
    return {
      ok: true,
      skippedDays,
      message: `Disalin, tapi ${skippedDays.map((day) => DAY_LABELS[day]).join(", ")} dilewati karena tumpang tindih.`,
    };
  }

  return {
    ok: true,
    skippedDays: [],
    message: "Jam kerja disalin ke semua hari kerja.",
  };
}
