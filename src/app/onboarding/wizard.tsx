"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";

import { WizardShell } from "@/components/onboarding/wizard-shell";
import { Button } from "@/components/ui/button";
import { typesForCategory } from "@/lib/business/catalog";
import type { BusinessCategory, IdProvince, TeamSize } from "@/types/database";

import { resolveIdentityDefaults, type IdentityDraft } from "./identity-draft";
import { OnboardingForm } from "./onboarding-form";
import { StepJam } from "./steps/step-jam";
import { StepKebutuhan } from "./steps/step-kebutuhan";
import { StepLayanan } from "./steps/step-layanan";
import { StepProfil } from "./steps/step-profil";
import { StepSukses } from "./steps/step-sukses";
import { StepUsaha } from "./steps/step-usaha";
import {
  EMPTY_ANSWERS,
  parseStoredAnswers,
  previousStep,
  requiredStepNumber,
  resolveStep,
  storageKey,
  type WizardAnswers,
  type WizardHoursAnswer,
  type WizardServiceAnswer,
  type WizardStep,
} from "./wizard-state";

/**
 * Langkah setelah garis finis. Ketiganya HANYA dicapai lewat penyimpanan yang
 * berhasil, tidak pernah lewat `?langkah=` -- `isStepUnlocked` mengembalikan
 * false untuk semuanya.
 */
type FinishedStep = Extract<WizardStep, "sukses" | "profil" | "kebutuhan">;

const TITLES: Record<WizardStep, { title: string; description?: string }> = {
  usaha: {
    title: "Usaha Anda bergerak di bidang apa?",
    description: "Dipakai untuk menyiapkan contoh layanan yang sesuai.",
  },
  layanan: {
    title: "Layanan pertama Anda",
    description: "Satu saja cukup untuk mulai. Layanan lain bisa ditambah kapan saja.",
  },
  jam: {
    title: "Kapan Anda melayani?",
    description: "Bisa diatur lebih detail per hari nanti di Ketersediaan.",
  },
  identitas: {
    title: "Tautan booking Anda",
    description:
      "Pelanggan cukup membuka tautan ini untuk memesan jadwal dan membayar DP.",
  },
  sukses: { title: "Selamat, Booka Anda siap" },
  profil: {
    title: "Sedikit lagi",
    description: "Lima pertanyaan singkat, semuanya boleh dilewati.",
  },
  kebutuhan: {
    title: "Sedikit lagi",
    description: "Lima pertanyaan singkat, semuanya boleh dilewati.",
  },
};

/** Ketersediaan cadangan hanya berubah lewat wizard ini sendiri. */
const subscribeNoop = () => () => {};

/**
 * Cache satu slot untuk snapshot sessionStorage.
 *
 * useSyncExternalStore membandingkan hasil getSnapshot dengan Object.is setiap
 * render, jadi mem-parse ulang JSON tiap kali akan mengembalikan objek baru
 * terus-menerus dan membuat React merender tanpa henti. Hasil parse disimpan
 * dan dipakai ulang selama string mentahnya sama.
 */
const cacheCadangan: { key: string | null; raw: string | null; value: WizardAnswers } = {
  key: null,
  raw: null,
  value: EMPTY_ANSWERS,
};

function bacaCadangan(userId: string): WizardAnswers {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(storageKey(userId));
  } catch {
    // Mode privasi bisa melempar saat sessionStorage diakses. Wizard tetap
    // jalan tanpa cadangan.
    raw = null;
  }

  if (cacheCadangan.key === userId && cacheCadangan.raw === raw) {
    return cacheCadangan.value;
  }

  cacheCadangan.key = userId;
  cacheCadangan.raw = raw;
  cacheCadangan.value = parseStoredAnswers(raw);
  return cacheCadangan.value;
}

