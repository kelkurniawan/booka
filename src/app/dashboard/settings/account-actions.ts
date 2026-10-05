"use server";

import { redirect } from "next/navigation";

import { purgeMerchantMedia } from "@/lib/media/purge";
import { ROUTES } from "@/lib/routes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type DeleteAccountState = { status: "idle" } | { status: "error"; message: string };

/**
 * Menghapus akun merchant beserta seluruh datanya.
 *
 * Urutannya disengaja:
 *   1. Tolak bila masih ada booking yang berjalan -- pelanggan yang sudah
 *      bayar DP (atau sedang membayar) akan kehilangan jejak pesanannya.
 *   2. Hapus berkas Storage. Dikerjakan SEBELUM akun, karena setelah akun
 *      hilang tidak ada lagi yang tahu folder mana yang harus dibersihkan.
 *   3. Hapus user Auth. Seluruh tabel `public` merujuk `auth.users` lewat
 *      merchants dengan ON DELETE CASCADE, termasuk kredensial payment
 *      gateway di schema private.
 */
export async function deleteAccount(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(ROUTES.login);

  const { data: merchant } = await supabase
    .from("merchants")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  const confirmation = String(formData.get("confirmation") ?? "").trim().toLowerCase();
  if (!merchant?.username || confirmation !== merchant.username) {
    return { status: "error", message: "Ketik username Anda persis untuk konfirmasi." };
  }

  const nowISO = new Date().toISOString();
  const [{ count: upcomingPaid }, { count: livePending }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", user.id)
      .eq("status", "PAID")
      .gt("end_datetime", nowISO),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", user.id)
      .eq("status", "PENDING")
      .gt("expires_at", nowISO),
  ]);

  if ((upcomingPaid ?? 0) > 0 || (livePending ?? 0) > 0) {
    return {
      status: "error",
      message:
        "Masih ada booking yang belum selesai atau sedang menunggu pembayaran. Selesaikan atau batalkan dulu dari halaman Booking masuk.",
    };
  }

  const admin = createAdminClient();

  try {
    await purgeMerchantMedia(admin, user.id);
  } catch (error) {
    console.error("[hapus-akun] gagal menghapus berkas", { userId: user.id, error });
    return { status: "error", message: "Gagal menghapus berkas Anda. Coba lagi." };
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("[hapus-akun] gagal menghapus user", { userId: user.id, error: deleteError });
    return { status: "error", message: "Gagal menghapus akun. Coba lagi." };
  }

  // Sesi di cookie masih menunjuk user yang sudah tidak ada; dibersihkan
  // supaya proxy tidak terus mencoba memperbaruinya.
  await supabase.auth.signOut();
  redirect(ROUTES.home);
}
