import type { Preview } from "@storybook/nextjs-vite";
import { Geist, Geist_Mono } from "next/font/google";

// Token Tailwind + shadcn yang sama persis dengan aplikasi.
import "../src/app/globals.css";

// Font sama dengan src/app/layout.tsx supaya tipografi story = aplikasi.
const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const preview: Preview = {
  decorators: [
    (Story) => (
      <div className={`${geistSans.variable} ${geistMono.variable} font-sans`}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    // Semua komponen app memakai next/navigation (App Router), bukan pages router.
    nextjs: { appDirectory: true },
    viewport: {
      options: {
        hp: {
          name: "HP",
          styles: { width: "390px", height: "844px" },
          type: "mobile",
        },
        tablet: {
          name: "Tablet",
          styles: { width: "768px", height: "1024px" },
          type: "tablet",
        },
        desktop: {
          name: "Desktop",
          styles: { width: "1280px", height: "800px" },
          type: "desktop",
        },
      },
    },
    // Pelanggaran aksesibilitas menggagalkan story, bukan sekadar peringatan.
    a11y: { test: "error" },
  },
};

export default preview;
