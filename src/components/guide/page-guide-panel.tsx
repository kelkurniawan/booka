"use client";

import * as React from "react";
import { Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { GUIDE_PAGES } from "@/lib/guide/content";
import type { GuidePageKey } from "@/types/database";

import type { GuideActionResult } from "@/app/dashboard/guide-actions";

export function PageGuidePanel({
  page,
  open,
  onOpenChange,
  onStartTour,
  checklistDismissed,
  onRestoreChecklist,
}: {
  page: GuidePageKey;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartTour: () => void;
  checklistDismissed: boolean;
  onRestoreChecklist: () => Promise<GuideActionResult>;
}) {
  const guide = GUIDE_PAGES[page];
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const restore = () =>
    startTransition(async () => {
      const result = await onRestoreChecklist();
      setError(result.ok ? null : (result.message ?? "Gagal menyimpan. Coba lagi."));
      if (result.ok) onOpenChange(false);
    });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:w-[380px] data-[side=right]:sm:max-w-[380px]">
        <SheetHeader>
          <SheetTitle>Panduan: {guide.title}</SheetTitle>
          <SheetDescription>{guide.summary}</SheetDescription>
          {guide.note ? <p className="text-muted-foreground text-sm">{guide.note}</p> : null}
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
          {guide.video ? (
            <video controls preload="none" className="aspect-video w-full rounded-lg border">
              <source src={guide.video.src} />
              <track kind="captions" src={guide.video.captionsSrc} srcLang="id" default />
            </video>
          ) : (
            <div className="text-muted-foreground flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm">
              <Video aria-hidden className="size-5" />
              Video panduan belum tersedia.
            </div>
          )}
          <ol className="space-y-3 text-sm">
            {guide.points.map((p) => (
              <li key={p.term}>
                <span className="font-semibold">{p.term}</span> {p.text}
              </li>
            ))}
          </ol>
          <Button type="button" className="min-h-11" onClick={onStartTour}>
            Mulai tur halaman ini
          </Button>
          {page === "today" && checklistDismissed ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={pending}
              onClick={restore}
            >
              Tampilkan lagi panduan memulai
            </Button>
          ) : null}
          {error ? (
            <p role="alert" className="text-muted-foreground text-sm">
              {error}
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
