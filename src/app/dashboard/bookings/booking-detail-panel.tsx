"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  attendanceWindow,
  rescheduleNoticeLink,
  whatsappLink,
} from "@/lib/booking/dashboard";
import { ON_SITE_METHOD_LABEL } from "@/lib/booking/payment-mode";
import { jakartaDateISO } from "@/lib/booking/slots";
import { formatDateTime, formatRupiah, formatSchedule } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OnSitePaymentMethod, PaymentMode } from "@/types/database";

import { getDisplayStatus, type BookingListItem } from "./booking-state";
import { BookingTimeline, type TimelineNotification } from "./booking-timeline";
import { SlotField } from "./slot-field";

type ActionResult = { ok: boolean; message?: string };

export type BookingDetailActions = {
  cancel: (id: string) => Promise<ActionResult>;
  decide: (id: string, approve: boolean) => Promise<ActionResult>;
  markPaid: (id: string, method: OnSitePaymentMethod) => Promise<ActionResult>;
  attend: (id: string, attended: boolean) => Promise<ActionResult>;
  reschedule: (id: string, startISO: string) => Promise<ActionResult>;
};

const MAX_RESCHEDULES = 3;
const METHODS = Object.keys(ON_SITE_METHOD_LABEL) as OnSitePaymentMethod[];
const MODE_LABEL: Record<PaymentMode, string> = {
  FULL: "Bayar penuh online",
  DEPOSIT: "DP online, sisa di tempat",
  ON_SITE: "Bayar di tempat",
  REQUEST: "Perlu persetujuan",
};
const ACTION_BUTTON = "min-h-11 w-full";

type Reschedule =
  { step: "closed" } | { step: "form" } | { step: "done"; startISO: string };

