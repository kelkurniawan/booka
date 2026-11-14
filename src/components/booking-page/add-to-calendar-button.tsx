"use client";

import { CalendarPlus } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Unduh berkas .ics yang sudah dibangun server, tanpa request tambahan. */
export function AddToCalendarButton({ ics, fileName }: { ics: string; fileName: string }) {
  function unduh() {
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button type="button" variant="outline" className="w-full" onClick={unduh}>
      <CalendarPlus aria-hidden />
      Tambah ke kalender
    </Button>
  );
}
