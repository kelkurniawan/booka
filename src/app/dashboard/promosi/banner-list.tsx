"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { publicMediaUrl } from "@/lib/media/url";
import { MAX_LIVE_BANNERS, type BannerStatus } from "@/lib/promo/banner";
import type { ResolvedTheme } from "@/lib/theme/types";
import { cn } from "@/lib/utils";
import type { MerchantBanner } from "@/types/database";

import { moveBanner } from "./banner-actions";
import { themeSwatch } from "./banner-state";
import { BannerForm, type ServiceOption, type VoucherOption } from "./banner-form";
import { validityLabel } from "./voucher/voucher-list";

export type BannerRow = { banner: MerchantBanner; status: BannerStatus };

function StatusBadge({ status }: { status: BannerStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
        status === "Tayang" ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

function Thumb({ banner, theme }: { banner: MerchantBanner; theme: ResolvedTheme }) {
  const className = "h-12 w-36 shrink-0 rounded-md border object-cover";
  if (banner.source === "IMAGE" && banner.image_path) {
    // eslint-disable-next-line @next/next/no-img-element -- gambar Storage milik merchant
    return <img src={publicMediaUrl(banner.image_path)} alt="" className={className} />;
  }
  return <div aria-hidden className={className} style={{ background: themeSwatch(theme, banner.color) }} />;
}

export function BannerList({
  rows,
  vouchers,
  services,
  theme,
  merchantId,
  merchantName,
}: {
  rows: BannerRow[];
  vouchers: VoucherOption[];
  services: ServiceOption[];
  theme: ResolvedTheme;
  merchantId: string;
  merchantName: string;
}) {
  const isMobile = useIsMobile();
  const [pending, startTransition] = useTransition();
  // undefined = tertutup, null = banner baru, objek = ubah.
  const [editing, setEditing] = useState<MerchantBanner | null | undefined>(undefined);
  const open = editing !== undefined;

  function move(id: string, direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveBanner(id, direction);
      if (!result.ok) toast.error("Urutan banner belum bisa diubah. Coba lagi.");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Kelola banner promosi</h2>
          <p className="text-muted-foreground text-sm">
            Tampil di atas daftar layanan. Maksimal {MAX_LIVE_BANNERS} banner tayang bersamaan.
          </p>
        </div>
        <Button onClick={() => setEditing(null)} className="min-h-11">
          <Plus /> Banner baru
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border p-6">
          <p className="text-muted-foreground text-sm">
            Belum ada banner. Buat banner pertama untuk mengumumkan promo di halaman booking Anda.
          </p>
          <Button variant="outline" onClick={() => setEditing(null)} className="min-h-11">
            Banner baru
          </Button>
        </div>
      ) : (
        <section aria-labelledby="urutan-tayang" className="flex flex-col gap-3">
          <h3 id="urutan-tayang" className="text-sm font-medium">
            Urutan tayang
          </h3>
          <ul className="flex flex-col gap-2">
            {rows.map(({ banner, status }, index) => {
              const label = banner.title ?? banner.alt_text ?? "Banner";
              return (
                <li key={banner.id} className="flex items-center gap-2 rounded-lg border p-2">
                  <button
                    type="button"
                    onClick={() => setEditing(banner)}
                    aria-label={`Ubah banner ${label}`}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <Thumb banner={banner} theme={theme} />
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="truncate text-sm font-medium">{label}</span>
                      <span className="text-muted-foreground text-xs">
                        {validityLabel(banner.starts_at, banner.ends_at)}
                      </span>
                    </span>
                    <StatusBadge status={status} />
                  </button>
                  <div className="flex shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      disabled={pending || index === 0}
                      aria-label={`Naikkan ${label}`}
                      onClick={() => move(banner.id, "up")}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      disabled={pending || index === rows.length - 1}
                      aria-label={`Turunkan ${label}`}
                      onClick={() => move(banner.id, "down")}
                    >
                      <ArrowDown />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-muted-foreground text-sm">Banner selesai otomatis disembunyikan setelah tanggal berakhir.</p>
        </section>
      )}

      <Sheet open={open} onOpenChange={(next) => !next && setEditing(undefined)}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className="max-h-[90dvh] overflow-y-auto data-[side=right]:sm:max-w-md"
        >
          <SheetHeader>
            <SheetTitle>{editing ? "Ubah banner" : "Banner baru"}</SheetTitle>
            <SheetDescription>Tampil di atas daftar layanan di halaman booking.</SheetDescription>
          </SheetHeader>
          {open ? (
            <BannerForm
              key={editing?.id ?? "baru"}
              banner={editing ?? null}
              vouchers={vouchers}
              services={services}
              theme={theme}
              merchantId={merchantId}
              merchantName={merchantName}
              onDone={() => setEditing(undefined)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
