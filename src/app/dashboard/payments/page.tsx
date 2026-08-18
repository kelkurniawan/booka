import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { loadMerchantCredential } from "@/lib/payments/credentials";
import { selectActiveConnection } from "@/lib/payments/select-connection";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { maskCredential } from "@/lib/validations/payment-connection";
import type { PaymentConnection, PaymentProvider } from "@/types/database";

import { OAuthStatusToast } from "./oauth-status-toast";
import { ProviderCard } from "./provider-card";

export const metadata: Metadata = { title: "Pembayaran" };

const PROVIDERS: PaymentProvider[] = ["MIDTRANS", "XENDIT"];

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; oauth_error?: string; provider?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(ROUTES.login);
  }

  const { connected, oauth_error: oauthError, provider: errorProvider } = await searchParams;

  const [{ data: connectionRows }, { data: merchantRow }] = await Promise.all([
    supabase.from("payment_connections").select("*").eq("merchant_id", user.id),
    supabase.from("merchants").select("active_payment_provider").eq("id", user.id).maybeSingle(),
  ]);

  const connectionByProvider = new Map<PaymentProvider, PaymentConnection>(
    (connectionRows ?? []).map((row) => [row.provider, row]),
  );

  // Provider yang benar-benar dipakai POST /api/bookings untuk booking baru
  // -- aturan yang SAMA PERSIS dengan route itu (selectActiveConnection),
  // supaya badge di bawah tidak bisa diam-diam tidak sinkron dengan
  // perilaku booking sungguhan. Badge hanya ditampilkan kalau merchant
  // punya LEBIH DARI SATU koneksi ACTIVE -- kalau cuma satu, tidak ada
  // ambiguitas untuk dijelaskan.
  const activeConnections = (connectionRows ?? [])
    .filter((row) => row.status === "ACTIVE")
    .sort((a, b) => a.connected_at.localeCompare(b.connected_at));
  const usedForBookingProvider: PaymentProvider | null =
    activeConnections.length > 1
      ? (selectActiveConnection(activeConnections, merchantRow?.active_payment_provider ?? null)
          ?.provider ?? null)
      : null;

  // Server Key/token TIDAK PERNAH dikirim penuh ke browser — didekripsi di
  // sini hanya untuk dipotong jadi 4 karakter terakhir sebelum dirender.
  const cards = await Promise.all(
    PROVIDERS.map(async (provider) => {
      const connection = connectionByProvider.get(provider) ?? null;
      let maskedCredential: string | null = null;

      if (connection?.status === "ACTIVE") {
        const credential = await loadMerchantCredential(user.id, provider);
        if (credential) maskedCredential = maskCredential(credential.credential);
      }

      return {
        provider,
        connection,
        maskedCredential,
        isUsedForBooking: usedForBookingProvider === provider,
      };
    }),
  );

  return (
    <>
      <PageHeader
        title="Pembayaran"
        description="Hubungkan akun payment gateway Anda. DP pelanggan masuk langsung ke akun tersebut, bukan ke Booka."
      />
      <OAuthStatusToast connected={connected} oauthError={oauthError} provider={errorProvider} />

      <div className="grid gap-4 md:grid-cols-2">
        {cards.map(({ provider, connection, maskedCredential, isUsedForBooking }) => (
          <ProviderCard
            key={provider}
            provider={provider}
            connection={connection}
            maskedCredential={maskedCredential}
            isUsedForBooking={isUsedForBooking}
          />
        ))}
      </div>
    </>
  );
}
