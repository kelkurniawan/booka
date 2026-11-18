"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatRupiah } from "@/lib/format";
import type { AdChannel } from "@/types/database";

import { archiveAdLink } from "./actions";
import { AdLinkQr } from "./ad-link-qr";
import { CHANNEL_LABELS } from "./labels";

export type AdLinkRow = {
  id: string;
  name: string;
  slug: string;
  channel: AdChannel;
  shortUrl: string;
  views: number;
  booked: number;
  paid: number;
  revenue: number;
};

export function AdLinkTable({ rows }: { rows: AdLinkRow[] }) {
  const [qr, setQr] = useState<AdLinkRow | null>(null);
  const [pending, startTransition] = useTransition();

  const copy = async (r: AdLinkRow) => {
    try {
      await navigator.clipboard.writeText(r.shortUrl);
      toast.success("Tautan tersalin");
    } catch {
      toast.error("Tautan belum bisa disalin");
    }
  };
  const archive = (r: AdLinkRow) =>
    startTransition(async () => {
      const res = await archiveAdLink(r.id);
      if (res.ok) toast.success("Tautan diarsipkan");
      else toast.error(res.message);
    });

  return (
    <section aria-labelledby="daftar-h" className="overflow-hidden rounded-xl border">
      <div className="flex items-center gap-3 border-b px-3.5 py-3">
        <h2 id="daftar-h" className="flex-1 text-[15px] font-semibold">Tautan tersimpan</h2>
        <span className="text-muted-foreground text-sm">30 hari terakhir</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground p-7 text-center text-sm">
          Belum ada tautan. Buat satu untuk bio Instagram Anda dulu, lalu satu lagi untuk setiap iklan.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="text-muted-foreground text-left [&>th]:whitespace-nowrap [&>th]:border-b [&>th]:px-3 [&>th]:py-2.5 [&>th]:font-medium">
                <th scope="col">Nama</th>
                <th scope="col">Dipasang di</th>
                <th scope="col" className="text-right!">Kunjungan</th>
                <th scope="col" className="text-right!">Booking</th>
                <th scope="col" className="text-right!">Dibayar</th>
                <th scope="col" className="text-right!">Omzet dibayar</th>
                <th scope="col"><span className="sr-only">Aksi</span></th>
              </tr>
            </thead>
            <tbody className="[&_td]:whitespace-nowrap [&_td]:border-b [&_td]:px-3 [&_td]:py-2.5 [&_tr:last-child_td]:border-b-0">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.name}</td>
                  <td>{CHANNEL_LABELS[r.channel]}</td>
                  <td className="text-right tabular-nums">{r.views}</td>
                  <td className="text-right tabular-nums">{r.booked}</td>
                  <td className="text-right tabular-nums">{r.paid}</td>
                  <td className="text-right tabular-nums">{formatRupiah(r.revenue)}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button type="button" variant="outline" size="sm" aria-label={`Salin tautan ${r.name}`} onClick={() => copy(r)}>Salin</Button>
                      <Button type="button" variant="outline" size="sm" aria-label={`Lihat QR ${r.name}`} onClick={() => setQr(r)}>QR</Button>
                      <Button type="button" variant="outline" size="sm" aria-label={`Arsipkan ${r.name}`} disabled={pending} onClick={() => archive(r)}>Arsipkan</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={qr !== null} onOpenChange={(o) => !o && setQr(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>QR {qr?.name}</DialogTitle>
          </DialogHeader>
          {qr ? <AdLinkQr url={qr.shortUrl} filename={qr.slug} ariaLabel={`QR untuk ${qr.name}`} /> : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
