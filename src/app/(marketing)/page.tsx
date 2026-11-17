import type { Metadata } from "next";

import { JsonLd } from "@/components/landing/json-ld";
import { LandingView } from "@/components/landing/landing-view";
import { contactLinks } from "@/lib/marketing/contact";
import { LANDING_FAQS } from "@/lib/marketing/content";
import { landingJsonLd } from "@/lib/marketing/json-ld";
import { EARLY_ACCESS_FREE, PLANS, STARTER_MONTHLY_TRANSACTIONS } from "@/lib/plans";
import { siteHost, siteUrl } from "@/lib/site";

const TITLE = "Marky: booking, DP, dan pengingat lewat satu tautan";
const DESCRIPTION = `Satu tautan di bio untuk jadwal, DP, dan pengingat. DP pelanggan masuk langsung ke akun Midtrans atau Xendit Anda. ${EARLY_ACCESS_FREE ? "Semua fitur gratis selama masa awal." : `Gratis untuk ${STARTER_MONTHLY_TRANSACTIONS} transaksi per bulan.`}`;

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/" },
  twitter: { card: "summary_large_image" },
};

export default function LandingPage() {
  const contact = contactLinks();
  return (
    <>
      <JsonLd data={landingJsonLd({ siteUrl: siteUrl(), plans: PLANS, faqs: LANDING_FAQS, contact })} />
      <LandingView host={siteHost()} contact={contact} />
    </>
  );
}
