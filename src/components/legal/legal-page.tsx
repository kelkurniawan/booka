import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { hasUnfilledLegalIdentity, LEGAL_IDENTITY } from "@/lib/legal";
import { ROUTES } from "@/lib/routes";

/**
 * Kerangka bersama /syarat dan /privasi: judul, tanggal berlaku, isi, dan
 * tautan silang. Gaya teksnya ditulis di sini sekali lewat selector anak
 * supaya isi dokumen cukup berupa h2/p/ul polos.
 */
export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-10 sm:py-16">
      <header className="flex flex-col gap-3">
        <Link href={ROUTES.home} className="font-mono text-sm">
          booka
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground text-sm">
          Berlaku sejak {LEGAL_IDENTITY.effectiveDate}
        </p>
      </header>

      {hasUnfilledLegalIdentity() ? (
        <Alert variant="destructive">
          <AlertTitle>Draf belum lengkap</AlertTitle>
          <AlertDescription>
            Identitas penyelenggara di dokumen ini masih berupa penanda. Isi
            nilainya di src/lib/legal.ts sebelum rilis publik.
          </AlertDescription>
        </Alert>
      ) : null}

      <article className="flex flex-col gap-4 text-sm leading-relaxed [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
        {children}
      </article>

      <footer className="text-muted-foreground border-t pt-6 text-sm">
        <nav className="flex gap-4">
          <Link href={ROUTES.terms} className="hover:text-foreground">
            Ketentuan Layanan
          </Link>
          <Link href={ROUTES.privacy} className="hover:text-foreground">
            Kebijakan Privasi
          </Link>
        </nav>
      </footer>
    </div>
  );
}
