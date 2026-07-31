// Test unit untuk src/app/api/webhooks/[provider]/route.ts.
//
// Fix round 1 (coordinator): orkestrasi handler ini (urutan verify-before-
// write, 401 kalau signature tidak valid, update PENDING->PAID yang
// bersyarat) adalah batas keamanan utama endpoint ini, tapi sebelumnya cuma
// helper murni di webhook-status.ts yang dites -- handler-nya sendiri
// (route.ts) tidak punya regresi test sama sekali. Test ini menutup itu
// dengan menyuntik `WebhookDeps` palsu langsung ke `handleWebhook` (seam
// yang sudah ada, bukan http/MSW) supaya tiga hal ini tidak bisa diam-diam
// regresi:
//   (a) signature tidak valid -> 401, NOL panggilan UPDATE ke bookings.
//   (b) booking sudah CANCELLED/PAID -> 200, NOL panggilan UPDATE (idempoten,
//       tidak di-flip).
//   (c) booking PENDING + signature valid -> UPDATE dipanggil dengan
//       `.eq("status", "PENDING")` (bukan blind overwrite).
//
// "server-only" (dipakai admin.ts/credentials.ts yang di-import route.ts
// secara transitif) hanya aman dengan --conditions=react-server, lihat
// package.json script test:unit dan komentar serupa di
// src/lib/crypto/secret-box.test.ts.
import assert from "node:assert/strict";
import { before, test } from "node:test";

import type { PaymentProviderAdapter } from "@/lib/payments/types";
import type { MerchantCredential } from "@/lib/payments/credentials";
import type { BookingStatus } from "@/types/database";

import type { handleWebhook as HandleWebhook, WebhookDeps } from "./route";

let handleWebhook: typeof HandleWebhook;

before(async () => {
  ({ handleWebhook } = await import("./route"));
});

type BookingLookupRow = { id: string; merchant_id: string; status: BookingStatus };

/**
 * Admin client palsu -- meniru persis chain `.from("bookings").select(...)
 * .eq().eq().maybeSingle()` dan `.from("bookings").update(...).eq().eq()`
 * yang dipakai route.ts (lihat tipe `WebhookAdminClient` di sana). Mencatat
 * setiap panggilan `update()` (jumlah + argumen `.eq()`-nya) supaya test
 * bisa menegaskan "nol panggilan UPDATE" atau "UPDATE ini harus memuat
 * .eq('status','PENDING')" tanpa menyentuh Supabase sungguhan.
 */
function createFakeAdmin(booking: BookingLookupRow | null) {
  const updateCalls: { values: Record<string, unknown>; eqCalls: [string, string][] }[] = [];

  const admin = {
    from(_table: "bookings") {
      return {
        select(_columns: string) {
          return {
            eq(_c1: string, _v1: string) {
              return {
                eq(_c2: string, _v2: string) {
                  return {
                    async maybeSingle() {
                      return { data: booking, error: null as unknown };
                    },
                  };
                },
              };
            },
          };
        },
        update(values: Record<string, unknown>) {
          const call = { values, eqCalls: [] as [string, string][] };
          updateCalls.push(call);
          return {
            eq(c1: string, v1: string) {
              call.eqCalls.push([c1, v1]);
              return {
                async eq(c2: string, v2: string) {
                  call.eqCalls.push([c2, v2]);
                  return { error: null as unknown };
                },
              };
            },
          };
        },
      };
    },
  };

  return { admin, updateCalls };
}

const VALID_CREDENTIAL: MerchantCredential = { environment: "SANDBOX", credential: "server-key-123" };

function makeAdapter(verifyResult: boolean): PaymentProviderAdapter {
  return {
    provider: "MIDTRANS",
    async createQrisCharge() {
      throw new Error("tidak dipakai di test ini");
    },
    verifyWebhookSignature: () => verifyResult,
  };
}

function makeDeps(params: {
  booking: BookingLookupRow | null;
  // Wajib diisi eksplisit (bukan `?:` + `??`) -- membedakan "kredensial
  // ditemukan" (VALID_CREDENTIAL) dari "sengaja null" (tidak ditemukan)
  // harus jelas di titik pemanggilan, bukan bergantung pada default yang
  // gampang salah kalau null dianggap "tidak diisi" oleh `??`.
  credential: MerchantCredential | null;
  verifyResult?: boolean;
}) {
  const { admin, updateCalls } = createFakeAdmin(params.booking);
  const deps: WebhookDeps = {
    createAdminClient: () => admin as unknown as ReturnType<WebhookDeps["createAdminClient"]>,
    loadMerchantCredential: async () => params.credential,
    getAdapter: () => makeAdapter(params.verifyResult ?? true),
  };
  return { deps, updateCalls };
}

