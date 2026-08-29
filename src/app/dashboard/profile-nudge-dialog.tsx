"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";

import { saveProfileFromDashboard, type OnboardingState } from "@/app/onboarding/actions";
import { StepKebutuhan } from "@/app/onboarding/steps/step-kebutuhan";
import { StepProfil } from "@/app/onboarding/steps/step-profil";
import { StepUsaha } from "@/app/onboarding/steps/step-usaha";
import type { WizardAnswers } from "@/app/onboarding/wizard-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import type { BusinessCategory, IdProvince, TeamSize } from "@/types/database";

const INITIAL_STATE: OnboardingState = { status: "idle" };

type Screen = "kategori" | "profil" | "kebutuhan";

/**
 * Kartu tawaran + Dialog kuesioner untuk merchant yang belum pernah menjawab
 * atau melewati blok opsional. Render-nya diputuskan `ProfileNudge` (Server
 * Component) berdasarkan ada/tidaknya baris `merchant_profiles`.
 *
 * `StepProfil` dan `StepKebutuhan` dipakai APA ADANYA -- komponen yang persis
 * sama dengan yang dipakai wizard (spec 8.5) -- termasuk tombol "Lewati"/
 * "Simpan" bawaannya yang langsung memanggil skipOptionalProfile/
 * saveOptionalProfile. Itu hanya berfungsi kalau baris `merchant_profiles`
 * sudah ada; untuk merchant yang barisnya belum ada sama sekali, layar
 * "kategori" di bawah membuat barisnya lebih dulu lewat
 * `saveProfileFromDashboard` (upsert) sebelum kedua komponen itu dipasang.
 */
export function ProfileNudgeDialog({ missingProfile }: { missingProfile: boolean }) {
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<Screen>(missingProfile ? "kategori" : "profil");
  const [profilDraft, setProfilDraft] = useState<{
    teamSize: TeamSize | null;
    province: IdProvince | null;
  }>({ teamSize: null, province: null });

  return (
    <Alert>
      <Sparkles aria-hidden />
      <AlertTitle>Kenali usaha Anda lebih dalam</AlertTitle>
      <AlertDescription>
        <p>
          Bantu kami menyesuaikan Booka untuk usaha Anda. Beberapa pertanyaan
          singkat, semuanya opsional.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="mt-2 min-h-11 w-fit">
              Isi sekarang
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Sedikit lagi</DialogTitle>
              <DialogDescription>
                Semuanya boleh dilewati kapan saja.
              </DialogDescription>
            </DialogHeader>

            {screen === "kategori" ? (
              <KategoriStep onSaved={() => setScreen("profil")} />
            ) : null}

            {screen === "profil" ? (
              <StepProfil
                teamSize={profilDraft.teamSize}
                province={profilDraft.province}
                onChange={setProfilDraft}
                onNext={() => setScreen("kebutuhan")}
              />
            ) : null}

            {screen === "kebutuhan" ? (
              <StepKebutuhan
                teamSize={profilDraft.teamSize}
                province={profilDraft.province}
              />
            ) : null}
          </DialogContent>
        </Dialog>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Layar tambahan HANYA untuk merchant yang baris `merchant_profiles`-nya
 * belum ada sama sekali. `business_category` NOT NULL di database, jadi baris
 * ini tidak bisa dibuat tanpa kategori -- bahkan "Lewati" pun butuh baris ini
 * ada lebih dulu (lihat status "missing_profile" di actions.ts).
 *
 * Memakai ulang `StepUsaha` (langkah 1 wizard) apa adanya, termasuk peta
 * ikonnya -- lihat komentar CATEGORY_ICONS di step-usaha.tsx.
 */
function KategoriStep({ onSaved }: { onSaved: () => void }) {
  const [state, formAction] = useActionState(saveProfileFromDashboard, INITIAL_STATE);
  const [category, setCategory] = useState<BusinessCategory | null>(null);
  const [typeSlug, setTypeSlug] = useState<string | null>(null);

  // saveProfileFromDashboard tidak redirect -- ia hanya insert/update baris
  // lalu revalidatePath. onSaved (prop, bukan setState lokal) yang memindah
  // layar, mengikuti pola child-melapor/parent-mengubah-state yang sama
  // dipakai onboarding-form.tsx + wizard.tsx.
  useEffect(() => {
    if (state.status !== "success") return;
    onSaved();
  }, [onSaved, state.status]);

  const answers: WizardAnswers = { category, typeSlug, service: null, hours: null };
  const categoryComplete = category !== null && (category === "LAINNYA" || typeSlug !== null);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm">
        Sebelum lanjut, ceritakan dulu bidang usaha Anda.
      </p>

      <StepUsaha
        answers={answers}
        onSelectCategory={(value) => {
          setCategory(value);
          setTypeSlug(null);
        }}
        onSelectType={setTypeSlug}
      />

      {state.status === "error" ? (
        <p role="alert" className="text-destructive text-sm">
          {state.message}
        </p>
      ) : null}

      <KategoriSubmitButton disabled={!categoryComplete} />
    </form>
  );
}

function KategoriSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" disabled={pending || disabled} className="min-h-11 w-full">
      {pending ? <Spinner /> : null}
      Lanjut
    </Button>
  );
}
