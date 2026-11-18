import { normalizeSectionOrder, type PageSection } from "@/lib/theme/sections";

export const LINK_PLACEMENTS = ["BEFORE_SERVICES", "AFTER_SERVICES", "END"] as const;
export type LinkPlacement = (typeof LINK_PLACEMENTS)[number];

/** Letakkan LINKS; urutan relatif PROMO, SERVICES, FAQ dipertahankan. */
export function applyPlacement(order: readonly string[] | null | undefined, placement: LinkPlacement): PageSection[] {
  const rest: PageSection[] = normalizeSectionOrder(order).filter((s) => s !== "LINKS");
  const at = rest.indexOf("SERVICES");
  if (placement === "END") return [...rest, "LINKS"];
  rest.splice(placement === "BEFORE_SERVICES" ? at : at + 1, 0, "LINKS");
  return rest;
}

/** Kebalikan applyPlacement untuk menampilkan pilihan saat ini. */
export function placementFromOrder(order: readonly string[] | null | undefined): LinkPlacement {
  const o = normalizeSectionOrder(order);
  const l = o.indexOf("LINKS");
  const s = o.indexOf("SERVICES");
  if (l < s) return "BEFORE_SERVICES";
  if (l === s + 1) return "AFTER_SERVICES";
  return "END";
}
