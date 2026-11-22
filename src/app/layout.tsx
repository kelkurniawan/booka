import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";

import { Toaster } from "@/components/ui/sonner";
import { siteUrl } from "@/lib/site";

import "./globals.css";

// Tulisan "marky" di logo (src/components/brand/marky-mark.tsx) selalu General
// Sans. preload: false supaya halaman tanpa logo (halaman merchant) tidak
// mengunduhnya; browser baru mengambil font saat tulisan itu digambar.
const wordmarkFont = localFont({
  src: "../assets/fonts/general-sans/GeneralSans-Variable.woff2",
  variable: "--font-wordmark",
  weight: "200 700",
  display: "swap",
  preload: false,
});

const geistSans = Geist({
  // Nama variabel mengikuti token `--font-sans` yang dipakai preset shadcn
  // di globals.css.
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Wajib untuk gambar OG: tanpa ini Next memakai localhost dan pratinjau
  // tautan di WhatsApp/Instagram tidak pernah muncul.
  metadataBase: siteUrl(),
  openGraph: {
    siteName: "Marky",
    locale: "id_ID",
    type: "website",
  },
  title: {
    default: "Marky: Booking & Invoicing untuk usaha kecil",
    template: "%s | Marky",
  },
  description:
    "Terima booking dan DP lewat satu tautan. Dana masuk langsung ke rekening Anda.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} ${wordmarkFont.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
