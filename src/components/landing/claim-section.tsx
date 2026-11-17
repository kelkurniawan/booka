import { MESSAGE_EXAMPLES } from "@/lib/marketing/content";

import { ClaimLink } from "./claim-link";
import { RadioSwitch, SwitchPanel } from "./radio-switch";

export function ClaimSection({ host }: { host: string }) {
  return (
    <section id="klaim" aria-labelledby="klaim-h" className="wrap" style={{ paddingTop: "var(--space-3xl)", paddingBottom: "var(--space-4xl)" }}>
      <div data-switch className="desk" style={{ borderRadius: 20, padding: "clamp(28px, 5vw, 72px)", display: "flex", flexWrap: "wrap", gap: "var(--space-2xl)", alignItems: "center" }}>
        <div style={{ flex: "1 1 380px", minWidth: 0, display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
          <h2 id="klaim-h" style={{ fontSize: "var(--text-section)", lineHeight: 1.04, maxWidth: "14ch" }}>Yang diterima pelanggan Anda.</h2>
          <RadioSwitch name="pesan" legend="Jenis pesan" options={MESSAGE_EXAMPLES.map((m) => m.label)} className="self-start" />
          <div className="claim-form" style={{ maxWidth: 520, marginTop: "var(--space-md)" }}>
            <ClaimLink host={host} />
          </div>
        </div>
        <div aria-live="polite" className="stock" style={{ flex: "1 1 360px", minWidth: 0, maxWidth: 440, padding: "var(--space-lg)", transform: "rotate(1.5deg)" }}>
          {MESSAGE_EXAMPLES.map((m, i) => (
            <SwitchPanel key={m.label} index={i} className="flex flex-col gap-2">
              <span style={{ fontSize: 13, color: "var(--color-muted)" }}>WhatsApp ke Ayu Lestari, {m.when}</span>
              <p style={{ margin: 0, fontSize: 16, whiteSpace: "pre-line" }}>{m.text}</p>
              <span className="fig" style={{ fontSize: 13, color: "var(--color-ink-2)", overflowWrap: "anywhere" }}>{host}{m.linkPath}</span>
              <span className="note">Contoh pesan.</span>
            </SwitchPanel>
          ))}
        </div>
      </div>
    </section>
  );
}
