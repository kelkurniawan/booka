"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";

import {
  saveProfileFromDashboard,
  skipOptionalProfile,
  type OnboardingState,
} from "@/app/onboarding/actions";
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
 * Component) berdasarkan ada/tidaknya baris `merchant_profiles` DAN
 * business_category-nya -- lihat komentar di profile-nudge.tsx.
 *
 * `missingProfile` bernilai true untuk DUA keadaan: baris belum ada sama
 * sekali (merchant lama dari sebelum kuesioner ada), atau baris sudah ada
 * tapi `business_category`-nya NULL (merchant yang pernah menekan
 * "Nanti saja" lalu kembali lewat "Isi sekarang"). Keduanya sama-sama butuh
 * layar "kategori" di bawah lebih dulu.
 *
 * `StepProfil` dan `StepKebutuhan` dipakai APA ADANYA -- komponen yang persis
 * sama dengan yang dipakai wizard (spec 8.5) -- termasuk tombol "Lewati"/
 * "Simpan" bawaannya yang langsung memanggil skipOptionalProfile/
 * saveOptionalProfile. `saveOptionalProfile` (via "Simpan") mensyaratkan
 * business_category sudah terisi (lihat constraint
 * merchant_profiles_category_required_with_answers); layar "kategori" di
 * bawah memastikan itu lewat `saveProfileFromDashboard` (upsert) sebelum
 * kedua komponen itu dipasang.
 */
export function ProfileNudgeDialog({ missingProfile }: { missingProfile: boolean }) {
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<Screen>(missingProfile ? "kategori" : "profil");
  const [profilDraft, setProfilDraft] = useState<{
    teamSize: TeamSize | null;
    province: IdProvince | null;
  }>({ teamSize: null, province: null });
  const [skipping, startSkip] = useTransition();
  const [skipError, setSkipError] = useState<string | null>(null);

  /**
   * "Nanti saja" -- tanpa ini kartu tampil selamanya untuk merchant yang tidak
   * mau menjawab (lihat FINDING 4 di laporan review). `skipOptionalProfile`
   * dipanggil sebagai fungsi biasa, BUKAN lewat useActionState: ia tidak
   * menerima argumen dan redirect ke dashboard sendiri saat berhasil (lihat
   * actions.ts), yang di sini efeknya cuma me-refresh halaman yang sama --
   * ProfileNudge (Server Component) query ulang lalu tidak lagi merender
   * kartu ini karena optional_skipped_at sudah terisi.
   *
   * `skipOptionalProfile` sendiri sudah upsert (lihat actions.ts), jadi di
   * sini TIDAK perlu lagi membuat baris `merchant_profiles` lebih dulu untuk
   * merchant yang belum punya baris (`missingProfile`) -- business_category
   * nullable sejak migration 20260830171027_nullable_business_category.sql,
   * dan dismissal SENGAJA dicatat dengan kategori NULL, bukan sentinel
   * apa pun. Merchant tetap bisa mengisi kategori sungguhannya lewat
   * "Isi sekarang" kapan saja.
   */
  function handleNantiSaja() {
    setSkipError(null);
    startSkip(async () => {
      const result = await skipOptionalProfile();
      // Jalur sukses berakhir lewat redirect() di dalam action, jadi baris di
      // bawah ini hanya tercapai kalau upsert-nya gagal.
      if (result.status !== "success") {
        setSkipError(result.message ?? "Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <Alert>
      <Sparkles aria-hidden />
      <AlertTitle>Kenali usaha Anda lebih dalam</AlertTitle>
      <AlertDescription>
        <p>
          Bantu kami menyesuaikan Booka untuk usaha Anda. Beberapa pertanyaan
          singkat, semuanya opsional.
        </p>
        {skipError ? (
          <p role="alert" className="text-destructive text-sm">
            {skipError}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="min-h-11 w-fit">
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 w-fit"
            disabled={skipping}
            onClick={handleNantiSaja}
          >
            {skipping ? <Spinner /> : null}
            Nanti saja
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Layar tambahan untuk merchant yang belum punya `business_category`
 * tersimpan -- baik baris `merchant_profiles`-nya belum ada sama sekali,
 * maupun sudah ada tapi kategorinya NULL (bekas dismissal via "Nanti saja").
 * `saveOptionalProfile` (dipanggil tombol "Simpan" di StepKebutuhan)
 * mensyaratkan business_category sudah terisi -- lihat constraint
 * merchant_profiles_category_required_with_answers di migration
 * 20260830171027_nullable_business_category.sql -- jadi layar ini WAJIB
 * mengisinya lebih dulu lewat `saveProfileFromDashboard` sebelum StepProfil/
 * StepKebutuhan dipasang.
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
