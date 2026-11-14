import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";

import { AddToCalendarButton } from "@/components/booking-page/add-to-calendar-button";
import { BookingPageShell } from "@/components/booking-page/page-shell";
import { QrisCode } from "@/components/qris-code";
import { Button } from "@/components/ui/button";
import { buildBookingIcs } from "@/lib/booking/calendar";
import { formatDayBlock, formatRupiah, formatSchedule, formatTime } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import type { ResolvedTheme } from "@/lib/theme/types";

import { BookingLiveStatus } from "./booking-live-status";

export type BookingPageRow = {
  id: string;
  merchant_id: string;
  service_name: string;
  service_price: number;
  start_datetime: string;
  end_datetime: string;
  customer_name: string;
  status: "PENDING" | "PAID" | "CANCELLED";
  payment_url: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  expires_at: string;
};

type ViewProps = {
  booking: BookingPageRow;
  merchantName: string;
  merchantUsername: string | null;
  theme: ResolvedTheme;
  isExpiredPending: boolean;
};

/** Tampilan murni /pesanan/[token]: tanpa query, supaya bisa dipakai Storybook. */
export function BookingStatusView({
  booking,
  merchantName,
  merchantUsername,
  theme,
  isExpiredPending,
}: ViewProps) {
  return (
    <BookingPageShell theme={theme}>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Booking Anda</h1>
        <p className="text-muted-foreground text-sm">{merchantName}</p>
      </header>

      {booking.status === "PAID" ? (
        <Paid booking={booking} merchantName={merchantName} merchantUsername={merchantUsername} />
      ) : booking.status === "CANCELLED" || isExpiredPending ? (
        <ExpiredOrCancelled
          booking={booking}
          merchantName={merchantName}
          merchantUsername={merchantUsername}
        />
      ) : (
        <Pending booking={booking} />
      )}
    </BookingPageShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-right font-medium text-balance">{children}</dd>
    </div>
  );
}

function Paid({
  booking,
  merchantName,
  merchantUsername,
}: {
  booking: BookingPageRow;
  merchantName: string;
  merchantUsername: string | null;
}) {
  const { month, day } = formatDayBlock(booking.start_datetime);
  const ics = buildBookingIcs({
    uid: booking.id,
    title: `${booking.service_name} di ${merchantName}`,
    startUtc: booking.start_datetime,
    endUtc: booking.end_datetime,
    location: merchantName,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="border-border bg-card flex items-center gap-4 rounded-[var(--radius)] border p-4">
        <div className="border-border flex w-16 shrink-0 flex-col items-center border-r pr-4">
          <span className="text-muted-foreground text-sm">{month}</span>
          <span className="text-3xl leading-none font-semibold">{day}</span>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-medium text-balance">{booking.service_name}</span>
          <span className="text-muted-foreground text-sm text-pretty">
            {formatSchedule(booking.start_datetime, booking.end_datetime)}
          </span>
        </div>
      </div>

      <dl className="flex flex-col gap-3 text-sm">
        <Row label="Atas nama">{booking.customer_name}</Row>
        <Row label="Dibayar">{formatRupiah(Number(booking.service_price))} (QRIS)</Row>
        <Row label="Status">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="size-4" aria-hidden />
            Terkonfirmasi
          </span>
        </Row>
      </dl>

      <div className="flex flex-col gap-3">
        <AddToCalendarButton ics={ics} fileName="booking.ics" />
        {merchantUsername ? (
          <Link
            href={ROUTES.merchantPage(merchantUsername)}
            className="text-muted-foreground hover:text-foreground text-center text-sm underline underline-offset-4"
          >
            Kembali ke halaman {merchantName}
          </Link>
        ) : null}
      </div>

      <p className="text-muted-foreground text-sm text-pretty">
        Simpan halaman ini. Tautannya bisa dibuka lagi kapan saja.
      </p>
    </div>
  );
}

function ExpiredOrCancelled({
  booking,
  merchantName,
  merchantUsername,
}: {
  booking: BookingPageRow;
  merchantName: string;
  merchantUsername: string | null;
}) {
  return (
    <div className="border-border bg-card flex flex-col items-center gap-3 rounded-[var(--radius)] border p-6 text-center">
      <XCircle className="text-destructive size-10" aria-hidden />
      <div className="flex flex-col gap-1">
        <span className="font-medium">
          {booking.status === "CANCELLED" ? "Booking dibatalkan" : "Waktu pembayaran habis"}
        </span>
        <p className="text-muted-foreground text-sm text-pretty">
          Slot ini sudah dilepas kembali.
          {booking.cancel_reason ? ` ${booking.cancel_reason}.` : ""} Silakan pesan ulang untuk
          memilih jadwal baru.
        </p>
      </div>

      {merchantUsername ? (
        <Button asChild variant="outline">
          <Link href={ROUTES.merchantPage(merchantUsername)}>Pesan ulang di {merchantName}</Link>
        </Button>
      ) : null}
    </div>
  );
}

function Pending({ booking }: { booking: BookingPageRow }) {
  return (
    <div className="flex flex-col gap-6">
      {/* Blok QR + nominal diteruskan sebagai children ke BookingLiveStatus
          (BUKAN dirender langsung) -- I4: begitu polling mengonfirmasi status
          terminal, BookingLiveStatus berhenti menampilkan children ini supaya
          kode QR yang sudah lunas tidak terlihat mengundang dipindai lagi. */}
      <BookingLiveStatus bookingId={booking.id} expiresAt={booking.expires_at}>
        <div className="flex flex-col items-center gap-3">
          {booking.payment_url ? (
            <QrisCode payload={booking.payment_url} />
          ) : (
            <div className="border-border flex w-full max-w-[320px] flex-col gap-2 rounded-[var(--radius)] border border-dashed p-6 text-center">
              <p className="text-sm text-pretty">
                Kode pembayaran belum tersedia. Coba muat ulang halaman ini.
              </p>
            </div>
          )}

          <div className="flex flex-col items-center">
            <span className="text-muted-foreground text-sm">Total dibayar</span>
            <span className="text-2xl font-semibold">
              {formatRupiah(Number(booking.service_price))}
            </span>
          </div>
          <p className="text-muted-foreground text-center text-sm">
            Bayar sebelum {formatTime(booking.expires_at)} WIB
          </p>
        </div>
      </BookingLiveStatus>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Cara bayar</h2>
        <ol className="text-muted-foreground flex list-decimal flex-col gap-1 pl-5 text-sm text-pretty">
          <li>Buka aplikasi e-wallet atau m-banking, lalu pilih Scan QRIS.</li>
          <li>Pindai kode di atas dan pastikan nominalnya sesuai.</li>
          <li>Halaman ini berubah otomatis setelah pembayaran diterima.</li>
        </ol>
      </section>

      <dl className="border-border flex flex-col gap-3 border-t pt-4 text-sm">
        <Row label="Layanan">{booking.service_name}</Row>
        <Row label="Jadwal">{formatSchedule(booking.start_datetime, booking.end_datetime)}</Row>
        <Row label="Atas nama">{booking.customer_name}</Row>
      </dl>
    </div>
  );
}