export function OnboardingWizard({
  userId,
  appUrl,
  defaultFullName,
  defaultUsername,
}: {
  userId: string;
  appUrl: string;
  defaultFullName: string;
  defaultUsername?: string;
}) {
  const searchParams = useSearchParams();
  const requested = searchParams.get("langkah");

  // `null` berarti merchant belum menyentuh apa pun di sesi render ini, jadi
  // yang berlaku adalah cadangan sessionStorage.
  const [dijawab, setDijawab] = useState<WizardAnswers | null>(null);
  const cadangan = useSyncExternalStore(
    subscribeNoop,
    () => bacaCadangan(userId),
    () => EMPTY_ANSWERS,
  );
  const answers = dijawab ?? cadangan;
  /**
   * SUMBER KEBENARAN untuk langkah setelah akun tersimpan.
   *
   * Setelah RPC berhasil, langkah TIDAK BOLEH dihitung ulang lewat
   * `resolveStep`: `isStepUnlocked` mengembalikan false untuk sukses/profil/
   * kebutuhan, jadi `resolveStep("sukses", jawabanLengkap)` akan memundurkan
   * merchant ke form identitas -- lalu ia mengirim ulang dan menabrak username
   * miliknya sendiri. Persis kejadian yang dicegah `previousStep("sukses")
   * === null`.
   */
  const [finished, setFinished] = useState<FinishedStep | null>(null);
  const [username, setUsername] = useState("");

  /**
   * Nama usaha dan username yang sedang diketik. Ditahan di sini karena
   * `OnboardingForm` dilepas sepenuhnya saat merchant menekan "Kembali" --
   * tanpa ini, ketikannya hilang diam-diam di langkah terakhir sebelum kirim.
   *
   * Diisi dari onChange form, BUKAN dari efek: `react-hooks/set-state-in-effect`
   * adalah error di repo ini, dan melaporkan lewat efek juga akan menambah satu
   * render bertingkat per ketukan tanpa alasan.
   */
  const [identitasDraft, setIdentitasDraft] = useState<IdentityDraft | null>(null);
  const identitas = resolveIdentityDefaults(
    { fullName: defaultFullName, username: defaultUsername ?? "" },
    identitasDraft,
  );

  /**
   * Jawaban Bonus A (ukuran tim, provinsi), ditahan di sini supaya Bonus B
   * bisa mengirim keduanya sebagai field tersembunyi dalam satu submit --
   * lihat komentar di step-kebutuhan.tsx.
   */
  const [profilDraft, setProfilDraft] = useState<{
    teamSize: TeamSize | null;
    province: IdProvince | null;
  }>({ teamSize: null, province: null });

  const step: WizardStep = finished ?? resolveStep(requested, answers);

  /** Menulis jawaban di atas apa pun yang sedang berlaku -- state atau cadangan. */
  function setJawaban(ubah: (sebelumnya: WizardAnswers) => WizardAnswers) {
    setDijawab((sebelumnya) => ubah(sebelumnya ?? cadangan));
  }

  const buildQuery = useCallback(
    (to: WizardStep) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("langkah", to);
      return `?${params.toString()}`;
    },
    [searchParams],
  );

  // Ditulis hanya setelah merchant benar-benar menjawab sesuatu. Menulis lebih
  // awal hanya akan menimpa cadangan yang baru saja dipulihkan dengan objek
  // kosong.
  useEffect(() => {
    if (dijawab === null || finished) return;
    try {
      window.sessionStorage.setItem(storageKey(userId), JSON.stringify(dijawab));
    } catch {
      // Kuota penuh atau penyimpanan diblokir -- bukan alasan menghentikan alur.
    }
  }, [dijawab, finished, userId]);

  /**
   * `resolveStep` memundurkan langkah karena prasyaratnya belum terjawab
   * (tautan langsung, atau cadangan yang hilang). URL disamakan lewat
   * replaceState, BUKAN pushState -- kalau tidak, tombol Back memantul
   * kembali ke langkah yang sama dan merchant terjebak.
   */
  useEffect(() => {
    if (finished || requested === null || requested === step) return;
    window.history.replaceState(null, "", buildQuery(step));
  }, [buildQuery, finished, requested, step]);

  /**
   * Setelah garis finis, URL mengikuti state -- bukan sebaliknya. replaceState
   * (bukan pushState) memakan entri riwayat langkah identitas, jadi Back
   * seketika tidak mendarat di form yang sudah terkirim. Efek ini juga jalan
   * lagi setiap popstate, sehingga Back berikutnya mengembalikan URL ke langkah
   * yang sedang tampil alih-alih membiarkan keduanya berbeda.
   */
  useEffect(() => {
    if (!finished || requested === finished) return;
    window.history.replaceState(null, "", buildQuery(finished));
  }, [buildQuery, finished, requested]);

  function goTo(to: WizardStep) {
    window.history.pushState(null, "", buildQuery(to));
  }

  function goBack() {
    const sebelumnya = previousStep(step);
    if (sebelumnya) goTo(sebelumnya);
  }

  function selectCategory(category: BusinessCategory) {
    // typeSlug lama WAJIB dibuang. parseStoredAnswers memulihkan category dan
    // typeSlug secara terpisah, jadi merchant yang mundur lalu berganti bidang
    // usaha bisa mengirim pasangan yang tidak cocok -- dan penolakannya baru
    // muncul di langkah terakhir tanpa petunjuk ke sumber masalahnya.
    setJawaban((sebelumnya) => ({ ...sebelumnya, category, typeSlug: null }));

    // Kategori tanpa sub-kategori (LAINNYA) sudah terjawab penuh di sini.
    if (typesForCategory(category).length === 0) goTo("layanan");
  }

  function selectType(slug: string) {
    setJawaban((sebelumnya) => ({ ...sebelumnya, typeSlug: slug }));
    goTo("layanan");
  }

  function submitService(service: WizardServiceAnswer) {
    setJawaban((sebelumnya) => ({ ...sebelumnya, service }));
    goTo("jam");
  }

  function submitHours(hours: WizardHoursAnswer) {
    setJawaban((sebelumnya) => ({ ...sebelumnya, hours }));
    goTo("identitas");
  }

  function handleSuccess(usernameTersimpan: string) {
    // Jawaban dipindahkan ke state dulu, baru cadangannya dihapus: kalau tidak,
    // snapshot store berubah menjadi kosong sementara `answers` masih
    // menunjuk ke sana.
    setDijawab(answers);
    try {
      window.sessionStorage.removeItem(storageKey(userId));
    } catch {
      // Diabaikan: cadangan sudah tidak dipakai lagi setelah titik ini.
    }
    setUsername(usernameTersimpan);
    setFinished("sukses");
  }

  const { title, description } = TITLES[step];

  return (
    <WizardShell
      progress={requiredStepNumber(step)}
      title={title}
      description={description}
    >
      {step === "usaha" ? (
        <StepUsaha
          answers={answers}
          onSelectCategory={selectCategory}
          onSelectType={selectType}
        />
      ) : null}

      {step === "layanan" ? (
        <StepLayanan answers={answers} onBack={goBack} onDone={submitService} />
      ) : null}

      {step === "jam" ? (
        <StepJam answers={answers} onBack={goBack} onDone={submitHours} />
      ) : null}

      {step === "identitas" ? (
        <div className="flex flex-col gap-6">
          <OnboardingForm
            answers={answers}
            appUrl={appUrl}
            defaultFullName={identitas.fullName}
            defaultUsername={identitas.username}
            defaultUsernameTouched={identitas.usernameTouched}
            onDraftChange={setIdentitasDraft}
            onSuccess={handleSuccess}
          />
          <Button
            type="button"
            variant="ghost"
            onClick={goBack}
            className="min-h-11 self-start"
          >
            Kembali
          </Button>
        </div>
      ) : null}

      {step === "sukses" ? (
        <StepSukses
          appUrl={appUrl}
          username={username}
          onContinue={() => setFinished("profil")}
        />
      ) : null}

      {step === "profil" ? (
        <StepProfil
          teamSize={profilDraft.teamSize}
          province={profilDraft.province}
          onChange={setProfilDraft}
          onNext={() => setFinished("kebutuhan")}
        />
      ) : null}

      {step === "kebutuhan" ? (
        <StepKebutuhan teamSize={profilDraft.teamSize} province={profilDraft.province} />
      ) : null}
    </WizardShell>
  );
}
