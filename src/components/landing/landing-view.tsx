import { LANDING_FAQS } from "@/lib/marketing/content";
import type { ContactLink } from "@/lib/marketing/contact";

import { ClaimSection } from "./claim-section";
import { FaqList } from "./faq-list";
import { Hero } from "./hero";
import { Masthead } from "./masthead";
import { Policies } from "./policies";
import { Pricing } from "./pricing";
import { SiteFooter } from "./site-footer";
import { Workflow } from "./workflow";

/** Seluruh halaman depan: masthead, bagian-bagian, kaki halaman. Server Component, statis. */
export function LandingView({ host, contact }: { host: string; contact: ContactLink[] }) {
  return (
    <>
      <Masthead />
      <main>
        <Hero host={host} />
        <Workflow host={host} />
        <Pricing />
        <FaqList faqs={LANDING_FAQS} headingId="tanya-h" heading="Tanya jawab" />
        <Policies />
        <ClaimSection host={host} />
      </main>
      <SiteFooter contact={contact} />
    </>
  );
}
