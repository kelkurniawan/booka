"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { durationOptions, formatDuration, parseClock, type CourtPriceRule } from "@/lib/booking/court";
import type { Service } from "@/types/database";

import { addCourt } from "./actions";
import type { CourtFormData, CourtOption } from "./court-data";
import { digits, PeakPricingEditor, validRules, type RuleDraft } from "./peak-pricing-editor";
import { PriceChecker } from "./price-checker";

const snap = (m: number, unit: number) => Math.max(unit, Math.ceil(m / unit) * unit);
const selectCls = "h-9 w-full rounded-lg border bg-background px-2.5 text-sm";

/**
 * Bagian "Sewa lapangan" di form layanan (papan L5). Saklar dipegang dialog
 * karena mematikan bidang restoran dan durasi. Isian dikirim lewat input
 * tersembunyi `court*`; `serviceSchema` dan `courtServiceSchema` memvalidasi
 * ulang di server.
 */
export function CourtFields({
  service,
  rental,
  onRentalChange,
  price,
  onPriceChange,
  data,
  error,
  priceError,
}: {
  service?: Service;
  rental: boolean;
  onRentalChange: (on: boolean) => void;
  price: string;
  onPriceChange: (v: string) => void;
  data: CourtFormData;
  error?: string;
  priceError?: string;
}) {
  const initialUnit: 30 | 60 = service?.court_unit_minutes === 60 ? 60 : 30;
  const [unit, setUnit] = useState<30 | 60>(initialUnit);
  const [min, setMin] = useState(service?.court_unit_minutes ? service.duration_minutes : 60);
  const [max, setMax] = useState(service?.court_max_minutes ?? 120);
  const [courts, setCourts] = useState<CourtOption[]>(data.courts);
  const [ids, setIds] = useState<string[]>(service ? (data.linksByService[service.id] ?? []) : []);
  const [rules, setRules] = useState<RuleDraft[]>(
    (service ? (data.rulesByService[service.id] ?? []) : []).map((r) => ({
      days: r.days,
      start: r.start.replace(":", "."),
      end: r.end.replace(":", "."),
      price: String(r.pricePerHour),
    })),
  );
  const [newName, setNewName] = useState("");
  const [addMsg, setAddMsg] = useState<string | null>(null);
  const [adding, startAdd] = useTransition();

  function changeUnit(next: 30 | 60) {
    setUnit(next);
    setMin((m) => snap(m, next));
    setMax((m) => Math.min(480, snap(m, next)));
  }

  function submitCourt() {
    setAddMsg(null);
    startAdd(async () => {
      const res = await addCourt(newName);
      if (res.status === "error") return setAddMsg(res.message ?? null);
      if (res.court) {
        setCourts((c) => [...c, res.court!]);
        setIds((i) => [...i, res.court!.id]);
        setNewName("");
      }
    });
  }

  const lens = durationOptions({ minMinutes: min, maxMinutes: Math.max(min, max), unitMinutes: unit });
  const unitOpts = (upTo: number) => durationOptions({ minMinutes: unit, maxMinutes: upTo, unitMinutes: unit });
  const checkerRules: CourtPriceRule[] = validRules(rules).flatMap((r) =>
    r.days.map((d) => ({ dayOfWeek: d as CourtPriceRule["dayOfWeek"], start: r.start, end: r.end, pricePerHour: r.pricePerHour })),
  );

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="sewa-h" className="flex flex-col gap-4 rounded-xl border p-4">
        <div className="flex items-start gap-3">
          <div className="flex flex-1 flex-col gap-0.5">
            <h3 id="sewa-h" className="text-sm font-semibold">Sewa lapangan</h3>
            <p className="text-muted-foreground text-[13px]">
              Pelanggan memilih lama main dan lapangan. Harga dihitung per jam.
            </p>
          </div>
          <Switch checked={rental} onCheckedChange={onRentalChange} aria-labelledby="sewa-h" />
        </div>
        {/* Selalu terkirim: server membaca courtEnabled untuk memutuskan cabang sewa. */}
        <input type="hidden" name="courtEnabled" value={rental ? "1" : ""} />
        <input type="hidden" name="courtWas" value={service?.court_unit_minutes != null ? "1" : ""} />

        {rental ? (
          <>
            <input type="hidden" name="courtUnit" value={unit} />
            <input type="hidden" name="courtMin" value={min} />
            <input type="hidden" name="courtMax" value={max} />
            <input type="hidden" name="courtIds" value={JSON.stringify(ids)} />
            <input
              type="hidden"
              name="courtRules"
              value={JSON.stringify(
                rules.map((r) => ({ days: r.days, start: parseClock(r.start) ?? r.start, end: parseClock(r.end) ?? r.end, pricePerHour: digits(r.price) })),
              )}
            />
            <div className="flex flex-wrap gap-4">
              <Field className="min-w-40 flex-1" data-invalid={Boolean(priceError)}>
                <FieldLabel htmlFor="price">Harga per jam (Rp)</FieldLabel>
                <Input
                  id="price"
                  name="price"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1000}
                  value={price}
                  onChange={(e) => onPriceChange(e.target.value)}
                  placeholder="150000"
                  aria-invalid={Boolean(priceError)}
                />
                {priceError ? <FieldError>{priceError}</FieldError> : <FieldDescription>Dipakai di luar jam ramai.</FieldDescription>}
              </Field>
              <fieldset className="flex min-w-40 flex-1 flex-col gap-1.5">
                <legend className="mb-1.5 text-sm font-medium">Jam mulai tiap</legend>
                <div role="radiogroup" className="bg-muted flex w-max gap-1 rounded-[10px] p-[3px]">
                  {([30, 60] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      role="radio"
                      aria-checked={unit === u}
                      onClick={() => changeUnit(u)}
                      className={`h-[30px] rounded-lg px-3 text-sm ${unit === u ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}
                    >
                      {u === 30 ? "30 menit" : "1 jam"}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex min-w-40 flex-1 flex-col gap-1.5 text-sm font-medium">
                Lama main paling singkat
                <select
                  className={selectCls}
                  value={min}
                  onChange={(e) => setMin(Number(e.target.value))}
                >
                  {unitOpts(240).map((m) => <option key={m} value={m}>{formatDuration(m)}</option>)}
                </select>
              </label>
              <label className="flex min-w-40 flex-1 flex-col gap-1.5 text-sm font-medium">
                Lama main paling lama
                <select className={selectCls} value={max} onChange={(e) => setMax(Number(e.target.value))}>
                  {unitOpts(480).map((m) => <option key={m} value={m}>{formatDuration(m)}</option>)}
                </select>
              </label>
            </div>
            <p className="bg-muted/50 text-foreground/80 rounded-lg px-3 py-2.5 text-sm">
              Pelanggan bisa memilih: {lens.map(formatDuration).join(", ")}. Jam mulai tiap {unit === 30 ? "30 menit" : "1 jam"}.
            </p>
          </>
        ) : null}
      </section>

      {rental ? (
        <>
          <section aria-labelledby="lap-h" className="flex flex-col gap-3 rounded-xl border p-4">
            <div className="flex flex-col gap-0.5">
              <h3 id="lap-h" className="text-sm font-semibold">Lapangan yang dipakai</h3>
              <p className="text-muted-foreground text-[13px]">
                Satu lapangan boleh dipakai beberapa layanan. Jadwalnya tetap satu, jadi tidak akan terpesan ganda.
              </p>
            </div>
            {courts.map((c) => (
              <label key={c.id} className="flex min-h-10 cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  className="size-[18px]"
                  checked={ids.includes(c.id)}
                  onChange={(e) => setIds((cur) => (e.target.checked ? [...cur, c.id] : cur.filter((x) => x !== c.id)))}
                />
                <span className="flex flex-1 flex-col">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground text-xs">{c.note}</span>
                </span>
              </label>
            ))}
            <div className="flex gap-2">
              <label htmlFor="baru" className="sr-only">Nama lapangan baru</label>
              <Input
                id="baru"
                value={newName}
                maxLength={40}
                onChange={(e) => setNewName(e.target.value)}
                // Enter di sini tidak boleh mengirim form layanan.
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (newName.trim()) submitCourt();
                  }
                }}
                placeholder="Nama lapangan baru, misalnya Lapangan 4"
                className="flex-1"
              />
              <Button type="button" variant="outline" disabled={adding || !newName.trim()} onClick={submitCourt}>
                Tambah lapangan
              </Button>
            </div>
            {addMsg ? <p role="alert" className="text-[13px] text-red-700">{addMsg}</p> : null}
          </section>

          <PeakPricingEditor rules={rules} onChange={setRules} />
          <PriceChecker
            basePerHour={Number(price) || 0}
            rules={checkerRules}
            unit={unit}
            minMinutes={min}
            maxMinutes={Math.max(min, max)}
          />
          {error ? <p role="alert" className="text-[13px] text-red-700">{error}</p> : null}
        </>
      ) : null}
    </div>
  );
}
