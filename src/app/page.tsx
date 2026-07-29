import Link from "next/link";
import { Check } from "lucide-react";

import { ClaimLink } from "@/components/landing/claim-link";
import { ROUTES } from "@/lib/routes";

export const metadata = {
  title: "Booka — Terima booking dan DP lewat satu tautan",
  description:
    "Satu tautan untuk pelanggan memesan jadwal dan membayar DP. Dananya masuk langsung ke akun payment gateway Anda, bukan ke Booka.",
};

/** Langkah yang benar-benar berurutan dari sisi pelanggan, karena itu dinomori. */
const STEPS = [
  {
    title: "Pelanggan buka tautan Anda",
    body: "Daftar layanan beserta harga dan durasinya langsung terlihat. Tidak perlu bertanya lebih dulu.",
  },
  {
    title: "Pilih tanggal dan jam kosong",
    body: "Jam yang sudah terisi tidak muncul. Slot terkunci begitu dipilih, jadi tidak ada dua orang di jam yang sama.",
  },
  {
    title: "Bayar DP lewat QRIS",
    body: "Dana masuk ke akun payment gateway Anda. Anda dan pelanggan sama-sama dapat notifikasi WhatsApp.",
  },
];

const PLANS = [
  {
    name: "Starter",
    price: "Gratis",
    period: "selamanya",
    for: "Baru mulai, ingin coba dulu",
    features: [
      "10 transaksi per bulan",
      "1 jenis layanan",
      "Halaman booking + QRIS",
      "Ada watermark Booka",
    ],
    cta: "Mulai gratis",
    featured: false,
  },
  {
    name: "Pro",
    price: "Rp79.000",
    period: "per bulan",
    for: "Sudah rutin menerima pesanan",
    features: [
      "Transaksi tanpa batas",
      "Layanan tanpa batas",
      "Reminder WhatsApp otomatis",
      "Tanpa watermark",
      "Warna dan tampilan sendiri",
    ],
    cta: "Mulai dari Starter",
    featured: true,
  },
  {
    name: "Studio",
    price: "Rp199.000",
    period: "per bulan",
    for: "Punya tim dan beberapa staf",
    features: [
      "Semua fitur Pro",
      "Jadwal per staf",
      "Laporan dan analitik",
      "Domain sendiri",
    ],
    cta: "Mulai dari Starter",
    featured: false,
  },
];

export default function LandingPage() {
  // Dibaca langsung, bukan lewat serverEnv(), supaya halaman depan tetap bisa
  // dirender walau konfigurasi Supabase belum lengkap.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const host = appUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        <Hero host={host} />
        <MoneyFlow />
        <HowItWorks />
        <Pricing />
        <ClosingCta />
      </main>

      <SiteFooter />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function SiteHeader() {
  return (
    <header className="border-border sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link href={ROUTES.home} className="font-mono text-sm font-semibold tracking-tight">
          booka
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            href={ROUTES.login}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-foreground/30 px-3 py-2 focus-visible:ring-2 focus-visible:outline-none"
          >
            Masuk
          </Link>
          <Link
            href={ROUTES.signup}
            className="bg-foreground text-background focus-visible:ring-foreground/30 px-4 py-2 focus-visible:ring-2 focus-visible:outline-none"
          >
            Mulai gratis
          </Link>
        </nav>
      </div>
    </header>
  );
}

/**
 * Garis pemisah setinggi 1px dengan label duduk di atasnya, ditandai potongan
 * garis yang lebih tebal. Dipakai sebagai satu-satunya perangkat struktural
 * halaman ini.
 */
function SectionRule({ label }: { label: string }) {
  return (
    <div className="border-border border-t">
      <div className="mx-auto max-w-5xl px-6">
        <span className="border-foreground text-muted-foreground -mt-px inline-block border-t-2 py-3 font-mono text-[0.7rem] tracking-[0.18em] uppercase">
          {label}
        </span>
      </div>
    </div>
  );
}

function Hero({ host }: { host: string }) {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
      <div className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 flex flex-col gap-8 motion-safe:duration-700">
        <h1 className="max-w-3xl text-4xl leading-[1.05] font-semibold tracking-[-0.03em] text-balance sm:text-6xl">
          Booking dan DP pelanggan Anda, selesai di satu tautan.
        </h1>

        <p className="text-muted-foreground max-w-xl text-lg text-pretty">
          Untuk MUA, fotografer, dan usaha jasa lain yang masih mengatur jadwal
          lewat chat. Buat tautan Anda, bagikan, dan biarkan pelanggan memesan
          sendiri.
        </p>

        <div className="max-w-2xl pt-2">
          <ClaimLink host={host} />
        </div>
      </div>
    </section>
  );
}

