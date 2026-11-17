"use client";

import { useState } from "react";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Service, TableMode } from "@/types/database";

import type { ServiceFormState } from "./service-state";

/**
 * Bagian "Jumlah tamu" dan "Reservasi meja" di form layanan. Tampil hanya bila
 * mode kapasitas menyala atau layanan sudah punya nilainya, supaya data lama
 * tidak hilang diam-diam saat form disimpan.
 */
export function ReservationFields({
  service,
  tableMode,
  errors,
}: {
  service?: Pick<Service, "party_min" | "party_max" | "seat_duration_minutes">;
  tableMode: TableMode;
  errors?: ServiceFormState["fieldErrors"];
}) {
  const [reserve, setReserve] = useState(service?.seat_duration_minutes != null);
  const hasValues =
    service != null &&
    (service.party_min != null || service.party_max != null || service.seat_duration_minutes != null);
  if (tableMode === "NONE" && !hasValues) return null;

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium">Jumlah tamu (opsional)</legend>
      <div className="grid grid-cols-2 gap-4">
        <Field data-invalid={Boolean(errors?.partyMin)}>
          <FieldLabel htmlFor="partyMin">Minimal</FieldLabel>
          <Input
            id="partyMin"
            name="partyMin"
            type="number"
            inputMode="numeric"
            min={1}
            max={200}
            defaultValue={service?.party_min ?? ""}
            aria-invalid={Boolean(errors?.partyMin)}
          />
          {errors?.partyMin ? <FieldError>{errors.partyMin}</FieldError> : null}
        </Field>
        <Field data-invalid={Boolean(errors?.partyMax)}>
          <FieldLabel htmlFor="partyMax">Maksimal</FieldLabel>
          <Input
            id="partyMax"
            name="partyMax"
            type="number"
            inputMode="numeric"
            min={1}
            max={200}
            defaultValue={service?.party_max ?? ""}
            aria-invalid={Boolean(errors?.partyMax)}
          />
          {errors?.partyMax ? <FieldError>{errors.partyMax}</FieldError> : null}
        </Field>
      </div>

      <div className="flex min-h-11 items-center gap-2 text-sm">
        <input
          id="reserve_table"
          type="checkbox"
          checked={reserve}
          onChange={(e) => setReserve(e.target.checked)}
          className="size-4"
        />
        <label htmlFor="reserve_table" className="inline-flex min-h-11 flex-1 items-center">
          Reservasi meja
        </label>
      </div>
      {reserve ? (
        <Field data-invalid={Boolean(errors?.seatDurationMinutes)}>
          <FieldLabel htmlFor="seatDurationMinutes">Lama duduk (menit)</FieldLabel>
          <Input
            id="seatDurationMinutes"
            name="seatDurationMinutes"
            type="number"
            inputMode="numeric"
            min={15}
            max={480}
            step={15}
            defaultValue={service?.seat_duration_minutes ?? 90}
            aria-invalid={Boolean(errors?.seatDurationMinutes)}
          />
          {errors?.seatDurationMinutes ? (
            <FieldError>{errors.seatDurationMinutes}</FieldError>
          ) : (
            <FieldDescription>Berapa lama satu reservasi menempati meja atau kursi.</FieldDescription>
          )}
        </Field>
      ) : null}
    </fieldset>
  );
}
