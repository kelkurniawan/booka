"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { BookingSummary } from "@/components/booking-page/booking-summary";
import { DateStrip } from "@/components/booking-page/date-strip";
import { GuestStepper } from "@/components/booking-page/guest-stepper";
import { PromoBanners } from "@/components/booking-page/promo-banners";
import { ReservationCard } from "@/components/booking-page/reservation-card";
import { ServiceOptionCard } from "@/components/booking-page/service-option-card";
import { BookingStepIndicator } from "@/components/booking-page/step-indicator";
import { StickyActionBar } from "@/components/booking-page/sticky-action-bar";
import {
  StaffPicker,
  type NearestState,
  type StaffOption,
} from "@/components/booking-page/staff-picker";
import {
  TablePicker,
  type TablePickerMode,
} from "@/components/booking-page/table-picker";
import {
  TimeSlotPicker,
  type PickerSlot,
  type TimeSlotState,
} from "@/components/booking-page/time-slot-picker";
import { VoucherPicker } from "@/components/booking-page/voucher-picker";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  computeAmounts,
  effectivePaymentMode,
  initialBookingStatus,
  paymentLabel,
  type PaymentSettings,
} from "@/lib/booking/payment-mode";
import {
  bookingErrorStep,
  holdSentence,
  isSeatService,
  MAX_CUSTOMER_NOTE,
  partyRangeLabel,
  type TablePickerData,
} from "@/lib/booking/reservation";
import { buildDateStrip, nextOpenDate } from "@/lib/booking/schedule";
import { jakartaDateISO, type NearestSlot } from "@/lib/booking/slots";
import {
  computeDiscount,
  voucherIneligibleReason,
  voucherSummary,
  type AppliedVoucher,
  type CheckVoucherResult,
} from "@/lib/booking/voucher";
import { formatRupiah } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import type { PageSection } from "@/lib/theme/sections";
import { checkoutSchema } from "@/lib/validations/booking";
import type {
  Availability,
  DayOfWeek,
  PublicBanner,
  PublicVoucher,
  Service,
  ServiceMedia,
  TableMode,
} from "@/types/database";

/** Pengaturan restoran yang terlihat anon; `areas` hanya terisi di mode TABLE. */
export type RestaurantInfo = {
  tableMode: TableMode;
  holdMinutes: number;
  areas: { id: string; name: string }[];
};

export type BookingFlowProps = {
  username: string;
  merchantName: string;
  services: Service[];
  mediaByService: Record<string, ServiceMedia[]>;
  availability: Pick<Availability, "day_of_week">[];
  /** Staf aktif (Studio) beserta hari kerjanya. `days` kosong = ikut jam usaha. */
  staff: (StaffOption & { days: DayOfWeek[] })[];
  /** Hanya petunjuk tampilan; server menentukan mode akhir saat booking dibuat. */
  paymentSettings: PaymentSettings;
  restaurant: RestaurantInfo;
  banners: PublicBanner[];
  vouchers: PublicVoucher[];
  /** Urutan bagian halaman yang tampil (theme.sections). */
  sections: PageSection[];
  /** Slot FAQ; null bila merchant belum mengisi. */
  faq: ReactNode;
};

/** 1 layanan, 2 jadwal, 3 meja (hanya reservasi mode TABLE), 4 data diri. */
type Step = 1 | 2 | 3 | 4;

const STEP_PARAM: Record<Step, string | null> = {
  1: null,
  2: "jadwal",
  3: "meja",
  4: "data",
};
const STEP_TITLE: Record<Step, string> = {
  1: "Pilih layanan",
  2: "Pilih jadwal",
  3: "Pilih meja",
  4: "Data diri",
};

