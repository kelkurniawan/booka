"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { BookingListItem } from "@/app/dashboard/bookings/booking-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { actionKind, tabParam, unpaidReminderLink } from "@/lib/booking/dashboard";
import { formatDateTime, formatRupiah, formatTime } from "@/lib/format";
import { ROUTES } from "@/lib/routes";

type ActionResult = { ok: boolean; message?: string };

const ACTION_HREF = `${ROUTES.bookings}?tab=${tabParam("ACTION")}`;

export function ActionList({
  items,
  total,
  pastUnmarked,
  onDecide,
}: {
  items: BookingListItem[];
  total: number;
  pastUnmarked: number;
  onDecide: (id: string, approve: boolean) => Promise<ActionResult>;
}) {
  const empty = items.length === 0 && pastUnmarked === 0;
  return (
    <section aria-labelledby="today-action" className="rounded-xl border">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 id="today-action" className="text-base font-semibold">
          Perlu tindakan <span className="text-muted-foreground font-normal">{total}</span>
        </h2>
        <Link href={ACTION_HREF} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">
          Lihat semua
        </Link>
      </header>
      {empty ? (
        <p className="text-muted-foreground px-4 py-6 text-sm">Tidak ada yang perlu ditindaklanjuti.</p>
      ) : (
        <ul className="divide-y">
          {items.map((b) => (
            <ActionRow key={b.id} booking={b} onDecide={onDecide} />
          ))}
          {pastUnmarked > 0 ? (
            <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{pastUnmarked} booking belum ditandai hadir</p>
                <p className="text-muted-foreground text-sm">
                  Tandai agar laporan tidak datang dan pendapatan akurat
                </p>
              </div>
              <Button asChild variant="outline" className="h-11 w-full sm:w-auto">
                <Link href={ACTION_HREF}>Tandai sekarang</Link>
              </Button>
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}

function ActionRow({
  booking: b,
  onDecide,
}: {
  booking: BookingListItem;
  onDecide: (id: string, approve: boolean) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmReject, setConfirmReject] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pressed, setPressed] = useState<"approve" | "reject" | null>(null);
  const kind = actionKind(b);

  // Konfirmasi tolak kedaluwarsa sendiri setelah 5 detik.
  useEffect(() => {
    if (!confirmReject) return;
    const t = setTimeout(() => setConfirmReject(false), 5000);
    return () => clearTimeout(t);
  }, [confirmReject]);

  function decide(approve: boolean) {
    if (!approve && !confirmReject) {
      setConfirmReject(true);
      return;
    }
    setError(null);
    setPressed(approve ? "approve" : "reject");
    start(async () => {
      const result = await onDecide(b.id, approve);
      if (result.ok) router.refresh();
      else setError(result.message ?? "Gagal menyimpan. Coba lagi.");
      setConfirmReject(false);
      setPressed(null);
    });
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            {kind === "REQUEST" ? (
              <Badge variant="outline">Permintaan</Badge>
            ) : (
              <Badge variant="secondary">Belum bayar</Badge>
            )}
            <p className="truncate font-medium">
              {b.service_name}, {b.customer_name}
            </p>
          </div>
          <p className="text-muted-foreground text-sm">
            {formatDateTime(b.start_datetime)}
            {kind === "REQUEST" ? `, otomatis ditolak pukul ${formatTime(b.expires_at)}` : null}
            {kind === "UNPAID"
              ? `. Bayar sekarang ${formatRupiah(b.amount_due_now)} sampai pukul ${formatTime(b.expires_at)}`
              : null}
          </p>
        </div>
        {kind === "REQUEST" ? (
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="outline" className="h-11" disabled={pending} onClick={() => decide(false)}>
              {pending && pressed === "reject" ? <Spinner /> : null}
              {confirmReject ? "Yakin tolak?" : "Tolak"}
            </Button>
            {confirmReject && !pending ? (
              <Button variant="ghost" className="h-11" onClick={() => setConfirmReject(false)}>
                Batal
              </Button>
            ) : null}
            <Button className="h-11" disabled={pending} onClick={() => decide(true)}>
              {pending && pressed === "approve" ? <Spinner /> : null}
              {b.amount_due_now > 0 ? "Setujui dan kirim tagihan" : "Setujui"}
            </Button>
          </div>
        ) : (
          <Button asChild variant="outline" className="h-11 w-full sm:w-auto">
            <a href={unpaidReminderLink(b)} target="_blank" rel="noopener noreferrer">
              Ingatkan lewat WhatsApp
            </a>
          </Button>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-muted-foreground mt-2 text-sm">
          {error}
        </p>
      ) : null}
    </li>
  );
}
