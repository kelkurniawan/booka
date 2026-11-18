"use client";

import { LinksSection } from "@/components/booking-page/links-section";
import type { MerchantLink } from "@/types/database";

import { trackFunnel } from "./funnel-tracker";

/** Pembungkus klien: LINK_CLICK dikirim lewat beacon, navigasi tidak diblok. */
export function PublicLinks({ links }: { links: Pick<MerchantLink, "id" | "label" | "url">[] }) {
  return <LinksSection links={links} onLinkClick={(id) => trackFunnel("LINK_CLICK", { merchantLinkId: id })} />;
}
