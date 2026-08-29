"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, ArrowRight, Check } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import type { IdentityDraft } from "./identity-draft";
import { answersToPayload } from "./wizard-payload";
import type { WizardAnswers } from "./wizard-state";

const INITIAL_STATE: OnboardingState = { status: "idle" };

export function OnboardingForm({
  answers,
  appUrl,
  defaultFullName,
  defaultUsername = "",
  defaultUsernameTouched,
  defaultWhatsappNumber = "",
  onBackToStep,
  onDraftChange,
  onSuccess,
}: {
  /** Jawaban langkah 1-3, dikirim sebagai satu field JSON `answers`. */
  answers: WizardAnswers;
  appUrl: string;
  defaultFullName: string;
  /** Username yang sudah diketik merchant di halaman depan, kalau ada. */
  defaultUsername?: string;
  /**
   * Apakah username bawaan sudah dianggap pilihan sadar merchant. Dipisah dari
   * `defaultUsername` karena saat form dipasang ulang, username turunan
   * otomatis dan username yang disunting sendiri terlihat sama dari luar --
   * lihat resolveIdentityDefaults di identity-draft.ts.
   */
  defaultUsernameTouched?: boolean;
  /** Nomor WhatsApp yang sudah diketik merchant, kalau ada -- lihat draft di bawah. */
  defaultWhatsappNumber?: string;
  /**
   * Mengembalikan merchant ke langkah `layanan` atau `jam` saat submit akhir
   * gagal di sana (mis. cadangan sessionStorage yang basi/tersunting manual
   * lolos validasi klien tapi ditolak Zod di server). Opsional supaya
   * pemanggil lama tidak wajib menyediakannya.
   */
  onBackToStep?: (step: "layanan" | "jam") => void;
  /**
   * Melaporkan nilai yang sedang diketik ke wizard, dipanggil dari onChange --
   * BUKAN dari efek. Wizard menyimpannya supaya "Kembali" lalu maju lagi tidak
   * membuang ketikan merchant.
   */
  onDraftChange: (draft: IdentityDraft) => void;
  /**
   * Dipanggil sekali saat RPC berhasil, membawa username yang baru dipakai.
   * Wizard-lah yang berpindah ke layar sukses -- aksi sengaja TIDAK redirect.
   */
  onSuccess: (username: string) => void;
}) {
  const [state, formAction] = useActionState(completeOnboarding, INITIAL_STATE);

  const [fullName, setFullName] = useState(defaultFullName);
  const [username, setUsername] = useState(
    () => defaultUsername || suggestUsername(defaultFullName),
  );
  // Sama seperti fullName/username: OnboardingForm dilepas total saat wizard
  // menampilkan StepJam, jadi nomor yang sudah diketik hilang tanpa ini.
  const [whatsappNumber, setWhatsappNumber] = useState(defaultWhatsappNumber);
  // Selama merchant belum menyentuh kolom username, isinya mengikuti nama usaha.
  // Username bawaan dari halaman depan dianggap pilihan sadar, jadi tidak ditimpa.
  const [usernameTouched, setUsernameTouched] = useState(
    defaultUsernameTouched ?? Boolean(defaultUsername),
  );
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

  // Aksi sengaja TIDAK redirect setelah RPC berhasil -- wizard yang berpindah
  // ke layar sukses. `status` hanya bergerak sekali ke "success", dan langkah
  // identitas langsung dilepas begitu wizard berpindah, jadi efek ini praktis
  // hanya sempat jalan satu kali.
  useEffect(() => {
    if (state.status !== "success") return;
    onSuccess(username);
  }, [onSuccess, state.status, username]);

  const check = lastCheck?.username === username ? lastCheck.result : null;
  const usernameError =
    state.fieldErrors?.username ?? (check?.available === false ? check.reason : undefined);

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {/*
        Jawaban langkah 1-3 ikut sebagai satu field JSON. `service.price`
        TETAP string: schema menolak string kosong sebelum coercion, dan
        `Number("")` akan menyelundupkannya masuk sebagai layanan gratis.
      */}
      <input type="hidden" name="answers" value={JSON.stringify(answersToPayload(answers))} />

      <Field data-invalid={Boolean(state.fieldErrors?.full_name)}>
        <FieldLabel htmlFor="full_name">Nama usaha</FieldLabel>
        <Input
          id="full_name"
          name="full_name"
          value={fullName}
          onChange={(event) => {
            const value = event.target.value;
            const usernameBerikutnya = usernameTouched
              ? username
              : suggestUsername(value);
            setFullName(value);
            if (!usernameTouched) setUsername(usernameBerikutnya);
            onDraftChange({
              fullName: value,
              username: usernameBerikutnya,
              usernameTouched,
              whatsappNumber,
            });
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
              const value = event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
              setUsernameTouched(true);
              setUsername(value);
              onDraftChange({
                fullName,
                username: value,
                usernameTouched: true,
                whatsappNumber,
              });
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
          value={whatsappNumber}
          onChange={(event) => {
            const value = event.target.value;
            setWhatsappNumber(value);
            onDraftChange({ fullName, username, usernameTouched, whatsappNumber: value });
          }}
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

      {/*
        service/hours berasal dari langkah 2 dan 3, yang formulir ini tidak
        punya field untuk merendernya. Ini kejadian nyata: cadangan
        sessionStorage yang basi/tersunting manual bisa lolos pemeriksaan
        klien lalu ditolak Zod persis di sini -- lihat FINDING 2 di laporan
        review. Tanpa alert ini merchant hanya melihat "Selesai" berhenti
        tanpa pesan apa pun.
      */}
      {state.fieldErrors?.service ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden />
          <AlertTitle>Layanan perlu diperbaiki</AlertTitle>
          <AlertDescription>
            <p>{state.fieldErrors.service}</p>
            {onBackToStep ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 min-h-11 w-fit"
                onClick={() => onBackToStep("layanan")}
              >
                Perbaiki layanan
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {state.fieldErrors?.hours ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden />
          <AlertTitle>Jam kerja perlu diperbaiki</AlertTitle>
          <AlertDescription>
            <p>{state.fieldErrors.hours}</p>
            {onBackToStep ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 min-h-11 w-fit"
                onClick={() => onBackToStep("jam")}
              >
                Perbaiki jam kerja
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

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
    <Button type="submit" disabled={pending || disabled} className="min-h-11 w-full">
      {pending ? <Spinner /> : null}
      Selesai
      {pending ? null : <ArrowRight />}
    </Button>
  );
}
