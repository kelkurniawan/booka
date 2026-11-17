import Link from "next/link";
import { CalendarClock, CheckCircle2, Clock, XCircle } from "lucide-react";

import { AddToCalendarButton } from "@/components/booking-page/add-to-calendar-button";
import { BookingPageShell } from "@/components/booking-page/page-shell";
import { QrisCode } from "@/components/qris-code";
import { Button } from "@/components/ui/button";
import { buildBookingIcs } from "@/lib/booking/calendar";
import { contactWhatsappText } from "@/lib/booking/contact";
import { CUSTOMER_CANCEL_REASON, type ManageState } from "@/lib/booking/customer-manage";
import { REQUEST_EXPIRY_REASON, REQUEST_REJECT_REASON } from "@/lib/booking/payment-mode";
import { formatDateTime, formatDayBlock, formatRupiah, formatSchedule, formatTime } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import type { ResolvedTheme } from "@/lib/theme/types";
import type { BookingStatus, PaymentMode } from "@/types/database";

import { BookingLiveStatus } from "./booking-live-status";
import { CancelBookingButton } from "./cancel-booking-button";
import { ContactButton, type ContactData } from "./contact-sheet";
import { PayNowButton } from "./pay-now-button";
import { ReminderSummary } from "./reminder-summary";

export type BookingPageRow = {
  id: string;
  merchant_id: string;
  service_name: string;
  service_price: number;
  start_datetime: string;
  end_datetime: string;
  customer_name: string;
  status: BookingStatus;
  payment_url: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  expires_at: string;
  payment_mode: PaymentMode;
  amount_due_now: number;
  amount_due_on_site: number;
  paid_on_site_at: string | null;
  service_id: string | null;
  staff_id: string | null;
  attended_at: string | null;
  no_show_at: string | null;
  reschedule_count: number;
  voucher_code: string | null;
  discount_amount: number;
};

export type ReminderView = {
  /** Efektif untuk booking ini (Keputusan 17). */
  whatsapp: boolean;
  email: boolean;
  push: boolean;
  /** Kanal yang dinyalakan merchant. */
  channelsOffered: { whatsapp: boolean; email: boolean; push: boolean };
  offsets: { dayBefore: boolean; sameDay: boolean };
};

type ViewProps = {
  /** Token akses dari URL; dipakai tombol bayar untuk permintaan yang disetujui. */
  token: string;
  booking: BookingPageRow;
  merchantName: string;
  merchantUsername: string | null;
  theme: ResolvedTheme;
  isExpiredPending: boolean;
  code: string;
  manage: ManageState;
  policy: string[];
  contact: ContactData;
  /** null = tidak tersedia (paket, status, atau semua kanal dimatikan merchant). */
  reminders: ReminderView | null;
  /** Diisi Task 9; Task 6 merender null. */
  pushPrompt?: React.ReactNode;
};

const hasContact = (c: ContactData) => c.whatsapp !== null || c.others.length > 0;
const ACTION_CLASS = "min-h-11 flex-1";

