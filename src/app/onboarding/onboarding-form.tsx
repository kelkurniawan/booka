"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, ArrowRight, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { suggestUsername, USERNAME_MAX } from "@/lib/validations/merchant";

import {
  checkUsernameAvailability,
  completeOnboarding,
  type OnboardingState,
  type UsernameCheck,
} from "./actions";

const INITIAL_STATE: OnboardingState = { status: "idle" };

export function OnboardingForm({
  appUrl,
  defaultFullName,
}: {
  appUrl: string;
  defaultFullName: string;
}) {
  const [state, formAction] = useActionState(completeOnboarding, INITIAL_STATE);

  const [fullName, setFullName] = useState(defaultFullName);
  const [username, setUsername] = useState(() => suggestUsername(defaultFullName));
  // Selama merchant belum menyentuh kolom username, isinya mengikuti nama usaha.
  const [usernameTouched, setUsernameTouched] = useState(false);
  // Hasil disimpan bersama username yang diperiksa, supaya respons yang
  // datang terlambat tidak dipakai untuk username yang sudah berganti.
  const [lastCheck, setLastCheck] = useState<{
    username: string;
    result: UsernameCheck;
  } | null>(null);
  const [checking, startChecking] = useTransition();

  const displayHost = appUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

  useEffect(() => {
    if (!username) return;

    const timer = setTimeout(() => {
      startChecking(async () => {
        const result = await checkUsernameAvailability(username);
        setLastCheck({ username, result });
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [username]);

  const check = lastCheck?.username === username ? lastCheck.result : null;
  const usernameError =
    state.fieldErrors?.username ?? (check?.available === false ? check.reason : undefined);

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <Field data-invalid={Boolean(state.fieldErrors?.full_name)}>
        <FieldLabel htmlFor="full_name">Nama usaha</FieldLabel>
        <Input
          id="full_name"
          name="full_name"
          value={fullName}
          onChange={(event) => {
            const value = event.target.value;
            setFullName(value);
            if (!usernameTouched) setUsername(suggestUsername(value));
          }}
          placeholder="Studio Mawar"
          autoComplete="organization"
          maxLength={80}
          required
          aria-invalid={Boolean(state.fieldErrors?.full_name)}
        />
        <FieldDescription>Nama yang dilihat pelanggan di halaman booking.</FieldDescription>
        {state.fieldErrors?.full_name ? (
          <FieldError>{state.fieldErrors.full_name}</FieldError>
        ) : null}
      </Field>

      <Field data-invalid={Boolean(usernameError)}>
        <FieldLabel htmlFor="username">Alamat halaman booking</FieldLabel>
        <div className="flex items-center gap-0 rounded-md border shadow-xs focus-within:ring-[3px] focus-within:ring-ring/50 has-aria-invalid:border-destructive has-aria-invalid:ring-destructive/20">
          <span className="text-muted-foreground shrink-0 pl-3 text-sm select-none">
            {displayHost}/
          </span>
          <Input
            id="username"
            name="username"
            value={username}
            onChange={(event) => {
              setUsernameTouched(true);
              setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
            }}
            placeholder="studio-mawar"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={USERNAME_MAX}
            required
            aria-invalid={Boolean(usernameError)}
            className="border-0 pl-0.5 shadow-none focus-visible:ring-0"
          />
          <span className="flex w-9 shrink-0 justify-center">
            {checking ? (
              <Spinner className="text-muted-foreground size-4" />
            ) : check?.available ? (
              <Check className="size-4 text-emerald-600" aria-hidden />
            ) : check?.available === false ? (
              <AlertCircle className="text-destructive size-4" aria-hidden />
            ) : null}
          </span>
        </div>
        {usernameError ? (
          <FieldError>{usernameError}</FieldError>
        ) : (
          <FieldDescription>
            3–30 karakter. Huruf kecil, angka, dan tanda hubung. Bisa diubah nanti
            di Pengaturan.
          </FieldDescription>
        )}
      </Field>

      <Field data-invalid={Boolean(state.fieldErrors?.whatsapp_number)}>
        <FieldLabel htmlFor="whatsapp_number">Nomor WhatsApp</FieldLabel>
        <Input
          id="whatsapp_number"
          name="whatsapp_number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0812-3456-7890"
          required
          aria-invalid={Boolean(state.fieldErrors?.whatsapp_number)}
        />
        <FieldDescription>
          Dipakai untuk notifikasi booking masuk. Tidak ditampilkan ke publik.
        </FieldDescription>
        {state.fieldErrors?.whatsapp_number ? (
          <FieldError>{state.fieldErrors.whatsapp_number}</FieldError>
        ) : null}
      </Field>

      {state.status === "error" && !state.fieldErrors ? (
        <p role="alert" className="text-destructive text-sm">
          {state.message}
        </p>
      ) : null}

      <SubmitButton disabled={check?.available === false} />
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending || disabled} className="w-full">
      {pending ? <Spinner /> : null}
      Mulai pakai Booka
      {pending ? null : <ArrowRight />}
    </Button>
  );
}
