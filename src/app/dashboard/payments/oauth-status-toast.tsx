"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  not_configured: "OAuth Connect belum aktif — kredensial partner belum dikonfigurasi.",
  denied: "Anda membatalkan proses menghubungkan akun.",
  invalid_state: "Sesi OAuth kedaluwarsa atau tidak valid. Silakan coba hubungkan lagi.",
  token_exchange_failed: "Gagal menukar kode OAuth dengan token. Coba lagi.",
  save_failed: "Gagal menyimpan koneksi. Coba lagi.",
};

const PROVIDER_LABELS: Record<string, string> = {
  MIDTRANS: "Midtrans",
  XENDIT: "Xendit",
};

/**
 * Menampilkan toast hasil redirect dari /api/payments/[provider]/{connect,callback}
 * lalu membersihkan query string-nya, supaya refresh halaman tidak
 * menampilkan toast yang sama berulang-ulang.
 */
export function OAuthStatusToast({
  connected,
  oauthError,
  provider,
}: {
  connected?: string;
  oauthError?: string;
  provider?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (connected) {
      toast.success(`${PROVIDER_LABELS[connected] ?? connected} terhubung.`);
      router.replace(pathname);
    } else if (oauthError) {
      const message = OAUTH_ERROR_MESSAGES[oauthError] ?? "Gagal menghubungkan akun. Coba lagi.";
      toast.error(provider ? `${PROVIDER_LABELS[provider] ?? provider}: ${message}` : message);
      router.replace(pathname);
    }
    // Sengaja hanya jalan sekali saat query param dari redirect awal muncul.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
