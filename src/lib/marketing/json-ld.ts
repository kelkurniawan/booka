import type { Plan } from "@/lib/plans";

import type { ContactLink } from "./contact";
import type { Faq } from "./content";

export function faqJsonLd(faqs: readonly Faq[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

/** [SoftwareApplication, Organization, FAQPage]. Tanpa rating, ulasan, atau logo. */
export function landingJsonLd(input: {
  siteUrl: URL;
  plans: readonly Plan[];
  faqs: readonly Faq[];
  contact: ContactLink[];
}): object[] {
  const url = input.siteUrl.origin;
  const sameAs = input.contact
    .filter((c) => c.kind !== "whatsapp" && c.kind !== "email")
    .map((c) => c.href);
  const email = input.contact.find((c) => c.kind === "email")?.href.replace(/^mailto:/, "");
  return [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Marky",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      inLanguage: "id-ID",
      url,
      offers: input.plans.map((p) => ({
        "@type": "Offer",
        name: p.name,
        price: String(p.monthlyPriceIdr),
        priceCurrency: "IDR",
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Marky",
      url,
      ...(sameAs.length > 0 ? { sameAs } : {}),
      ...(email ? { email } : {}),
    },
    faqJsonLd(input.faqs),
  ];
}
