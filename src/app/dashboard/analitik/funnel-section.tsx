import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CHANNEL_LABELS,
  FUNNEL_STEPS,
  STEP_LABEL,
  summarizeFunnel,
  type FunnelRow,
} from "@/lib/analytics/funnel";
import { formatRupiah } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

import { FunnelChannelSelect } from "./funnel-channel-select";

export const FUNNEL_RANGES = [7, 30, 90] as const;

const nf = new Intl.NumberFormat("id-ID");
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function FunnelSection({
  rows,
  days,
  channel,
  periode,
}: {
  rows: FunnelRow[];
  days: number;
  /** "ALL" atau salah satu label kanal. */
  channel: string;
  periode: string;
}) {
  const summary = summarizeFunnel(rows, channel);
  const total = summarizeFunnel(rows, "ALL").steps[0].count;
  const base = `${ROUTES.analytics}?periode=${periode}`;
  const hrefFor = (d: number) =>
    `${base}&fr=${d}${channel === "ALL" ? "" : `&kanal=${encodeURIComponent(channel)}`}`;

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">Funnel kunjungan</h2>
        <p className="text-muted-foreground text-sm">
          Dari kunjungan sampai bayar: di langkah mana pengunjung berhenti, dan kanal mana yang menghasilkan.
        </p>
      </div>
      <nav className="flex gap-1" aria-label="Rentang funnel">
        {FUNNEL_RANGES.map((d) => (
          <Link
            key={d}
            href={hrefFor(d)}
            aria-current={d === days ? "page" : undefined}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm",
              d === days ? "bg-foreground text-background border-foreground" : "hover:bg-muted",
            )}
          >
            {d} hari
          </Link>
        ))}
      </nav>
    </div>
  );

  if (total === 0) {
    return (
      <section className="flex flex-col gap-4" data-testid="funnel">
        {header}
        <Card>
          <CardHeader>
            <CardTitle>Belum ada kunjungan tercatat</CardTitle>
            <CardDescription>
              Kunjungan mulai dihitung setelah halaman booking Anda dibuka orang. Pasang tautannya di bio
              Instagram atau buat tautan iklan pertama.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={ROUTES.ads}>Buat tautan iklan</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  const top = summary.steps[0].count;
  const worstIdx = summary.worstStep ? FUNNEL_STEPS.indexOf(summary.worstStep) : -1;
  const worst = worstIdx > 0 ? summary.steps[worstIdx] : null;

  return (
    <section className="flex flex-col gap-4" data-testid="funnel">
      {header}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>
            {channel === "ALL" ? "Semua kanal" : channel}, {days} hari terakhir
          </CardTitle>
          <FunnelChannelSelect
            value={channel}
            options={CHANNEL_LABELS}
            hrefBase={`${base}&fr=${days}`}
          />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {top === 0 ? (
            <p className="text-muted-foreground text-sm">Belum ada kunjungan dari kanal ini.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {summary.steps.map((s, i) => (
                <li key={s.key} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span>{STEP_LABEL[s.key]}</span>
                    <span className="tabular-nums">
                      <strong>{nf.format(s.count)}</strong>
                      <span className="text-muted-foreground ml-2 text-xs">
                        {i === 0 || s.rateFromPrev === null ? "100%" : `${pct(s.rateFromPrev)} dari langkah sebelumnya`}
                      </span>
                    </span>
                  </div>
                  <div className="bg-muted h-3 overflow-hidden rounded-full" aria-hidden>
                    <span
                      className="bg-foreground block h-full rounded-full"
                      style={{ width: `${Math.max(Math.min((s.count / top) * 100, 100), 2)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
          {worst ? (
            <p className="bg-muted rounded-md px-3 py-2 text-sm">
              Paling banyak berhenti di antara &quot;{STEP_LABEL[FUNNEL_STEPS[worstIdx - 1]]}&quot; dan &quot;
              {STEP_LABEL[worst.key]}&quot;: hanya {pct(worst.rateFromPrev ?? 0)} yang lanjut.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per kanal</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-left text-xs">
              <tr>
                <th className="pb-2 font-normal">Kanal</th>
                <th className="pb-2 text-right font-normal">Kunjungan</th>
                <th className="pb-2 text-right font-normal">Booking</th>
                <th className="pb-2 text-right font-normal">Dibayar</th>
                <th className="pb-2 text-right font-normal">Kunjungan jadi bayar</th>
                <th className="pb-2 text-right font-normal">Omzet dibayar</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {summary.channels.map((c) => (
                <tr key={c.channel} className="border-t">
                  <td className="py-2">{c.channel}</td>
                  <td className="py-2 text-right">{nf.format(c.views)}</td>
                  <td className="py-2 text-right">{nf.format(c.booked)}</td>
                  <td className="py-2 text-right">{nf.format(c.paid)}</td>
                  <td className="py-2 text-right">{(c.conversion * 100).toFixed(1).replace(".", ",")}%</td>
                  <td className="py-2 text-right">{formatRupiah(c.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-muted-foreground mt-3 text-xs">
            Kunjungan dihitung per sesi browser tanpa cookie pelacak, jadi orang yang sama di hari lain dihitung
            lagi. Dibayar hanya menghitung pembayaran QRIS; booking bayar di tempat masuk ke Booking.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