/** URL halaman ini dengan parameter `langkah` untuk `step`; query lain dan hash tetap. */
function urlForStep(step: Step): string {
  const params = new URLSearchParams(window.location.search);
  const value = STEP_PARAM[step];
  if (value) params.set("langkah", value);
  else params.delete("langkah");
  const query = params.toString();
  return (
    window.location.pathname + (query ? `?${query}` : "") + window.location.hash
  );
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
  voucherCode: string | null;
  partySize: number | null;
  areaId: string | null;
  tableId: string | null;
  customerNote: string | null;
};

/** Galat dari server; `code` dipakai alur reservasi untuk memilih langkah yang dibuka lagi. */
class CheckoutError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
  ) {
    super(message);
  }
}

/** Respons sukses `POST /api/bookings` -- lihat src/app/api/bookings/route.ts. */
type CheckoutResult = {
  bookingId: string;
  payment_url: string;
  expires_at: string;
  bookingUrl: string;
};

type CheckoutErrorBody = { error?: string; code?: string; issues?: unknown };

/**
 * `POST /api/bookings`. `merchantId` sengaja tidak dikirim: route resolve
 * sendiri lewat `username`. Melempar `Error` berisi pesan Indonesia yang sudah
 * dipetakan server, tinggal ditampilkan lewat toast.
 */
