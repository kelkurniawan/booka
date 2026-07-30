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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { PaymentProvider } from "@/types/database";

import { saveManualKey } from "./actions";
import { INITIAL_MANUAL_KEY_FORM_STATE, PROVIDER_META } from "./payment-state";

export function ManualKeyDialog({
  open,
  onOpenChange,
  provider,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: PaymentProvider;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <ManualKeyForm provider={provider} onSuccess={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ManualKeyForm({
  provider,
  onSuccess,
}: {
  provider: PaymentProvider;
  onSuccess: () => void;
}) {
  const [state, formAction] = useActionState(saveManualKey, INITIAL_MANUAL_KEY_FORM_STATE);
  const providerName = PROVIDER_META[provider].name;

  useEffect(() => {
    if (state.status === "success") {
      toast.success(`${providerName} terhubung`);
      onSuccess();
    }
    // onSuccess sengaja tidak masuk dependency -- identitasnya berubah
    // setiap render karena dibuat inline di pemanggil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, providerName]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Hubungkan {providerName} dengan Server Key</DialogTitle>
        <DialogDescription>
          Ambil Server Key dari dashboard {providerName} Anda. Server Key disimpan
          terenkripsi dan tidak pernah ditampilkan penuh lagi setelah disimpan.
        </DialogDescription>
      </DialogHeader>

      <input type="hidden" name="provider" value={provider} />

      <Field data-invalid={Boolean(state.fieldErrors?.environment)}>
        <FieldLabel htmlFor="environment">Environment</FieldLabel>
        <Select name="environment" defaultValue="SANDBOX">
          <SelectTrigger id="environment" className="w-full" aria-invalid={Boolean(state.fieldErrors?.environment)}>
            <SelectValue placeholder="Pilih environment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="SANDBOX">Sandbox (untuk uji coba)</SelectItem>
            <SelectItem value="PRODUCTION">Production (transaksi sungguhan)</SelectItem>
          </SelectContent>
        </Select>
        {state.fieldErrors?.environment ? (
          <FieldError>{state.fieldErrors.environment}</FieldError>
        ) : (
          <FieldDescription>
            Pakai Sandbox dulu untuk uji coba sebelum menerima pembayaran sungguhan.
          </FieldDescription>
        )}
      </Field>

      <Field data-invalid={Boolean(state.fieldErrors?.serverKey)}>
        <FieldLabel htmlFor="serverKey">Server Key</FieldLabel>
        <Input
          id="serverKey"
          name="serverKey"
          type="password"
          autoComplete="off"
          placeholder="SB-Mid-server-..."
          required
          aria-invalid={Boolean(state.fieldErrors?.serverKey)}
        />
        {state.fieldErrors?.serverKey ? (
          <FieldError>{state.fieldErrors.serverKey}</FieldError>
        ) : (
          <FieldDescription>
            Hanya 4 karakter terakhir yang akan ditampilkan lagi setelah ini disimpan.
          </FieldDescription>
        )}
      </Field>

      {state.status === "error" && !state.fieldErrors ? (
        <Alert variant="destructive">
          <AlertTitle>Gagal menghubungkan</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <DialogFooter>
        <SubmitButton />
      </DialogFooter>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Spinner /> : null}
      Simpan & hubungkan
    </Button>
  );
}
