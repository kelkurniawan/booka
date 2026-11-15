import "server-only";

import { createHash } from "node:crypto";

import { sendNotification, WebPushError } from "web-push";
import { z } from "zod";

import { serverEnv } from "@/lib/env/server";

import type { SendResult } from "./whatsapp";

export type PushConfig = { publicKey: string; privateKey: string; subject: string };

/** null bila salah satu env VAPID kosong: push dimatikan, bukan error. */
export function pushConfig(): PushConfig | null {
  const { vapidPublicKey, vapidPrivateKey, vapidSubject } = serverEnv();
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) return null;
  // Subject salah hanya mematikan push; tidak boleh merusak serverEnv() milik pembayaran.
  if (!vapidSubject.startsWith("mailto:") && !vapidSubject.startsWith("https://")) return null;
  return { publicKey: vapidPublicKey, privateKey: vapidPrivateKey, subject: vapidSubject };
}

export type StoredPushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

/**
 * Hanya layanan push milik browser besar yang boleh jadi tujuan POST server
 * (Keputusan 12). Tanpa daftar ini, pemegang token booking bisa menyuruh
 * server mengirim request ke alamat bebas (SSRF).
 */
export const PUSH_HOST_SUFFIXES: readonly string[] = [
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password || url.port) return false;
  // Cocokkan di batas label: "evilfcm.googleapis.com" tidak boleh lolos.
  return PUSH_HOST_SUFFIXES.some((s) => url.hostname === s || url.hostname.endsWith(`.${s}`));
}

const base64url = z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+={0,2}$/);

export const pushSubscriptionSchema: z.ZodType<StoredPushSubscription> = z.object({
  endpoint: z.string().max(1000).refine(isAllowedPushEndpoint, "Endpoint push tidak diizinkan"),
  keys: z.object({ p256dh: base64url, auth: base64url }),
});

export function endpointHash(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

export type PushPayload = { title: string; body: string; url: string; tag: string };

/** Pesan menunggu di layanan push maksimal 12 jam; lewat itu pengingat basi. */
const TTL_SECONDS = 43200;

export async function sendPush(
  config: PushConfig,
  sub: StoredPushSubscription,
  payload: PushPayload,
): Promise<SendResult & { gone?: boolean }> {
  // Data lama di DB tidak dipercaya: cek ulang sebelum server menembak endpoint.
  if (!isAllowedPushEndpoint(sub.endpoint)) {
    return { ok: false, reason: "push: endpoint tidak diizinkan", gone: true };
  }
  try {
    await sendNotification(sub, JSON.stringify(payload), {
      TTL: TTL_SECONDS,
      timeout: 10_000,
      vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof WebPushError) {
      const gone = error.statusCode === 404 || error.statusCode === 410;
      return { ok: false, reason: `push: HTTP ${error.statusCode}`, ...(gone ? { gone: true } : {}) };
    }
    return { ok: false, reason: `push: ${error instanceof Error ? error.message : "gagal"}` };
  }
}
