import Link from "next/link";

import { POLICIES } from "@/lib/marketing/content";
import { ROUTES } from "@/lib/routes";

export function Policies() {
  return (
    <section id="kebijakan" aria-labelledby="kebijakan-h" className="wrap" style={{ paddingTop: "var(--space-xl)", paddingBottom: "var(--space-3xl)", display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>
      <h2 id="kebijakan-h" style={{ fontSize: "var(--text-section)", lineHeight: 1.04, maxWidth: "16ch" }}>Kebijakan singkat</h2>
      {/* Baris bergaris, bukan kartu kembar: urutannya sama penting, jadi tidak diberi bobot visual berbeda. */}
      <ul className="ruled-list">
        {POLICIES.map((p) => (
          <li key={p.title}>
            <h3>{p.title}</h3>
            <p>{p.body}</p>
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
