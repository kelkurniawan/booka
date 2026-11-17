"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { placeTip, type Rect, type TourStep } from "@/lib/guide/guide";
import { cn } from "@/lib/utils";

/** Elemen pertama ber-`data-tour` itu yang terlihat (getClientRects().length > 0), atau null. */
export function findTourTarget(target: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`);
  return Array.from(all).find((el) => el.getClientRects().length > 0) ?? null;
}

const PAD = 4;

export function CoachmarkTour({
  steps,
  open,
  onClose,
}: {
  steps: TourStep[];
  open: boolean;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const [index, setIndex] = React.useState(0);
  const [rect, setRect] = React.useState<Rect | null>(null);
  const [tip, setTip] = React.useState({ width: 300, height: 180 });
  const cardRef = React.useRef<HTMLDivElement>(null);
  const nextRef = React.useRef<HTMLButtonElement>(null);

  // Kembali ke langkah pertama setiap kali tur dibuka.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setIndex(0);
  }

  const step = steps[index] as TourStep | undefined;
  const targetName = step?.target ?? null;

  React.useEffect(() => {
    if (!open) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = targetName ? findTourTarget(targetName) : null;
        if (!el) return setRect(null);
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        const c = cardRef.current;
        if (c) setTip({ width: c.offsetWidth, height: c.offsetHeight });
      });
    };
    findTourTarget(targetName ?? "")?.scrollIntoView({
      block: isMobile ? "start" : "center",
      inline: "nearest",
      behavior: "instant",
    });
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, index, targetName, isMobile]);

  if (!step) return null;
  const total = steps.length;
  const last = index === total - 1;
  const counter = `Langkah ${index + 1} dari ${total}`;
  const pos = isMobile
    ? undefined
    : placeTip(rect, tip, {
        width: typeof window === "undefined" ? 1280 : window.innerWidth,
        height: typeof window === "undefined" ? 800 : window.innerHeight,
      });

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()} modal>
      <DialogPrimitive.Portal>
        {rect ? (
          <div
            aria-hidden
            className="pointer-events-none fixed z-50 rounded-lg motion-safe:transition-all motion-safe:duration-200"
            style={{
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
              boxShadow: "0 0 0 3px var(--background), 0 0 0 9999px rgb(0 0 0 / 0.55)",
            }}
          />
        ) : (
          <div aria-hidden className="pointer-events-none fixed inset-0 z-50 bg-black/55" />
        )}
        <DialogPrimitive.Content
          ref={cardRef}
          aria-describedby="coachmark-body"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            nextRef.current?.focus();
          }}
          onPointerDownOutside={(e) => e.preventDefault()}
          className={cn(
            "fixed z-50 flex flex-col gap-3 rounded-xl border bg-background p-4 text-foreground shadow-lg outline-none",
            isMobile
              ? "inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))]"
              : "w-[300px]",
          )}
          style={pos}
        >
          <p className="text-sm text-muted-foreground">{counter}</p>
          <DialogPrimitive.Title asChild>
            <h2 className="text-base font-semibold">{step.title}</h2>
          </DialogPrimitive.Title>
          <DialogPrimitive.Description id="coachmark-body" className="text-sm">
            {step.body}
          </DialogPrimitive.Description>
          {isMobile && (
            <div aria-hidden className="flex gap-1.5">
              {steps.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "size-2 rounded-full border",
                    i <= index ? "border-foreground bg-foreground" : "border-border",
                  )}
                />
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" className="min-h-11" onClick={onClose}>
              {isMobile ? "Lewati" : "Lewati tur"}
            </Button>
            <div className="ml-auto flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={index === 0}
                onClick={() => setIndex(index - 1)}
              >
                Kembali
              </Button>
              <Button
                ref={nextRef}
                type="button"
                className="min-h-11"
                onClick={() => (last ? onClose() : setIndex(index + 1))}
              >
                {last ? "Selesai" : "Lanjut"}
              </Button>
            </div>
          </div>
          <div className="sr-only" aria-live="polite">
            {counter}: {step.title}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