async function submitCheckout(
  payload: CheckoutSubmitPayload,
): Promise<CheckoutResult> {
  const response = await fetch("/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body: unknown = await response.json().catch(() => null);

  if (
    !response.ok ||
    !body ||
    typeof body !== "object" ||
    !("bookingId" in body)
  ) {
    const message =
      body && typeof body === "object" && "error" in body
        ? ((body as CheckoutErrorBody).error ?? null)
        : null;
    const code =
      body && typeof body === "object" && "code" in body
        ? (body as CheckoutErrorBody).code
        : undefined;
    throw new CheckoutError(
      message ?? "Gagal membuat booking, silakan coba lagi.",
      code,
    );
  }

  return body as CheckoutResult;
}

/**
 * `POST /api/vouchers/check`. Melempar `Error` berisi pesan Indonesia dari
 * server, tinggal ditampilkan di bawah kolom kode.
 */
async function checkVoucherCode(
  username: string,
  serviceId: string,
  code: string,
): Promise<CheckVoucherResult> {
  const response = await fetch("/api/vouchers/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, serviceId, code }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (
    !response.ok ||
    !body ||
    typeof body !== "object" ||
    !("discount" in body)
  ) {
    const message =
      body && typeof body === "object" && "error" in body
        ? ((body as CheckoutErrorBody).error ?? null)
        : null;
    throw new Error(message ?? "Kode tidak bisa diperiksa, coba lagi.");
  }
  return body as CheckVoucherResult;
}

export function BookingFlow({
  username,
  merchantName,
  services,
  mediaByService,
  availability,
  staff,
  paymentSettings,
  restaurant,
  banners,
  vouchers,
  sections,
  faq,
}: BookingFlowProps) {
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  // null = "siapa saja" (atau merchant tanpa staf).
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    services.length === 1 ? services[0].id : null,
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<PickerSlot | null>(null);
  const [slotState, setSlotState] = useState<TimeSlotState>({ kind: "idle" });

  // Reservasi restoran: jumlah tamu, area, meja, dan catatan.
  const [partySize, setPartySize] = useState<number | null>(null);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [tableMode, setTableMode] = useState<TablePickerMode>("auto");
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [tablesData, setTablesData] = useState<TablePickerData | null>(null);
  const [tablesState, setTablesState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [customerNote, setCustomerNote] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [appliedVoucher, setAppliedVoucher] = useState<AppliedVoucher | null>(
    null,
  );
  // Pesan netral saat voucher dilepas atau tidak jadi dipasang karena layanan tidak cocok.
  const [voucherNotice, setVoucherNotice] = useState<string | null>(null);
  const serviceListRef = useRef<HTMLDivElement>(null);

  const [todayISO] = useState(() => jakartaDateISO(new Date()));

  // Jam kosong terdekat per staf, sekali per layanan saat langkah 2 (hasil lama dipakai ulang).
  const [nearestByService, setNearestByService] = useState<
    Record<string, Record<string, NearestSlot | null> | "error">
  >({});
  const selectedService =
    services.find((service) => service.id === selectedServiceId) ?? null;
  // Reservasi tidak memakai staf (Keputusan 10 F8); meja hanya di mode TABLE.
  const seat = selectedService
    ? isSeatService(selectedService, restaurant.tableMode)
    : false;
  const hasTableStep = seat && restaurant.tableMode === "TABLE";
  const needNearest =
    step === 2 && staff.length > 0 && !seat && selectedServiceId !== null;
  const nearestLoaded =
    selectedServiceId !== null && selectedServiceId in nearestByService;
  useEffect(() => {
    if (!needNearest || nearestLoaded || !selectedServiceId) return;
    const serviceId = selectedServiceId;
    const controller = new AbortController();
    const params = new URLSearchParams({ username, serviceId });
    fetch(`/api/slots/nearest?${params}`, { signal: controller.signal })
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(String(res.status))),
      )
      .then((body: { nearest: Record<string, NearestSlot | null> }) =>
        setNearestByService((prev) => ({ ...prev, [serviceId]: body.nearest })),
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("[booking-flow] gagal memuat jam terdekat", error);
        setNearestByService((prev) => ({ ...prev, [serviceId]: "error" }));
      });
    return () => controller.abort();
  }, [needNearest, nearestLoaded, selectedServiceId, username]);
  const nearest: NearestState =
    (selectedServiceId && nearestByService[selectedServiceId]) || "loading";

  // Hari buka mengikuti staf yang dipilih: staf dengan jam sendiri bisa
  // bekerja di hari usaha tutup, dan sebaliknya. "Siapa saja" = gabungan.
  // Tanpa useMemo: React Compiler menolak memo manual yang bergantung pada `seat`.
  const merchantDays = availability.map((row) => row.day_of_week);
  const dayCandidates = seat
    ? []
    : selectedStaffId
      ? staff.filter((m) => m.id === selectedStaffId)
      : staff;
  const openDays = new Set(
    dayCandidates.length === 0
      ? merchantDays
      : dayCandidates.flatMap((m) => (m.days.length > 0 ? m.days : merchantDays)),
  );
  const strip = buildDateStrip(openDays, todayISO);
  const serviceNames = useMemo(
    () =>
      Object.fromEntries(services.map((service) => [service.id, service.name])),
    [services],
  );
  const voucherCodeById = useMemo(
    () =>
      Object.fromEntries(vouchers.map((voucher) => [voucher.id, voucher.code])),
    [vouchers],
  );

  // Pilihan terkini untuk listener popstate (effect-nya hanya jalan sekali).
  const selectionRef = useRef({ hasService: false, hasSlot: false });
  useEffect(() => {
    selectionRef.current = {
      hasService: Boolean(selectedServiceId),
      hasSlot: Boolean(selectedSlot),
    };
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
      const wanted: Step =
        param === "data" ? 4 : param === "meja" ? 3 : param === "jadwal" ? 2 : 1;
      const { hasService, hasSlot } = selectionRef.current;
      const max: Step = hasService && hasSlot ? 4 : hasService ? 2 : 1;
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

  async function loadSlots(
    serviceId: string,
    dateISO: string,
    staffId: string | null,
    party: number | null,
    area: string | null,
  ) {
    const requestId = (requestIdRef.current += 1);
    setSlotState({ kind: "loading" });
    try {
      const params = new URLSearchParams({
        username,
        serviceId,
        date: dateISO,
      });
      if (staffId) params.set("staffId", staffId);
      if (party !== null) params.set("party", String(party));
      if (area) params.set("areaId", area);
      const response = await fetch(`/api/slots?${params.toString()}`);
      if (!response.ok) throw new Error("Gagal memuat jadwal");
      const body = (await response.json()) as { slots: PickerSlot[] };
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
    const next = services.find((service) => service.id === serviceId);
    setPartySize(next?.party_max != null ? (next.party_min ?? 1) : null);
    setAreaId(null);
    setSelectedTableId(null);
    setTableMode("auto");
    if (appliedVoucher && next) {
      const reason = voucherIneligibleReason(
        appliedVoucher,
        next,
        serviceNames,
      );
      if (reason) {
        setAppliedVoucher(null);
        setVoucherNotice(`Voucher ${appliedVoucher.code} dilepas. ${reason}.`);
      }
    }
  }

  function scrollToServices() {
    serviceListRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  // Dari banner: layanan dipilih lalu daftar digulir ke tampilan.
  function handleBannerSelectService(serviceId: string) {
    handleSelectService(serviceId);
    scrollToServices();
  }

  function handleApplyVoucher(voucher: AppliedVoucher) {
    if (selectedService) {
      const reason = voucherIneligibleReason(
        voucher,
        selectedService,
        serviceNames,
      );
      if (reason) {
        setVoucherNotice(`Voucher ${voucher.code} belum dipasang. ${reason}.`);
        return;
      }
    }
    setVoucherNotice(null);
    setAppliedVoucher(voucher);
  }

  function handleBannerApplyVoucher(voucherId: string) {
    const voucher = vouchers.find((item) => item.id === voucherId);
    if (!voucher) return;
    handleApplyVoucher({ ...voucher, source: "PUBLIC" });
    scrollToServices();
  }

  function handleSelectStaff(staffId: string | null) {
    setSelectedStaffId(staffId);
    resetSchedule();
  }

  function handleSelectDate(dateISO: string) {
    setSelectedDate(dateISO);
    setSelectedSlot(null);
    if (selectedServiceId)
      void loadSlots(
        selectedServiceId,
        dateISO,
        seat ? null : selectedStaffId,
        partySize,
        areaId,
      );
  }

  // Jumlah tamu atau area berubah: jam terpilih tidak lagi berlaku, muat ulang.
  function handleChangeBooking(party: number | null, area: string | null) {
    setPartySize(party);
    setAreaId(area);
    setSelectedSlot(null);
    setSelectedTableId(null);
    if (selectedServiceId && selectedDate)
      void loadSlots(selectedServiceId, selectedDate, null, party, area);
  }

  // Status meja untuk jam dan jumlah tamu terpilih. `tablesRequestRef` menjaga urutan.
  const tablesRequestRef = useRef(0);
  async function loadTables(startUtc: string, party: number) {
    if (!selectedServiceId) return;
    const requestId = (tablesRequestRef.current += 1);
    setTablesState("loading");
    try {
      const params = new URLSearchParams({
        username,
        serviceId: selectedServiceId,
        start: startUtc,
        party: String(party),
      });
      const response = await fetch(`/api/tables?${params.toString()}`);
      if (!response.ok) throw new Error("Gagal memuat meja");
      const body = (await response.json()) as TablePickerData;
      if (tablesRequestRef.current !== requestId) return;
      setTablesData(body);
      setTablesState("ready");
    } catch {
      if (tablesRequestRef.current === requestId) setTablesState("error");
    }
  }

  function handleScheduleNext() {
    if (!hasTableStep || !selectedSlot) {
      goForward(4);
      return;
    }
    setSelectedTableId(null);
    setTableMode("auto");
    void loadTables(selectedSlot.startUtc, partySize ?? 1);
    goForward(3);
  }

  async function handleCheckoutSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedServiceId || !selectedSlot || submitting) return;

    const result = checkoutSchema.safeParse({
      serviceId: selectedServiceId,
      staffId: seat ? null : selectedStaffId,
      startUtc: selectedSlot.startUtc,
      customer_name: customerName,
      customer_whatsapp: customerWhatsapp,
      partySize,
      areaId: seat ? areaId : null,
      tableId: seat && tableMode === "pick" ? selectedTableId : null,
      customerNote: customerNote || null,
    });

    if (!result.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !nextErrors[key])
          nextErrors[key] = issue.message;
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
        staffId: seat ? null : result.data.staffId,
        startUtc: result.data.startUtc,
        customer_name: result.data.customer_name,
        customer_whatsapp: result.data.customer_whatsapp,
        voucherCode: appliedVoucher?.code ?? null,
        partySize: result.data.partySize,
        areaId: result.data.areaId,
        tableId: result.data.tableId,
        customerNote: result.data.customerNote,
      });
      // Booking sudah permanen: arahkan ke /pesanan/[token], tempat QRIS atau
      // hasil akhir ditampilkan. Selalu ikuti bookingUrl: server yang
      // menentukan status (mis. ON_SITE bisa jadi FULL karena no-show). `submitting` sengaja tidak direset karena halaman segera
      // berpindah.
      router.push(checkout.bookingUrl);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Gagal membuat booking, silakan coba lagi.",
      );
      setSubmitting(false);
      // Reservasi: kapasitas atau meja berubah selagi mengisi, buka langkah yang relevan.
      const back = seat
        ? bookingErrorStep(error instanceof CheckoutError ? error.code : undefined)
        : null;
      if (back === "meja" && hasTableStep) {
        setSelectedTableId(null);
        void loadTables(selectedSlot.startUtc, partySize ?? 1);
        goForward(3);
      } else if (back === "jadwal" && selectedDate) {
        setSelectedSlot(null);
        void loadSlots(selectedServiceId, selectedDate, null, partySize, areaId);
        goForward(2);
      }
    }
  }

  // Rincian bayar langkah 3, dihitung dari pengaturan yang terlihat anon.
  let payment: {
    discount: number;
    dueNow: number;
    dueOnSite: number;
    approval: boolean;
    online: boolean;
    actionLabel: string;
  } | null = null;
  if (selectedService) {
    const mode = effectivePaymentMode(selectedService, paymentSettings);
    const discount = appliedVoucher
      ? computeDiscount(appliedVoucher, Number(selectedService.price))
      : 0;
    const { dueNow, dueOnSite } = computeAmounts(
      selectedService,
      mode,
      discount,
    );
    const status = initialBookingStatus(mode, dueNow, paymentSettings);
    payment = {
      discount,
      dueNow,
      dueOnSite,
      approval: status === "REQUESTED",
      online: status === "PENDING",
      actionLabel:
        status === "REQUESTED"
          ? "Kirim permintaan"
          : status === "CONFIRMED"
            ? "Konfirmasi booking"
            : `Bayar ${formatRupiah(dueNow)}`,
    };
  }

  // Meja pilihan sendiri yang masih bebas; status dimuat ulang tiap masuk langkah Meja.
  const pickedTable =
    tablesData?.tables.find(
      (t) => t.id === selectedTableId && t.status === "FREE",
    ) ?? null;

  const staffName = !seat && selectedStaffId
    ? staff.find((m) => m.id === selectedStaffId)?.name
    : null;

  // Di permukaan solid: teks tidak boleh langsung di atas lapisan gerak.
  const langkahHead = (
    <div
      className="bg-card border-border flex flex-col gap-3 border p-3"
      style={{ borderRadius: "var(--radius)" }}
    >
      {seat && step !== 1 ? (
        <BookingStepIndicator
          current={
            hasTableStep ? step - 1 : step === 4 ? 2 : 1
          }
          labels={
            hasTableStep
              ? ["Jadwal", "Meja", "Data diri"]
              : ["Jadwal", "Data diri"]
          }
        />
      ) : (
        <BookingStepIndicator
          current={step === 4 ? 3 : step}
        />
      )}
      <h2
        id="langkah-judul"
        ref={headingRef}
        tabIndex={-1}
        className="text-lg font-medium outline-none"
      >
        {step === 2 && selectedService?.party_max != null
          ? "Pilih jumlah tamu, tanggal, dan jam"
          : STEP_TITLE[step]}
      </h2>
    </div>
  );

  const promoSection = (
    <PromoBanners
      banners={banners}
      voucherCodeById={voucherCodeById}
      activeServiceIds={services.map((service) => service.id)}
      onApplyVoucher={handleBannerApplyVoucher}
      onSelectService={handleBannerSelectService}
    />
  );

  // Layanan reservasi punya kartu sendiri (R1) di atas daftar layanan lain.
  const seatServices = services.filter((service) =>
    isSeatService(service, restaurant.tableMode),
  );
  const otherServices = services.filter(
    (service) => !isSeatService(service, restaurant.tableMode),
  );

  const servicesSection = (
    <>
      {langkahHead}
      {appliedVoucher ? (
        <div
          className="bg-card border-border flex items-center justify-between gap-3 border p-3"
          style={{ borderRadius: "var(--radius)" }}
        >
          <div className="min-w-0">
            <p className="text-sm font-medium">Voucher {appliedVoucher.code}</p>
            <p className="text-muted-foreground text-xs">
              {voucherSummary(appliedVoucher)}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setAppliedVoucher(null)}
          >
            Lepas
          </Button>
        </div>
      ) : null}
      {voucherNotice ? (
        <p role="status" className="text-muted-foreground text-sm">
          {voucherNotice}
        </p>
      ) : null}
      {seatServices.map((service) => (
        <ReservationCard
          key={service.id}
          title={service.name}
          partyLabel={partyRangeLabel(service)}
          holdText={holdSentence(restaurant.holdMinutes)}
          paymentLabel={paymentLabel(service, paymentSettings)}
          onStart={() => {
            handleSelectService(service.id);
            goForward(2);
          }}
        />
      ))}
      <div
        ref={serviceListRef}
        role="radiogroup"
        aria-labelledby="langkah-judul"
        className="flex scroll-mt-4 flex-col gap-3"
      >
        {otherServices.map((service, index) => (
          <ServiceOptionCard
            key={service.id}
            service={service}
            media={mediaByService[service.id] ?? []}
            checked={service.id === selectedServiceId}
            onSelect={() => handleSelectService(service.id)}
            eager={index === 0}
            paymentLabel={paymentLabel(service, paymentSettings)}
            promoPrice={
              appliedVoucher &&
              !voucherIneligibleReason(appliedVoucher, service, serviceNames)
                ? Number(service.price) -
                  computeDiscount(appliedVoucher, Number(service.price))
                : undefined
            }
          />
        ))}
      </div>
    </>
  );

  const bagian: Record<PageSection, ReactNode> = {
    PROMO: promoSection,
    SERVICES: servicesSection,
    FAQ: faq,
  };
  const faqTampil = sections.includes("FAQ");

  return (
    <div className="flex flex-col gap-6">
      {step !== 1 ? langkahHead : null}

      {step === 1 ? (
        <>
          {sections.map((key) => (
            <Fragment key={key}>{bagian[key]}</Fragment>
          ))}
          <StickyActionBar
            summary={
              selectedService ? selectedService.name : "Pilih satu layanan"
            }
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
              <p className="truncate text-sm font-medium">
                {selectedService.name}
              </p>
              <p className="text-muted-foreground text-xs">
                {formatRupiah(selectedService.price)}
              </p>
            </div>
            {services.length > 1 ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => window.history.back()}
              >
                Ganti
              </Button>
            ) : null}
          </div>

          {selectedService.party_max != null && partySize !== null ? (
            <GuestStepper
              value={partySize}
              min={selectedService.party_min ?? 1}
              max={selectedService.party_max}
              onChange={(n) => handleChangeBooking(n, areaId)}
              hint={
                partySize === selectedService.party_max &&
                services.length > 1 ? (
                  <Button
                    type="button"
                    variant="link"
                    className="min-h-11 h-auto justify-start px-0"
                    onClick={() => window.history.back()}
                  >
                    {`Lebih dari ${selectedService.party_max}? Lihat layanan lain.`}
                  </Button>
                ) : null
              }
            />
          ) : null}

          {/* Permukaan solid: latar bergerak F6 tidak boleh berada langsung di bawah teks. */}
          <div
            className="bg-card border-border flex flex-col gap-6 border p-3"
            style={{ borderRadius: "var(--radius)" }}
          >
            {hasTableStep && restaurant.areas.length >= 2 ? (
              <div className="flex flex-col gap-2">
                <p id="area-label" className="text-sm font-medium">
                  Area{" "}
                  <span className="text-muted-foreground font-normal">
                    (opsional)
                  </span>
                </p>
                <div
                  role="radiogroup"
                  aria-labelledby="area-label"
                  className="flex flex-wrap gap-2"
                >
                  {[{ id: null, name: "Bebas" }, ...restaurant.areas].map(
                    (area) => (
                      <Button
                        key={area.id ?? "bebas"}
                        type="button"
                        role="radio"
                        aria-checked={areaId === area.id}
                        variant={areaId === area.id ? "default" : "outline"}
                        className="min-h-11"
                        onClick={() => handleChangeBooking(partySize, area.id)}
                      >
                        {area.name}
                      </Button>
                    ),
                  )}
                </div>
              </div>
            ) : null}

            {staff.length > 0 && !seat ? (
              <StaffPicker
                staff={staff}
                selectedId={selectedStaffId}
                onSelect={handleSelectStaff}
                nearest={nearest}
                todayISO={todayISO}
              />
            ) : null}

            {strip.every((d) => !d.open) ? (
              <div className="flex flex-col gap-1">
                <p className="font-medium">
                  Tidak ada jadwal buka dalam 14 hari ke depan.
                </p>
                {staff.length > 0 ? (
                  <p className="text-muted-foreground text-sm">
                    Coba pilih staf lain.
                  </p>
                ) : null}
              </div>
            ) : (
              <>
                <DateStrip
                  days={strip}
                  selected={selectedDate}
                  onSelect={handleSelectDate}
                />
                <TimeSlotPicker
                  state={slotState}
                  selected={selectedSlot?.startUtc ?? null}
                  onSelect={setSelectedSlot}
                  onRetry={() => selectedDate && handleSelectDate(selectedDate)}
                  onPickDate={handleSelectDate}
                />
              </>
            )}
          </div>
          <StickyActionBar
            summary={
              selectedDate && selectedSlot
                ? `${dateLabel(selectedDate)}, ${selectedSlot.label}`
                : "Pilih tanggal dan jam"
            }
            actionLabel="Lanjut"
            disabled={!selectedSlot}
            onAction={handleScheduleNext}
          />
        </>
      ) : null}

      {step === 3 && hasTableStep && selectedService && selectedSlot ? (
        <>
          <div
            className="bg-card border-border flex flex-col gap-1 border p-3"
            style={{ borderRadius: "var(--radius)" }}
          >
            <p className="text-sm font-medium">
              {partySize} orang
              {selectedDate && selectedSlot
                ? `, ${dateLabel(selectedDate)}, ${selectedSlot.label}`
                : ""}
            </p>
          </div>
          <TablePicker
            data={tablesData}
            state={tablesState}
            mode={tableMode}
            selectedTableId={selectedTableId}
            guests={partySize ?? 1}
            onModeChange={(m) => {
              setTableMode(m);
              if (m === "auto") setSelectedTableId(null);
            }}
            onSelect={setSelectedTableId}
            onRetry={() => void loadTables(selectedSlot.startUtc, partySize ?? 1)}
          />
          <StickyActionBar
            summary={
              tableMode === "auto"
                ? "Dipilihkan restoran"
                : pickedTable
                  ? `Meja ${pickedTable.name}`
                  : "Pilih satu meja"
            }
            actionLabel="Lanjut"
            disabled={
              tablesState === "loading" ||
              (tableMode === "pick" && !pickedTable)
            }
            onAction={() => goForward(4)}
          />
        </>
      ) : null}

      {step === 4 &&
      selectedService &&
      selectedDate &&
      selectedSlot &&
      payment ? (
        <form
          onSubmit={handleCheckoutSubmit}
          noValidate
          className="bg-card border-border flex flex-col gap-6 border p-3"
          style={{ borderRadius: "var(--radius)" }}
        >
          <VoucherPicker
            vouchers={vouchers}
            service={selectedService}
            serviceNames={serviceNames}
            merchantName={merchantName}
            applied={appliedVoucher}
            onApply={handleApplyVoucher}
            onRemove={() => setAppliedVoucher(null)}
            checkCode={(code) =>
              checkVoucherCode(username, selectedService.id, code)
            }
          />
          {partySize !== null ? (
            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="font-medium">
                {partySize} orang
                {seat && tableMode === "pick" && pickedTable
                  ? `, Meja ${pickedTable.name}`
                  : ""}
              </p>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => goForward(2)}
              >
                Ubah
              </Button>
            </div>
          ) : null}
          <BookingSummary
            rows={[
              { label: "Layanan", value: selectedService.name },
              ...(staffName ? [{ label: "Dengan", value: staffName }] : []),
              { label: "Tanggal", value: dateLabel(selectedDate) },
              { label: "Jam", value: selectedSlot.label },
              ...(payment.discount > 0 ||
              payment.dueNow !== Number(selectedService.price)
                ? [
                    {
                      label: "Harga layanan",
                      value: formatRupiah(Number(selectedService.price)),
                    },
                  ]
                : []),
              ...(payment.discount > 0 && appliedVoucher
                ? [
                    {
                      label: `Voucher ${appliedVoucher.code}`,
                      value: `\u2212${formatRupiah(payment.discount)}`,
                    },
                  ]
                : []),
            ]}
            total={formatRupiah(payment.dueNow)}
            onSite={
              payment.dueOnSite > 0
                ? formatRupiah(payment.dueOnSite)
                : undefined
            }
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
            {formErrors.customer_name ? (
              <FieldError>{formErrors.customer_name}</FieldError>
            ) : null}
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

          {selectedService.party_max != null ? (
            <Field>
              <FieldLabel htmlFor="customer_note">Catatan (opsional)</FieldLabel>
              <Textarea
                id="customer_note"
                name="customer_note"
                value={customerNote}
                onChange={(event) => setCustomerNote(event.target.value)}
                maxLength={MAX_CUSTOMER_NOTE}
                rows={3}
              />
            </Field>
          ) : null}

          <div className="text-muted-foreground flex flex-col gap-2 text-sm text-pretty">
            {payment.online ? (
              <p>
                Pembayaran masuk langsung ke {merchantName} lewat QRIS. Jadwal
                ditahan 15 menit selama Anda membayar.
              </p>
            ) : null}
            {payment.approval ? (
              <p>
                Ini permintaan booking. {merchantName} akan menyetujui atau
                menolak dalam 24 jam.
                {payment.dueNow > 0
                  ? ` Setelah disetujui, Anda membayar ${formatRupiah(payment.dueNow)} lewat halaman booking Anda.`
                  : ""}
              </p>
            ) : null}
            {!payment.online && !payment.approval ? (
              <p>Tidak perlu bayar sekarang.</p>
            ) : null}
            {seat && payment.dueNow === 0 && holdSentence(restaurant.holdMinutes) ? (
              <p>{holdSentence(restaurant.holdMinutes)}</p>
            ) : null}
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
            actionLabel={
              seat && !payment.online ? "Kirim reservasi" : payment.actionLabel
            }
            busy={submitting}
          />
        </form>
      ) : null}

      {step !== 1 && faqTampil ? faq : null}
    </div>
  );
}