export function BookingDetailPanel({
  booking,
  nowMs,
  username,
  notifications,
  actions,
}: {
  booking: BookingListItem;
  /** Instant "sekarang" dari server (lihat getDisplayStatus). */
  nowMs: number;
  username: string;
  /** null = riwayat pesan gagal dimuat. */
  notifications: TimelineNotification[] | null;
  actions: BookingDetailActions;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"reject" | "cancel" | "paid" | null>(
    null,
  );
  const [method, setMethod] = useState<OnSitePaymentMethod>("CASH");
  const [reschedule, setReschedule] = useState<Reschedule>({ step: "closed" });
  const todayISO = jakartaDateISO(new Date(nowMs));
  const [dateISO, setDateISO] = useState(() =>
    jakartaDateISO(new Date(booking.start_datetime)),
  );
  const [newStart, setNewStart] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, [booking.id]);

  const displayStatus = getDisplayStatus(booking, nowMs);
  const startMs = new Date(booking.start_datetime).getTime();
  const live = booking.status === "PAID" || booking.status === "CONFIRMED";
  const attendanceDone = Boolean(booking.attended_at || booking.no_show_at);
  const { canAttend, canNoShow } = attendanceWindow(
    booking.start_datetime,
    nowMs,
  );
  const onSiteOpen =
    live && booking.amount_due_on_site > 0 && !booking.paid_on_site_at;
  const canDecide = displayStatus === "REQUESTED";
  const canCancel = ["PENDING", "PAID", "CONFIRMED"].includes(booking.status);
  const remaining = Math.max(
    0,
    MAX_RESCHEDULES - booking.merchant_reschedule_count,
  );
  const canReschedule =
    live && !attendanceDone && nowMs < startMs && remaining > 0;
  const amount = booking.amount_due_now + booking.amount_due_on_site;

  function run(action: () => Promise<ActionResult>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setConfirm(null);
        onOk?.();
        router.refresh();
      } else {
        setError(result.message ?? "Gagal menyimpan. Coba lagi.");
      }
    });
  }

  function saveReschedule() {
    if (!newStart) return;
    const picked = newStart;
    run(
      () => actions.reschedule(booking.id, picked),
      () => setReschedule({ step: "done", startISO: picked }),
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="pr-11">
        <h2
          id="booking-detail-title"
          ref={titleRef}
          tabIndex={-1}
          className="text-lg font-semibold outline-none"
        >
          {booking.customer_name}
        </h2>
        <p className="text-muted-foreground text-sm">
          {booking.customer_whatsapp}
        </p>
      </header>

      <Button asChild variant="outline" className={ACTION_BUTTON}>
        <a
          href={whatsappLink(booking.customer_whatsapp)}
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle />
          Chat WhatsApp
        </a>
      </Button>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Jadwal</dt>
        <dd>{formatSchedule(booking.start_datetime, booking.end_datetime)}</dd>
        <dt className="text-muted-foreground">Layanan</dt>
        <dd>{booking.service_name}</dd>
        {booking.staff_name ? (
          <>
            <dt className="text-muted-foreground">Staf</dt>
            <dd>{booking.staff_name}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Dibuat</dt>
        <dd>{booking.source === "MANUAL" ? "Manual" : "Halaman booking"}</dd>
      </dl>

      <section
        aria-labelledby="booking-payment-title"
        className="flex flex-col gap-3 rounded-xl border p-4"
      >
        <div>
          <h3
            id="booking-payment-title"
            className="text-muted-foreground text-sm"
          >
            Pembayaran
          </h3>
          <p className="text-sm">{MODE_LABEL[booking.payment_mode]}</p>
          <p className="text-2xl font-semibold tabular-nums">
            {formatRupiah(amount)}
          </p>
          {booking.amount_due_now > 0 && booking.amount_due_on_site > 0 ? (
            <p className="text-muted-foreground text-sm">
              DP {formatRupiah(booking.amount_due_now)}
              {booking.status === "PAID" || booking.status === "CONFIRMED"
                ? " lunas"
                : " belum dibayar"}
              , sisa {formatRupiah(booking.amount_due_on_site)} di tempat
            </p>
          ) : null}
        </div>

        {booking.paid_on_site_at ? (
          <p
            role="status"
            className="flex items-center gap-2 text-sm font-medium"
          >
            <Check className="size-4" />
            Lunas di tempat
            {booking.paid_on_site_method
              ? `, ${ON_SITE_METHOD_LABEL[booking.paid_on_site_method]}`
              : ""}
          </p>
        ) : null}

        {onSiteOpen ? (
          confirm === "paid" ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm">
                Tandai lunas {formatRupiah(booking.amount_due_on_site)} dengan{" "}
                {ON_SITE_METHOD_LABEL[method]}?
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={pending}
                  onClick={() => setConfirm(null)}
                >
                  Batal
                </Button>
                <Button
                  className="min-h-11"
                  disabled={pending}
                  onClick={() =>
                    run(() => actions.markPaid(booking.id, method))
                  }
                >
                  {pending ? <Spinner /> : null}
                  Ya
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div
                role="radiogroup"
                aria-label="Cara bayar di tempat"
                className="grid grid-cols-3 gap-2"
              >
                {METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={method === m}
                    onClick={() => setMethod(m)}
                    className={cn(
                      "focus-visible:ring-ring/50 min-h-11 rounded-md border text-sm outline-none focus-visible:ring-3",
                      method === m
                        ? "border-primary bg-primary text-primary-foreground font-medium"
                        : "border-border bg-card",
                    )}
                  >
                    {ON_SITE_METHOD_LABEL[m]}
                  </button>
                ))}
              </div>
              <Button
                className="min-h-11"
                disabled={pending}
                onClick={() => setConfirm("paid")}
              >
                Tandai lunas
              </Button>
            </div>
          )
        ) : null}
      </section>

      {canDecide ? (
        confirm === "reject" ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm">Tolak permintaan ini?</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="min-h-11"
                disabled={pending}
                onClick={() => setConfirm(null)}
              >
                Batal
              </Button>
              <Button
                className="min-h-11"
                disabled={pending}
                onClick={() => run(() => actions.decide(booking.id, false))}
              >
                {pending ? <Spinner /> : null}
                Yakin tolak
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={pending}
              onClick={() => setConfirm("reject")}
            >
              Tolak
            </Button>
            <Button
              className="min-h-11"
              disabled={pending}
              onClick={() => run(() => actions.decide(booking.id, true))}
            >
              {pending ? <Spinner /> : null}
              {booking.amount_due_now > 0
                ? "Setujui dan kirim tagihan"
                : "Setujui"}
            </Button>
          </div>
        )
      ) : null}

      {live && attendanceDone ? (
        <p
          role="status"
          className="flex items-center gap-2 text-sm font-medium"
        >
          {booking.attended_at ? <Check className="size-4" /> : null}
          {booking.attended_at ? "Hadir" : "Tidak datang"}
        </p>
      ) : null}

      {reschedule.step === "done" ? (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-xl border p-4 text-sm"
        >
          <p className="font-medium">
            Jadwal diubah ke {formatDateTime(reschedule.startISO)}
          </p>
          <a
            href={rescheduleNoticeLink(booking, reschedule.startISO)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            Kabari pelanggan lewat WhatsApp
          </a>
        </div>
      ) : null}

      {reschedule.step === "form" ? (
        <section
          aria-labelledby="booking-reschedule-title"
          className="flex flex-col gap-3 rounded-xl border p-4"
        >
          <h3 id="booking-reschedule-title" className="text-sm font-semibold">
            Jadwal ulang
          </h3>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reschedule-date">Tanggal baru</Label>
            <Input
              id="reschedule-date"
              type="date"
              className="min-h-11"
              min={todayISO}
              value={dateISO}
              onChange={(e) => {
                if (!e.target.value) return;
                setDateISO(e.target.value);
                setNewStart(null);
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label id="reschedule-slot-label">Jam baru</Label>
            <SlotField
              username={username}
              serviceId={booking.service_id}
              staffId={booking.staff_id}
              dateISO={dateISO}
              value={newStart}
              onChange={setNewStart}
              labelledBy="reschedule-slot-label"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={pending}
              onClick={() => {
                setReschedule({ step: "closed" });
                setNewStart(null);
                setError(null);
              }}
            >
              Batal
            </Button>
            <Button
              className="min-h-11"
              disabled={pending || !newStart}
              onClick={saveReschedule}
            >
              {pending ? <Spinner /> : null}
              Simpan jadwal
            </Button>
          </div>
        </section>
      ) : null}

      {(live || canCancel) &&
      confirm !== "cancel" &&
      reschedule.step !== "form" ? (
        <div className="grid grid-cols-2 gap-2">
          {live && canAttend && !booking.attended_at ? (
            <Button
              variant="outline"
              className="border-foreground min-h-11"
              disabled={pending}
              onClick={() => run(() => actions.attend(booking.id, true))}
            >
              {pending ? <Spinner /> : null}
              Tandai hadir
            </Button>
          ) : null}
          {canReschedule ? (
            <Button
              variant="outline"
              className="min-h-11"
              disabled={pending}
              onClick={() => {
                setError(null);
                setDateISO(jakartaDateISO(new Date(booking.start_datetime)));
                setNewStart(null);
                setReschedule({ step: "form" });
              }}
            >
              Jadwal ulang
            </Button>
          ) : null}
          {live && canNoShow && !booking.no_show_at ? (
            <Button
              variant="outline"
              className="min-h-11"
              disabled={pending}
              onClick={() => run(() => actions.attend(booking.id, false))}
            >
              {pending ? <Spinner /> : null}
              Tidak datang
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              variant="ghost"
              className="text-destructive min-h-11"
              disabled={pending}
              onClick={() => setConfirm("cancel")}
            >
              Batalkan
            </Button>
          ) : null}
        </div>
      ) : null}

      {live && !attendanceDone && !canAttend ? (
        <p className="text-muted-foreground text-xs">
          Kehadiran bisa ditandai mulai 1 jam sebelum jadwal.
        </p>
      ) : null}
      {live && !attendanceDone && canAttend && !canNoShow ? (
        <p className="text-muted-foreground text-xs">
          Tidak datang bisa ditandai mulai jam jadwal.
        </p>
      ) : null}
      {live && !attendanceDone ? (
        <p className="text-muted-foreground text-xs">
          {remaining > 0
            ? `Sisa jadwal ulang: ${remaining} dari ${MAX_RESCHEDULES}.`
            : `Sudah dijadwal ulang ${MAX_RESCHEDULES} kali.`}
        </p>
      ) : null}

      {confirm === "cancel" ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            Batalkan booking {booking.customer_name}? Slot jadwal ini akan
            dilepas dan bisa dipesan pelanggan lain. Tindakan ini tidak bisa
            dibatalkan.
            {booking.status === "PAID"
              ? " DP pelanggan untuk booking ini sudah masuk ke akun payment gateway Anda, jadi membatalkan di sini tidak mengembalikan dananya secara otomatis. Kalau perlu refund, lakukan manual lewat dashboard payment gateway Anda."
              : ""}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={pending}
              onClick={() => setConfirm(null)}
            >
              Kembali
            </Button>
            <Button
              variant="destructive"
              className="min-h-11"
              disabled={pending}
              onClick={() => run(() => actions.cancel(booking.id))}
            >
              {pending ? <Spinner /> : null}
              Ya, batalkan
            </Button>
          </div>
        </div>
      ) : null}

      {booking.status === "CANCELLED" ? (
        <p role="status" className="text-sm font-medium">
          Dibatalkan
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-foreground text-sm">
          {error}
        </p>
      ) : null}

      <BookingTimeline booking={booking} notifications={notifications} />
    </div>
  );
}
