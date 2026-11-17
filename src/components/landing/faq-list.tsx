import { Plus } from "lucide-react";

import type { Faq } from "@/lib/marketing/content";

export function FaqList({ faqs, headingId, heading }: { faqs: readonly Faq[]; headingId: string; heading: string }) {
  return (
    <section id="tanya" aria-labelledby={headingId} className="wrap" style={{ paddingTop: "var(--space-4xl)", paddingBottom: "var(--space-3xl)", display: "flex", flexWrap: "wrap", gap: "var(--space-xl) var(--space-3xl)" }}>
      <h2 id={headingId} style={{ flex: "1 1 280px", fontSize: "var(--text-section)", lineHeight: 1.04 }}>{heading}</h2>
      <div style={{ flex: "2 1 520px", minWidth: 0, borderTop: "1px solid var(--color-rule-2)" }}>
        {faqs.map((f) => (
          <details key={f.question} style={{ borderBottom: "1px solid var(--color-rule-2)" }}>
            <summary style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-md)", minHeight: 68, fontSize: 19, fontWeight: 500 }}>
              {f.question}
              <Plus className="q-mark" aria-hidden="true" size={26} strokeWidth={1.5} style={{ flex: "none" }} />
            </summary>
            <p style={{ margin: "0 0 var(--space-lg)", maxWidth: "60ch", color: "var(--color-ink-2)" }}>{f.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
