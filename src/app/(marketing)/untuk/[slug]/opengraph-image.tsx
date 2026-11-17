import { notFound } from "next/navigation";

import { INDUSTRIES, industryBySlug } from "@/lib/marketing/industries";
import { renderOgCard } from "@/lib/marketing/og";
import { OG_IMAGE_SIZE } from "@/lib/site";

export const alt = "Marky untuk jenis usaha Anda";
export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return INDUSTRIES.map((i) => ({ slug: i.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const industry = industryBySlug((await params).slug);
  if (!industry) notFound();
  return renderOgCard({ title: industry.h1, subtitle: industry.name });
}
