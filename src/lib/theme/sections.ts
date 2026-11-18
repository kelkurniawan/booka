// Harus sama dengan constraint merchant_themes_section_order_valid dan
// merchant_themes_hidden_sections_valid di migration 20261125000200.
export const PAGE_SECTIONS = ["LINKS", "PROMO", "SERVICES", "FAQ"] as const;
export type PageSection = (typeof PAGE_SECTIONS)[number];

/** SERVICES tidak bisa disembunyikan: halaman tanpa layanan tidak bisa menerima pesanan. */
export const HIDEABLE_SECTIONS = ["LINKS", "PROMO", "FAQ"] as const;

export const SECTION_LABELS: Record<PageSection, string> = {
  LINKS: "Tautan",
  PROMO: "Banner promo",
  SERVICES: "Layanan",
  FAQ: "Pertanyaan umum",
};

/** Urutan lengkap: kunci asing dan duplikat dibuang, yang hilang ditambahkan di urutan bawaan. */
export function normalizeSectionOrder(
  order: readonly string[] | null | undefined,
): PageSection[] {
  const hasil: PageSection[] = [];
  for (const kunci of [...(order ?? []), ...PAGE_SECTIONS]) {
    const bagian = PAGE_SECTIONS.find((s) => s === kunci);
    if (bagian && !hasil.includes(bagian)) hasil.push(bagian);
  }
  return hasil;
}

/** Urutan tampil: urutan lengkap tanpa bagian yang disembunyikan (LINKS/PROMO/FAQ). */
export function visibleSections(
  order: readonly string[] | null | undefined,
  hidden: readonly string[] | null | undefined,
): PageSection[] {
  return normalizeSectionOrder(order).filter(
    (s) => !(HIDEABLE_SECTIONS as readonly string[]).includes(s) || !hidden?.includes(s),
  );
}

export function moveSection(
  order: readonly PageSection[],
  section: PageSection,
  direction: "up" | "down",
): PageSection[] {
  const hasil = [...order];
  const dari = hasil.indexOf(section);
  const ke = dari + (direction === "up" ? -1 : 1);
  if (dari < 0 || ke < 0 || ke >= hasil.length) return hasil;
  [hasil[dari], hasil[ke]] = [hasil[ke], hasil[dari]];
  return hasil;
}