const midtransSettlementBody = {
  order_id: "booking-1",
  status_code: "200",
  gross_amount: "100000.00",
  transaction_status: "settlement",
  signature_key: "tidak-relevan-verifyWebhookSignature-di-stub",
};

// --- (a) signature tidak valid -> 401, nol UPDATE ---------------------------

test("handleWebhook: signature tidak valid -> 401 dan tidak memanggil UPDATE sama sekali", async () => {
  const { deps, updateCalls } = makeDeps({
    booking: { id: "booking-1", merchant_id: "merchant-1", status: "PENDING" },
    credential: VALID_CREDENTIAL,
    verifyResult: false,
  });

  const response = await handleWebhook("MIDTRANS", midtransSettlementBody, {}, deps);

  assert.equal(response.status, 401);
  assert.equal(updateCalls.length, 0);
});

// --- (b) booking sudah terminal (CANCELLED/PAID) -> 200, nol UPDATE --------

test("handleWebhook: booking sudah CANCELLED (signature valid) -> 200, tidak di-flip, nol UPDATE", async () => {
  const { deps, updateCalls } = makeDeps({
    booking: { id: "booking-2", merchant_id: "merchant-1", status: "CANCELLED" },
    credential: VALID_CREDENTIAL,
    verifyResult: true,
  });

  const response = await handleWebhook("MIDTRANS", midtransSettlementBody, {}, deps);

  assert.equal(response.status, 200);
  assert.equal(updateCalls.length, 0);
});

test("handleWebhook: booking sudah PAID (signature valid, event duplikat) -> 200, nol UPDATE", async () => {
  const { deps, updateCalls } = makeDeps({
    booking: { id: "booking-3", merchant_id: "merchant-1", status: "PAID" },
    credential: VALID_CREDENTIAL,
    verifyResult: true,
  });

  const response = await handleWebhook("MIDTRANS", midtransSettlementBody, {}, deps);

  assert.equal(response.status, 200);
  assert.equal(updateCalls.length, 0);
});

// --- (c) booking PENDING + signature valid -> UPDATE bersyarat -------------

test("handleWebhook: booking PENDING + signature valid + settlement -> UPDATE dipanggil dengan .eq('status','PENDING')", async () => {
  const { deps, updateCalls } = makeDeps({
    booking: { id: "booking-4", merchant_id: "merchant-1", status: "PENDING" },
    credential: VALID_CREDENTIAL,
    verifyResult: true,
  });

  const response = await handleWebhook("MIDTRANS", midtransSettlementBody, {}, deps);

  assert.equal(response.status, 200);
  assert.equal(updateCalls.length, 1);

  const [update] = updateCalls;
  assert.equal(update.values.status, "PAID");
  assert.ok(typeof update.values.paid_at === "string" && update.values.paid_at.length > 0);

  // Bukan blind overwrite -- WAJIB ada .eq("status", "PENDING") di antara
  // filter-nya (di samping .eq("id", ...)), supaya dua webhook yang datang
  // nyaris bersamaan tidak keduanya sukses meng-update baris yang sama.
  assert.ok(
    update.eqCalls.some(([column, value]) => column === "status" && value === "PENDING"),
    `update harus difilter .eq("status","PENDING"), tapi eqCalls = ${JSON.stringify(update.eqCalls)}`,
  );
  assert.ok(update.eqCalls.some(([column, value]) => column === "id" && value === "booking-4"));
});

test("handleWebhook: kredensial merchant tidak ditemukan -> 401, nol UPDATE (signature tidak bisa diverifikasi sama sekali)", async () => {
  const { deps, updateCalls } = makeDeps({
    booking: { id: "booking-5", merchant_id: "merchant-1", status: "PENDING" },
    credential: null,
  });

  const response = await handleWebhook("MIDTRANS", midtransSettlementBody, {}, deps);

  assert.equal(response.status, 401);
  assert.equal(updateCalls.length, 0);
});
