"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Mail } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { signInWithGoogle, signInWithMagicLink, type AuthActionState } from "./actions";

const INITIAL_STATE: AuthActionState = { status: "idle" };

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(signInWithMagicLink, INITIAL_STATE);

  if (state.status === "sent") {
    return (
      <Alert>
        <CheckCircle2 />
        <AlertTitle>Tautan masuk sudah dikirim</AlertTitle>
        <AlertDescription>
          Cek kotak masuk email Anda dan klik tautannya untuk melanjutkan. Tautan
          berlaku selama 1 jam dan hanya bisa dipakai sekali.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="next" value={next} />

        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="nama@email.com"
            required
            aria-invalid={state.status === "error"}
            aria-describedby={state.status === "error" ? "email-error" : undefined}
          />
          <FieldDescription>
            Belum punya akun? Tautan yang sama akan langsung mendaftarkan Anda.
          </FieldDescription>
        </Field>

        {state.status === "error" ? (
          <p id="email-error" role="alert" className="text-destructive text-sm">
            {state.message}
          </p>
        ) : null}

        <SubmitButton />
      </form>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-muted-foreground text-xs">atau</span>
        <Separator className="flex-1" />
      </div>

      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <GoogleButton />
      </form>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? <Spinner /> : <Mail />}
      Kirim tautan masuk
    </Button>
  );
}

function GoogleButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="outline" disabled={pending} className="w-full">
      {pending ? <Spinner /> : <GoogleIcon />}
      Lanjutkan dengan Google
    </Button>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.63h6.2a5.3 5.3 0 0 1-2.3 3.48v2.9h3.72c2.18-2 3.44-4.96 3.44-8.56Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.11 0 5.72-1.03 7.62-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.55-2.03-6.46-4.76H1.7v2.98A11.5 11.5 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.54 14.66a6.9 6.9 0 0 1 0-4.4V7.28H1.7a11.51 11.51 0 0 0 0 10.36l3.84-2.98Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.69 0 3.21.58 4.4 1.72l3.3-3.3C17.72 1.2 15.11 0 12 0 7.48 0 3.58 2.6 1.7 6.38l3.84 2.98C6.45 6.63 9 4.75 12 4.75Z"
      />
    </svg>
  );
}
