"use client";

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
import { formatDateTime, formatDuration, formatRupiah, formatTime } from "@/lib/format";

import {
  type BookingListItem,
  getDisplayStatus,
  PROVIDER_LABELS,
  STATUS_META,
} from "./booking-state";

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

          <dt className="text-muted-foreground">Jadwal</dt>
          <dd>
            {formatDateTime(booking.start_datetime)} &ndash; {formatTime(booking.end_datetime)}
          </dd>

          <dt className="text-muted-foreground">Nilai</dt>
          <dd>{formatRupiah(booking.service_price)}</dd>

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

        {onCancelRequest ? (
          <DialogFooter>
            <Button variant="destructive" onClick={onCancelRequest}>
              Batalkan booking
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
