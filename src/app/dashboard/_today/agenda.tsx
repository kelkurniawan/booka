"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import type { BookingListItem } from "@/app/dashboard/bookings/booking-state";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { attendanceWindow, nowLineIndex, paymentSummary } from "@/lib/booking/dashboard";
import { formatTime } from "@/lib/format";
import { ROUTES } from "@/lib/routes";

type ActionResult = { ok: boolean; message?: string };

export function Agenda({
  rows,
  nowMs,
  onAttend,
}: {
  rows: BookingListItem[];
  nowMs: number;
  onAttend: (id: string) => Promise<ActionResult>;
}) {
  const lineAt = nowLineIndex(rows, nowMs);
  return (
    <section aria-labelledby="today-agenda" className="rounded-xl border">
      <header className="border-b px-4 py-3">
        <h2 id="today-agenda" className="text-base font-semibold">
          Agenda hari ini <span className="text-muted-foreground font-normal">{rows.length} booking</span>
        </h2>
      </header>
      {rows.length === 0 ? (
        <div className="space-y-2 px-4 py-6 text-sm">
          <p className="text-muted-foreground">Belum ada booking hari ini.</p>
          <Link href={ROUTES.newBooking} className="inline-flex min-h-11 items-center underline underline-offset-4">
            Catat booking manual
          </Link>
        </div>
      ) : (
        <ul className="divide-y">
          {rows.map((b, i) => (
            <AgendaItem key={b.id} booking={b} nowMs={nowMs} showLine={i === lineAt} onAttend={onAttend} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AgendaItem({
  booking: b,
  nowMs,
  showLine,
  onAttend,
}: {
  booking: BookingListItem;
  nowMs: number;
  showLine: boolean;
  onAttend: (id: string) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pay = paymentSummary(b);
  const canAttend = !b.attended_at && !b.no_show_at && attendanceWindow(b.start_datetime, nowMs).canAttend;

  function attend() {
    setError(null);
    start(async () => {
      const result = await onAttend(b.id);
      if (result.ok) router.refresh();
      else setError(result.message ?? "Gagal menyimpan. Coba lagi.");
    });
  }

  return (
    <>
      {showLine ? (
        <li aria-label={`Sekarang ${formatTime(new Date(nowMs))}`} className="flex items-center gap-2 px-4 py-1 text-xs font-medium">
          <span className="h-px flex-1 bg-foreground" />
          Sekarang {formatTime(new Date(nowMs))}
          <span className="h-px flex-1 bg-foreground" />
        </li>
      ) : null}
      <li className="px-4 py-3">
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 sm:grid-cols-[auto_1fr_auto_auto]">
          <span className="font-medium tabular-nums">{formatTime(b.start_datetime)}</span>
          <div className="min-w-0">
            <p className="truncate font-medium">{b.customer_name}</p>
            <p className="text-muted-foreground truncate text-sm">
              {b.service_name}
              {b.staff_name ? `, ${b.staff_name}` : ""}
            </p>
          </div>
          <div className="col-start-2 text-sm sm:col-start-auto sm:text-right">
            <p>{pay.main}</p>
            {pay.sub ? <p className="text-muted-foreground">{pay.sub}</p> : null}
          </div>
          <div className="col-start-2 sm:col-start-auto">
            {b.attended_at ? (
              <span className="inline-flex items-center gap-1 text-sm font-medium">
                <Check className="size-4" aria-hidden="true" />
                Hadir
              </span>
            ) : b.no_show_at ? (
              <span className="text-muted-foreground text-sm">Tidak datang</span>
            ) : canAttend ? (
              <Button variant="outline" className="h-11 w-full sm:w-auto" disabled={pending} onClick={attend}>
                {pending ? <Spinner /> : null}
                Tandai hadir
              </Button>
            ) : null}
          </div>
        </div>
        {error ? (
          <p role="alert" className="text-muted-foreground mt-2 text-sm">
            {error}
          </p>
        ) : null}
      </li>
    </>
  );
}
