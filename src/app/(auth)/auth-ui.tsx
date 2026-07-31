"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";

import { signInWithGoogle } from "./actions";

/** Tombol kirim yang menampilkan spinner selama server action berjalan. */
export function SubmitButton({
  children,
  variant = "default",
  disabled,
}: {
  children: React.ReactNode;
  variant?: "default" | "outline";
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant={variant} disabled={pending || disabled} className="w-full">
      {pending ? <Spinner /> : null}
      {children}
    </Button>
  );
}

export function GoogleSignIn({ next, label }: { next: string; label: string }) {
  return (
    <form action={signInWithGoogle}>
      <input type="hidden" name="next" value={next} />
      <GoogleButton label={label} />
    </form>
  );
}

function GoogleButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="outline" disabled={pending} className="w-full">
      {pending ? <Spinner /> : <GoogleIcon />}
      {label}
    </Button>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3">
      <Separator className="flex-1" />
      <span className="text-muted-foreground text-xs">atau</span>
      <Separator className="flex-1" />
    </div>
  );
}

export function EmailField({ error }: { error?: string }) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor="email">Email</FieldLabel>
      <Input
        id="email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="nama@email.com"
        required
        aria-invalid={Boolean(error)}
      />
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

export function PasswordField({
  id = "password",
  name = "password",
  label = "Password",
  autoComplete,
  description,
  error,
}: {
  id?: string;
  name?: string;
  label?: string;
  autoComplete: "current-password" | "new-password";
  description?: string;
  error?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          aria-invalid={Boolean(error)}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          // Tombolnya hanya mengubah tampilan di perangkat ini, jadi tidak
          // perlu diumumkan ulang sebagai perubahan state form.
          aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-md focus-visible:ring-[3px] focus-visible:outline-none"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {error ? (
        <FieldError>{error}</FieldError>
      ) : description ? (
        <FieldDescription>{description}</FieldDescription>
      ) : null}
    </Field>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-destructive text-sm">
      {message}
    </p>
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
