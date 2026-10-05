import type { EmailMessage } from "./templates";
import type { SendResult } from "./whatsapp";

export type EmailConfig = { apiKey: string; from: string };

const TIMEOUT_MS = 10_000;

/**
 * Kirim email lewat REST API Resend. Tanpa SDK supaya tidak menambah
 * dependensi untuk satu panggilan HTTP. Paket gratis Resend cukup untuk
 * notifikasi merchant; kuncinya sama dengan yang dipakai SMTP Supabase
 * (lihat docs/NOTIFIKASI.md).
 */
export async function sendEmail(
  config: EmailConfig,
  to: string,
  message: EmailMessage,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, reason: `resend HTTP ${response.status}` };
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: `resend: ${error instanceof Error ? error.name : "fetch gagal"}` };
  }
}
