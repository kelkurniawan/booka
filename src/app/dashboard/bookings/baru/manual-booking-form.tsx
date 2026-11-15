"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { ROUTES } from "@/lib/routes";

import { createManualBooking } from "../actions";
import { type ManualBookingInput, type ManualBookingResult, manualBookingErrorMessage } from "../manual-booking";
import { SlotField } from "../slot-field";

type ServiceOption = { id: string; name: string; duration_minutes: number; price: number };

const SELECT_CLASS =
  "border-input bg-background focus-visible:ring-ring/50 min-h-11 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-3";

export function ManualBookingForm({
  username,
  todayISO,
  services,
  staff,
  action = createManualBooking,
}: {
  username: string;
  /** Hari ini (WIB), dihitung di server. */
  todayISO: string;
  services: ServiceOption[];
  staff: { id: string; name: string }[];
  /** Bisa diganti di Storybook. */
  action?: (input: ManualBookingInput) => Promise<ManualBookingResult>;
}) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [staffId, setStaffId] = useState("");
  const [dateISO, setDateISO] = useState(todayISO);
  const [startISO, setStartISO] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  // Naik saat slot bentrok: me-remount SlotField supaya daftar jam diambil ulang.
  const [slotsRound, setSlotsRound] = useState(0);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!startISO) {
      setMessage("Pilih jam dulu.");
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await action({
        serviceId,
        staffId: staffId || null,
        startISO,
        customerName: name,
        customerWhatsapp: whatsapp,
      });
      if (result.ok) router.push(`${ROUTES.bookings}?tab=mendatang&b=${result.id}`);
      else {
        setMessage(result.message);
        if (result.message === manualBookingErrorMessage("23P01")) {
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
            setStartISO(null);
          }}>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.duration_minutes} menit)
            </option>
          ))}
        </select>
      </div>
      {staff.length > 0 ? (
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
          staffId={staffId || null}
          dateISO={dateISO}
          value={startISO}
          onChange={setStartISO}
          labelledBy="mb-jam-label"
        />
      </div>
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
