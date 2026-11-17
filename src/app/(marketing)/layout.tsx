import localFont from "next/font/local";

import "@/components/landing/marketing.css";

const generalSans = localFont({
  src: "../../assets/fonts/general-sans/GeneralSans-Variable.woff2",
  variable: "--font-general-sans",
  weight: "200 700",
  // optional, bukan swap: H1 tidak digambar ulang saat font tiba, sehingga LCP HP tidak menunggu font.
  // Kunjungan pertama di jaringan lambat bisa memakai font cadangan; kunjungan berikutnya memakai General Sans dari cache.
  display: "optional",
});

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${generalSans.variable} marketing flex-1`}>
      {/* Filter cap "Lunas" (kanvas), dirujuk lewat url(#press). */}
      <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
        <filter id="press">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.25" result="m" />
          <feComposite in="SourceGraphic" in2="m" operator="in" result="ink" />
          <feOffset in="ink" dx="0.6" dy="0.8" result="o" />
          <feMerge>
            <feMergeNode in="o" />
            <feMergeNode in="ink" />
          </feMerge>
        </filter>
      </svg>
      {children}
    </div>
  );
}
