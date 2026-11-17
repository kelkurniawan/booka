"use client";

import { CalendarPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Unduh berkas .ics yang sudah dibangun server, tanpa request tambahan. */
export function AddToCalendarButton({
  ics,
  fileName,
  label = "Tambah ke kalender",
  className,
}: {
  ics: string;
  fileName: string;
  label?: string;
  className?: string;
}) {
  function unduh() {
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <Button type="button" variant="outline" className={cn("w-full", className)} onClick={unduh}>
      <CalendarPlus aria-hidden />
      {label}
    </Button>
  );
}
