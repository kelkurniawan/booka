import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Pemilih jumlah tamu. Tombol dinonaktifkan di batas, angka diumumkan pembaca layar. */
export function GuestStepper({
  value,
  min,
  max,
  onChange,
  hint,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  hint?: string | null;
}) {
  return (
    <div
      className="bg-card border-border flex flex-col gap-2 border p-4"
      style={{ borderRadius: "var(--radius)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <span id="jumlah-tamu-label" className="font-medium">
          Jumlah tamu
        </span>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11"
            aria-label="Kurangi tamu"
            disabled={value <= min}
            onClick={() => onChange(value - 1)}
          >
            <Minus aria-hidden />
          </Button>
          <output aria-live="polite" aria-labelledby="jumlah-tamu-label" className="min-w-8 text-center text-lg font-bold">
            {value}
          </output>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11"
            aria-label="Tambah tamu"
            disabled={value >= max}
            onClick={() => onChange(value + 1)}
          >
            <Plus aria-hidden />
          </Button>
        </div>
      </div>
      {hint ? <p className="text-muted-foreground text-sm">{hint}</p> : null}
    </div>
  );
}
