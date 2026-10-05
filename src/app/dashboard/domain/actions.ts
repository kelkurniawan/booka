"use server";

import { resolveTxt } from "node:dns/promises";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ownershipRecord, vercelConfig } from "@/lib/domains/config";
import { isAppHost } from "@/lib/domains/routing";
import { addProjectDomain, getDomainStatus, removeProjectDomain } from "@/lib/domains/vercel";
import { serverEnv } from "@/lib/env/server";
import { ROUTES } from "@/lib/routes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { domainSchema } from "@/lib/validations/domain";

export type DomainActionResult = { ok: true; message?: string } | { ok: false; message: string };

async function sessionClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(ROUTES.login);
  return { supabase, userId: user.id };
}

const NOT_CONFIGURED = "Fitur domain sendiri belum diaktifkan oleh admin Booka.";

export async function registerDomain(input: string): Promise<DomainActionResult> {
  const parsed = domainSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const domain = parsed.data;

  if (isAppHost(domain, serverEnv().appUrl)) {
    return { ok: false, message: "Domain ini milik Booka dan tidak bisa dipakai." };
  }

  const config = vercelConfig();
  if (!config) return { ok: false, message: NOT_CONFIGURED };

  const { supabase, userId } = await sessionClient();

  // Klaim baru atas domain yang sudah aktif untuk merchant lain pasti gagal
  // saat diperiksa (unique index ACTIVE); tolak di depan supaya merchant
  // tidak menunggu DNS untuk sesuatu yang mustahil.
  const { count: activeElsewhere } = await createAdminClient()
    .from("merchant_domains")
    .select("merchant_id", { count: "exact", head: true })
    .eq("domain", domain)
    .eq("status", "ACTIVE")
    .neq("merchant_id", userId);
  if ((activeElsewhere ?? 0) > 0) {
    return { ok: false, message: "Domain ini sudah dipakai halaman booking lain." };
  }

  const { error } = await supabase.from("merchant_domains").insert({ merchant_id: userId, domain });
  if (error) {
    if (error.code === "23505") return { ok: false, message: "Lepas dulu domain lama sebelum memasang yang baru." };
    if (error.code === "BK010") return { ok: false, message: "Domain sendiri khusus paket Studio." };
    console.error("[domain] gagal mendaftarkan domain", { userId, error });
    return { ok: false, message: "Gagal mendaftarkan domain. Coba lagi." };
  }

  const added = await addProjectDomain(config, domain);
  if (!added.ok) {
    // Baris tanpa domain di Vercel hanya membingungkan; batalkan.
    await supabase.from("merchant_domains").delete().eq("merchant_id", userId);
    console.error("[domain] Vercel menolak domain", { userId, domain, reason: added.message });
    return { ok: false, message: "Vercel menolak domain ini. Periksa ejaannya atau coba lagi." };
  }

  revalidatePath(ROUTES.domain);
  return { ok: true };
}

/** Apakah TXT `_booka.<domain>` memuat token merchant ini. */
async function ownsDomain(domain: string, token: string): Promise<boolean> {
  const record = ownershipRecord(domain, token);
  try {
    const records = await resolveTxt(record.name);
    return records.some((chunks) => chunks.join("") === record.value);
  } catch {
    // ENOTFOUND/ENODATA: record belum ada atau belum menyebar.
    return false;
  }
}

export async function checkDomain(): Promise<DomainActionResult> {
  const config = vercelConfig();
  if (!config) return { ok: false, message: NOT_CONFIGURED };

  const { supabase, userId } = await sessionClient();
  const { data: row } = await supabase
    .from("merchant_domains")
    .select("domain, status, verification_token")
    .eq("merchant_id", userId)
    .maybeSingle();
  if (!row) return { ok: false, message: "Belum ada domain yang didaftarkan." };
  if (row.status === "ACTIVE") return { ok: true, message: "Domain sudah aktif." };

  const [owned, status] = await Promise.all([
    ownsDomain(row.domain, row.verification_token),
    getDomainStatus(config, row.domain),
  ]);

  if (!owned) {
    return { ok: false, message: "Record TXT verifikasi belum ditemukan. Perubahan DNS bisa butuh beberapa jam." };
  }
  if (!status.ok) {
    console.error("[domain] gagal memeriksa status di Vercel", { userId, reason: status.message });
    return { ok: false, message: "Gagal memeriksa status domain. Coba lagi." };
  }
  if (status.value.misconfigured) {
    return { ok: false, message: "Record CNAME/A belum mengarah ke Booka. Perubahan DNS bisa butuh beberapa jam." };
  }
  if (!status.value.verified) {
    return { ok: false, message: "Vercel masih memverifikasi domain ini. Coba lagi beberapa menit lagi." };
  }

  // Status hanya boleh ditulis service role (lihat migration). Filter
  // merchant_id + domain eksplisit karena klien admin tidak punya RLS.
  const { error } = await createAdminClient()
    .from("merchant_domains")
    .update({ status: "ACTIVE", verified_at: new Date().toISOString() })
    .eq("merchant_id", userId)
    .eq("domain", row.domain);
  if (error) {
    if (error.code === "23505") return { ok: false, message: "Domain ini sudah aktif untuk merchant lain." };
    console.error("[domain] gagal mengaktifkan domain", { userId, error });
    return { ok: false, message: "Gagal mengaktifkan domain. Coba lagi." };
  }

  revalidatePath(ROUTES.domain);
  return { ok: true, message: "Domain aktif. Halaman booking Anda kini bisa dibuka lewat domain ini." };
}

export async function removeDomain(): Promise<DomainActionResult> {
  const { supabase, userId } = await sessionClient();
  const { data: row } = await supabase
    .from("merchant_domains")
    .select("domain")
    .eq("merchant_id", userId)
    .maybeSingle();
  if (!row) return { ok: true };

  const { error } = await supabase.from("merchant_domains").delete().eq("merchant_id", userId);
  if (error) {
    console.error("[domain] gagal melepas domain", { userId, error });
    return { ok: false, message: "Gagal melepas domain. Coba lagi." };
  }

  // Lepas dari proyek Vercel hanya bila tidak ada merchant lain yang masih
  // mengklaim nama yang sama -- klaim mereka butuh domain tetap terpasang.
  const config = vercelConfig();
  if (config) {
    const { count } = await createAdminClient()
      .from("merchant_domains")
      .select("merchant_id", { count: "exact", head: true })
      .eq("domain", row.domain);
    if ((count ?? 0) === 0) {
      const removed = await removeProjectDomain(config, row.domain);
      if (!removed.ok) console.error("[domain] gagal melepas dari Vercel", { domain: row.domain, reason: removed.message });
    }
  }

  revalidatePath(ROUTES.domain);
  return { ok: true };
}
