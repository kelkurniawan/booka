"use client";

import { CircleHelp } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useGuide } from "./guide-provider";

export function PageGuideButton() {
  const guide = useGuide();
  if (!guide || !guide.page) return null;
  const unseen = !guide.isSeen(guide.page);

  return (
    <Button
      type="button"
      variant="outline"
      data-tour="page-guide"
      className="relative size-11 md:h-11 md:w-auto"
      onClick={guide.openPanel}
    >
      <CircleHelp aria-hidden />
      <span className="sr-only md:not-sr-only">Panduan halaman ini</span>
      {unseen ? (
        <>
          <span aria-hidden className="bg-primary absolute -top-1 -right-1 size-2 rounded-full" />
          <span className="sr-only">, belum dibuka</span>
        </>
      ) : null}
    </Button>
  );
}
