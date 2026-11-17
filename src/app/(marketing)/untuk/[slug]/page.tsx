import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BizExampleCard } from "@/components/landing/biz-example-card";
import { ClaimSection } from "@/components/landing/claim-section";
import { FaqList } from "@/components/landing/faq-list";
import { JsonLd } from "@/components/landing/json-ld";
import { Masthead } from "@/components/landing/masthead";
import { SiteFooter } from "@/components/landing/site-footer";
import { contactLinks } from "@/lib/marketing/contact";
import { INDUSTRIES, industryBySlug } from "@/lib/marketing/industries";
import { faqJsonLd } from "@/lib/marketing/json-ld";
import { ROUTES } from "@/lib/routes";
import { siteHost } from "@/lib/site";

export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return INDUSTRIES.map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const industry = industryBySlug((await params).slug);
  if (!industry) return {};
  const url = ROUTES.industry(industry.slug);
  return {
    title: { absolute: industry.metaTitle },
    description: industry.metaDescription,
    alternates: { canonical: url },
    openGraph: { title: industry.metaTitle, description: industry.metaDescription, url },
  };
}

export default async function IndustryPage({ params }: Props) {
  const industry = industryBySlug((await params).slug);
  if (!industry) notFound();
  const host = siteHost();

  return (
    <>
      <JsonLd data={faqJsonLd(industry.faqs)} />
      <Masthead />
      <main>
        <section aria-labelledby="industri-h" className="wrap" style={{ paddingTop: "var(--space-2xl)", paddingBottom: "var(--space-3xl)", display: "flex", flexWrap: "wrap", gap: "var(--space-2xl) var(--space-3xl)", alignItems: "center" }}>
          <div style={{ flex: "1 1 380px", minWidth: 0, display: "flex", flexDirection: "column", gap: "var(--space-lg)", alignItems: "flex-start" }}>
            <h1 id="industri-h" style={{ maxWidth: "16ch", fontSize: "var(--text-display)", lineHeight: 1.02 }}>{industry.h1}</h1>
            <p style={{ margin: 0, maxWidth: "40ch", fontSize: "var(--text-lead)", color: "var(--color-ink-2)" }}>{industry.intro}</p>
            <a href="#klaim" className="btn btn--ink btn--wrap">Klaim {host}/nama-anda</a>
          </div>
          <div className="desk" style={{ flex: "1 1 360px", minWidth: 0, borderRadius: 16, padding: "clamp(24px, 4vw, 48px)", display: "flex", justifyContent: "center" }}>
            <BizExampleCard example={industry.example} host={host} />
          </div>
        </section>

        <section aria-labelledby="bayar-h" className="wrap" style={{ paddingBottom: "var(--space-3xl)", display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          <h2 id="bayar-h" style={{ maxWidth: "24ch", fontSize: "var(--text-section)", lineHeight: 1.04 }}>{industry.paymentFit.title}</h2>
          <p style={{ margin: 0, maxWidth: "60ch", color: "var(--color-ink-2)" }}>{industry.paymentFit.body}</p>
        </section>

        <section aria-label="Yang Anda dapat" className="wrap" style={{ paddingBottom: "var(--space-3xl)" }}>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: "var(--space-lg)" }}>
            {industry.points.map((p) => (
              <li key={p.title} className="stock" style={{ flex: "1 1 260px", minWidth: 0, padding: "var(--space-lg)", display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{p.title}</h3>
                <p style={{ margin: 0, color: "var(--color-ink-2)" }}>{p.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <FaqList faqs={industry.faqs} headingId="tanya-h" heading="Tanya jawab" />
        <ClaimSection host={host} />
      </main>
      <SiteFooter contact={contactLinks()} />
    </>
  );
}
