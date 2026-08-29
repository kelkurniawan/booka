"use client";

import { useState } from "react";

import { ALL_DAYS, DAY_LABELS } from "@/app/dashboard/availability/availability-state";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { OptionCard, OptionCardGroup } from "@/components/ui/option-card";
import { OptionCheckCard } from "@/components/ui/option-check-card";
import { hoursStepSchema } from "@/lib/validations/onboarding";
import type { DayOfWeek } from "@/types/database";

import { matchHoursPreset } from "../wizard-payload";
import { HOURS_PRESETS, type WizardAnswers, type WizardHoursAnswer } from "../wizard-state";

/** Nilai OptionCard untuk kartu jam kustom -- bukan id preset mana pun. */
const SENDIRI = "sendiri";

/**
 * Langkah 3: jam buka.
 *
 * Preset maju otomatis -- satu ketukan, tanpa yang diketik, dan bisa dibatalkan
 * penuh lewat "Kembali". "Atur sendiri" mengembang DI TEMPAT dan hanya maju
 * lewat tombol: begitu ada yang diketik, layar tidak boleh berpindah sendiri.
 */
export function StepJam({
  answers,
  onBack,
  onDone,
}: {
  answers: WizardAnswers;
  onBack: () => void;
  onDone: (hours: WizardHoursAnswer) => void;
}) {
  const presetTersimpan = matchHoursPreset(answers.hours);

  const [pilihan, setPilihan] = useState<string | null>(() =>
    presetTersimpan ?? (answers.hours ? SENDIRI : null),
  );
  // Diambil dari jawaban tersimpan APA PUN asalnya. Preset pun menyimpan hari
  // dan jamnya ke `answers.hours`, jadi merchant yang kembali lalu menekan
  // "Atur sendiri" mulai dari preset yang tadi dipilihnya -- bukan dari panel
  // kosong yang memaksanya mengisi ulang tujuh hari dari nol.
  const [days, setDays] = useState<DayOfWeek[]>(() =>
    toDaysOfWeek(answers.hours?.days ?? []),
  );
  const [startTime, setStartTime] = useState(answers.hours?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(answers.hours?.endTime ?? "17:00");

  const hasil = hoursStepSchema.safeParse({
    days,
    start_time: startTime,
    end_time: endTime,
  });

  const errors = hasil.success ? {} : ambilErrors(hasil.error.issues);

  function pilih(value: string) {
    setPilihan(value);
    if (value === SENDIRI) return;

    const preset = HOURS_PRESETS.find((item) => item.id === value);
    if (!preset) return;

    // Maju otomatis: pilihan tunggal, tanpa ketikan, dan sepenuhnya bisa
    // dibatalkan lewat "Kembali".
    onDone({
      days: [...preset.days],
      startTime: preset.startTime,
      endTime: preset.endTime,
    });
  }

  function toggleDay(value: string, checked: boolean) {
    const day = Number(value);
    if (!isDayOfWeek(day)) return;
    setDays((sebelumnya) =>
      checked
        ? [...sebelumnya, day].sort((a, b) => a - b)
        : sebelumnya.filter((item) => item !== day),
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <OptionCardGroup aria-label="Jam buka" className="lg:grid-cols-2">
        {HOURS_PRESETS.map((preset) => (
          <OptionCard
            key={preset.id}
            name="hours_preset"
            value={preset.id}
            checked={pilihan === preset.id}
            onSelect={pilih}
            label={preset.label}
            description={preset.description}
          />
        ))}
        <OptionCard
          name="hours_preset"
          value={SENDIRI}
          checked={pilihan === SENDIRI}
          onSelect={pilih}
          label="Atur sendiri"
          description="Pilih hari dan jamnya"
        />
      </OptionCardGroup>

      {pilihan === SENDIRI ? (
        <section className="flex flex-col gap-6">
          <Field data-invalid={Boolean(errors.days)}>
            <FieldLabel>Hari buka</FieldLabel>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {ALL_DAYS.map((day) => (
                <OptionCheckCard
                  key={day}
                  name="hours_days"
                  value={String(day)}
                  checked={days.includes(day)}
                  onToggle={toggleDay}
                  label={DAY_LABELS[day]}
                />
              ))}
            </div>
            {errors.days ? <FieldError>{errors.days}</FieldError> : null}
          </Field>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="wizard_start_time">Jam mulai</FieldLabel>
              <Input
                id="wizard_start_time"
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className="min-h-11"
              />
            </Field>

            <Field data-invalid={Boolean(errors.end_time)}>
              <FieldLabel htmlFor="wizard_end_time">Jam selesai</FieldLabel>
              <Input
                id="wizard_end_time"
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                aria-invalid={Boolean(errors.end_time)}
                className="min-h-11"
              />
              {errors.end_time ? (
                <FieldError>{errors.end_time}</FieldError>
              ) : (
                <FieldDescription>Berlaku untuk semua hari terpilih.</FieldDescription>
              )}
            </Field>
          </div>
        </section>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={onBack} className="min-h-11">
          Kembali
        </Button>
        {pilihan === SENDIRI ? (
          <Button
            type="button"
            disabled={!hasil.success}
            className="min-h-11"
            onClick={() => {
              if (!hasil.success) return;
              onDone({ days: [...days], startTime, endTime });
            }}
          >
            Lanjut
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * `WizardHoursAnswer.days` bertipe `number[]` -- cadangan sessionStorage bisa
 * berisi angka apa pun. Dipersempit ke `DayOfWeek` lewat pemeriksaan sungguhan,
 * BUKAN `as DayOfWeek`, supaya angka di luar 1..7 tersaring di sini alih-alih
 * lolos sampai ke constraint availability_day_range di database.
 */
function isDayOfWeek(value: number): value is DayOfWeek {
  return Number.isInteger(value) && value >= 1 && value <= 7;
}

function toDaysOfWeek(values: readonly number[]): DayOfWeek[] {
  return values.filter(isDayOfWeek).sort((a, b) => a - b);
}

function ambilErrors(
  issues: readonly { path: PropertyKey[]; message: string }[],
): Partial<Record<"days" | "start_time" | "end_time", string>> {
  const errors: Partial<Record<"days" | "start_time" | "end_time", string>> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (key === "days" || key === "start_time" || key === "end_time") {
      errors[key] ??= issue.message;
    }
  }
  return errors;
}
