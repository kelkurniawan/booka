import Link from "next/link";
import { ArrowRight, CalendarCheck, ShieldCheck, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";

const HIGHLIGHTS = [
  {
    icon: CalendarCheck,
    title: "Satu tautan untuk semua",
    body: "Pelanggan memilih layanan, memilih jam, dan membayar DP tanpa chat bolak-balik.",
  },
  {
    icon: Wallet,
    title: "Dana langsung ke Anda",
    body: "Hubungkan akun payment gateway sendiri. Booka tidak pernah menahan uang Anda.",
  },
  {
    icon: ShieldCheck,
    title: "Tidak ada jadwal dobel",
    body: "Slot yang sudah dipesan langsung terkunci di level database.",
  },
];

export default function LandingPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-12 px-4 py-16">
      <div className="flex flex-col gap-6">
        <span className="text-muted-foreground text-sm font-medium">Booka</span>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Terima booking dan DP lewat satu tautan.
        </h1>
        <p className="text-muted-foreground max-w-xl text-lg text-pretty">
          Dibuat untuk MUA, fotografer, dan usaha jasa kecil di Indonesia. Sewa
          sistemnya bulanan, pembayaran pelanggan tetap masuk ke rekening Anda
          sendiri.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href={ROUTES.login}>
              Mulai gratis
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        {HIGHLIGHTS.map((item) => (
          <div key={item.title} className="flex flex-col gap-2">
            <item.icon className="text-muted-foreground size-5" aria-hidden />
            <h2 className="font-medium">{item.title}</h2>
            <p className="text-muted-foreground text-sm">{item.body}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
