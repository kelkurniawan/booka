import Link from "next/link";
import type { ReactNode } from "react";

import type { ContactKind, ContactLink } from "@/lib/marketing/contact";
import { ROUTES } from "@/lib/routes";

const svg = (children: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const ICONS: Record<ContactKind, ReactNode> = {
  whatsapp: svg(<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z" />),
  email: svg(
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </>,
  ),
  instagram: svg(
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M17.5 6.5h.01" />
    </>,
  ),
  threads: <span style={{ fontWeight: 700, fontSize: 18 }}>@</span>,
  x: <span style={{ fontWeight: 700, fontSize: 17 }}>X</span>,
  tiktok: svg(<path d="M9 12a4 4 0 1 0 4 4V3c.5 2.5 2.5 4.5 5 5" />),
};

const iconLink = {
  width: 44,
  height: 44,
  borderRadius: 999,
  border: "1px solid var(--color-rule-2)",
  color: "var(--color-ink)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
} as const;

export function SiteFooter({ contact }: { contact: ContactLink[] }) {
  return (
    <footer className="wrap" style={{ paddingBottom: "var(--space-xl)" }}>
      <p
        aria-hidden="true"
        style={{
          margin: 0,
          fontSize: "clamp(96px, 22vw, 320px)",
          fontWeight: 700,
          letterSpacing: "-0.06em",
          lineHeight: 0.8,
          color: "var(--color-ink)",
        }}
      >
        marky
      </p>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--space-md) var(--space-xl)",
          alignItems: "center",
          paddingTop: "var(--space-lg)",
          marginTop: "var(--space-lg)",
          borderTop: "1px solid var(--color-rule-2)",
          fontSize: "var(--text-small)",
          color: "var(--color-muted)",
        }}
      >
        <span style={{ flex: "1 1 280px" }}>Untuk usaha jasa kecil di Indonesia.</span>
        <nav aria-label="Kaki halaman" style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-sm) var(--space-lg)" }}>
          <Link href="/#harga">Harga</Link>
          <Link href={ROUTES.login}>Masuk</Link>
          <Link href={ROUTES.terms}>Syarat</Link>
          <Link href={ROUTES.privacy}>Privasi</Link>
        </nav>
        {contact.length > 0 && (
          <ul
            aria-label="Media sosial dan kontak"
            style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: "var(--space-sm)" }}
          >
            {contact.map((c) => (
              <li key={c.kind}>
                <a href={c.href} aria-label={c.label} style={iconLink}>
                  <span aria-hidden="true" style={{ display: "flex" }}>{ICONS[c.kind]}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </footer>
  );
}
