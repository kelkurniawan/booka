"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { courtPrice, durationOptions, formatDuration, type CourtPriceRule } from "@/lib/booking/court";
import { isSeatService, partyRangeLabel } from "@/lib/booking/reservation";
import { formatRupiah, formatTime } from "@/lib/format";
import { jakartaWallClockToUtc } from "@/lib/booking/slots";
import { ROUTES } from "@/lib/routes";
import type { TableMode } from "@/types/database";

import { createManualBooking } from "../actions";
import { type ManualBookingInput, type ManualBookingResult, manualBookingErrorMessage } from "../manual-booking";
import { SlotField } from "../slot-field";

type ServiceOption = {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
  party_min?: number | null;
  party_max?: number | null;
  seat_duration_minutes?: number | null;
  /** Terisi hanya untuk layanan sewa lapangan. */
  court_unit_minutes?: number | null;
  court_max_minutes?: number | null;
};

export type CourtFormInfo = {
  courts: { id: string; name: string }[];
  linksByService: Record<string, string[]>;
  rulesByService: Record<string, CourtPriceRule[]>;
};

const SELECT_CLASS =
  "border-input bg-background focus-visible:ring-ring/50 min-h-11 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-3";

export function ManualBookingForm({
  username,
  todayISO,
  services,
  staff,
  tableMode = "NONE",
  tables = [],
  courtInfo = { courts: [], linksByService: {}, rulesByService: {} },
  prefill,
  action = createManualBooking,
}: {
  username: string;
  /** Hari ini (WIB), dihitung di server. */
  todayISO: string;
  services: ServiceOption[];
  staff: { id: string; name: string }[];
  tableMode?: TableMode;
  /** Semua meja merchant, termasuk yang tidak bisa dipesan online. */
  tables?: { id: string; name: string; max_seats: number }[];
  courtInfo?: CourtFormInfo;
  /** Dari ketukan sel kosong jadwal lapangan. */
  prefill?: { serviceId: string | null; courtId: string | null; dateISO: string | null; timeHHMM: string | null };
  /** Bisa diganti di Storybook. */
  action?: (input: ManualBookingInput) => Promise<ManualBookingResult>;
}) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState(prefill?.serviceId ?? services[0]?.id ?? "");
  const [party, setParty] = useState("");
  const service = services.find((s) => s.id === serviceId);
  const needsParty = service?.party_max != null;
  const partyNumber = needsParty && party ? Number(party) : null;
  // Layanan reservasi tidak memakai staf (Keputusan 10 F8).
  const seat = !!service && isSeatService({ seat_duration_minutes: service.seat_duration_minutes ?? null }, tableMode);
  const showTables = seat && needsParty && tableMode === "TABLE";
  const unit = service?.court_unit_minutes === 30 || service?.court_unit_minutes === 60 ? service.court_unit_minutes : null;
  const isCourt = unit !== null;
  const [courtId, setCourtId] = useState(prefill?.courtId ?? "");
  const [duration, setDuration] = useState<number | null>(null);
  const durations = isCourt
    ? durationOptions({ minMinutes: service!.duration_minutes, maxMinutes: service!.court_max_minutes ?? service!.duration_minutes, unitMinutes: unit })
    : [];
  // Lama main terpilih harus ada di opsi layanan aktif; jatuh ke minimum.
  const effectiveDuration = isCourt ? (duration !== null && durations.includes(duration) ? duration : (durations[0] ?? null)) : null;
  const serviceCourts = courtInfo.courts.filter((c) => (courtInfo.linksByService[serviceId] ?? []).includes(c.id));
  const [staffId, setStaffId] = useState("");
  const [dateISO, setDateISO] = useState(prefill?.dateISO ?? todayISO);
  const [startISO, setStartISO] = useState<string | null>(
    prefill?.dateISO && prefill.timeHHMM ? jakartaWallClockToUtc(prefill.dateISO, prefill.timeHHMM).toISOString() : null,
  );
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [tableId, setTableId] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  // Naik saat slot bentrok: me-remount SlotField supaya daftar jam diambil ulang.
  const [slotsRound, setSlotsRound] = useState(0);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (needsParty && !partyNumber) {
      setMessage("Isi jumlah tamu dulu.");
      return;
    }
    if (!startISO) {
      setMessage("Pilih jam dulu.");
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await action({
        serviceId,
        staffId: seat || isCourt ? null : staffId || null,
        startISO,
        customerName: name,
        customerWhatsapp: whatsapp,
        partySize: partyNumber,
        tableId: showTables && tableId ? tableId : null,
        customerNote: needsParty && note.trim() ? note.trim() : null,
        courtId: isCourt && courtId ? courtId : null,
        durationMinutes: effectiveDuration,
      });
      if (result.ok) router.push(`${ROUTES.bookings}?tab=mendatang&b=${result.id}`);
      else {
        setMessage(result.message);
        if (
          result.message === manualBookingErrorMessage("23P01") ||
          result.message === manualBookingErrorMessage("BK060") ||
          result.message === manualBookingErrorMessage("BK061") ||
          result.message === manualBookingErrorMessage("BK070") ||
          result.message === manualBookingErrorMessage("BK072")
        ) {
          setStartISO(null);
          setSlotsRound((n) => n + 1);
        }
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="mb-service">Layanan</Label>
        <select id="mb-service" className={SELECT_CLASS} value={serviceId} onChange={(e) => {
            setServiceId(e.target.value);
            setCourtId("");
            setDuration(null);
            setStartISO(null);
            setTableId("");
          }}>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.duration_minutes} menit)
            </option>
          ))}
        </select>
      </div>
      {needsParty ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="mb-party">Jumlah tamu</Label>
          <Input
            id="mb-party"
            type="number"
            inputMode="numeric"
            className="min-h-11"
            min={service?.party_min ?? 1}
            max={service?.party_max ?? 200}
            value={party}
            onChange={(e) => {
              setParty(e.target.value);
              setStartISO(null);
            }}
            required
          />
          {service ? <p className="text-muted-foreground text-sm">{partyRangeLabel({ party_min: service.party_min ?? null, party_max: service.party_max ?? null })}</p> : null}
        </div>
      ) : null}
      {staff.length > 0 && !seat && !isCourt ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="mb-staff">Staf</Label>
          <select id="mb-staff" className={SELECT_CLASS} value={staffId} onChange={(e) => {
              setStaffId(e.target.value);
              setStartISO(null);
            }}>
            <option value="">Siapa saja</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {isCourt ? (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="mb-court">Lapangan</Label>
            <select id="mb-court" className={SELECT_CLASS} value={courtId} onChange={(e) => { setCourtId(e.target.value); setStartISO(null); }}>
              <option value="">Mana saja</option>
              {serviceCourts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="mb-duration">Lama main</Label>
            <select id="mb-duration" className={SELECT_CLASS} value={effectiveDuration ?? ""} onChange={(e) => { setDuration(Number(e.target.value)); setStartISO(null); }}>
              {durations.map((m) => (
                <option key={m} value={m}>
                  {formatDuration(m)}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="mb-date">Tanggal</Label>
        <Input
          id="mb-date"
          type="date"
          className="min-h-11"
          min={todayISO}
          value={dateISO}
          onChange={(e) => {
            if (!e.target.value) return;
            setDateISO(e.target.value);
            setStartISO(null);
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label id="mb-jam-label">Jam</Label>
        <SlotField
          key={slotsRound}
          username={username}
          serviceId={serviceId || null}
          staffId={seat || isCourt ? null : staffId || null}
          partySize={partyNumber}
          durationMinutes={effectiveDuration}
          courtId={isCourt && courtId ? courtId : null}
          dateISO={dateISO}
          value={startISO}
          onChange={setStartISO}
          labelledBy="mb-jam-label"
        />
      </div>
      {isCourt && startISO && effectiveDuration && service ? (
        <p role="status" className="rounded-md border px-3 py-2 text-sm" data-tour="manual-court-price">
          {(() => {
            const { total, segments } = courtPrice({
              basePerHour: service.price,
              rules: courtInfo.rulesByService[serviceId] ?? [],
              dateISO,
              startHHMM: formatTime(startISO),
              durationMinutes: effectiveDuration,
              unitMinutes: unit,
            });
            return `Harga ${formatRupiah(total)}${segments.some((x) => x.peak) ? ", termasuk jam ramai" : ""}`;
          })()}
        </p>
      ) : null}
      {showTables ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="mb-table">Meja</Label>
          <select id="mb-table" className={SELECT_CLASS} value={tableId} onChange={(e) => setTableId(e.target.value)}>
            <option value="">Pilihkan otomatis</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.max_seats} kursi)
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="mb-name">Nama pelanggan</Label>
        <Input id="mb-name" className="min-h-11" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="mb-wa">WhatsApp</Label>
        <Input
          id="mb-wa"
          type="tel"
          inputMode="tel"
          className="min-h-11"
          placeholder="0812..."
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          required
        />
      </div>
      {needsParty ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="mb-note">Catatan (opsional)</Label>
          <Input id="mb-note" className="min-h-11" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      ) : null}
      <p className="text-muted-foreground text-sm">
        Dicatat sebagai bayar di tempat. Tandai lunas di detail booking setelah pelanggan membayar.
      </p>
      {message ? (
        <p role="alert" className="border-border bg-muted rounded-md border px-3 py-2 text-sm">
          {message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="min-h-11 w-full sm:w-auto">
        {pending ? <Spinner /> : null}
        Simpan booking
      </Button>
    </form>
  );
}
