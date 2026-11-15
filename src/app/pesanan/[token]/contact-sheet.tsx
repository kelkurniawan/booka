"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ContactLink } from "@/lib/booking/contact";

export type ContactData = {
  whatsapp: ContactLink | null;
  others: ContactLink[];
  replyHours: string | null;
};

const PREVIEW_MAX = 80;

export function ContactSheet({
  merchantName,
  whatsappText,
  contact,
  open,
  onOpenChange,
}: {
  merchantName: string;
  whatsappText: string;
  contact: ContactData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const preview = whatsappText.length > PREVIEW_MAX ? `${whatsappText.slice(0, PREVIEW_MAX)}...` : whatsappText;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-4 pb-6">
        <SheetHeader>
          <SheetTitle>Hubungi {merchantName}</SheetTitle>
          {contact.replyHours ? <SheetDescription>{contact.replyHours}</SheetDescription> : null}
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4">
          {contact.whatsapp ? (
            <a
              href={contact.whatsapp.href}
              target="_blank"
              rel="noopener noreferrer"
              className="border-border bg-card flex min-h-11 flex-col gap-2 rounded-[var(--radius)] border p-4"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="flex flex-col">
                  <span className="font-medium">{contact.whatsapp.label}</span>
                  <span className="text-muted-foreground text-sm">{contact.whatsapp.handle}</span>
                </span>
                <span className="bg-primary text-primary-foreground inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius)] px-4 text-sm font-medium">
                  <MessageCircle className="size-4" aria-hidden />
                  Chat
                </span>
              </span>
              <span className="text-muted-foreground text-sm text-pretty">&quot;{preview}&quot;</span>
            </a>
          ) : null}
          {contact.others.map((link) => {
            const external = link.channel !== "PHONE" && link.channel !== "EMAIL";
            return (
              <a
                key={link.channel}
                href={link.href}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="border-border flex min-h-11 items-center justify-between gap-3 rounded-[var(--radius)] border px-4 py-2 text-sm"
              >
                <span className="font-medium">{link.label}</span>
                <span className="text-muted-foreground truncate">{link.handle}</span>
              </a>
            );
          })}
          <p className="text-muted-foreground text-sm text-pretty">
            Hanya kanal yang diaktifkan {merchantName} yang tampil di sini.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Tombol Hubungi beserta sheet-nya; menyimpan status buka-tutup sendiri. */
export function ContactButton({
  merchantName,
  whatsappText,
  contact,
  className,
}: {
  merchantName: string;
  whatsappText: string;
  contact: ContactData;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" className={className} onClick={() => setOpen(true)}>
        <MessageCircle aria-hidden />
        Hubungi
      </Button>
      <ContactSheet
        merchantName={merchantName}
        whatsappText={whatsappText}
        contact={contact}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
