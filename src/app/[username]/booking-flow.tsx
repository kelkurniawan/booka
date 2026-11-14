"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { BookingSummary } from "@/components/booking-page/booking-summary";
import { DateStrip } from "@/components/booking-page/date-strip";
import { ServiceOptionCard } from "@/components/booking-page/service-option-card";
import { BookingStepIndicator } from "@/components/booking-page/step-indicator";
import { StickyActionBar } from "@/components/booking-page/sticky-action-bar";
import { TimeSlotPicker, type TimeSlotState } from "@/components/booking-page/time-slot-picker";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  computeAmounts,
  effectivePaymentMode,
  needsApproval,
  paymentLabel,
  type PaymentSettings,
} from "@/lib/booking/payment-mode";
import { buildDateStrip, nextOpenDate } from "@/lib/booking/schedule";
import { jakartaDateISO, type FreeSlot } from "@/lib/booking/slots";
import { formatRupiah } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import { checkoutSchema } from "@/lib/validations/booking";
import type { Availability, DayOfWeek, Service, ServiceMedia } from "@/types/database";

export type BookingFlowProps = {
  username: string;
  merchantName: string;
  services: Service[];
  mediaByService: Record<string, ServiceMedia[]>;
  availability: Pick<Availability, "day_of_week">[];
  /** Staf aktif (Studio) beserta hari kerjanya. `days` kosong = ikut jam usaha. */
  staff: { id: string; name: string; days: DayOfWeek[] }[];
  /** Hanya petunjuk tampilan; server menentukan mode akhir saat booking dibuat. */
  paymentSettings: PaymentSettings;
};

type Step = 1 | 2 | 3;

const STEP_PARAM: Record<Step, string | null> = { 1: null, 2: "jadwal", 3: "data" };
const STEP_TITLE: Record<Step, string> = { 1: "Pilih layanan", 2: "Pilih jadwal", 3: "Data diri" };

/** URL halaman ini dengan parameter `langkah` untuk `step`; query lain dan hash tetap. */
function urlForStep(step: Step): string {
  const params = new URLSearchParams(window.location.search);
  const value = STEP_PARAM[step];
  if (value) params.set("langkah", value);
  else params.delete("langkah");
  const query = params.toString();
  return window.location.pathname + (query ? `?${query}` : "") + window.location.hash;
}

const TANGGAL = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  // Tanggal kalender murni, bukan instant: format sebagai UTC agar tidak
  // bergeser oleh zona waktu browser.
  timeZone: "UTC",
});

function dateLabel(dateISO: string): string {
  return TANGGAL.format(new Date(`${dateISO}T12:00:00Z`));
}

type CheckoutSubmitPayload = {
  username: string;
  serviceId: string;
  staffId: string | null;
  startUtc: string;
  customer_name: string;
  customer_whatsapp: string;
};

/** Respons sukses `POST /api/bookings` -- lihat src/app/api/bookings/route.ts. */
type CheckoutResult = {
  bookingId: string;
  payment_url: string;
  expires_at: string;
  bookingUrl: string;
};

type CheckoutErrorBody = { error?: string; issues?: unknown };

/**
 * `POST /api/bookings`. `merchantId` sengaja tidak dikirim: route resolve
 * sendiri lewat `username`. Melempar `Error` berisi pesan Indonesia yang sudah
 * dipetakan server, tinggal ditampilkan lewat toast.
 */
async function submitCheckout(payload: CheckoutSubmitPayload): Promise<CheckoutResult> {
  const response = await fetch("/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok || !body || typeof body !== "object" || !("bookingId" in body)) {
    const message =
      body && typeof body === "object" && "error" in body
        ? ((body as CheckoutErrorBody).error ?? null)
        : null;
    throw new Error(message ?? "Gagal membuat booking, silakan coba lagi.");
  }

  return body as CheckoutResult;
}

