import type { ReactNode } from "react";

import { publicMediaUrl } from "@/lib/media/url";
import { themeToCssVars } from "@/lib/theme/css";
import { BOOKING_FONT_CLASSNAMES } from "@/lib/theme/fonts";
import type { ResolvedTheme } from "@/lib/theme/types";
import { cn } from "@/lib/utils";

/**
 * Pembungkus bertema halaman booking.
 *
 * Seluruh tema masuk lewat CSS custom property inline di elemen ini, sehingga
 * ikut ter-SSR dan tidak pernah ada kedipan warna default sebelum tema dipakai.
 * Kelas `dark` dipasang berdampingan karena `@custom-variant dark (&:is(.dark *))`
 * di globals.css menyasar keturunan, bukan elemen ini sendiri.
 *
 * Dipakai halaman publik DAN preview di dashboard. Jangan menulis warna,
 * ukuran, atau font langsung di sini atau di komponen tetangganya -- semuanya
 * lewat token dari themeToCssVars(), atau keduanya akan diam-diam berbeda.
 */
export function BookingPageShell({
  theme,
  children,
  className,
  innerClassName,
}: {
  theme: ResolvedTheme;
  children: ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  const gambarLatar = theme.backgroundImagePath
    ? publicMediaUrl(theme.backgroundImagePath)
    : null;

  return (
    <div
      className={cn(
        "relative isolate min-h-svh w-full",
        BOOKING_FONT_CLASSNAMES,
        theme.colorMode === "GELAP" && "dark",
        className,
      )}
      style={{
        ...themeToCssVars(theme),
        backgroundColor: "var(--background)",
        color: "var(--foreground)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {theme.backgroundStyle === "GRADIENT" ? (
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage:
              "linear-gradient(180deg, var(--background) 0%, var(--gradient-to) 100%)",
          }}
        />
      ) : null}

      {gambarLatar ? (
        <>
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url("${gambarLatar}")` }}
          />
          {/* Overlay sewarna background preset. Inilah permukaan yang dipakai
              resolveTheme() saat menghitung kontras teks. */}
          <div
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{
              backgroundColor: "var(--background)",
              opacity: "var(--page-overlay)",
            }}
          />
        </>
      ) : null}

      <div
        className={cn(
          "mx-auto flex min-h-svh w-full max-w-md flex-col gap-8 px-4 py-10",
          innerClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
