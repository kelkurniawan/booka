"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Mail } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ROUTES } from "@/lib/routes";

import { INITIAL_AUTH_STATE } from "../auth-state";
import { signInWithMagicLink, signInWithPassword } from "../actions";
import {
  EmailField,
  FormError,
  GoogleSignIn,
  OrDivider,
  PasswordField,
  SubmitButton,
} from "../auth-ui";

export function SignInForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"password" | "magic">("password");

  return (
    <div className="flex flex-col gap-6">
      <GoogleSignIn next={next} label="Lanjutkan dengan Google" />

      <OrDivider />

      {mode === "password" ? (
        <PasswordMode next={next} onUseMagicLink={() => setMode("magic")} />
      ) : (
        <MagicLinkMode next={next} onUsePassword={() => setMode("password")} />
      )}
    </div>
  );
}

function PasswordMode({
  next,
  onUseMagicLink,
}: {
  next: string;
  onUseMagicLink: () => void;
}) {
  const [state, formAction] = useActionState(signInWithPassword, INITIAL_AUTH_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />

      <EmailField error={state.fieldErrors?.email} />

      <PasswordField
        autoComplete="current-password"
        error={state.fieldErrors?.password}
      />

      <div className="flex justify-end">
        <Link
          href={ROUTES.forgotPassword}
          className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
        >
          Lupa password?
        </Link>
      </div>

      <FormError message={state.message} />

      <SubmitButton>Masuk</SubmitButton>

      <button
        type="button"
        onClick={onUseMagicLink}
        className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
      >
        Masuk lewat tautan email saja
      </button>
    </form>
  );
}

function MagicLinkMode({
  next,
  onUsePassword,
}: {
  next: string;
  onUsePassword: () => void;
}) {
  const [state, formAction] = useActionState(signInWithMagicLink, INITIAL_AUTH_STATE);

  if (state.status === "sent") {
    return (
      <Alert>
        <CheckCircle2 />
        <AlertTitle>Tautan masuk sudah dikirim</AlertTitle>
        <AlertDescription>
          Cek kotak masuk email Anda dan klik tautannya. Tautan berlaku 1 jam dan
          hanya bisa dipakai sekali.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />

      <EmailField error={state.fieldErrors?.email} />

      <FormError message={state.message} />

      <SubmitButton>
        <Mail />
        Kirim tautan masuk
      </SubmitButton>

      <button
        type="button"
        onClick={onUsePassword}
        className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
      >
        Masuk pakai password
      </button>
    </form>
  );
}
