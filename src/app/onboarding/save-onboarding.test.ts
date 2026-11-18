import assert from "node:assert/strict";
import { test } from "node:test";

import type { CompleteOnboardingValues } from "@/lib/validations/onboarding";

import { saveOnboarding } from "./save-onboarding";

type RpcResult = { error: { code?: string; message?: string } | null };

/** Klien palsu yang hanya perlu `rpc`; mencatat argumen tiap panggilan. */
function fake(result: RpcResult = { error: null }) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve(result);
    },
  };
  return { client: client as never, calls };
}

const BASE = {
  full_name: "Padel Kita",
  username: "padel-kita",
  whatsapp_number: "+6281234567890",
  business_category: "OLAHRAGA",
  business_type_slug: "padel",
  service: { name: "Sewa lapangan Padel", duration_minutes: 60, price: 150000 },
  hours: { days: [1, 2], start_time: "08:00", end_time: "22:00" },
  court: { unitMinutes: 30, minMinutes: 60, maxMinutes: 120 },
} as unknown as CompleteOnboardingValues;

const SALON = {
  ...BASE,
  business_category: "KECANTIKAN",
  business_type_slug: "barbershop",
  court: null,
} as unknown as CompleteOnboardingValues;

test("sewa: satu RPC membawa sport dari katalog dan angka sewa", async () => {
  const { client, calls } = fake();
  assert.equal(await saveOnboarding(client, BASE), null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "complete_onboarding");
  assert.equal(calls[0].args.p_court_sport, "PADEL");
  assert.equal(calls[0].args.p_court_unit, 30);
  assert.equal(calls[0].args.p_court_min, 60);
  assert.equal(calls[0].args.p_court_max, 120);
});

test("salon: argumen sewa tidak dikirim sama sekali", async () => {
  const { client, calls } = fake();
  assert.equal(await saveOnboarding(client, SALON), null);
  assert.equal("p_court_sport" in calls[0].args, false);
});

test("court dari klien tanpa sport di katalog tidak mengirim argumen sewa", async () => {
  const { client, calls } = fake();
  await saveOnboarding(client, { ...SALON, court: BASE.court } as CompleteOnboardingValues);
  assert.equal("p_court_sport" in calls[0].args, false);
});

const gagal = [
  ["23505", "Username baru saja diambil orang lain. Coba yang lain.", "username"],
  ["23514", "Username tidak dapat digunakan.", "username"],
  ["23P01", "Jam kerja yang dipilih tumpang tindih. Periksa kembali.", "hours"],
  ["22023", "Pengaturan sewa lapangan tidak valid. Periksa kembali.", "service"],
] as const;

for (const [code, message, field] of gagal) {
  test(`error ${code} dipetakan ke pesan dan field tertentu`, async () => {
    const { client } = fake({ error: { code, message: "raw postgres text" } });
    const state = await saveOnboarding(client, BASE);
    assert.deepEqual(state?.status, "error");
    assert.equal(state?.message, message);
    assert.ok(state?.fieldErrors?.[field]);
    assert.doesNotMatch(JSON.stringify(state), /raw postgres/);
  });
}

test("42501 meminta sesi baru, tanpa field", async () => {
  const { client } = fake({ error: { code: "42501", message: "raw" } });
  const state = await saveOnboarding(client, BASE);
  assert.equal(state?.message, "Sesi berakhir. Muat ulang halaman lalu masuk lagi.");
  assert.equal(state?.fieldErrors, undefined);
});

test("error tak dikenal: pesan umum tanpa teks mentah", async () => {
  const { client } = fake({ error: { code: "XX000", message: "raw secret" } });
  const orig = console.error;
  console.error = () => {};
  try {
    const state = await saveOnboarding(client, BASE);
    assert.equal(state?.message, "Gagal menyimpan data. Coba lagi.");
    assert.doesNotMatch(JSON.stringify(state), /raw secret/);
  } finally {
    console.error = orig;
  }
});
