"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { MONTHS_ID_SHORT, formatRupiah, toJakartaWallClock } from "@/lib/format";
import { voucherSummary, type VoucherStatus } from "@/lib/booking/voucher";
import { cn } from "@/lib/utils";
import type { Voucher } from "@/types/database";

import { VoucherForm, type ServiceOption } from "./voucher-form";

export type VoucherRow = { voucher: Voucher; used: number; status: VoucherStatus };

/** "Tanpa batas" | "1 sampai 31 Des" | "Mulai 1 Des" | "Sampai 31 Des". Akhir bersifat eksklusif di DB. */
export function validityLabel(startsAt: string | null, endsAt: string | null): string {
  const fmt = (iso: string) => toJakartaWallClock(iso);
  const start = startsAt ? fmt(startsAt) : null;
  const end = endsAt ? fmt(new Date(Date.parse(endsAt) - 1).toISOString()) : null;
  const dm = (p: NonNullable<typeof start>) => `${p.day} ${MONTHS_ID_SHORT[p.month]}`;
  if (start && end) {
    return start.month === end.month && start.year === end.year
      ? `${start.day} sampai ${dm(end)}`
      : `${dm(start)} sampai ${dm(end)}`;
  }
  if (start) return `Mulai ${dm(start)}`;
  if (end) return `Sampai ${dm(end)}`;
  return "Tanpa batas";
}

function StatusBadge({ status }: { status: VoucherStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
        status === "Aktif" ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

function Usage({ used, quota }: { used: number; quota: number | null }) {
  if (quota == null) return <span>{used}</span>;
  return (
    <div className="flex flex-col gap-1">
      <span>
        {used} dari {quota}
      </span>
      <div className="bg-muted h-1 w-24 overflow-hidden rounded-full">
        <div className="bg-primary h-full" style={{ width: `${Math.min(100, (used / quota) * 100)}%` }} />
      </div>
    </div>
  );
}

function CodeCell({ voucher }: { voucher: Voucher }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono font-medium">{voucher.code}</span>
      <span className="text-muted-foreground text-xs">
        {voucher.visibility === "PUBLIC" ? "Tampil di halaman" : "Kode rahasia"}
      </span>
    </div>
  );
}

export function VoucherList({
  rows,
  services,
  monthDiscount,
  monthBookings,
}: {
  rows: VoucherRow[];
  services: ServiceOption[];
  monthDiscount: number;
  monthBookings: number;
}) {
  const isMobile = useIsMobile();
  // undefined = tertutup, null = voucher baru, objek = ubah.
  const [editing, setEditing] = useState<Voucher | null | undefined>(undefined);
  const open = editing !== undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Semua voucher</h2>
          <p className="text-muted-foreground text-sm">Kode diskon yang diketik pelanggan saat booking.</p>
          {monthBookings > 0 ? (
            <p className="text-sm">
              {formatRupiah(monthDiscount).replace(/\s/g, "")} diskon diberikan bulan ini, dari {monthBookings}{" "}
              booking yang memakai voucher.
            </p>
          ) : null}
        </div>
        <Button onClick={() => setEditing(null)} className="min-h-11">
          <Plus /> Buat voucher
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border p-6">
          <p className="text-muted-foreground text-sm">
            Belum ada voucher. Buat kode diskon pertama untuk pelanggan Anda.
          </p>
          <Button variant="outline" onClick={() => setEditing(null)} className="min-h-11">
            Buat voucher
          </Button>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Kode</th>
                  <th className="px-4 py-2 font-medium">Potongan</th>
                  <th className="px-4 py-2 font-medium">Terpakai</th>
                  <th className="px-4 py-2 font-medium">Berlaku</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ voucher, used, status }) => (
                  <tr
                    key={voucher.id}
                    className="hover:bg-muted/40 cursor-pointer border-t"
                    onClick={() => setEditing(voucher)}
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className="text-left"
                        aria-label={`Ubah voucher ${voucher.code}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(voucher);
                        }}
                      >
                        <CodeCell voucher={voucher} />
                      </button>
                    </td>
                    <td className="px-4 py-3">{voucherSummary(voucher)}</td>
                    <td className="px-4 py-3">
                      <Usage used={used} quota={voucher.quota} />
                    </td>
                    <td className="px-4 py-3">{validityLabel(voucher.starts_at, voucher.ends_at)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="flex flex-col gap-3 md:hidden">
            {rows.map(({ voucher, used, status }) => (
              <li key={voucher.id}>
                <button
                  type="button"
                  onClick={() => setEditing(voucher)}
                  aria-label={`Ubah voucher ${voucher.code}`}
                  className="flex min-h-11 w-full flex-col gap-2 rounded-lg border p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <CodeCell voucher={voucher} />
                    <StatusBadge status={status} />
                  </div>
                  <span className="text-sm">{voucherSummary(voucher)}</span>
                  <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-sm">
                    <Usage used={used} quota={voucher.quota} />
                    <span>{validityLabel(voucher.starts_at, voucher.ends_at)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <Sheet open={open} onOpenChange={(next) => !next && setEditing(undefined)}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className="max-h-[90dvh] overflow-y-auto data-[side=right]:sm:max-w-md"
        >
          <SheetHeader>
            <SheetTitle>{editing ? "Ubah voucher" : "Buat voucher"}</SheetTitle>
            <SheetDescription>Kode diskon yang diketik pelanggan saat booking.</SheetDescription>
          </SheetHeader>
          {open ? (
            <VoucherForm
              key={editing?.id ?? "baru"}
              voucher={editing ?? null}
              services={services}
              onDone={() => setEditing(undefined)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
