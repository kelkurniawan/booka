import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { loadMerchantCredential } from "@/lib/payments/credentials";
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

  const { data: connectionRows } = await supabase
    .from("payment_connections")
    .select("*")
    .eq("merchant_id", user.id);

  const connectionByProvider = new Map<PaymentProvider, PaymentConnection>(
    (connectionRows ?? []).map((row) => [row.provider, row]),
  );

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

      return { provider, connection, maskedCredential };
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
        {cards.map(({ provider, connection, maskedCredential }) => (
          <ProviderCard
            key={provider}
            provider={provider}
            connection={connection}
            maskedCredential={maskedCredential}
          />
        ))}
      </div>
    </>
  );
}
