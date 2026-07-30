"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { Availability, DayOfWeek } from "@/types/database";

import { addSlot, copyToWeekdays, removeSlot } from "./actions";
import { INITIAL_AVAILABILITY_FORM_STATE } from "./availability-state";

export function DayCard({
  day,
  label,
  slots,
}: {
  day: DayOfWeek;
  label: string;
  slots: Availability[];
}) {
  const [copyPending, startCopy] = useTransition();

  function handleCopy() {
    startCopy(async () => {
      const result = await copyToWeekdays(day);
      if (result.ok) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{label}</CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          disabled={copyPending || slots.length === 0}
        >
          {copyPending ? <Spinner /> : null}
          Salin ke semua hari kerja
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {slots.length === 0 ? (
          <p className="text-muted-foreground text-sm">Belum ada jam kerja.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {slots.map((slot) => (
              <SlotRow key={slot.id} slot={slot} />
            ))}
          </ul>
        )}

        <AddSlotForm day={day} />
      </CardContent>
    </Card>
  );
}

function AddSlotForm({ day }: { day: DayOfWeek }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(addSlot, INITIAL_AVAILABILITY_FORM_STATE);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
    // Pesan sukses tidak butuh toast di sini — kartu langsung menampilkan
    // rentang baru begitu revalidatePath menyegarkan data.
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="day_of_week" value={day} />
      <div className="flex items-end gap-2">
        <Field data-invalid={Boolean(state.fieldErrors?.start_time)} className="flex-1">
          <FieldLabel htmlFor={`start_time_${day}`} className="sr-only">
            Jam mulai
          </FieldLabel>
          <Input
            id={`start_time_${day}`}
            name="start_time"
            type="time"
            required
            aria-invalid={Boolean(state.fieldErrors?.start_time)}
          />
        </Field>
        <span className="text-muted-foreground pb-2 text-sm">–</span>
        <Field data-invalid={Boolean(state.fieldErrors?.end_time)} className="flex-1">
          <FieldLabel htmlFor={`end_time_${day}`} className="sr-only">
            Jam selesai
          </FieldLabel>
          <Input
            id={`end_time_${day}`}
            name="end_time"
            type="time"
            required
            aria-invalid={Boolean(state.fieldErrors?.end_time)}
          />
        </Field>
        <AddButton />
      </div>
      {state.fieldErrors?.start_time ? <FieldError>{state.fieldErrors.start_time}</FieldError> : null}
      {state.fieldErrors?.end_time ? <FieldError>{state.fieldErrors.end_time}</FieldError> : null}
      {state.status === "error" && !state.fieldErrors ? (
        <p className="text-destructive text-sm">{state.message}</p>
      ) : null}
    </form>
  );
}

function AddButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="icon" disabled={pending} aria-label="Tambah jam kerja">
      {pending ? <Spinner /> : <Plus />}
    </Button>
  );
}

function SlotRow({ slot }: { slot: Availability }) {
  const [pending, startTransition] = useTransition();

  function handleRemove() {
    startTransition(async () => {
      const result = await removeSlot(slot.id);
      if (!result.ok) {
        toast.error(result.message ?? "Gagal menghapus jam kerja.");
      }
    });
  }

  return (
    <li className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
      <span>
        {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={handleRemove}
        disabled={pending}
        aria-label="Hapus jam kerja"
      >
        {pending ? <Spinner /> : <Trash2 />}
      </Button>
    </li>
  );
}
