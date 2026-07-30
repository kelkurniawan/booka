"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatDuration, formatRupiah, formatTime } from "@/lib/format";
import { isoDayOfWeek, jakartaDateISO, type FreeSlot } from "@/lib/booking/slots";
import { checkoutSchema } from "@/lib/validations/booking";
import type { Availability, DayOfWeek, Service } from "@/types/database";
import { cn } from "@/lib/utils";

/** Seberapa jauh ke depan dicari tanggal yang buka. */
const DAYS_TO_SEARCH = 21;
/** Dibatasi supaya daftar tanggal tetap ringkas di layar mobile (max-w-md). */
const MAX_DATES_SHOWN = 8;

const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
  day: "numeric",
  month: "short",
  // Tanggal di sini adalah tanggal kalender murni ("YYYY-MM-DD"), bukan
  // instant -- diformat sebagai UTC eksplisit (lihat dateLabel di bawah)
  // supaya penampilannya tidak ikut bergeser oleh zona waktu browser
  // pengunjung.
  timeZone: "UTC",
});

function dateLabel(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  return DAY_LABEL_FORMATTER.format(new Date(Date.UTC(y, m - 1, d)));
}

/** Tanggal kalender Jakarta berikutnya yang punya jam kerja terdaftar. */
function nextAvailableDates(openDays: Set<DayOfWeek>): string[] {
  const dates: string[] = [];
  const nowMs = Date.now();
  for (let offset = 0; offset < DAYS_TO_SEARCH && dates.length < MAX_DATES_SHOWN; offset += 1) {
    // Menambah persis 24 jam selalu maju satu tanggal kalender di Jakarta
    // karena WIB tidak mengenal DST (lihat komentar di src/lib/booking/slots.ts).
    const candidateInstant = new Date(nowMs + offset * 24 * 60 * 60 * 1000);
    const dateISO = jakartaDateISO(candidateInstant);
    if (openDays.has(isoDayOfWeek(dateISO))) {
      dates.push(dateISO);
    }
  }
  return dates;
}

export type BookingPickerProps = {
  merchantId: string;
  username: string;
  services: Service[];
  availability: Pick<Availability, "day_of_week">[];
};

type CheckoutSubmitPayload = {
  merchantId: string;
  username: string;
  serviceId: string;
  startUtc: string;
  customer_name: string;
  customer_whatsapp: string;
};

/** Respons sukses `POST /api/bookings` -- lihat src/app/api/bookings/route.ts. */
type CheckoutResult = {
  bookingId: string;
  payment_url: string;
  expires_at: string;
};

type CheckoutErrorBody = { error?: string; issues?: unknown };

/**
 * `POST /api/bookings` sungguhan (Task 8).
 *
 * `merchantId` di payload SENGAJA tidak dikirim -- route resolve
 * `merchant_id` sendiri lewat `username` (lihat `createBookingRequestSchema`
 * di src/lib/validations/booking.ts), sama seperti `GET /api/slots`.
 * Mempercayai `merchantId` dari klien tidak menambah bahaya nyata (halaman
 * ini publik, id-nya bukan rahasia) tapi tetap salah secara prinsip --
 * AGENTS.md.
 *
 * Melempar `Error` berisi pesan Indonesia yang SUDAH dipetakan server (lihat
 * `mapBookingError`) supaya pemanggil tinggal menampilkannya lewat toast --
 * tidak ada teks error mentah yang perlu diterjemahkan lagi di sini.
 */
async function submitCheckout(payload: CheckoutSubmitPayload): Promise<CheckoutResult> {
  const response = await fetch("/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: payload.username,
      serviceId: payload.serviceId,
      startUtc: payload.startUtc,
      customer_name: payload.customer_name,
      customer_whatsapp: payload.customer_whatsapp,
    }),
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