/** Tampilan murni /pesanan/[token]: tanpa query, supaya bisa dipakai Storybook. */
export function BookingStatusView({
  token,
  booking,
  merchantName,
  merchantUsername,
  theme,
  isExpiredPending,
  code,
  manage,
  policy,
  contact,
  reminders,
  pushPrompt,
}: ViewProps) {
  const whatsappText = contactWhatsappText({
    merchantName,
    customerName: booking.customer_name,
    code,
    startISO: booking.start_datetime,
  });
  const contactButton = hasContact(contact) ? (
    <ContactButton merchantName={merchantName} whatsappText={whatsappText} contact={contact} className="min-h-11 w-full" />
  ) : null;
  return (
    <BookingPageShell theme={theme}>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Booking Anda</h1>
        <p className="text-muted-foreground text-sm">{merchantName}</p>
      </header>

      {booking.status === "PAID" || booking.status === "CONFIRMED" ? (
        <Booked
          token={token}
          booking={booking}
          merchantName={merchantName}
          merchantUsername={merchantUsername}
          code={code}
          manage={manage}
          policy={policy}
          contact={contact}
          whatsappText={whatsappText}
          reminders={reminders}
          pushPrompt={pushPrompt}
        />
      ) : booking.status === "CANCELLED" || isExpiredPending ? (
        <ExpiredOrCancelled
          booking={booking}
          merchantName={merchantName}
          merchantUsername={merchantUsername}
          isExpiredPending={isExpiredPending}
        />
      ) : booking.status === "REQUESTED" ? (
        <Requested booking={booking} merchantName={merchantName} contactButton={contactButton}>
          {manage.cancel.allowed ? <CancelBookingButton token={token} policy={policy} /> : null}
        </Requested>
      ) : booking.payment_mode === "REQUEST" && !booking.payment_url ? (
        // Hanya permintaan yang disetujui yang menunggu pelanggan menekan Bayar;
        // PENDING lain tanpa QR tetap memakai cadangan "muat ulang" di Pending.
        <Approved token={token} booking={booking} contactButton={contactButton} />
      ) : (
        <Pending booking={booking} contactButton={contactButton} />
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

/** Harga asli dan potongan voucher; hanya muncul bila ada diskon. */
function VoucherRows({ booking }: { booking: BookingPageRow }) {
  if (!(booking.discount_amount > 0)) return null;
  return (
    <>
      <Row label="Harga layanan">{formatRupiah(Number(booking.service_price))}</Row>
      <Row label={`Voucher ${booking.voucher_code ?? ""}`.trim()}>
        {"\u2212"}{formatRupiah(Number(booking.discount_amount))}
      </Row>
    </>
  );
}

function Booked({
  token,
  booking,
  merchantName,
  merchantUsername,
  code,
  manage,
  policy,
  contact,
  whatsappText,
  reminders,
  pushPrompt,
}: {
  token: string;
  booking: BookingPageRow;
  merchantName: string;
  merchantUsername: string | null;
  code: string;
  manage: ManageState;
  policy: string[];
  contact: ContactData;
  whatsappText: string;
  reminders: ReminderView | null;
  pushPrompt?: React.ReactNode;
}) {
  const confirmed = booking.status === "CONFIRMED";
  const { month, day } = formatDayBlock(booking.start_datetime);
  const ics = buildBookingIcs({
    uid: booking.id,
    title: `${booking.service_name} di ${merchantName}`,
    startUtc: booking.start_datetime,
    endUtc: booking.end_datetime,
    location: merchantName,
  });

  const onSiteRow = booking.amount_due_on_site > 0 && (
    <Row label={booking.paid_on_site_at ? "Lunas di tempat" : confirmed ? "Bayar di tempat" : "Sisa di tempat"}>
      {formatRupiah(Number(booking.amount_due_on_site))}
      {confirmed && !booking.paid_on_site_at ? (
        <span className="text-muted-foreground block text-xs font-normal">Dibayar saat layanan</span>
      ) : null}
    </Row>
  );

  return (
    <div className="flex flex-col gap-6">
      {confirmed ? (
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Jadwal sudah dipesan</h2>
          <p className="text-muted-foreground text-sm">
            Sampai jumpa, {booking.customer_name.split(" ")[0]}.
          </p>
        </div>
      ) : null}
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
        {confirmed ? onSiteRow : null}
        <Row label="Atas nama">{booking.customer_name}</Row>
        <Row label="Kode booking">{code}</Row>
        <VoucherRows booking={booking} />
        {confirmed ? null : (
          <>
            <Row label="Dibayar">{formatRupiah(Number(booking.amount_due_now))} (QRIS)</Row>
            {onSiteRow}
          </>
        )}
        <Row label="Status">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="size-4" aria-hidden />
            Terkonfirmasi
          </span>
        </Row>
      </dl>

      <div className="flex gap-2">
        {manage.reschedule.allowed ? (
          <Button asChild variant="outline" className={ACTION_CLASS}>
            <Link href={ROUTES.bookingReschedule(token)}>
              <CalendarClock aria-hidden />
              Ubah jadwal
            </Link>
          </Button>
        ) : null}
        {hasContact(contact) ? (
          <ContactButton merchantName={merchantName} whatsappText={whatsappText} contact={contact} className={ACTION_CLASS} />
        ) : null}
        <AddToCalendarButton ics={ics} fileName="booking.ics" label="Kalender" className={ACTION_CLASS} />
      </div>

      {pushPrompt ?? null}
      {reminders ? <ReminderSummary token={token} startISO={booking.start_datetime} reminders={reminders} /> : null}

      <section className="border-border bg-card flex flex-col gap-2 rounded-[var(--radius)] border p-4">
        <h2 className="font-medium">Kebijakan {merchantName}</h2>
        {policy.map((line) => (
          <p key={line} className="text-muted-foreground text-sm text-pretty">
            {line}
          </p>
        ))}
      </section>

      <div className="flex flex-col gap-3">
        {manage.cancel.allowed ? <CancelBookingButton token={token} policy={policy} /> : null}
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
  isExpiredPending,
}: {
  booking: BookingPageRow;
  merchantName: string;
  merchantUsername: string | null;
  isExpiredPending: boolean;
}) {
  const rejected =
    booking.status === "CANCELLED" && booking.cancel_reason === REQUEST_REJECT_REASON;
  const unanswered =
    (booking.status === "CANCELLED" && booking.cancel_reason === REQUEST_EXPIRY_REASON) ||
    (booking.status === "REQUESTED" && isExpiredPending);
  const byCustomer = booking.status === "CANCELLED" && booking.cancel_reason === CUSTOMER_CANCEL_REASON;
  const isRequestEnd = rejected || unanswered || byCustomer;
  return (
    <div className="border-border bg-card flex flex-col items-center gap-3 rounded-[var(--radius)] border p-6 text-center">
      <XCircle className="text-destructive size-10" aria-hidden />
      <div className="flex flex-col gap-1">
        <span className="font-medium">
          {rejected
            ? "Permintaan ditolak"
            : unanswered
              ? "Permintaan tidak dijawab"
              : byCustomer
                ? "Anda membatalkan booking ini"
                : booking.status === "CANCELLED"
                ? "Booking dibatalkan"
                : "Waktu pembayaran habis"}
        </span>
        <p className="text-muted-foreground text-sm text-pretty">
          Slot ini sudah dilepas kembali.
          {booking.cancel_reason && !isRequestEnd ? ` ${booking.cancel_reason}.` : ""} Silakan
          pesan ulang untuk memilih jadwal baru.
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

function Pending({ booking, contactButton }: { booking: BookingPageRow; contactButton: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      {/* Blok QR + nominal diteruskan sebagai children ke BookingLiveStatus
          (BUKAN dirender langsung) -- I4: begitu polling mengonfirmasi status
          terminal, BookingLiveStatus berhenti menampilkan children ini supaya
          kode QR yang sudah lunas tidak terlihat mengundang dipindai lagi. */}
      <BookingLiveStatus bookingId={booking.id} expiresAt={booking.expires_at}>
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm font-medium">Menunggu pembayaran</p>
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
            <span className="text-muted-foreground text-sm">
              {booking.amount_due_on_site > 0 ? "DP dibayar sekarang" : "Yang perlu dibayar"}
            </span>
            <span className="text-2xl font-semibold">
              {formatRupiah(Number(booking.amount_due_now))}
            </span>
          </div>
          {booking.amount_due_on_site > 0 ? (
            <p className="text-muted-foreground text-center text-sm">
              Sisa {formatRupiah(Number(booking.amount_due_on_site))} dibayar di tempat.
            </p>
          ) : null}
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
        <VoucherRows booking={booking} />
      </dl>
      {contactButton}
    </div>
  );
}

function Summary({ booking }: { booking: BookingPageRow }) {
  return (
    <dl className="border-border flex flex-col gap-3 border-t pt-4 text-sm">
      <Row label="Layanan">{booking.service_name}</Row>
      <Row label="Jadwal">{formatSchedule(booking.start_datetime, booking.end_datetime)}</Row>
      <Row label="Atas nama">{booking.customer_name}</Row>
      <VoucherRows booking={booking} />
      {booking.amount_due_now > 0 ? (
        <Row label="Dibayar setelah disetujui">{formatRupiah(Number(booking.amount_due_now))}</Row>
      ) : null}
      {booking.amount_due_on_site > 0 ? (
        <Row label="Bayar di tempat">{formatRupiah(Number(booking.amount_due_on_site))}</Row>
      ) : null}
    </dl>
  );
}

function Requested({
  booking,
  merchantName,
  contactButton,
  children,
}: {
  booking: BookingPageRow;
  merchantName: string;
  contactButton: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="border-border bg-card flex flex-col items-center gap-3 rounded-[var(--radius)] border p-6 text-center">
        <Clock className="size-10" aria-hidden />
        <div className="flex flex-col gap-1">
          <h2 className="font-medium">Permintaan terkirim</h2>
          <p className="text-muted-foreground text-sm text-pretty">
            {merchantName} akan menjawab sebelum {formatDateTime(booking.expires_at)} WIB. Buka lagi
            halaman ini untuk melihat jawabannya.
          </p>
        </div>
      </div>
      <Summary booking={booking} />
      {contactButton}
      {children}
    </div>
  );
}

function Approved({
  token,
  booking,
  contactButton,
}: {
  token: string;
  booking: BookingPageRow;
  contactButton: React.ReactNode;
}) {
  const amount = formatRupiah(Number(booking.amount_due_now));
  return (
    <div className="flex flex-col gap-6">
      <div className="border-border bg-card flex flex-col items-center gap-3 rounded-[var(--radius)] border p-6 text-center">
        <CheckCircle2 className="size-10" aria-hidden />
        <div className="flex flex-col gap-1">
          <h2 className="font-medium">Permintaan disetujui</h2>
          <p className="text-muted-foreground text-sm text-pretty">
            Bayar {amount} sebelum {formatTime(booking.expires_at)} WIB untuk mengunci jadwal.
          </p>
        </div>
        <PayNowButton token={token} label={`Bayar ${amount}`} />
      </div>
      <Summary booking={booking} />
      {contactButton}
    </div>
  );
}
