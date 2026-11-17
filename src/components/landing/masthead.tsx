import Link from "next/link";

import { ROUTES } from "@/lib/routes";

import { MastheadMenu } from "./masthead-menu";

/** Masthead: tautan kiri, wordmark tengah, Masuk dan CTA kanan. */
export function Masthead() {
  return (
    <header className="wrap" style={{ paddingTop: "var(--space-lg)", position: "relative" }}>
      <div
        className="masthead"
        style={{
          alignItems: "center",
          gap: "var(--space-md)",
          paddingBottom: "var(--space-md)",
          borderBottom: "1px solid var(--color-rule)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <MastheadMenu />
          <nav aria-label="Utama" className="masthead-links" style={{ fontSize: "var(--text-small)" }}>
            <Link href="/#alur" style={{ textDecoration: "none" }}>Cara kerja</Link>
            <Link href="/#harga" style={{ textDecoration: "none" }}>Harga</Link>
            <Link href="/#tanya" style={{ textDecoration: "none" }}>Tanya jawab</Link>
          </nav>
        </div>
        <Link
          href="/"
          aria-label="Marky, beranda"
          style={{
            justifySelf: "center",
            textDecoration: "none",
            fontSize: "clamp(30px, 3.4vw, 44px)",
            fontWeight: 700,
            letterSpacing: "-0.05em",
            lineHeight: 1,
          }}
        >
          marky
        </Link>
        <div style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
          <Link href={ROUTES.login} className="masthead-login" style={{ fontSize: "var(--text-small)", textDecoration: "none" }}>
            Masuk
          </Link>
          <a
            href="#klaim"
            className="btn btn--ink"
            style={{ minHeight: 44, padding: "0 var(--space-md)", fontSize: "var(--text-small)" }}
          >
            <span className="cta-long">Mulai gratis</span>
            <span className="cta-short">Mulai</span>
          </a>
        </div>
      </div>
    </header>
  );
}
