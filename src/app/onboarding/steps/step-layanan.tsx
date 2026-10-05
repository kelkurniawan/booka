"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { OptionCard, OptionCardGroup } from "@/components/ui/option-card";
import { findBusinessType, type ServiceTemplate } from "@/lib/business/catalog";
import { wizardServiceSchema } from "@/lib/validations/onboarding";

import type { WizardAnswers, WizardServiceAnswer } from "../wizard-state";

/** Nilai OptionCard untuk kartu "Tulis sendiri" -- bukan nama template mana pun. */
const SENDIRI = "sendiri";

/**
 * Langkah 2: layanan pertama.
 *
 * TIDAK PERNAH maju otomatis. Setiap kolom di sini diketik, dan layar yang
 * berpindah sendiri sedetik setelah merchant selesai mengetik harga adalah
 * cara tercepat membuat pekerjaannya hilang.
 */
export function StepLayanan({
  answers,
  onBack,
  onDone,
}: {
  answers: WizardAnswers;
  onBack: () => void;
  onDone: (service: WizardServiceAnswer) => void;
}) {
  const templates = answers.typeSlug
    ? (findBusinessType(answers.typeSlug)?.templates ?? [])
    : [];

  const [pilihan, setPilihan] = useState<string | null>(() =>
    tebakPilihan(templates, answers.service),
  );
  const [name, setName] = useState(answers.service?.name ?? "");
  const [duration, setDuration] = useState(
    answers.service ? String(answers.service.durationMinutes) : "",
  );
  // Harga TIDAK PERNAH diisi template. Berapa merchant memasang harga adalah
  // keputusannya, bukan tebakan kami -- template hanya memberi rentang wajar.
  const [price, setPrice] = useState(answers.service?.price ?? "");

  const templateTerpilih =
    pilihan && pilihan !== SENDIRI
      ? (templates.find((template) => template.name === pilihan) ?? null)
      : null;

  const hasil = wizardServiceSchema.safeParse({
    name,
    duration_minutes: duration,
    price,
  });

  const errors = hasil.success ? {} : ambilErrors(hasil.error.issues);

  function pilihTemplate(value: string) {
    setPilihan(value);
    if (value === SENDIRI) {
      setName("");
      setDuration("");
      return;
    }
    const template = templates.find((item) => item.name === value);
    if (!template) return;
    setName(template.name);
    setDuration(String(template.durationMinutes));
  }

  function lanjut() {
    if (!hasil.success) return;
    onDone({
      name: hasil.data.name,
      durationMinutes: hasil.data.duration_minutes,
      // Harga dikirim sebagai STRING mentah. Nilai hasil coercion sengaja
      // dibuang di sini supaya schema di server tetap yang memutuskan, dan
      // string kosong tidak pernah berubah menjadi 0 dalam perjalanan.
      price,
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {templates.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Pilih layanan atau tulis sendiri</h2>
          <OptionCardGroup aria-label="Template layanan">
            {templates.map((template) => (
              <OptionCard
                key={template.name}
                name="service_template"
                value={template.name}
                checked={pilihan === template.name}
                onSelect={pilihTemplate}
                label={template.name}
                description={`${template.durationMinutes} menit`}
              />
            ))}
            <OptionCard
              name="service_template"
              value={SENDIRI}
              checked={pilihan === SENDIRI}
              onSelect={pilihTemplate}
              label="Tulis sendiri"
              description="Layanan Anda tidak ada di daftar"
            />
          </OptionCardGroup>
        </section>
      ) : null}

      <div className="flex flex-col gap-6">
        <Field data-invalid={Boolean(errors.name && name.length > 0)}>
          <FieldLabel htmlFor="wizard_service_name">Nama layanan</FieldLabel>
          <Input
            id="wizard_service_name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Potong rambut"
            maxLength={80}
            aria-invalid={Boolean(errors.name && name.length > 0)}
          />
          {errors.name && name.length > 0 ? (
            <FieldError>{errors.name}</FieldError>
          ) : (
            <FieldDescription>Bisa ditambah layanan lain nanti.</FieldDescription>
          )}
        </Field>

        <Field data-invalid={Boolean(errors.duration_minutes && duration.length > 0)}>
          <FieldLabel htmlFor="wizard_service_duration">Durasi (menit)</FieldLabel>
          <Input
            id="wizard_service_duration"
            type="number"
            inputMode="numeric"
            min={5}
            max={480}
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            placeholder="45"
            aria-invalid={Boolean(errors.duration_minutes && duration.length > 0)}
          />
          {errors.duration_minutes && duration.length > 0 ? (
            <FieldError>{errors.duration_minutes}</FieldError>
          ) : (
            <FieldDescription>Antara 5 dan 480 menit.</FieldDescription>
          )}
        </Field>

        <Field data-invalid={Boolean(errors.price && price.length > 0)}>
          <FieldLabel htmlFor="wizard_service_price">Harga (Rp)</FieldLabel>
          <Input
            id="wizard_service_price"
            type="number"
            inputMode="numeric"
            min={0}
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="50000"
            aria-invalid={Boolean(errors.price && price.length > 0)}
          />
          {errors.price && price.length > 0 ? (
            <FieldError>{errors.price}</FieldError>
          ) : (
            <FieldDescription>
              {templateTerpilih?.priceHint ?? "Bisa diubah kapan saja di Layanan."}
            </FieldDescription>
          )}
        </Field>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={onBack} className="min-h-11">
          Kembali
        </Button>
        <Button
          type="button"
          onClick={lanjut}
          disabled={!hasil.success}
          className="min-h-11"
        >
          Lanjut
        </Button>
      </div>
    </div>
  );
}

/**
 * Saat merchant kembali dari langkah berikutnya, kartu yang dulu dipilih harus
 * tetap tersorot. Template dikenali dari nama + durasi; kalau nilainya sudah
 * disunting sampai tidak cocok lagi, itu memang layanan tulisan sendiri.
 */
function tebakPilihan(
  templates: readonly ServiceTemplate[],
  service: WizardServiceAnswer | null,
): string | null {
  if (!service) return null;
  const cocok = templates.find(
    (template) =>
      template.name === service.name &&
      template.durationMinutes === service.durationMinutes,
  );
  return cocok?.name ?? SENDIRI;
}

function ambilErrors(
  issues: readonly { path: PropertyKey[]; message: string }[],
): Partial<Record<"name" | "duration_minutes" | "price", string>> {
  const errors: Partial<Record<"name" | "duration_minutes" | "price", string>> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (key === "name" || key === "duration_minutes" || key === "price") {
      errors[key] ??= issue.message;
    }
  }
  return errors;
}
