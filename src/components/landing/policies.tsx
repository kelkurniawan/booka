import Link from "next/link";

import { POLICIES } from "@/lib/marketing/content";
import { ROUTES } from "@/lib/routes";

export function Policies() {
  return (
    <section id="kebijakan" aria-labelledby="kebijakan-h" className="wrap" style={{ paddingTop: "var(--space-xl)", paddingBottom: "var(--space-3xl)", display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>
      <h2 id="kebijakan-h" style={{ fontSize: "var(--text-section)", lineHeight: 1.04, maxWidth: "16ch" }}>Kebijakan singkat</h2>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: "var(--space-md)" }}>
        {POLICIES.map((p) => (
          <li key={p.title} className="stock" style={{ padding: "var(--space-lg)", display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
            <h3 style={{ fontSize: 19, letterSpacing: "-0.01em" }}>{p.title}</h3>
            <p style={{ margin: 0, color: "var(--color-ink-2)" }}>{p.body}</p>
          </li>
        ))}
      </ul>
      <p style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: "var(--space-sm) var(--space-lg)" }}>
        <Link href={ROUTES.terms}>Baca syarat lengkap</Link>
        <Link href={ROUTES.privacy}>Baca kebijakan privasi</Link>
      </p>
    </section>
  );
}
