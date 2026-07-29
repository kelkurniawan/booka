import Link from "next/link";

import { ROUTES } from "@/lib/routes";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 px-4 py-10">
      <Link href={ROUTES.home} className="text-xl font-semibold tracking-tight">
        Booka
      </Link>
      <main className="w-full max-w-sm">{children}</main>
      <p className="text-muted-foreground max-w-sm text-center text-xs">
        Dengan melanjutkan, Anda menyetujui Ketentuan Layanan dan Kebijakan
        Privasi Booka.
      </p>
    </div>
  );
}