function MoneyFlow() {
  return (
    <>
      <SectionRule label="Soal uang" />
      <section className="mx-auto max-w-5xl px-6 py-14 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-16">
          <div className="flex flex-col gap-4">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-balance sm:text-3xl">
              DP pelanggan tidak pernah lewat kami.
            </h2>
            <p className="text-muted-foreground text-pretty">
              Anda menghubungkan akun Midtrans atau Xendit milik Anda sendiri.
              Booka menembak API atas nama Anda, lalu dananya langsung mendarat
              di akun itu — tanpa jeda pencairan, tanpa potongan dari kami.
            </p>
            <p className="text-muted-foreground text-pretty">
              Yang Anda bayar ke Booka hanya biaya sewa sistemnya, terpisah sama
              sekali dari uang pelanggan.
            </p>
          </div>

          <figure className="flex flex-col gap-4">
            <div
              className="border-border flex flex-col gap-0 border sm:flex-row"
              role="img"
              aria-label="Diagram: dana dari pelanggan mengalir langsung ke akun payment gateway merchant. Booka hanya menerima data jadwal, bukan dana."
            >
              <div className="flex-1 p-6">
                <p className="text-muted-foreground font-mono text-[0.7rem] tracking-[0.18em] uppercase">
                  Dari
                </p>
                <p className="mt-2 text-lg font-medium">Pelanggan</p>
                <p className="text-muted-foreground mt-1 text-sm">Bayar DP via QRIS</p>
              </div>

              <div
                className="border-border text-muted-foreground flex items-center justify-center border-t px-6 py-3 sm:border-t-0 sm:border-l sm:py-0"
                aria-hidden
              >
                <span className="font-mono text-sm">→</span>
              </div>

              <div className="border-border flex-1 border-t p-6 sm:border-t-0 sm:border-l">
                <p className="text-muted-foreground font-mono text-[0.7rem] tracking-[0.18em] uppercase">
                  Ke
                </p>
                <p className="mt-2 text-lg font-medium">Akun payment gateway Anda</p>
                <p className="text-muted-foreground mt-1 text-sm">Midtrans atau Xendit</p>
              </div>
            </div>

            <figcaption className="border-border text-muted-foreground border border-dashed p-5 text-sm">
              <span className="text-foreground font-mono text-[0.7rem] tracking-[0.18em] uppercase">
                Peran Booka
              </span>
              <span className="mt-2 block text-pretty">
                Mengunci jadwal, mengirim notifikasi, dan merapikan catatan
                pesanan. Tidak pernah menyentuh dananya.
              </span>
            </figcaption>
          </figure>
        </div>
      </section>
    </>
  );
}

function HowItWorks() {
  return (
    <>
      <SectionRule label="Dari sisi pelanggan" />
      <section className="mx-auto max-w-5xl px-6 py-14 sm:py-20">
        <ol className="border-border grid border-t sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="border-border border-b p-6 sm:border-r sm:border-b-0 sm:last:border-r-0"
            >
              <span
                className="text-muted-foreground font-mono text-[0.7rem] tracking-[0.18em]"
                aria-hidden
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 font-medium text-balance">{step.title}</h3>
              <p className="text-muted-foreground mt-2 text-sm text-pretty">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function Pricing() {
  return (
    <>
      <SectionRule label="Harga" />
      <section className="mx-auto max-w-5xl px-6 py-14 sm:py-20">
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
            Mulai gratis, bayar kalau sudah ramai.
          </h2>
          <p className="text-muted-foreground max-w-xl text-pretty">
            Tidak ada uji coba berbatas waktu. Paket Starter tetap gratis
            selamanya — naik paket hanya saat kuotanya benar-benar terasa
            kurang.
          </p>
        </div>

        <div className="mt-10 grid gap-px sm:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={
                plan.featured
                  ? "border-foreground flex flex-col border-2 p-6"
                  : "border-border flex flex-col border p-6"
              }
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-mono text-sm tracking-[0.12em] uppercase">{plan.name}</h3>
                {plan.featured ? (
                  <span className="bg-foreground text-background px-2 py-0.5 font-mono text-[0.65rem] tracking-[0.1em] uppercase">
                    Populer
                  </span>
                ) : null}
              </div>

              <p className="mt-5 text-3xl font-semibold tracking-[-0.02em]">{plan.price}</p>
              <p className="text-muted-foreground font-mono text-xs">{plan.period}</p>

              <p className="text-muted-foreground mt-4 border-t border-border pt-4 text-sm">
                {plan.for}
              </p>

              <ul className="mt-4 flex flex-1 flex-col gap-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span className="text-pretty">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={ROUTES.signup}
                className={
                  plan.featured
                    ? "bg-foreground text-background focus-visible:ring-foreground/30 mt-6 py-2.5 text-center text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
                    : "border-border hover:border-foreground focus-visible:ring-foreground/30 mt-6 border py-2.5 text-center text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
                }
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="text-muted-foreground mt-6 text-sm">
          Biaya transaksi payment gateway mengikuti tarif Midtrans atau Xendit
          dan ditagih langsung oleh mereka. Booka tidak menambah potongan apa pun.
        </p>
      </section>
    </>
  );
}

function ClosingCta() {
  return (
    <>
      <SectionRule label="Mulai" />
      <section className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
        <div className="flex flex-col items-start gap-6">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-[-0.025em] text-balance sm:text-4xl">
            Berhenti mencatat jadwal di kepala.
          </h2>
          <p className="text-muted-foreground max-w-lg text-pretty">
            Buat akun, tentukan tautan Anda, dan halaman booking langsung hidup.
            Hubungkan payment gateway kapan pun Anda siap menerima DP.
          </p>
          <Link
            href={ROUTES.signup}
            className="bg-foreground text-background focus-visible:ring-foreground/30 px-6 py-3 text-sm font-medium focus-visible:ring-4 focus-visible:outline-none"
          >
            Buat akun gratis
          </Link>
        </div>
      </section>
    </>
  );
}

function SiteFooter() {
  return (
    <footer className="border-border border-t">
      <div className="text-muted-foreground mx-auto flex max-w-5xl flex-col gap-3 px-6 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="font-mono">booka</p>
        <p>Dibuat untuk usaha jasa kecil di Indonesia.</p>
      </div>
    </footer>
  );
}
