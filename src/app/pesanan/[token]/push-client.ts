import { ROUTES } from "@/lib/routes";

// Modul browser murni: dipanggil dari komponen client, tanpa dependensi server.

export type PushSupport = "unsupported" | "ios-needs-install" | "denied" | "available";
type Result = { ok: true } | { ok: false; message: string };

export function pushSupport(): PushSupport {
  // iOS hanya punya PushManager di PWA yang sudah dipasang ke layar utama.
  if (/iPhone|iPad/.test(navigator.userAgent) && !("PushManager" in window)) return "ios-needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  if (typeof Notification !== "undefined" && Notification.permission === "denied") return "denied";
  return "available";
}

function keyToBytes(key: string): Uint8Array<ArrayBuffer> {
  const b64 = key.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(key.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function subscribePush(token: string, vapidPublicKey: string): Promise<Result> {
  try {
    const registration = await navigator.serviceWorker.register(ROUTES.serviceWorker, { scope: "/pesanan/" });
    if ((await Notification.requestPermission()) !== "granted") {
      return { ok: false, message: "Izin notifikasi ditolak. Ubah di pengaturan browser." };
    }
    await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyToBytes(vapidPublicKey),
    });
    const res = await fetch(ROUTES.bookingPushApi(token), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, message: data?.error ?? "Gagal mengaktifkan notifikasi." };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "Gagal mengaktifkan notifikasi." };
  }
}

export async function unsubscribePush(token: string): Promise<Result> {
  try {
    const res = await fetch(ROUTES.bookingPushApi(token), { method: "DELETE" });
    return res.ok ? { ok: true } : { ok: false, message: "Gagal mematikan notifikasi." };
  } catch {
    return { ok: false, message: "Gagal mematikan notifikasi." };
  }
}
