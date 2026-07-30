"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { BIO_MAX, USERNAME_MAX } from "@/lib/validations/merchant";

import { updateSettings } from "./actions";
import { INITIAL_SETTINGS_FORM_STATE } from "./settings-state";

export function SettingsForm({
  appUrl,
  defaultFullName,
  defaultBio,
  defaultWhatsapp,
  defaultUsername,
}: {
  appUrl: string;
  defaultFullName: string;
  defaultBio: string;
  defaultWhatsapp: string;
  defaultUsername: string;
}) {
  const [state, formAction] = useActionState(updateSettings, INITIAL_SETTINGS_FORM_STATE);

  // Username terkontrol supaya bisa dinormalkan (huruf kecil, tanpa karakter
  // liar) sambil diketik, dan supaya peringatan di bawah selalu menampilkan
  // tautan lama yang benar-benar akan berhenti berfungsi.
  const [username, setUsername] = useState(defaultUsername);

  const displayHost = appUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

  useEffect(() => {
    if (state.status === "success") {
      toast.success("Perubahan tersimpan");
    }
  }, [state]);

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-6" noValidate>
      <Field data-invalid={Boolean(state.fieldErrors?.full_name)}>
        <FieldLabel htmlFor="full_name">Nama usaha</FieldLabel>
        <Input
          id="full_name"
          name="full_name"
          defaultValue={defaultFullName}
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

      <Field data-invalid={Boolean(state.fieldErrors?.bio)}>
        <FieldLabel htmlFor="bio">Bio (opsional)</FieldLabel>
        <Textarea
          id="bio"
          name="bio"
          defaultValue={defaultBio}
          placeholder="Ceritakan singkat tentang usaha Anda"
          maxLength={BIO_MAX}
          aria-invalid={Boolean(state.fieldErrors?.bio)}
        />
        {state.fieldErrors?.bio ? (
          <FieldError>{state.fieldErrors.bio}</FieldError>
        ) : (
          <FieldDescription>
            Tampil di halaman booking publik Anda. Maksimal {BIO_MAX} karakter.
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
          defaultValue={defaultWhatsapp}
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

      <Field data-invalid={Boolean(state.fieldErrors?.username)}>
        <FieldLabel htmlFor="username">Alamat halaman booking</FieldLabel>
        <div className="flex items-center gap-0 rounded-md border shadow-xs focus-within:ring-[3px] focus-within:ring-ring/50 has-aria-invalid:border-destructive has-aria-invalid:ring-destructive/20">
          <span className="text-muted-foreground shrink-0 pl-3 text-sm select-none">
            {displayHost}/
          </span>
          <Input
            id="username"
            name="username"
            value={username}
            onChange={(event) =>
              setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
            }
            placeholder="studio-mawar"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={USERNAME_MAX}
            required
            aria-invalid={Boolean(state.fieldErrors?.username)}
            className="border-0 pl-0.5 shadow-none focus-visible:ring-0"
          />
        </div>
        {state.fieldErrors?.username ? (
          <FieldError>{state.fieldErrors.username}</FieldError>
        ) : (
          <FieldDescription>
            3–30 karakter. Huruf kecil, angka, dan tanda hubung.
          </FieldDescription>
        )}
      </Field>

      {username && username !== defaultUsername ? (
        <Alert variant="destructive">
          <AlertTitle>Tautan lama akan berhenti berfungsi</AlertTitle>
          <AlertDescription>
            Pelanggan yang menyimpan tautan {displayHost}/{defaultUsername} tidak akan bisa
            membuka halaman booking Anda lagi setelah username diganti. Pastikan Anda
            memperbarui tautan yang sudah dibagikan.
          </AlertDescription>
        </Alert>
      ) : null}

      {state.status === "error" && !state.fieldErrors ? (
        <Alert variant="destructive">
          <AlertTitle>Gagal menyimpan</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Spinner /> : null}
      Simpan perubahan
    </Button>
  );
}
