import assert from "node:assert/strict";
import { test } from "node:test";

import { sendEmail } from "./email";
import { sendWhatsapp, toProviderNumber, type WhatsappConfig } from "./whatsapp";

type Captured = { url: string; init: RequestInit };

function fakeFetch(response: Response, captured: Captured[]): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(url), init: init ?? {} });
    return response;
  }) as typeof fetch;
}

test("toProviderNumber membuang '+' dan pemisah", () => {
  assert.equal(toProviderNumber("+62 812-345"), "62812345");
});

test("WAHA: POST /api/sendText dengan chatId @c.us dan X-Api-Key", async () => {
  const captured: Captured[] = [];
  const config: WhatsappConfig = {
    provider: "waha",
    apiUrl: "https://wa.example.com/",
    apiKey: "rahasia",
    session: "default",
  };
  const result = await sendWhatsapp(config, "+6281234", "halo", fakeFetch(new Response("{}"), captured));
  assert.deepEqual(result, { ok: true });
  assert.equal(captured[0].url, "https://wa.example.com/api/sendText");
  assert.equal((captured[0].init.headers as Record<string, string>)["X-Api-Key"], "rahasia");
  assert.deepEqual(JSON.parse(String(captured[0].init.body)), {
    session: "default",
    chatId: "6281234@c.us",
    text: "halo",
  });
});

test("Evolution: POST /message/sendText/{instance} dengan header apikey", async () => {
  const captured: Captured[] = [];
  await sendWhatsapp(
    { provider: "evolution", apiUrl: "https://evo.example.com", apiKey: "k", session: "booka" },
    "+6281234",
    "halo",
    fakeFetch(new Response("{}", { status: 201 }), captured),
  );
  assert.equal(captured[0].url, "https://evo.example.com/message/sendText/booka");
  assert.equal((captured[0].init.headers as Record<string, string>).apikey, "k");
  assert.deepEqual(JSON.parse(String(captured[0].init.body)), { number: "6281234", text: "halo" });
});

test("Fonnte: status false di body dianggap gagal walau HTTP 200", async () => {
  const result = await sendWhatsapp(
    { provider: "fonnte", apiKey: "t", session: "default" },
    "+6281234",
    "halo",
    fakeFetch(Response.json({ status: false, reason: "token invalid" }), []),
  );
  assert.deepEqual(result, { ok: false, reason: "fonnte: token invalid" });
});

test("gateway self-host tanpa URL ditolak tanpa memanggil jaringan", async () => {
  const captured: Captured[] = [];
  const result = await sendWhatsapp(
    { provider: "waha", apiKey: "k", session: "default" },
    "+6281234",
    "halo",
    fakeFetch(new Response("{}"), captured),
  );
  assert.equal(result.ok, false);
  assert.equal(captured.length, 0);
});

test("HTTP non-2xx dilaporkan sebagai gagal", async () => {
  const result = await sendWhatsapp(
    { provider: "waha", apiUrl: "https://wa.example.com", apiKey: "k", session: "default" },
    "+6281234",
    "halo",
    fakeFetch(new Response("down", { status: 503 }), []),
  );
  assert.deepEqual(result, { ok: false, reason: "waha HTTP 503" });
});

test("fetch yang melempar (timeout/jaringan) tidak ikut melempar", async () => {
  const throwing = (async () => {
    throw new DOMException("timeout", "TimeoutError");
  }) as unknown as typeof fetch;
  const result = await sendWhatsapp(
    { provider: "waha", apiUrl: "https://wa.example.com", apiKey: "k", session: "default" },
    "+6281234",
    "halo",
    throwing,
  );
  assert.deepEqual(result, { ok: false, reason: "waha: TimeoutError" });
});

test("Resend: bearer token dan penerima dalam array", async () => {
  const captured: Captured[] = [];
  const result = await sendEmail(
    { apiKey: "re_x", from: "Booka <a@b.id>" },
    "m@b.id",
    { subject: "s", text: "t", html: "<p>t</p>" },
    fakeFetch(Response.json({ id: "1" }), captured),
  );
  assert.deepEqual(result, { ok: true });
  assert.equal(captured[0].url, "https://api.resend.com/emails");
  assert.equal((captured[0].init.headers as Record<string, string>).Authorization, "Bearer re_x");
  assert.deepEqual(JSON.parse(String(captured[0].init.body)).to, ["m@b.id"]);
});
