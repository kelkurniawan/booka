import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getAdapter } from "@/lib/payments";
import { loadMerchantCredential } from "@/lib/payments/credentials";
import { parseProviderParam } from "@/lib/payments/oauth-config";
import {
  extractProviderOrderId,
  mapProviderStatus,
  shouldMarkPaid,
} from "@/lib/payments/webhook-status";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BookingStatus, PaymentProvider } from "@/types/database";

type BookingLookupRow = { id: string; merchant_id: string; status: BookingStatus };

/**
 * Subset kecil dari `SupabaseClient<Database>` -- persis chain query yang
 * dipakai `handleWebhook` di bawah, tidak lebih. Ada supaya test bisa
 * menyuntik admin client palsu tanpa harus meniru seluruh tipe postgrest-js
 * (lihat route.test.ts). `defaultDeps` di bawah meng-cast klien admin
 * sungguhan ke tipe ini sekali di satu titik -- bukan berarti klien
 * sungguhan benar-benar terbatas segini, hanya bagian ini yang dipakai.
 */
type WebhookAdminClient = {
  from(table: "bookings"): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        eq(
          column: string,
          value: string,
        ): { maybeSingle(): Promise<{ data: BookingLookupRow | null; error: unknown }> };
      };
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): { eq(column: string, value: string): Promise<{ error: unknown }> };
    };
  };
};

/**
 * Dependensi yang bisa disuntik `handleWebhook` -- seam untuk test
 * (route.test.ts men-stub ketiganya langsung, tanpa jaringan/DB sungguhan).
 * `POST` di bawah selalu memanggil `handleWebhook` tanpa argumen ke-4, jadi
 * memakai `defaultDeps` (implementasi asli).
 */
export type WebhookDeps = {
  createAdminClient: () => WebhookAdminClient;
  loadMerchantCredential: typeof loadMerchantCredential;
  getAdapter: typeof getAdapter;
};

const defaultDeps: WebhookDeps = {
  createAdminClient: () => createAdminClient() as unknown as WebhookAdminClient,
  loadMerchantCredential,
  getAdapter,
};

/**
 * Logika inti `POST /api/webhooks/[provider]`, dipisah dari handler Next.js
 * supaya bisa dites langsung (lihat route.test.ts) tanpa membangun
 * `NextRequest` sungguhan atau memukul Supabase asli. `POST` di bawah cuma
 * bertugas mem-parsing request Next.js jadi (provider, body, headers) lalu
 * memanggil ini.
 *
 * WAJIB balas HTTP 200 secepatnya begitu payload sudah diproses/diputuskan
 * -- gateway akan retry berkali-kali kalau tidak menerima 2xx dalam waktu
 * singkat. Tidak ada message queue di proyek ini (lihat docs/DECISIONS.md
 * dan komentar di bawah dekat notifikasi WhatsApp) jadi update status
 * dikerjakan langsung inline di sini -- bukan alasan untuk melakukan kerja
 * lain yang lambat (kirim WA, dst.) di jalur ini.
 */
