"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ROUTES } from "@/lib/routes";
import type { Service } from "@/types/database";

import { createService, updateService } from "./actions";
import { INITIAL_SERVICE_FORM_STATE } from "./service-state";

/**
 * Dialog tambah/ubah layanan. Mode ditentukan oleh ada tidaknya `service`.
 *
 * `DialogContent` dari Radix baru merender anaknya ke DOM saat dialog
 * terbuka, dan melepasnya lagi setelah animasi tutup selesai — jadi
 * `ServiceForm` di dalamnya otomatis mendapat state form yang bersih setiap
 * kali dialog dibuka ulang, tanpa perlu reset manual.
 */
export function ServiceFormDialog({
  open,
  onOpenChange,
  service,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service?: Service;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <ServiceForm service={service} onSuccess={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ServiceForm({
  service,
  onSuccess,
}: {
  service?: Service;
  onSuccess: () => void;
}) {
  const isEdit = Boolean(service);
  const action = isEdit ? updateService : createService;
  const [state, formAction] = useActionState(action, INITIAL_SERVICE_FORM_STATE);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(isEdit ? "Layanan diperbarui" : "Layanan ditambahkan");
      onSuccess();
    }
    // onSuccess sengaja tidak masuk dependency: identitasnya berubah setiap
    // render karena dibuat inline di ServiceFormDialog, dan hanya perlu
    // dipanggil saat status berubah jadi "success".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, isEdit]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Ubah layanan" : "Tambah layanan"}</DialogTitle>
        <DialogDescription>
          Layanan ini akan tampil di halaman booking Anda beserta harga dan durasinya.
        </DialogDescription>
      </DialogHeader>

      {service ? <input type="hidden" name="id" value={service.id} /> : null}

      <Field data-invalid={Boolean(state.fieldErrors?.name)}>
        <FieldLabel htmlFor="name">Nama layanan</FieldLabel>
        <Input
          id="name"
          name="name"
          defaultValue={service?.name ?? ""}
          placeholder="Riasan pengantin"
          maxLength={80}
          required
          aria-invalid={Boolean(state.fieldErrors?.name)}
        />
        {state.fieldErrors?.name ? <FieldError>{state.fieldErrors.name}</FieldError> : null}
      </Field>

      <Field data-invalid={Boolean(state.fieldErrors?.description)}>
        <FieldLabel htmlFor="description">Deskripsi (opsional)</FieldLabel>
        <Textarea
          id="description"
          name="description"
          defaultValue={service?.description ?? ""}
          placeholder="Ceritakan singkat apa yang didapat pelanggan"
          maxLength={500}
          aria-invalid={Boolean(state.fieldErrors?.description)}
        />
        {state.fieldErrors?.description ? (
          <FieldError>{state.fieldErrors.description}</FieldError>
        ) : null}
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field data-invalid={Boolean(state.fieldErrors?.price)}>
          <FieldLabel htmlFor="price">Harga (Rp)</FieldLabel>
          <Input
            id="price"
            name="price"
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            defaultValue={service?.price ?? ""}
            placeholder="350000"
            required
            aria-invalid={Boolean(state.fieldErrors?.price)}
          />
          {state.fieldErrors?.price ? (
            <FieldError>{state.fieldErrors.price}</FieldError>
          ) : (
            <FieldDescription>Angka polos, tanpa titik atau &quot;Rp&quot;.</FieldDescription>
          )}
        </Field>

        <Field data-invalid={Boolean(state.fieldErrors?.duration_minutes)}>
          <FieldLabel htmlFor="duration_minutes">Durasi (menit)</FieldLabel>
          <Input
            id="duration_minutes"
            name="duration_minutes"
            type="number"
            inputMode="numeric"
            min={5}
            max={480}
            step={5}
            defaultValue={service?.duration_minutes ?? ""}
            placeholder="90"
            required
            aria-invalid={Boolean(state.fieldErrors?.duration_minutes)}
          />
          {state.fieldErrors?.duration_minutes ? (
            <FieldError>{state.fieldErrors.duration_minutes}</FieldError>
          ) : (
            <FieldDescription>5–480 menit.</FieldDescription>
          )}
        </Field>
      </div>

      {state.status === "error" && !state.fieldErrors ? (
        <Alert variant="destructive">
          <AlertTitle>{state.limitReached ? "Batas layanan tercapai" : "Gagal menyimpan"}</AlertTitle>
          <AlertDescription>
            {state.message}
            {state.limitReached ? (
              <>
                {" "}
                <a href={ROUTES.billing}>Naik ke paket Pro</a>.
              </>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <DialogFooter>
        <SubmitButton isEdit={isEdit} />
      </DialogFooter>
    </form>
  );
}

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Spinner /> : null}
      {isEdit ? "Simpan perubahan" : "Tambah layanan"}
    </Button>
  );
}
