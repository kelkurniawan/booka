"use client";

import { Link2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** Tombol ikon 44px (HP) yang menyalin tautan halaman booking. */
export function CopyLinkButton({ path }: { path: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      toast.success("Tautan disalin");
    } catch {
      toast("Gagal menyalin tautan.");
    }
  }
  return (
    <Button variant="outline" className="size-11 md:hidden" onClick={copy}>
      <Link2 aria-hidden="true" />
      <span className="sr-only">Salin tautan halaman booking</span>
    </Button>
  );
}
