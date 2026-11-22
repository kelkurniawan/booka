import Link from "next/link";

import { MarkyLogo } from "@/components/brand/marky-mark";
import { ROUTES } from "@/lib/routes";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 px-4 py-10">
      <Link href={ROUTES.home} aria-label="Marky, beranda" className="inline-flex min-h-11 items-center text-2xl">
        <MarkyLogo />
      </Link>
      <main className="w-full max-w-sm">{children}</main>
      <p className="text-muted-foreground max-w-sm text-center text-xs">
        Dengan melanjutkan, Anda menyetujui{" "}
        <Link href={ROUTES.terms} className="hover:text-foreground underline">
          Ketentuan Layanan
        </Link>{" "}
        dan{" "}
        <Link href={ROUTES.privacy} className="hover:text-foreground underline">
          Kebijakan Privasi
        </Link>{" "}
        Marky.
      </p>
    </div>
  );
}