export function BookingPicker({ merchantId, username, services, availability }: BookingPickerProps) {
  const openDays = useMemo(
    () => new Set(availability.map((row) => row.day_of_week)),
    [availability],
  );
  const availableDates = useMemo(() => nextAvailableDates(openDays), [openDays]);

  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    services.length === 1 ? services[0].id : null,
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<FreeSlot | null>(null);

  const [slots, setSlots] = useState<FreeSlot[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(null);

  const selectedService = services.find((service) => service.id === selectedServiceId) ?? null;

  // Slot diambil langsung dari event handler (klik layanan/tanggal), BUKAN
  // dari useEffect yang mengintip perubahan state. Ini interaksi pengunjung,
  // bukan sinkronisasi ke sistem eksternal -- lihat "Fetching data" di
  // node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md
  // dan panduan React "You Might Not Need An Effect". `requestIdRef` menjaga
  // urutan: kalau pengunjung ganti tanggal dengan cepat, respons dari request
  // lama yang datang belakangan tidak boleh menimpa hasil request terbaru.
  const requestIdRef = useRef(0);

  async function loadSlots(serviceId: string, dateISO: string) {
    const requestId = (requestIdRef.current += 1);
    setLoadingSlots(true);
    setSlotsError(null);

    try {
      const params = new URLSearchParams({ username, serviceId, date: dateISO });
      const response = await fetch(`/api/slots?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Gagal memuat jadwal");
      }
      const body = (await response.json()) as { slots: FreeSlot[] };
      if (requestIdRef.current === requestId) {
        setSlots(body.slots);
      }
    } catch {
      if (requestIdRef.current === requestId) {
        setSlotsError("Gagal memuat jadwal. Coba lagi.");
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setLoadingSlots(false);
      }
    }
  }

  function handleSelectService(serviceId: string) {
    setSelectedServiceId(serviceId);
    setSelectedDate(null);
    setSelectedSlot(null);
    setSlots(null);
    setSlotsError(null);
  }

  function handleSelectDate(dateISO: string) {
    setSelectedDate(dateISO);
    setSelectedSlot(null);
    if (selectedServiceId) {
      void loadSlots(selectedServiceId, dateISO);
    }
  }

  async function handleCheckoutSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedServiceId || !selectedSlot || submitting) return;

    const result = checkoutSchema.safeParse({
      serviceId: selectedServiceId,
      startUtc: selectedSlot.startUtc,
      customer_name: customerName,
      customer_whatsapp: customerWhatsapp,
    });

    if (!result.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      }
      setFormErrors(nextErrors);
      return;
    }

    setFormErrors({});
    setSubmitting(true);
    try {
      const checkout = await submitCheckout({
        merchantId,
        username,
        serviceId: result.data.serviceId,
        startUtc: result.data.startUtc,
        customer_name: result.data.customer_name,
        customer_whatsapp: result.data.customer_whatsapp,
      });
      setCheckoutResult(checkout);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal membuat booking, silakan coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {services.length > 1 ? (
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground font-mono text-[0.7rem] tracking-[0.18em] uppercase">
            Pilih layanan
          </span>
          <div className="flex flex-col gap-2">
            {services.map((service) => (
              <button
                key={service.id}
                type="button"
                aria-pressed={service.id === selectedServiceId}
                onClick={() => handleSelectService(service.id)}
                className={cn(
                  "flex items-baseline justify-between gap-3 border p-3 text-left text-sm transition-colors",
                  service.id === selectedServiceId
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:bg-muted",
                )}
              >
                <span className="font-medium text-balance">{service.name}</span>
                <span className="shrink-0 text-xs">{formatDuration(service.duration_minutes)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {selectedServiceId ? (
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground font-mono text-[0.7rem] tracking-[0.18em] uppercase">
            Pilih tanggal
          </span>
          {availableDates.length === 0 ? (
            <p className="text-muted-foreground text-sm text-pretty">
              Tidak ada jadwal buka dalam {DAYS_TO_SEARCH} hari ke depan.
            </p>
          ) : (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {availableDates.map((dateISO) => (
                <button
                  key={dateISO}
                  type="button"
                  aria-pressed={dateISO === selectedDate}
                  onClick={() => handleSelectDate(dateISO)}
                  className={cn(
                    "shrink-0 border px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors",
                    dateISO === selectedDate
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {dateLabel(dateISO)}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {selectedServiceId && selectedDate ? (
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground font-mono text-[0.7rem] tracking-[0.18em] uppercase">
            Pilih jam
          </span>

          {loadingSlots ? (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Memuat jadwal...
            </div>
          ) : slotsError ? (
            <p className="text-destructive text-sm">{slotsError}</p>
          ) : slots && slots.length === 0 ? (
            <p className="text-muted-foreground text-sm text-pretty">
              Tidak ada jam kosong di tanggal ini. Coba tanggal lain.
            </p>
          ) : slots ? (
            <div className="grid grid-cols-3 gap-2">
              {slots.map((slot) => (
                <button
                  key={slot.startUtc}
                  type="button"
                  aria-pressed={slot.startUtc === selectedSlot?.startUtc}
                  onClick={() => setSelectedSlot(slot)}
                  className={cn(
                    "border px-2 py-2 text-sm font-medium transition-colors",
                    slot.startUtc === selectedSlot?.startUtc
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {slot.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {selectedService && selectedSlot && !checkoutResult ? (
        <form
          onSubmit={handleCheckoutSubmit}
          noValidate
          className="border-border flex flex-col gap-4 border p-4"
        >
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground font-mono text-[0.7rem] tracking-[0.18em] uppercase">
              Ringkasan
            </span>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-balance">
                {selectedService.name} · {dateLabel(selectedDate ?? "")} · {selectedSlot.label}
              </span>
              <span className="shrink-0 font-medium">{formatRupiah(selectedService.price)}</span>
            </div>
          </div>

          <Field data-invalid={Boolean(formErrors.customer_name)}>
            <FieldLabel htmlFor="customer_name">Nama</FieldLabel>
            <Input
              id="customer_name"
              name="customer_name"
              autoComplete="name"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Nama lengkap"
              maxLength={80}
              required
              aria-invalid={Boolean(formErrors.customer_name)}
            />
            {formErrors.customer_name ? <FieldError>{formErrors.customer_name}</FieldError> : null}
          </Field>

          <Field data-invalid={Boolean(formErrors.customer_whatsapp)}>
            <FieldLabel htmlFor="customer_whatsapp">Nomor WhatsApp</FieldLabel>
            <Input
              id="customer_whatsapp"
              name="customer_whatsapp"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={customerWhatsapp}
              onChange={(event) => setCustomerWhatsapp(event.target.value)}
              placeholder="0812-3456-7890"
              required
              aria-invalid={Boolean(formErrors.customer_whatsapp)}
            />
            {formErrors.customer_whatsapp ? (
              <FieldError>{formErrors.customer_whatsapp}</FieldError>
            ) : null}
          </Field>

          <div className="flex flex-col gap-2">
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Memproses...
                </>
              ) : (
                "Konfirmasi booking"
              )}
            </Button>
          </div>
        </form>
      ) : null}

      {checkoutResult ? (
        <div className="border-border flex flex-col gap-3 border p-4">
          <span className="text-muted-foreground font-mono text-[0.7rem] tracking-[0.18em] uppercase">
            Menunggu pembayaran
          </span>
          <p className="text-sm text-pretty">
            Booking berhasil dibuat. Selesaikan pembayaran QRIS sebelum{" "}
            <span className="font-medium">{formatTime(checkoutResult.expires_at)} WIB</span> agar slot
            ini tidak hangus.
          </p>
          <code className="bg-muted block overflow-x-auto p-2 text-xs break-all">
            {checkoutResult.payment_url}
          </code>
          <p className="text-muted-foreground text-xs text-pretty">
            Pembayaran otomatis terdeteksi lewat halaman ini di Task 9 -- untuk sekarang scan QRIS di
            atas lalu tunggu konfirmasi dari merchant.
          </p>
        </div>
      ) : null}
    </div>
  );
}