export async function handleWebhook(
  provider: PaymentProvider,
  body: Record<string, unknown>,
  headers: Record<string, string>,
  deps: WebhookDeps = defaultDeps,
): Promise<NextResponse> {
  const orderId = extractProviderOrderId(provider, body);
  if (!orderId) {
    // Payload tidak punya order id yang bisa dikenali -- tidak ada booking
    // yang mungkin dicocokkan. Balas 200: payload semacam ini tidak akan
    // pernah valid, jadi retry gateway hanya buang-buang.
    console.warn("[webhooks] payload tanpa order id yang dikenali", { provider });
    return NextResponse.json({ ok: true });
  }

  const admin = deps.createAdminClient();
  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select("id, merchant_id, status")
    .eq("payment_reference", orderId)
    .eq("payment_provider", provider)
    .maybeSingle();

  if (bookingError) {
    console.error("[webhooks] gagal memuat booking", { provider, orderId, error: bookingError });
    return NextResponse.json({ error: "Gagal memuat booking" }, { status: 500 });
  }

  if (!booking) {
    // Webhook untuk order id yang tidak dikenal (mis. booking test dari
    // dashboard sandbox provider, atau data sudah dibersihkan) TIDAK BOLEH
    // membuat gateway retry selamanya -- balas 200, cukup dicatat di log.
    console.warn("[webhooks] booking tidak ditemukan untuk order id", { provider, orderId });
    return NextResponse.json({ ok: true });
  }

  // Signature diverifikasi dengan Server Key/token milik MERCHANT PEMILIK
  // booking ini (bukan kredensial global) -- setiap merchant punya
  // kredensial payment gateway sendiri.
  const credential = await deps.loadMerchantCredential(booking.merchant_id, provider);
  if (!credential) {
    // Koneksi merchant sudah tidak ACTIVE (dicabut/kedaluwarsa) -- signature
    // tidak bisa diverifikasi sama sekali. Diperlakukan sebagai tidak valid,
    // bukan error server.
    console.error("[webhooks] kredensial merchant tidak ditemukan/tidak aktif", {
      provider,
      merchantId: booking.merchant_id,
    });
    return NextResponse.json({ error: "Kredensial tidak ditemukan" }, { status: 401 });
  }

  // Batas keamanan utama endpoint ini -- webhook palsu (signature tidak
  // cocok) TIDAK BOLEH bisa mengubah status booking apa pun. Verifikasi
  // ini WAJIB terjadi sebelum baris UPDATE mana pun di bawah -- lihat
  // route.test.ts kasus (a): signature tidak valid harus 401 dan nol
  // panggilan UPDATE.
  const adapter = deps.getAdapter(provider);
  const validSignature = adapter.verifyWebhookSignature({
    body,
    headers,
    credential: credential.credential,
  });

  if (!validSignature) {
    console.warn("[webhooks] signature tidak valid", { provider, bookingId: booking.id });
    return NextResponse.json({ error: "Signature tidak valid" }, { status: 401 });
  }

  // Idempotensi: lihat komentar shouldMarkPaid di webhook-status.ts. Booking
  // yang sudah PAID (event duplikat) atau CANCELLED (pembayaran telat)
  // tidak diproses lagi -- keduanya dibalas 200 supaya gateway berhenti
  // retry, tanpa efek samping apa pun (nol panggilan UPDATE -- route.test.ts
  // kasus (b)).
  if (!shouldMarkPaid(booking.status)) {
    if (booking.status === "CANCELLED") {
      console.warn(
        "[webhooks] pembayaran diterima untuk booking yang sudah CANCELLED, tidak di-flip ke PAID",
        { provider, bookingId: booking.id },
      );
    }
    return NextResponse.json({ ok: true });
  }

  const outcome = mapProviderStatus(provider, body);
  if (outcome !== "PAID") {
    // Status seperti expire/cancel/deny/pending -- tidak melakukan apa pun,
    // cron pembatalan booking kedaluwarsa (Task 10) yang menangani expiry.
    return NextResponse.json({ ok: true });
  }

  // `.eq("status", "PENDING")` di query update (bukan hanya cek shouldMarkPaid
  // di atas) menutup race dua webhook untuk booking yang sama datang nyaris
  // bersamaan -- salah satu menang UPDATE-nya, yang lain affected rows = 0.
  // Ditegaskan lagi lewat route.test.ts kasus (c): update HARUS memuat
  // `.eq("status", "PENDING")`, bukan blind overwrite.
  const { error: updateError } = await admin
    .from("bookings")
    .update({ status: "PAID", paid_at: new Date().toISOString() })
    .eq("id", booking.id)
    .eq("status", "PENDING");

  if (updateError) {
    console.error("[webhooks] gagal update status booking ke PAID", {
      bookingId: booking.id,
      error: updateError,
    });
    return NextResponse.json({ error: "Gagal update booking" }, { status: 500 });
  }

  // Titik pemicu notifikasi WhatsApp (ke merchant + pelanggan) begitu
  // booking PAID akan ada di sini -- sengaja belum diimplementasikan.
  // PRD bagian 5B menyebut melempar event ke message queue (Upstash) supaya
  // respons 200 tetap cepat, tapi proyek ini belum punya message queue
  // (lihat AGENTS.md/docs/DECISIONS.md) dan notifikasi WhatsApp memang di
  // luar scope MVP saat ini. Update status di atas sudah cukup untuk Task 9.
  return NextResponse.json({ ok: true });
}

/**
 * POST /api/webhooks/[provider]
 *
 * Tidak membaca raw body request (`request.text()`) -- tidak dibutuhkan:
 * signature Midtrans dihitung ulang dari field JSON individual (order_id +
 * status_code + gross_amount + ServerKey, lihat midtrans.ts), dan Xendit
 * memverifikasi lewat header `x-callback-token`, bukan HMAC atas raw bytes.
 * `request.json()` sudah cukup untuk kedua adapter yang ada.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: rawProvider } = await params;
  const provider = parseProviderParam(rawProvider);

  if (!provider) {
    return NextResponse.json({ error: "Provider tidak dikenal" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    const parsedBody: unknown = await request.json();
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      throw new Error("bukan objek JSON");
    }
    body = parsedBody as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Body webhook harus objek JSON valid" }, { status: 400 });
  }

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  return handleWebhook(provider, body, headers);
}
