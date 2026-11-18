"use client";

import { Button } from "@/components/ui/button";
import { findRuleOverlap, formatRuleOverlap, parseClock } from "@/lib/booking/court";
import { cn } from "@/lib/utils";

/** Satu kartu aturan. Jam dan harga berupa teks supaya mengetik tidak terpotong. */
export type RuleDraft = { days: number[]; start: string; end: string; price: string };

const DAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

export const dotted = (hhmm: string) => hhmm.replace(":", ".");
export const digits = (s: string) => Number(s.replace(/\D/g, "")) || 0;

/** Kartu yang jamnya sudah valid; dipakai untuk deteksi tumpang tindih dan Cek harga. */
export function validRules(drafts: RuleDraft[]) {
  return drafts.flatMap((d, index) => {
    const start = parseClock(d.start);
    const end = parseClock(d.end);
    return start && end ? [{ index, days: d.days, start, end, pricePerHour: digits(d.price) }] : [];
  });
}

export function PeakPricingEditor({
  rules,
  onChange,
}: {
  rules: RuleDraft[];
  onChange: (next: RuleDraft[]) => void;
}) {
  const valid = validRules(rules);
  const overlap = findRuleOverlap(valid);
  // Indeks overlap relatif ke `valid`; petakan balik ke kartu aslinya.
  const errIndex = overlap ? valid[overlap.ruleIndex].index : -1;
  const errText = overlap ? formatRuleOverlap({ ...overlap, with: valid[overlap.with].index }) : "";

  const patch = (i: number, p: Partial<RuleDraft>) => onChange(rules.map((r, ri) => (ri === i ? { ...r, ...p } : r)));

  return (
    <section aria-labelledby="ramai-h" className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-col gap-0.5">
        <h3 id="ramai-h" className="text-sm font-semibold">Harga jam ramai</h3>
        <p className="text-muted-foreground text-[13px]">
          Di luar aturan ini, harga per jam di atas yang berlaku. Aturan tidak boleh tumpang tindih di hari yang sama.
        </p>
      </div>
      {rules.map((r, i) => {
        const bad = i === errIndex;
        return (
          <div
            key={i}
            role="group"
            aria-label={`Aturan ${i + 1}`}
            className={cn("flex flex-col gap-2.5 rounded-lg border p-3", bad && "border-red-300 bg-red-50")}
          >
            <div role="group" aria-label="Hari" className="flex flex-wrap gap-1">
              {DAY_LABELS.map((label, di) => {
                const on = r.days.includes(di + 1);
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => patch(i, { days: on ? r.days.filter((d) => d !== di + 1) : [...r.days, di + 1] })}
                    className={cn(
                      "h-8 min-w-11 rounded-lg border px-2 text-[13px]",
                      on ? "border-foreground bg-foreground text-background" : "bg-background text-muted-foreground",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                aria-label="Mulai"
                value={r.start}
                onChange={(e) => patch(i, { start: e.target.value })}
                className="h-9 w-18 rounded-lg border bg-background px-2.5 text-sm"
              />
              <span className="text-muted-foreground">sampai</span>
              <input
                aria-label="Selesai"
                value={r.end}
                onChange={(e) => patch(i, { end: e.target.value })}
                className="h-9 w-18 rounded-lg border bg-background px-2.5 text-sm"
              />
              <input
                aria-label="Harga per jam"
                inputMode="numeric"
                value={r.price}
                onChange={(e) => patch(i, { price: e.target.value })}
                className="h-9 w-28 rounded-lg border bg-background px-2.5 text-sm"
              />
              <span className="text-muted-foreground">per jam</span>
              <Button
                type="button"
                variant="ghost"
                aria-label={`Hapus aturan ${i + 1}`}
                className="ml-auto text-red-700"
                onClick={() => onChange(rules.filter((_, ri) => ri !== i))}
              >
                Hapus
              </Button>
            </div>
            {bad ? (
              <p role="alert" className="text-[13px] text-red-700">
                {errText}
              </p>
            ) : null}
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        className="self-start border-dashed"
        onClick={() => onChange([...rules, { days: [], start: "17.00", end: "22.00", price: "" }])}
      >
        Tambah aturan
      </Button>
    </section>
  );
}
