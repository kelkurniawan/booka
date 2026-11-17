"use client";

import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import type { GuideActionResult } from "@/app/dashboard/guide-actions";
import { useGuide } from "@/components/guide/guide-provider";
import { Button } from "@/components/ui/button";
import { CHECKLIST_COPY } from "@/lib/guide/content";
import type { ChecklistItem } from "@/lib/guide/guide";
import type { ManualStepKey } from "@/types/database";

const TOTAL = 6;

export function GettingStarted({
  items,
  pagePath,
  onMarkStep,
  onDismiss,
}: {
  items: ChecklistItem[];
  pagePath: string;
  onMarkStep: (step: ManualStepKey) => Promise<GuideActionResult>;
  // Menerima nilai (bukan closure) supaya server action bisa dioper langsung dari Server Component.
  onDismiss: (dismissed: boolean) => Promise<GuideActionResult>;
}) {
  const guide = useGuide();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [openKey, setOpenKey] = React.useState(
    () => items.find((i) => !i.done)?.key ?? null,
  );
  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === TOTAL;

  function run(action: () => Promise<GuideActionResult>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok)
          setError(result.message ?? "Gagal menyimpan. Coba lagi.");
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${pagePath}`,
      );
      toast.success("Tautan disalin");
    } catch {
      toast("Gagal menyalin tautan.");
      return;
    }
    run(() => onMarkStep("SHARE"));
  }

  const dismissButton = (
    <Button
      variant="ghost"
      className="min-h-11"
      disabled={pending}
      onClick={() => run(() => onDismiss(true))}
    >
      Sembunyikan
    </Button>
  );

  return (
    <section
      aria-labelledby="getting-started-title"
      data-tour="getting-started"
      className="bg-card rounded-xl border"
    >
      <button
        type="button"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((o) => !o)}
        className="focus-visible:ring-ring flex min-h-11 w-full items-center justify-between gap-3 rounded-xl p-4 text-left focus-visible:ring-2 md:hidden"
      >
        <span>
          <span className="block font-semibold">Panduan memulai</span>
          <span className="text-muted-foreground block text-sm">
            {doneCount} dari {TOTAL} selesai
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`size-5 motion-safe:transition-transform ${mobileOpen ? "rotate-180" : ""}`}
        />
      </button>

      <div className={`${mobileOpen ? "block" : "hidden"} md:block`}>
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 md:pt-4">
          <div>
            <h2 id="getting-started-title" className="font-semibold">
              Panduan memulai Marky
            </h2>
            <p className="text-muted-foreground text-sm">
              {doneCount} dari {TOTAL} selesai. Bisa dicicil.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {guide ? (
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => guide.startTour("today")}
              >
                Tur dashboard
              </Button>
            ) : null}
            {dismissButton}
          </div>
        </div>

        <div
          role="progressbar"
          aria-label="Kemajuan panduan memulai"
          aria-valuemin={0}
          aria-valuemax={TOTAL}
          aria-valuenow={doneCount}
          className="bg-muted mx-4 mt-3 h-1 overflow-hidden rounded-full"
        >
          <div
            className="bg-primary h-full"
            style={{ width: `${(doneCount / TOTAL) * 100}%` }}
          />
        </div>

        {allDone ? (
          <div className="space-y-3 p-4">
            <p className="text-sm">
              Semua langkah selesai. Halaman Anda siap menerima booking.
            </p>
            {dismissButton}
          </div>
        ) : (
          <ol className="p-2">
            {items.map((item, index) => {
              const copy = CHECKLIST_COPY[item.key];
              const open = openKey === item.key;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={`gs-${item.key}`}
                    onClick={() => setOpenKey(open ? null : item.key)}
                    className="focus-visible:ring-ring flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2 text-left focus-visible:ring-2"
                  >
                    <span
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs ${item.done ? "bg-primary text-primary-foreground border-primary" : ""}`}
                    >
                      {item.done ? (
                        <>
                          <Check aria-hidden="true" className="size-3.5" />
                          <span className="sr-only">Selesai:</span>
                        </>
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span
                      className={`flex-1 text-sm font-medium ${item.done ? "text-muted-foreground line-through" : ""}`}
                    >
                      {copy.title}
                    </span>
                    {item.done ? (
                      <span className="text-muted-foreground text-sm">
                        Selesai
                      </span>
                    ) : null}
                  </button>
                  {open ? (
                    <div
                      id={`gs-${item.key}`}
                      className="space-y-3 py-2 pr-2 pl-11"
                    >
                      <p className="text-muted-foreground text-sm">
                        {copy.body}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        {copy.ctaHref ? (
                          <Button
                            asChild
                            variant="outline"
                            className="min-h-11"
                          >
                            <Link href={copy.ctaHref}>{copy.ctaLabel}</Link>
                          </Button>
                        ) : null}
                        {item.key === "BOOKING" ? (
                          <Button
                            asChild
                            variant="outline"
                            className="min-h-11"
                          >
                            <Link
                              href={pagePath}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {copy.ctaLabel}
                            </Link>
                          </Button>
                        ) : null}
                        {item.key === "SHARE" ? (
                          <Button
                            variant="outline"
                            className="min-h-11"
                            disabled={pending}
                            onClick={copyLink}
                          >
                            {copy.ctaLabel}
                          </Button>
                        ) : null}
                        {item.manual && !item.done ? (
                          <Button
                            variant="ghost"
                            className="min-h-11"
                            disabled={pending}
                            onClick={() =>
                              run(() => onMarkStep(item.key as ManualStepKey))
                            }
                          >
                            Tandai selesai
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}

        {error ? (
          <p role="alert" className="text-muted-foreground px-4 pb-4 text-sm">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
