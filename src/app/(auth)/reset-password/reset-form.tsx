"use client";

import { useActionState } from "react";

import { INITIAL_AUTH_STATE } from "../auth-state";
import { updatePassword } from "../actions";
import { FormError, PasswordField, SubmitButton } from "../auth-ui";

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(updatePassword, INITIAL_AUTH_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <PasswordField
        label="Password baru"
        autoComplete="new-password"
        description="Minimal 8 karakter."
        error={state.fieldErrors?.password}
      />

      <PasswordField
        id="confirmPassword"
        name="confirmPassword"
        label="Ulangi password baru"
        autoComplete="new-password"
        error={state.fieldErrors?.confirmPassword}
      />

      <FormError message={state.message} />

      <SubmitButton>Simpan password baru</SubmitButton>
    </form>
  );
}
