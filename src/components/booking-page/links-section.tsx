"use client";

import { IconSvg } from "@/components/booking-page/social-icons";
import { isSafeLinkUrl } from "@/lib/funnel/pixel-ids";
import { linkHost, linkIconFor } from "@/lib/funnel/link-icon";
import type { MerchantLink } from "@/types/database";

/** Tautan link-in-bio. Tanpa tautan aman, bagian ini tidak ada di HTML. */
export function LinksSection({
  links,
  onLinkClick,
}: {
  links: Pick<MerchantLink, "id" | "label" | "url">[];
  onLinkClick?: (id: string) => void;
}) {
  const aman = links.filter((l) => isSafeLinkUrl(l.url));
  if (aman.length === 0) return null;

  return (
    <section aria-labelledby="tautan-heading">
      <h2 id="tautan-heading" className="sr-only">
        Tautan
      </h2>
      <ul className="flex flex-col gap-2.5">
        {aman.map((l) => (
          <li key={l.id}>
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onLinkClick?.(l.id)}
              className="bg-card border-border text-foreground flex min-h-14 items-center gap-3 border py-2 pr-4 pl-2"
              style={{ borderRadius: "var(--radius)" }}
            >
              <span
                aria-hidden
                className="bg-muted text-primary flex size-10 shrink-0 items-center justify-center"
                style={{ borderRadius: "calc(var(--radius) * 0.75)" }}
              >
                <IconSvg name={linkIconFor(l.url)} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold">{l.label}</span>
                <span className="text-muted-foreground truncate text-xs">{linkHost(l.url)}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
