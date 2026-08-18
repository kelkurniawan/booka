import "server-only";

import { createHash } from "node:crypto";

import { serverEnv } from "@/lib/env/server";

/**
 * Ambil alamat IP pemanggil dari header proxy, untuk dipakai rate limit
 * `POST /api/bookings` (lihat `public.check_booking_rate_limit` di
 * supabase/migrations/20260813120000_harden_booking_abuse.sql).
 *
 * Vercel selalu mengisi `x-forwarded-for` dengan client IP di entri
 * PERTAMA (entri berikutnya, kalau ada, adalah hop proxy internal) --
 * https://vercel.com/docs/edge-network/headers#x-forwarded-for. `x-real-ip`
 * dipakai sebagai fallback untuk lingkungan lain (mis. di belakang proxy
 * lokal docker-compose). Kalau keduanya tidak ada, string kosong
 * dikembalikan -- `check_booking_rate_limit` sendiri sudah menangani ip_hash
 * kosong dengan membiarkan request lewat + mencatat warning, bukan menolak
 * semua orang begitu saja.
 */
export function extractClientIp(headers: Pick<Headers, "get">): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "";
}

/**
 * Hash IP sebelum dikirim ke RPC rate limit -- IP mentah pelanggan TIDAK
 * PERNAH boleh dikirim, dicatat log, atau disimpan (lihat komentar tabel
 * `booking_attempts` di migration di atas, yang sengaja hanya menyimpan
 * hash). `TOKEN_ENCRYPTION_KEY` dipakai sebagai salt server-side supaya
 * tidak perlu env var baru -- nilainya sudah rahasia server-only, dan dipakai
 * di sini sebagai bahan hash satu-arah (SHA-256), bukan untuk
 * enkripsi/dekripsi, jadi tidak bentrok secara kriptografis dengan
 * pemakaiannya di src/lib/crypto/secret-box.ts.
 *
 * IP kosong (lihat extractClientIp) tetap di-hash apa adanya -- hasilnya
 * konstan untuk semua request tanpa header proxy yang bisa diandalkan, dan
 * `check_booking_rate_limit` yang memutuskan cara menanganinya (lewat cek
 * `p_ip_hash = ''` sebelum insert, bukan `''` yang sudah di-hash).
 */
export function hashClientIp(ip: string): string {
  const { tokenEncryptionKey } = serverEnv();
  return createHash("sha256").update(`${ip}:${tokenEncryptionKey ?? ""}`).digest("hex");
}