export function BookingFlow({
  username,
  merchantName,
  services,
  mediaByService,
  availability,
  staff,
  paymentSettings,
}: BookingFlowProps) {
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  // null = "siapa saja" (atau merchant tanpa staf).
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    services.length === 1 ? services[0].id : null,
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<FreeSlot | null>(null);
  const [slotState, setSlotState] = useState<TimeSlotState>({ kind: "idle" });

  const [customerName, setCustomerName] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const [todayISO] = useState(() => jakartaDateISO(new Date()));

  // Hari buka mengikuti staf yang dipilih: staf dengan jam sendiri bisa
  // bekerja di hari usaha tutup, dan sebaliknya. "Siapa saja" = gabungan.
  const openDays = useMemo(() => {
    const merchantDays = availability.map((row) => row.day_of_week);
    if (staff.length === 0) return new Set(merchantDays);
    const candidates = selectedStaffId ? staff.filter((m) => m.id === selectedStaffId) : staff;
    return new Set(candidates.flatMap((m) => (m.days.length > 0 ? m.days : merchantDays)));
  }, [availability, staff, selectedStaffId]);
  const strip = useMemo(() => buildDateStrip(openDays, todayISO), [openDays, todayISO]);

  const selectedService = services.find((service) => service.id === selectedServiceId) ?? null;

  // Pilihan terkini untuk listener popstate (effect-nya hanya jalan sekali).
  const selectionRef = useRef({ hasService: false, hasSlot: false });
  useEffect(() => {
    selectionRef.current = { hasService: Boolean(selectedServiceId), hasSlot: Boolean(selectedSlot) };
  }, [selectedServiceId, selectedSlot]);

  // Riwayat browser: maju langkah = pushState, tombol Kembali = popstate.
  // Ini sinkronisasi ke sistem eksternal (history), jadi memang layak di effect.
  useEffect(() => {
    // Saat dimuat selalu mulai di langkah 1, jadi parameter lama dibuang.
    if (new URLSearchParams(window.location.search).has("langkah")) {
      window.history.replaceState(null, "", urlForStep(1));
    }

    function onPopState() {
      const param = new URLSearchParams(window.location.search).get("langkah");
      const wanted: Step = param === "data" ? 3 : param === "jadwal" ? 2 : 1;
      const { hasService, hasSlot } = selectionRef.current;
      const max: Step = hasService && hasSlot ? 3 : hasService ? 2 : 1;
      const next = (wanted > max ? max : wanted) as Step;
      if (next !== wanted) {
        // Sejajarkan URL dengan langkah yang benar-benar ditampilkan.
        window.history.replaceState(null, "", urlForStep(next));
      }
      setStep(next);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Fokus ke judul langkah setiap ganti langkah, kecuali saat pertama dimuat.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [step]);

  function goForward(next: Step) {
    window.history.pushState(null, "", urlForStep(next));
    setStep(next);
  }

  // Slot diambil dari event handler (klik tanggal), bukan effect. `requestIdRef`
  // menjaga urutan: respons request lama tidak boleh menimpa yang terbaru.
  const requestIdRef = useRef(0);

  async function loadSlots(serviceId: string, dateISO: string, staffId: string | null) {
    const requestId = (requestIdRef.current += 1);
    setSlotState({ kind: "loading" });
    try {
      const params = new URLSearchParams({ username, serviceId, date: dateISO });
      if (staffId) params.set("staffId", staffId);
      const response = await fetch(`/api/slots?${params.toString()}`);
      if (!response.ok) throw new Error("Gagal memuat jadwal");
      const body = (await response.json()) as { slots: FreeSlot[] };
      if (requestIdRef.current !== requestId) return;
      setSlotState(
        body.slots.length === 0
          ? { kind: "empty", nextDate: nextOpenDate(strip, dateISO) }
          : { kind: "ready", slots: body.slots },
      );
    } catch {
      if (requestIdRef.current === requestId) setSlotState({ kind: "error" });
    }
  }

  function resetSchedule() {
    requestIdRef.current += 1;
    setSelectedDate(null);
    setSelectedSlot(null);
    setSlotState({ kind: "idle" });
  }

  function handleSelectService(serviceId: string) {
    setSelectedServiceId(serviceId);
    resetSchedule();
  }

  function handleSelectStaff(staffId: string | null) {
    setSelectedStaffId(staffId);
    resetSchedule();
  }

  function handleSelectDate(dateISO: string) {
    setSelectedDate(dateISO);
    setSelectedSlot(null);
    if (selectedServiceId) void loadSlots(selectedServiceId, dateISO, selectedStaffId);
  }

  async function handleCheckoutSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedServiceId || !selectedSlot || submitting) return;

    const result = checkoutSchema.safeParse({
      serviceId: selectedServiceId,
      staffId: selectedStaffId,
      startUtc: selectedSlot.startUtc,
      customer_name: customerName,
      customer_whatsapp: customerWhatsapp,
    });

    if (!result.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !nextErrors[key]) nextErrors[key] = issue.message;
      }
      setFormErrors(nextErrors);
      return;
    }

    setFormErrors({});
    setSubmitting(true);
    try {
      const checkout = await submitCheckout({
        username,
        serviceId: result.data.serviceId,
        staffId: result.data.staffId,
        startUtc: result.data.startUtc,
        customer_name: result.data.customer_name,
        customer_whatsapp: result.data.customer_whatsapp,
      });
      // Booking sudah permanen: arahkan ke /pesanan/[token], tempat QRIS atau
      // hasil akhir ditampilkan. Selalu ikuti bookingUrl: server yang
      // menentukan status (mis. ON_SITE bisa jadi FULL karena no-show). `submitting` sengaja tidak direset karena halaman segera
      // berpindah.
      router.push(checkout.bookingUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal membuat booking, silakan coba lagi.");
      setSubmitting(false);
    }
  }

  // Rincian bayar langkah 3, dihitung dari pengaturan yang terlihat anon.
  let payment: {
    dueNow: number;
    dueOnSite: number;
    approval: boolean;
    online: boolean;
    actionLabel: string;
  } | null = null;
  if (selectedService) {
    const mode = effectivePaymentMode(selectedService, paymentSettings);
    const { dueNow, dueOnSite } = computeAmounts(selectedService, mode);
    const approval = needsApproval(mode, paymentSettings);
    payment = {
      dueNow,
      dueOnSite,
      approval,
      online: !approval && mode !== "ON_SITE",
      actionLabel: approval
        ? "Kirim permintaan"
        : mode === "ON_SITE"
          ? "Konfirmasi booking"
          : `Bayar ${formatRupiah(dueNow)}`,
    };
  }

  const staffName = selectedStaffId ? staff.find((m) => m.id === selectedStaffId)?.name : null;

  return (
    <div className="flex flex-col gap-6">
      <BookingStepIndicator current={step} />
      <h2 id="langkah-judul" ref={headingRef} tabIndex={-1} className="text-lg font-medium outline-none">
        {STEP_TITLE[step]}
      </h2>

      {step === 1 ? (
        <>
          <div role="radiogroup" aria-labelledby="langkah-judul" className="flex flex-col gap-3">
            {services.map((service, index) => (
              <ServiceOptionCard
                key={service.id}
                service={service}
                media={mediaByService[service.id] ?? []}
                checked={service.id === selectedServiceId}
                onSelect={() => handleSelectService(service.id)}
                eager={index === 0}
                paymentLabel={paymentLabel(service, paymentSettings)}
              />
            ))}
          </div>
          <StickyActionBar
            summary={selectedService ? selectedService.name : "Pilih satu layanan"}
            actionLabel="Pilih jadwal"
            disabled={!selectedService}
            onAction={() => goForward(2)}
          />
        </>
      ) : null}

      {step === 2 && selectedService ? (
        <>
          <div
            className="bg-card border-border flex items-center justify-between gap-3 border p-3"
            style={{ borderRadius: "var(--radius)" }}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{selectedService.name}</p>
              <p className="text-muted-foreground text-xs">{formatRupiah(selectedService.price)}</p>
            </div>
            {services.length > 1 ? (
              <Button type="button" variant="outline" className="min-h-11" onClick={() => window.history.back()}>
                Ganti
              </Button>
            ) : null}
          </div>

          {staff.length > 0 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Dengan siapa?</legend>
              <div className="flex flex-wrap gap-2">
                {[{ id: null, name: "Siapa saja" }, ...staff].map((member) => (
                  <Button
                    key={member.id ?? "siapa-saja"}
                    type="button"
                    variant={member.id === selectedStaffId ? "default" : "outline"}
                    aria-pressed={member.id === selectedStaffId}
                    className="min-h-11"
                    onClick={() => handleSelectStaff(member.id)}
                  >
                    {member.name}
                  </Button>
                ))}
              </div>
            </fieldset>
          ) : null}

          {strip.every((d) => !d.open) ? (
            <div className="flex flex-col gap-1">
              <p className="font-medium">Tidak ada jadwal buka dalam 14 hari ke depan.</p>
              {staff.length > 0 ? (
                <p className="text-muted-foreground text-sm">Coba pilih staf lain.</p>
              ) : null}
            </div>
          ) : (
            <>
              <DateStrip days={strip} selected={selectedDate} onSelect={handleSelectDate} />
              <TimeSlotPicker
                state={slotState}
                selected={selectedSlot?.startUtc ?? null}
                onSelect={setSelectedSlot}
                onRetry={() => selectedDate && handleSelectDate(selectedDate)}
                onPickDate={handleSelectDate}
              />
            </>
          )}
          <StickyActionBar
            summary={
              selectedDate && selectedSlot
                ? `${dateLabel(selectedDate)}, ${selectedSlot.label}`
                : "Pilih tanggal dan jam"
            }
            actionLabel="Lanjut"
            disabled={!selectedSlot}
            onAction={() => goForward(3)}
          />
        </>
      ) : null}

      {step === 3 && selectedService && selectedDate && selectedSlot && payment ? (
        <form onSubmit={handleCheckoutSubmit} noValidate className="flex flex-col gap-6">
          <BookingSummary
            rows={[
              { label: "Layanan", value: selectedService.name },
              ...(staffName ? [{ label: "Dengan", value: staffName }] : []),
              { label: "Tanggal", value: dateLabel(selectedDate) },
              { label: "Jam", value: selectedSlot.label },
              ...(payment.dueNow !== Number(selectedService.price)
                ? [{ label: "Harga layanan", value: formatRupiah(Number(selectedService.price)) }]
                : []),
            ]}
            total={formatRupiah(payment.dueNow)}
            onSite={payment.dueOnSite > 0 ? formatRupiah(payment.dueOnSite) : undefined}
          />

          <Field data-invalid={Boolean(formErrors.customer_name)}>
            <FieldLabel htmlFor="customer_name">Nama lengkap</FieldLabel>
            <Input
              id="customer_name"
              name="customer_name"
              autoComplete="name"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              maxLength={80}
              required
              className="min-h-11"
              aria-invalid={Boolean(formErrors.customer_name)}
            />
            {formErrors.customer_name ? <FieldError>{formErrors.customer_name}</FieldError> : null}
          </Field>

          <Field data-invalid={Boolean(formErrors.customer_whatsapp)}>
            <FieldLabel htmlFor="customer_whatsapp">Nomor WhatsApp</FieldLabel>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm" aria-hidden>
                +62
              </span>
              <Input
                id="customer_whatsapp"
                name="customer_whatsapp"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                value={customerWhatsapp}
                onChange={(event) => setCustomerWhatsapp(event.target.value)}
                placeholder="812-3456-7890"
                required
                className="min-h-11"
                aria-invalid={Boolean(formErrors.customer_whatsapp)}
                aria-describedby="customer_whatsapp_hint"
              />
            </div>
            <FieldDescription id="customer_whatsapp_hint">
              Dipakai merchant untuk menghubungi Anda soal booking ini.
            </FieldDescription>
            {formErrors.customer_whatsapp ? (
              <FieldError>{formErrors.customer_whatsapp}</FieldError>
            ) : null}
          </Field>

          <div className="text-muted-foreground flex flex-col gap-2 text-sm text-pretty">
            {payment.online ? (
              <p>
                Pembayaran masuk langsung ke {merchantName} lewat QRIS. Jadwal ditahan 15 menit
                selama Anda membayar.
              </p>
            ) : null}
            {payment.approval ? (
              <p>
                Ini permintaan booking. {merchantName} akan menyetujui atau menolak dalam 24 jam.
                {payment.dueNow > 0
                  ? ` Setelah disetujui, Anda membayar ${formatRupiah(payment.dueNow)} lewat halaman booking Anda.`
                  : ""}
              </p>
            ) : null}
            {!payment.online && !payment.approval ? <p>Tidak perlu bayar sekarang.</p> : null}
            {payment.dueOnSite > 0 ? (
              <p>
                {payment.dueNow > 0
                  ? `Sisanya ${formatRupiah(payment.dueOnSite)} dibayar langsung ke ${merchantName} saat layanan.`
                  : `Bayar ${formatRupiah(payment.dueOnSite)} langsung ke ${merchantName} saat layanan.`}
              </p>
            ) : null}
          </div>
          {/* Titik pengumpulan data pribadi: kebijakan ditautkan di sini (UU PDP). */}
          <p className="text-muted-foreground text-center text-xs">
            Data Anda diproses sesuai{" "}
            <Link href={ROUTES.privacy} target="_blank" className="underline">
              Kebijakan Privasi
            </Link>{" "}
            Marky.
          </p>

          <StickyActionBar
            type="submit"
            summary={selectedService.name}
            actionLabel={payment.actionLabel}
            busy={submitting}
          />
        </form>
      ) : null}
    </div>
  );
}
