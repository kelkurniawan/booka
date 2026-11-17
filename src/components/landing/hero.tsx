import { EARLY_ACCESS_FREE, STARTER_MONTHLY_TRANSACTIONS } from "@/lib/plans";

import { HeroMotionShell } from "./hero-motion/hero-motion";

const bubble = { margin: 0, maxWidth: "85%", padding: "8px 12px", fontSize: 14 } as const;
const dt = { color: "var(--color-muted)" } as const;
const dd = { margin: 0 } as const;

export function Hero({ host }: { host: string }) {
  const intro = (
    <div className="wrap" style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "var(--space-lg)" }}>
      <h1 id="hero-h" style={{ maxWidth: "13ch", fontSize: "var(--text-display)", lineHeight: 1.02 }}>Booking masuk sendiri. Anda tinggal melayani.</h1>
      <p style={{ margin: 0, maxWidth: "34ch", fontSize: "var(--text-lead)", color: "var(--color-ink-2)" }}>Satu tautan di bio untuk jadwal, DP, dan pengingat.</p>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "var(--space-sm)", maxWidth: "100%" }}>
        <a href="#klaim" className="btn btn--ink btn--wrap">Klaim {host}/nama-anda</a>
        <a href="#alur" style={{ display: "inline-flex", alignItems: "center", minHeight: 48, padding: "0 var(--space-md)", fontSize: 16, fontWeight: 500 }}>Lihat cara kerjanya</a>
      </div>
      <p style={{ margin: 0, fontSize: "var(--text-small)", color: "var(--color-muted)" }}>{EARLY_ACCESS_FREE ? "Semua fitur gratis selama masa awal, tanpa kartu kredit." : `Gratis untuk ${STARTER_MONTHLY_TRANSACTIONS} transaksi per bulan, tanpa kartu kredit.`}</p>
    </div>
  );

  const desk = (
    <div className="wrap" style={{ width: "100%", display: "flex", justifyContent: "center", marginTop: "var(--space-xl)" }}>
      <figure aria-label="Sebelum dan sesudah: obrolan WhatsApp menjadi slip booking yang sudah lunas" className="desk" style={{ margin: 0, width: "100%", maxWidth: 980, borderRadius: 16, padding: "clamp(28px, 5vw, 56px) clamp(16px, 4vw, 56px)", boxSizing: "border-box", display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: "clamp(24px, 4vw, 56px)", textAlign: "left" }}>
        <div className="stock chat" style={{ flex: "0 1 330px", minWidth: 0, padding: "var(--space-md)", display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          <span style={{ fontSize: 13, color: "var(--color-muted)" }}>Sebelum, lewat DM</span>
          <p className="bubble" style={{ ...bubble, "--i": 0, alignSelf: "flex-start", borderRadius: "4px 12px 12px 12px", background: "var(--color-paper-2)" } as React.CSSProperties}>Kak, Sabtu jam 10 masih kosong?</p>
          <p className="bubble" style={{ ...bubble, "--i": 1, alignSelf: "flex-end", borderRadius: "12px 4px 12px 12px", background: "var(--color-chat)" } as React.CSSProperties}>Sebentar ya kak, saya cek dulu</p>
          <p className="bubble" style={{ ...bubble, "--i": 2, alignSelf: "flex-start", borderRadius: "4px 12px 12px 12px", background: "var(--color-paper-2)" } as React.CSSProperties}>Kak? Jadi bisa nggak?</p>
          <span className="fig bubble" style={{ "--i": 3, alignSelf: "flex-end", fontSize: 12, color: "var(--color-muted)" } as React.CSSProperties}>dibalas 3 jam kemudian</span>
        </div>

        <div className="stock slip" style={{ position: "relative", flex: "0 1 340px", minWidth: 0, padding: "var(--space-lg)", display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--space-md)" }}>
            <span style={{ fontWeight: 600 }}>Rias by Sekar</span>
            <span className="fig" style={{ fontSize: 13, color: "var(--color-muted)" }}>BK-7F3A</span>
          </div>
          <span style={{ fontSize: 13, color: "var(--color-muted)" }}>Sesudah, lewat Marky</span>
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: "6px var(--space-md)", fontSize: 15 }}>
            <dt style={dt}>Layanan</dt><dd style={dd}>Makeup Wisuda</dd>
            <dt style={dt}>Jadwal</dt><dd style={dd}>Sabtu 21 Nov, <span className="fig">10.00</span></dd>
            <dt style={dt}>Pelanggan</dt><dd style={dd}>Ayu Lestari</dd>
          </dl>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: "var(--space-sm)", borderTop: "1px solid var(--color-print)" }}>
            <span style={{ fontWeight: 600 }}>DP lewat QRIS</span><span className="fig" style={{ fontWeight: 500 }}>Rp350.000</span>
          </div>
          <span className="stamp" aria-hidden="true" style={{ position: "absolute", right: 18, bottom: 54 }}>
            <span className="paid" style={{ fontSize: 34, letterSpacing: "-0.02em" }}>Lunas</span>
          </span>
          <span className="note">Contoh slip booking.</span>
        </div>
      </figure>
    </div>
  );

  return (
    <section aria-labelledby="hero-h" style={{ paddingTop: "var(--space-2xl)", paddingBottom: "var(--space-3xl)" }}>
      <HeroMotionShell desk={desk} host={host}>{intro}</HeroMotionShell>
    </section>
  );
}
