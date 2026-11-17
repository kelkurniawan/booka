import { planAvailability } from "@/lib/plans";
import { AGENDA_EXAMPLE_ROWS, BIZ_EXAMPLES, QRIS_EXAMPLE_ROWS } from "@/lib/marketing/content";

import { BizExampleCard } from "./biz-example-card";
import { RadioSwitch, SwitchPanel } from "./radio-switch";

const li = { display: "flex", gap: "var(--space-xl) var(--space-2xl)", alignItems: "center", padding: "var(--space-2xl) 0", borderTop: "1px solid var(--color-rule-2)" } as const;
const text = { flex: "1 1 340px", minWidth: 0, display: "flex", flexDirection: "column", gap: "var(--space-md)" } as const;
const stage = { flex: "1 1 420px", minWidth: 0, borderRadius: 16, padding: "var(--space-xl)", display: "flex", justifyContent: "center" } as const;
const lead = { margin: 0, maxWidth: "44ch", color: "var(--color-ink-2)" } as const;
const h3 = { fontSize: "var(--text-title)" } as const;

const AGENDA_OFFSETS = [
  { left: 0, right: 24 },
  { left: 12, right: 12 },
  { left: 24, right: 0 },
  { left: 36, right: -12 },
] as const;

export function Workflow({ host }: { host: string }) {
  return (
    <section id="alur" aria-labelledby="alur-h" className="wrap" style={{ paddingTop: "var(--space-4xl)", paddingBottom: "var(--space-3xl)" }}>
      <h2 id="alur-h" style={{ fontSize: "var(--text-section)", lineHeight: 1.04, maxWidth: "18ch" }}>Satu booking, dari tautan sampai hari H.</h2>
      <ol style={{ listStyle: "none", margin: "var(--space-2xl) 0 0", padding: 0, display: "flex", flexDirection: "column" }}>
        <li data-switch style={{ ...li, flexWrap: "wrap" }}>
          <div style={text}>
            <h3 style={h3}>1. Pelanggan membuka tautan di bio</h3>
            <p style={lead}>Mereka melihat layanan, harga, dan jam yang masih kosong, dengan warna dan logo usaha Anda.</p>
            <RadioSwitch name="usaha" legend="Contoh usaha" options={BIZ_EXAMPLES.map((b) => b.label)} className="self-start" />
          </div>
          <div className="desk" style={stage}>
            {BIZ_EXAMPLES.map((b, i) => (
              <SwitchPanel key={b.slug} index={i} className="flex w-full justify-center">
                <BizExampleCard example={b} host={host} />
              </SwitchPanel>
            ))}
          </div>
        </li>

        <li style={{ ...li, flexWrap: "wrap-reverse" }}>
          <div className="desk" style={stage}>
            <div className="stock" style={{ width: "100%", maxWidth: 380, padding: "var(--space-lg)", display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontWeight: 600 }}>Mutasi QRIS, Sabtu</span>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <caption className="note" style={{ captionSide: "bottom", textAlign: "left", paddingTop: 8 }}>Contoh pembayaran DP yang masuk.</caption>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--color-muted)", fontSize: 13 }}>
                    <th scope="col" style={{ padding: "8px 0", fontWeight: 500 }}>Pelanggan</th>
                    <th scope="col" style={{ padding: "8px 0", fontWeight: 500, textAlign: "right" }}>Masuk</th>
                  </tr>
                </thead>
                <tbody>
                  {QRIS_EXAMPLE_ROWS.map((r) => (
                    <tr key={r.customer} style={{ borderTop: "1px solid var(--color-rule)" }}>
                      <td style={{ padding: "8px 0" }}>{r.customer}</td>
                      <td className="fig" style={{ padding: "8px 0", textAlign: "right" }}>{r.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <span className="note">Langsung ke akun Midtrans atau Xendit milik Anda.</span>
            </div>
          </div>
          <div style={text}>
            <h3 style={h3}>2. DP masuk ke akun pembayaran Anda</h3>
            <p style={lead}>Lewat QRIS, tanpa menunggu bukti transfer. Untuk restoran atau barbershop, layanan bisa diatur bayar di tempat.</p>
          </div>
        </li>

        <li style={{ ...li, flexWrap: "wrap" }}>
          <div style={text}>
            <h3 style={h3}>3. Pengingat terkirim sendiri</h3>
            {/* Klaim dicocokkan dengan kode: pengingat H-1 dan pagi hari jadwal (reminder-plan.ts), paket Pro dan Studio (REMINDER_TIERS), pindah jadwal bila merchant mengizinkan (customer-policy-form.tsx). */}
            <p style={lead}>Pengingat H-1 dikirim lewat WhatsApp, email, atau notifikasi HP, dan bisa ditambah pengingat pagi hari H. {planAvailability("Pro dan Studio")} Pelanggan bisa pindah jadwal sendiri bila Anda mengizinkan.</p>
          </div>
          <div className="desk" style={{ ...stage, flexDirection: "column", alignItems: "center", gap: "var(--space-md)" }}>
            <div className="stock" style={{ width: "100%", maxWidth: 360, padding: "var(--space-md) var(--space-lg)", transform: "rotate(-1.5deg)" }}>
              <span className="fig" style={{ fontSize: 12, color: "var(--color-muted)" }}>Jumat, 10.00</span>
              <p style={{ margin: "6px 0 0", fontSize: 15 }}>Halo Ayu, besok pukul 10.00 jadwal Makeup Wisuda di Rias by Sekar. Perlu pindah jadwal? Buka tautan di bawah.</p>
            </div>
            <div className="stock" style={{ alignSelf: "flex-end", maxWidth: 200, padding: "var(--space-sm) var(--space-md)", transform: "rotate(2deg)", fontSize: 15 }}>Siap, sampai besok</div>
            <span className="note" style={{ alignSelf: "flex-start" }}>Contoh pengingat.</span>
          </div>
        </li>

        <li style={{ ...li, flexWrap: "wrap-reverse" }}>
          <div className="desk" style={{ ...stage, flexDirection: "column", alignItems: "center", gap: "var(--space-md)", paddingBottom: "var(--space-xl)" }}>
            <div className="agenda-stack" style={{ position: "relative", width: "100%", maxWidth: 380, height: 236 }}>
              {AGENDA_EXAMPLE_ROWS.map((r, i) => (
                <div key={r.time} className="stock" style={{ position: "absolute", ...AGENDA_OFFSETS[i], top: i * 60, padding: "12px var(--space-md)", display: "flex", justifyContent: "space-between", gap: "var(--space-sm)" }}>
                  <span><span className="fig">{r.time}</span> {r.who}</span>
                  <span style={{ color: "var(--color-muted)" }}>{r.status}</span>
                </div>
              ))}
            </div>
            <span className="note" style={{ alignSelf: "flex-start" }}>Contoh agenda.</span>
          </div>
          <div style={text}>
            <h3 style={h3}>4. Hari H, semua sudah tertata</h3>
            <p style={lead}>Dashboard di HP menunjukkan siapa yang datang, siapa yang sudah bayar, dan siapa yang membayar di tempat.</p>
          </div>
        </li>
      </ol>
    </section>
  );
}
