"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { INITIAL_AUTH_STATE } from "../auth-state";
import { signUpWithPassword } from "../actions";
import {
  EmailField,
  FormError,
  GoogleSignIn,
  OrDivider,
  PasswordField,
  SubmitButton,
} from "../auth-ui";

export function SignUpForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(signUpWithPassword, INITIAL_AUTH_STATE);

  if (state.status === "confirm") {
    return (
      <Alert>
        <CheckCircle2 />
        <AlertTitle>Cek email Anda</AlertTitle>
        <AlertDescription>
          Kami mengirim tautan konfirmasi. Klik tautannya untuk mengaktifkan akun
          dan melanjutkan ke pengaturan tautan booking Anda.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <GoogleSignIn next={next} label="Daftar dengan Google" />

      <OrDivider />

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="next" value={next} />

        <EmailField error={state.fieldErrors?.email} />

        <PasswordField
          autoComplete="new-password"
          description="Minimal 8 karakter."
          error={state.fieldErrors?.password}
        />

        <FormError message={state.message} />

        <SubmitButton>Buat akun</SubmitButton>
      </form>
    </div>
  );
}
