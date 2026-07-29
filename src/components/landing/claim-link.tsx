"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight } from "lucide-react";

import { ROUTES } from "@/lib/routes";
import { USERNAME_MAX, USERNAME_MIN } from "@/lib/validations/merchant";

/**
 * Elemen utama halaman depan: tautan booking merchant, dibentuk sambil diketik.
 *
 * Ketersediaan username TIDAK dicek di sini. Pengecekan butuh sesi login, dan
 * membuka endpoint-nya untuk publik akan mengizinkan siapa pun memanen daftar
 * username yang sudah terpakai. Yang divalidasi hanya formatnya; ketersediaan
 * diperiksa di halaman onboarding setelah merchant masuk.
 */
/** Spasi jadi tanda hubung, sisanya dibuang. Contoh: "Studio Mawar!" -> "studio-mawar" */
function toSlug(raw: string) {
  return raw
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, USERNAME_MAX);
}

export function ClaimLink({ host }: { host: string }) {
  const router = useRouter();
  const [slug, setSlug] = useState("");

  // Tanda hubung di ujung dibiarkan selama mengetik, lalu dirapikan saat kirim
  // — supaya tidak muncul peringatan tiap kali merchant baru menekan spasi.
  const trimmed = slug.replace(/^-+|-+$/g, "");
  const hint =
    trimmed.length > 0 && trimmed.length < USERNAME_MIN
      ? `Minimal ${USERNAME_MIN} karakter`
      : null;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const next =
      trimmed && !hint
        ? `${ROUTES.onboarding}?u=${encodeURIComponent(trimmed)}`
        : ROUTES.onboarding;
    router.push(`${ROUTES.signup}?next=${encodeURIComponent(next)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="border-foreground focus-within:ring-foreground/20 flex flex-col border-2 focus-within:ring-4 sm:flex-row sm:items-stretch">
        <label htmlFor="claim-slug" className="sr-only">
          Nama tautan booking Anda
        </label>

        {/* Skala tipe dinaikkan bertahap: di layar kecil, prefix host memakan
            lebar dan membuat slug yang diketik terpotong. */}
        <div className="flex min-w-0 flex-1 items-baseline gap-0 px-4 py-4 font-mono text-base sm:px-5 sm:py-5 sm:text-xl md:text-2xl">
          <span className="text-muted-foreground shrink-0 select-none">{host}/</span>
          <input
            id="claim-slug"
            value={slug}
            onChange={(event) => setSlug(toSlug(event.target.value))}
            placeholder="studio-mawar"
            maxLength={USERNAME_MAX}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            aria-describedby={hint ? "claim-hint" : undefined}
            aria-invalid={Boolean(hint)}
            className="placeholder:text-muted-foreground/50 w-full min-w-0 bg-transparent outline-none"
          />
        </div>

        <button
          type="submit"
          className="bg-foreground text-background focus-visible:ring-foreground/30 flex shrink-0 items-center justify-center gap-2 px-6 py-4 text-sm font-medium tracking-wide focus-visible:ring-4 focus-visible:outline-none sm:py-0"
        >
          Ambil tautan ini
          <ArrowRight className="size-4" aria-hidden />
        </button>
      </div>

      <p
        id="claim-hint"
        role={hint ? "alert" : undefined}
        className="text-muted-foreground font-mono text-xs"
      >
        {hint ?? "Gratis selamanya untuk 10 transaksi per bulan. Tanpa kartu kredit."}
      </p>
    </form>
  );
}
