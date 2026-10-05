/**
 * Adapter pengiriman WhatsApp. Ganti penyedia cukup lewat env
 * (WHATSAPP_PROVIDER dkk.), kode pemanggil tidak berubah.
 *
 * - waha:      gateway self-host WAHA      -- POST {url}/api/sendText
 * - evolution: gateway self-host Evolution -- POST {url}/message/sendText/{instance}
 * - fonnte:    layanan berbayar Fonnte     -- POST https://api.fonnte.com/send
 *
 * WAHA dan Evolution bukan API resmi WhatsApp. Nomor pengirim bisa diblokir
 * bila pesannya dianggap spam -- karena itu Booka hanya mengirim pesan
 * transaksional ke orang yang baru saja memesan, tidak pernah siaran.
 *
 * Modul ini murni (tanpa `server-only`, tanpa env) supaya bisa diuji dengan
 * `fetch` tiruan; konfigurasinya disuntik oleh dispatch.ts.
 */

export type WhatsappConfig = {
  provider: "waha" | "evolution" | "fonnte";
  /** Base URL gateway self-host; diabaikan untuk Fonnte. */
  apiUrl?: string;
  apiKey: string;
  /** Sesi WAHA / instance Evolution. */
  session: string;
};

export type SendResult = { ok: true } | { ok: false; reason: string };

/** "+6281234" -> "6281234". Semua penyedia memakai digit tanpa '+'. */
export function toProviderNumber(e164: string): string {
  return e164.replace(/\D/g, "");
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}

/** Batas waktu per pesan; gateway yang macet tidak boleh menahan cron. */
const TIMEOUT_MS = 10_000;

export async function sendWhatsapp(
  config: WhatsappConfig,
  toE164: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const number = toProviderNumber(toE164);
  let request: { url: string; init: RequestInit };

  switch (config.provider) {
    case "waha":
      if (!config.apiUrl) return { ok: false, reason: "WHATSAPP_API_URL belum diisi" };
      request = {
        url: joinUrl(config.apiUrl, "/api/sendText"),
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Api-Key": config.apiKey },
          body: JSON.stringify({ session: config.session, chatId: `${number}@c.us`, text }),
        },
      };
      break;
    case "evolution":
      if (!config.apiUrl) return { ok: false, reason: "WHATSAPP_API_URL belum diisi" };
      request = {
        url: joinUrl(config.apiUrl, `/message/sendText/${encodeURIComponent(config.session)}`),
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: config.apiKey },
          body: JSON.stringify({ number, text }),
        },
      };
      break;
    case "fonnte": {
      const form = new FormData();
      form.set("target", number);
      form.set("message", text);
      request = {
        url: "https://api.fonnte.com/send",
        init: { method: "POST", headers: { Authorization: config.apiKey }, body: form },
      };
      break;
    }
  }

  try {
    const response = await fetchImpl(request.url, {
      ...request.init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, reason: `${config.provider} HTTP ${response.status}` };
    }
    // Fonnte membalas 200 bahkan saat gagal; statusnya ada di body.
    if (config.provider === "fonnte") {
      const body = (await response.json().catch(() => null)) as {
        status?: boolean;
        reason?: string;
      } | null;
      if (!body?.status) {
        return { ok: false, reason: `fonnte: ${body?.reason ?? "status false"}`.slice(0, 200) };
      }
    }
    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.name : "fetch gagal";
    return { ok: false, reason: `${config.provider}: ${reason}` };
  }
}
