import { EARLY_ACCESS_DETAIL, EARLY_ACCESS_FREE, EARLY_ACCESS_NOTE, PLAN_COMPARISON, PLANS, type Plan } from "@/lib/plans";

import { RadioSwitch, SwitchPanel } from "./radio-switch";

const muted = { color: "var(--color-board-muted)" } as const;
const ctaFor = (p: Plan) =>
  EARLY_ACCESS_FREE ? "Mulai gratis" : p.tier === "STARTER" ? "Mulai dengan Starter" : "Mulai dari Starter";
const priceHead = (p: Plan) => (p.period === "per bulan" ? `${p.price} / bulan` : p.price);

export function Pricing() {
  return (
    <section id="harga" aria-labelledby="harga-h" style={{ background: "var(--color-board)", color: "var(--color-board-type)" }}>
      <div className="wrap" style={{ paddingTop: "var(--space-4xl)", paddingBottom: "var(--space-4xl)", display: "flex", flexDirection: "column", gap: "var(--space-2xl)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "var(--space-xl)" }}>
          <h2 id="harga-h" style={{ fontSize: "var(--text-section)", lineHeight: 1.04, maxWidth: "14ch" }}>Mulai gratis, naik saat ramai.</h2>
          <p style={{ margin: 0, display: "flex", alignItems: "baseline", gap: "var(--space-sm)" }}>
            <span style={{ fontSize: "clamp(72px, 11vw, 168px)", fontWeight: 600, letterSpacing: "-0.05em", lineHeight: 0.85 }}>Rp0</span>
            <span style={{ fontSize: "var(--text-title)", fontWeight: 500, ...muted }}>untuk mulai</span>
          </p>
        </div>

        {EARLY_ACCESS_FREE ? (
          <p style={{ margin: 0, fontSize: "var(--text-body)" }}>
            <strong>{EARLY_ACCESS_NOTE}</strong> <span style={muted}>{EARLY_ACCESS_DETAIL}</span>
          </p>
        ) : null}

        <div className="price-mobile" data-switch style={{ flexDirection: "column", gap: "var(--space-lg)" }}>
          <RadioSwitch name="paket" legend="Pilih paket" options={PLANS.map((p) => p.name)} defaultIndex={1} tone="board" />
          {PLANS.map((p, i) => (
            <SwitchPanel key={p.tier} index={i}>
              <article aria-labelledby={`plan-h-${p.tier}`} style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)", padding: "var(--space-lg)", borderRadius: 12, border: "1px solid var(--color-board-rule)" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <h3 id={`plan-h-${p.tier}`} style={{ fontSize: "var(--text-title)" }}>{p.name}</h3>
                  <span style={muted}>{p.audience}</span>
                </div>
                <p style={{ margin: 0, display: "flex", alignItems: "baseline", gap: "var(--space-sm)", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1 }}>{p.price}</span>
                  <span style={muted}>{p.period}</span>
                </p>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
                  {PLAN_COMPARISON.map((r) => {
                    const v = r.values[p.tier];
                    return (
                      <li key={r.label} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "12px 0", borderTop: "1px solid var(--color-board-rule)", ...(v ? {} : muted) }}>
                        <span>{r.label}</span>
                        <span style={{ fontWeight: 600, textAlign: "right" }}>{v ?? "Tidak termasuk"}</span>
                      </li>
                    );
                  })}
                </ul>
                <a href="#klaim" className="btn btn--card" style={{ width: "100%", boxSizing: "border-box" }}>{ctaFor(p)}</a>
              </article>
            </SwitchPanel>
          ))}
          {/* Klaim dicocokkan: perubahan paket ditangani manual tim Marky (dashboard/billing/page.tsx). */}
          <span style={{ fontSize: "var(--text-small)", ...muted }}>Tanpa kartu kredit. Perubahan paket dibantu tim Marky.</span>
        </div>

        <div className="price-table" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse", fontSize: 16 }}>
            <caption className="sr-only">Perbandingan paket Marky</caption>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th scope="col" style={{ padding: "0 0 var(--space-md)", width: "34%", fontWeight: 500, ...muted }}>Paket</th>
                {PLANS.map((p, i) => (
                  <th key={p.tier} scope="col" style={{ padding: i < 2 ? "0 var(--space-md) var(--space-md) 0" : "0 0 var(--space-md)", verticalAlign: "bottom" }}>
                    <span style={{ display: "block", fontSize: "var(--text-title)", fontWeight: 600 }}>{p.name}</span>
                    <span className="fig" style={{ fontWeight: 400, ...muted }}>{priceHead(p)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLAN_COMPARISON.map((r) => (
                <tr key={r.label} style={{ borderTop: "1px solid var(--color-board-rule)" }}>
                  <th scope="row" style={{ padding: "14px var(--space-md) 14px 0", textAlign: "left", fontWeight: 400, ...muted }}>{r.label}</th>
                  {PLANS.map((p, i) => (
                    <td key={p.tier} style={{ padding: i < 2 ? "14px var(--space-md) 14px 0" : "14px 0" }}>{r.values[p.tier] ?? "Tidak"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="price-foot" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-md)" }}>
          <a href="#klaim" className="btn btn--card">{EARLY_ACCESS_FREE ? "Mulai gratis" : "Mulai dengan Starter"}</a>
          <span style={{ fontSize: "var(--text-small)", ...muted }}>Tanpa kartu kredit.</span>
        </div>
      </div>
    </section>
  );
}
