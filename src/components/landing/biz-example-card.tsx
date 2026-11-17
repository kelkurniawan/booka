import type { BizExample } from "@/lib/marketing/content";

/** Kartu contoh halaman usaha (.stock). Fiktif; selalu diberi tanda "Contoh halaman." */
export function BizExampleCard({ example, host }: { example: BizExample; host: string }) {
  return (
    <div className="stock" style={{ width: "100%", maxWidth: 360, padding: "var(--space-lg)", display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span className="fig" style={{ fontSize: 13, color: "var(--color-muted)", overflowWrap: "anywhere" }}>
          {host}/{example.slug}
        </span>
        <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>{example.name}</span>
        <span style={{ fontSize: 14, color: "var(--color-muted)" }}>{example.bio}</span>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
        {example.items.map((it) => (
          <li key={it.name} style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)", padding: "10px 0", borderTop: "1px solid var(--color-rule)", fontSize: 15 }}>
            <span>{it.name}</span>
            <span className="fig" style={{ color: "var(--color-ink-2)" }}>{it.price}</span>
          </li>
        ))}
      </ul>
      <span className="btn btn--ink" aria-hidden="true" style={{ pointerEvents: "none" }}>{example.cta}</span>
      <span className="note">Contoh halaman.</span>
    </div>
  );
}
