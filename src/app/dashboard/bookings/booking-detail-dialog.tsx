"use client";

import { useState, useTransition } from "react";
import { MessageCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { ON_SITE_METHOD_LABEL } from "@/lib/booking/payment-mode";
import { formatDateTime, formatDuration, formatRupiah, formatTime } from "@/lib/format";

import {
  type BookingListItem,
  getDisplayStatus,
  PROVIDER_LABELS,
  STATUS_META,
} from "./booking-state";
import type { CancelBookingResult } from "./booking-state";
import { decideRequest, markAttendance, markPaidOnSite } from "./actions";
import { NotificationHistory } from "./notification-history";

/**
 * Nomor WhatsApp pelanggan tersimpan format E.164 ("+62812..." --
 * whatsappSchema di src/lib/validations/merchant.ts), sementara tautan
 * wa.me butuh format internasional TANPA "+", spasi, atau strip. Buang
 * semua karakter non-digit sudah cukup karena formatnya sudah dijamin
 * E.164 sejak disimpan.
 */
function toWhatsappLink(whatsapp: string): string {
  return `https://wa.me/${whatsapp.replace(/\D/g, "")}`;
}

export function BookingDetailDialog({
  open,
  onOpenChange,
  booking,
  nowMs,
  onCancelRequest,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: BookingListItem;
  /** Instant referensi "sekarang", diteruskan dari page.tsx lewat
   * bookings-table.tsx -- lihat komentar nowMs di getDisplayStatus
   * (booking-state.ts). */
  nowMs: number;
  /** Diberikan hanya kalau booking ini masih boleh dibatalkan -- lihat
   * `cancellable` di bookings-table.tsx. */
  onCancelRequest?: () => void;
}) {
  const displayStatus = getDisplayStatus(booking, nowMs);
  const meta = STATUS_META[displayStatus];
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);

  const startMs = new Date(booking.start_datetime).getTime();
  const live = booking.status === "PAID" || booking.status === "CONFIRMED";
  const canDecide = displayStatus === "REQUESTED";
  const onSiteOpen = live && booking.amount_due_on_site > 0 && !booking.paid_on_site_at;
  const attendanceDone = Boolean(booking.attended_at || booking.no_show_at);
  const canAttend = nowMs >= startMs - 60 * 60 * 1000;
  const canNoShow = nowMs >= startMs;

  function run(action: () => Promise<CancelBookingResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setConfirmReject(false);
        onOpenChange(false);
      } else {
        setError(result.message ?? "Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{booking.customer_name}</DialogTitle>
          <DialogDescription>Detail booking</DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">WhatsApp</dt>
          <dd>
            <a
              href={toWhatsappLink(booking.customer_whatsapp)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-4"
            >
              <MessageCircle className="size-3.5" />
              {booking.customer_whatsapp}
            </a>
          </dd>

          <dt className="text-muted-foreground">Layanan</dt>
          <dd>{booking.service_name}</dd>

          <dt className="text-muted-foreground">Durasi</dt>
          <dd>{formatDuration(booking.duration_minutes)}</dd>

          {booking.staff_name ? (
            <>
              <dt className="text-muted-foreground">Staf</dt>
              <dd>{booking.staff_name}</dd>
            </>
          ) : null}

          <dt className="text-muted-foreground">Jadwal</dt>
          <dd>
            {formatDateTime(booking.start_datetime)} &ndash; {formatTime(booking.end_datetime)}
          </dd>

          <dt className="text-muted-foreground">Nilai</dt>
          <dd>{formatRupiah(booking.service_price)}</dd>

          {booking.amount_due_now > 0 ? (
            <>
              <dt className="text-muted-foreground">Dibayar online</dt>
              <dd>
                {booking.status === "PAID"
                  ? formatRupiah(booking.amount_due_now)
                  : `${formatRupiah(booking.amount_due_now)} (belum dibayar)`}
              </dd>
            </>
          ) : null}

          {booking.amount_due_on_site > 0 ? (
            <>
              <dt className="text-muted-foreground">Ditagih di tempat</dt>
              <dd>
                {formatRupiah(booking.amount_due_on_site)},{" "}
                {booking.paid_on_site_at
                  ? `lunas${booking.paid_on_site_method ? ` (${ON_SITE_METHOD_LABEL[booking.paid_on_site_method]})` : ""}`
                  : "belum dibayar"}
              </dd>
            </>
          ) : null}

          {booking.attended_at ? (
            <>
              <dt className="text-muted-foreground">Kehadiran</dt>
              <dd>Hadir</dd>
            </>
          ) : null}

          {booking.no_show_at ? (
            <>
              <dt className="text-muted-foreground">Kehadiran</dt>
              <dd>Tidak datang</dd>
            </>
          ) : null}

          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <Badge variant={meta.badgeVariant}>{meta.label}</Badge>
          </dd>

          {booking.payment_provider ? (
            <>
              <dt className="text-muted-foreground">Provider</dt>
              <dd>{PROVIDER_LABELS[booking.payment_provider] ?? booking.payment_provider}</dd>
            </>
          ) : null}

          {booking.payment_reference ? (
            <>
              <dt className="text-muted-foreground">Referensi</dt>
              <dd className="font-mono text-xs break-all">{booking.payment_reference}</dd>
            </>
          ) : null}

          <dt className="text-muted-foreground">Dibuat</dt>
          <dd>{formatDateTime(booking.created_at)}</dd>

          {booking.paid_at ? (
            <>
              <dt className="text-muted-foreground">Dibayar</dt>
              <dd>{formatDateTime(booking.paid_at)}</dd>
            </>
          ) : null}

          {booking.cancelled_at ? (
            <>
              <dt className="text-muted-foreground">Dibatalkan</dt>
              <dd>{formatDateTime(booking.cancelled_at)}</dd>
            </>
          ) : null}

          {booking.cancel_reason ? (
            <>
              <dt className="text-muted-foreground">Alasan dibatalkan</dt>
              <dd>{booking.cancel_reason}</dd>
            </>
          ) : null}
        </dl>

        {open ? <NotificationHistory bookingId={booking.id} /> : null}

        {error ? (
          <p role="alert" className="text-foreground text-sm">
            {error}
          </p>
        ) : null}

        {canDecide ? (
          <DialogFooter>
            {confirmReject ? (
              <>
                <span className="text-sm sm:mr-auto sm:self-center">Tolak permintaan ini?</span>
                <Button variant="outline" disabled={pending} onClick={() => setConfirmReject(false)}>
                  Batal
                </Button>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() => run(() => decideRequest(booking.id, false))}
                >
                  {pending ? <Spinner /> : null}
                  Ya, tolak
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" disabled={pending} onClick={() => setConfirmReject(true)}>
                  Tolak
                </Button>
                <Button disabled={pending} onClick={() => run(() => decideRequest(booking.id, true))}>
                  {pending ? <Spinner /> : null}
                  Setujui
                </Button>
              </>
            )}
          </DialogFooter>
        ) : null}

        {onSiteOpen ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">Tandai lunas di tempat:</span>
            {(Object.keys(ON_SITE_METHOD_LABEL) as (keyof typeof ON_SITE_METHOD_LABEL)[]).map(
              (method) => (
                <Button
                  key={method}
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => markPaidOnSite(booking.id, method))}
                >
                  {ON_SITE_METHOD_LABEL[method]}
                </Button>
              ),
            )}
          </div>
        ) : null}

        {live && !attendanceDone ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pending || !canAttend}
              onClick={() => run(() => markAttendance(booking.id, true))}
            >
              Hadir
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pending || !canNoShow}
              onClick={() => run(() => markAttendance(booking.id, false))}
            >
              Tidak datang
            </Button>
            {!canAttend ? (
              <span className="text-muted-foreground text-xs">
                Kehadiran bisa ditandai mulai 1 jam sebelum jadwal.
              </span>
            ) : null}
          </div>
        ) : null}

        {onCancelRequest ? (
          <DialogFooter>
            <Button variant="destructive" disabled={pending} onClick={onCancelRequest}>
              Batalkan booking
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
