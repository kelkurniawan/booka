"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ROUTES } from "@/lib/routes";
import { USERNAME_CHECK_MESSAGES, type UsernameCheckResult } from "@/lib/marketing/username-check";
import { USERNAME_MAX } from "@/lib/validations/merchant";

export type CheckFn = (slug: string, signal: AbortSignal) => Promise<UsernameCheckResult>;

/**
 * Tautan booking merchant, dibentuk sambil diketik, dengan cek ketersediaan
 * sungguhan lewat /api/username-check. Endpoint itu sengaja publik: setiap
 * username merchant sudah publik lewat /<username> dan sitemap.xml, jadi tidak
 * ada yang bisa "dipanen"; yang dijaga adalah beban database (rate limit di RPC).
 *
 * Status yang tampil hanya balasan server untuk slug yang sedang tertulis.
 */
const DEBOUNCE_MS = 400;

const defaultCheck: CheckFn = async (slug, signal) => {
  const res = await fetch(`${ROUTES.usernameCheck}?u=${encodeURIComponent(slug)}`, { signal });
  return res.json();
};

/** Spasi jadi tanda hubung, sisanya dibuang. Contoh: "Studio Mawar!" -> "studio-mawar" */
function toSlug(raw: string) {
  return raw
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, USERNAME_MAX);
}

export function ClaimLink({ host, check = defaultCheck }: { host: string; check?: CheckFn }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [slug, setSlug] = useState("");
  // Hasil disimpan bersama slug-nya; dipakai hanya bila slug masih sama.
  const [reply, setReply] = useState<{ slug: string; result: UsernameCheckResult } | null>(null);

  // Tanda hubung di ujung dibiarkan selama mengetik, dirapikan saat kirim.
  const trimmed = slug.replace(/^-+|-+$/g, "");

  useEffect(() => {
    if (!trimmed) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      check(trimmed, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) setReply({ slug: trimmed, result });
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted || (err as Error)?.name === "AbortError") return;
          setReply({
            slug: trimmed,
            result: { status: "error", message: USERNAME_CHECK_MESSAGES.error },
          });
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, check]);

  const current = trimmed && reply?.slug === trimmed ? reply.result : null;
  const blocked =
    current?.status === "taken" || current?.status === "reserved" || current?.status === "invalid";

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (blocked) {
      inputRef.current?.focus();
      return;
    }
    const next = trimmed
      ? `${ROUTES.onboarding}?u=${encodeURIComponent(trimmed)}`
      : ROUTES.onboarding;
    router.push(`${ROUTES.signup}?next=${encodeURIComponent(next)}`);
  }

  return (
    <form
      action={ROUTES.signup}
      method="get"
      aria-label="Klaim tautan Marky"
      onSubmit={handleSubmit}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <label className="flex min-w-0 flex-1 flex-wrap items-baseline px-4 py-3 [overflow-wrap:anywhere]">
          <span aria-hidden className="shrink-0 select-none opacity-70">
            {host}/
          </span>
          <input
            ref={inputRef}
            value={slug}
            onChange={(event) => setSlug(toSlug(event.target.value))}
            aria-label={`Nama tautan setelah ${host}/`}
            placeholder="nama-anda"
            maxLength={USERNAME_MAX}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={blocked}
            aria-describedby="claim-status"
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        <button type="submit" className="btn btn--ink min-h-11">
          Klaim tautan
        </button>
      </div>

      <p id="claim-status" role="status" className="min-h-[1.5em] text-sm">
        {current?.message}
      </p>
    </form>
  );
}
