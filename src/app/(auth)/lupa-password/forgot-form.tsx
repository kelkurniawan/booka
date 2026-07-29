"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { INITIAL_AUTH_STATE } from "../auth-state";
import { requestPasswordReset } from "../actions";
import { EmailField, FormError, SubmitButton } from "../auth-ui";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordReset, INITIAL_AUTH_STATE);

  if (state.status === "sent") {
    return (
      <Alert>
        <CheckCircle2 />
        <AlertTitle>Tautan pemulihan sudah dikirim</AlertTitle>
        <AlertDescription>
          Kalau email tersebut terdaftar, tautan untuk mengganti password sudah
          masuk ke kotak masuknya. Tautan berlaku 1 jam.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <EmailField error={state.fieldErrors?.email} />
      <FormError message={state.message} />
      <SubmitButton>Kirim tautan pemulihan</SubmitButton>
    </form>
  );
}
