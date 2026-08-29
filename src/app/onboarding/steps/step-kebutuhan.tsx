"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { OptionCard, OptionCardGroup } from "@/components/ui/option-card";
import { OptionCheckCard } from "@/components/ui/option-check-card";
import { Spinner } from "@/components/ui/spinner";
import {
  ACQUISITION_SOURCE_LABELS,
  BOOKING_CHANNEL_LABELS,
  MERCHANT_GOAL_LABELS,
} from "@/lib/business/labels";
import { ROUTES } from "@/lib/routes";
import {
  ACQUISITION_SOURCE_VALUES,
  BOOKING_CHANNEL_VALUES,
  MAX_GOALS,
  MERCHANT_GOAL_VALUES,
} from "@/lib/validations/onboarding";
import type {
  AcquisitionSource,
  BookingChannel,
  IdProvince,
  MerchantGoal,
  TeamSize,
} from "@/types/database";

import { saveOptionalProfile, skipOptionalProfile, type OnboardingState } from "../actions";

const INITIAL_STATE: OnboardingState = { status: "idle" };

/**
 * Bonus B: tiga pertanyaan cepat -- kanal pemesanan saat ini, kendala utama
 * (maks 3), dan sumber tahu Booka. Satu `<form>`, satu `saveOptionalProfile`.
 *
 * `teamSize`/`province` datang dari langkah `profil` sebelumnya dan dikirim
 * lewat field tersembunyi supaya SATU submit menyimpan jawaban kedua layar
 * sekaligus -- merchant yang mengisi profil lalu melewati kebutuhan (atau
 * sebaliknya) tetap kehilangan jawabannya kalau keduanya disimpan terpisah.
 *
 * "Lewati" di sini SENGAJA sama menonjol dengan "Simpan" (spec 5.3: kedua
 * layar bonus punya tombol lewati yang setara dengan tombol lanjut/simpan)
 * dan memanggil `skipOptionalProfile()` yang sama seperti di step-profil.tsx.
 */
export function StepKebutuhan({
  teamSize,
  province,
}: {
  teamSize: TeamSize | null;
  province: IdProvince | null;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(saveOptionalProfile, INITIAL_STATE);

  const [channels, setChannels] = useState<BookingChannel[]>([]);
  const [goals, setGoals] = useState<MerchantGoal[]>([]);
  const [acquisition, setAcquisition] = useState<AcquisitionSource | null>(null);

  const [skipError, setSkipError] = useState<string | null>(null);
  const [skipping, startSkipping] = useTransition();

  // saveOptionalProfile TIDAK redirect sendiri (berbeda dari
  // skipOptionalProfile) -- ia hanya update lalu revalidatePath, supaya
  // pemanggil (di sini, dan nanti dialog dashboard) yang memutuskan ke mana
  // setelah sukses. router.replace, BUKAN setState, jadi aman dipakai di
  // useEffect -- lihat presedennya di oauth-status-toast.tsx.
  useEffect(() => {
    if (state.status !== "success") return;
    router.replace(ROUTES.dashboard);
  }, [router, state.status]);

  function toggleChannel(value: string, checked: boolean) {
    const channel = value as BookingChannel;
    setChannels((sebelumnya) =>
      checked ? [...sebelumnya, channel] : sebelumnya.filter((item) => item !== channel),
    );
  }

  function toggleGoal(value: string, checked: boolean) {
    const goal = value as MerchantGoal;
    setGoals((sebelumnya) =>
      checked ? [...sebelumnya, goal] : sebelumnya.filter((item) => item !== goal),
    );
  }

  function lewati() {
    setSkipError(null);
    startSkipping(async () => {
      const hasil = await skipOptionalProfile();
      setSkipError(hasil.message ?? "Gagal menyimpan. Coba lagi.");
    });
  }

  // Batas dinyatakan lewat menonaktifkan pilihan yang belum tercentang, BUKAN
  // pesan error setelah fakta -- lihat komentar di option-check-card.tsx.
  // current_channels TIDAK butuh logika serupa: jumlah nilai yang ada persis
  // sama dengan MAX_CHANNELS, jadi batasnya tidak pernah tercapai lebih dulu.
  const goalLimitReached = goals.length >= MAX_GOALS;

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <input type="hidden" name="team_size" value={teamSize ?? ""} />
      <input type="hidden" name="province" value={province ?? ""} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Sekarang pelanggan memesan lewat apa?</h2>
        <OptionCardGroup aria-label="Kanal pemesanan saat ini">
          {BOOKING_CHANNEL_VALUES.map((value) => (
            <OptionCheckCard
              key={value}
              name="current_channels"
              value={value}
              checked={channels.includes(value)}
              onToggle={toggleChannel}
              label={BOOKING_CHANNEL_LABELS[value]}
            />
          ))}
        </OptionCardGroup>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">
          Apa yang paling ingin Anda selesaikan? (maksimal {MAX_GOALS})
        </h2>
        <OptionCardGroup aria-label="Kendala utama">
          {MERCHANT_GOAL_VALUES.map((value) => {
            const checked = goals.includes(value);
            return (
              <OptionCheckCard
                key={value}
                name="goals"
                value={value}
                checked={checked}
                onToggle={toggleGoal}
                disabled={!checked && goalLimitReached}
                label={MERCHANT_GOAL_LABELS[value]}
              />
            );
          })}
        </OptionCardGroup>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Tahu Booka dari mana?</h2>
        <OptionCardGroup aria-label="Sumber tahu Booka">
          {ACQUISITION_SOURCE_VALUES.map((value) => (
            <OptionCard
              key={value}
              name="acquisition_source"
              value={value}
              checked={acquisition === value}
              onSelect={() => setAcquisition(value)}
              label={ACQUISITION_SOURCE_LABELS[value]}
            />
          ))}
        </OptionCardGroup>
      </section>

      {state.status === "error" || state.status === "missing_profile" ? (
        <p role="alert" className="text-destructive text-sm">
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <SubmitButton disabled={skipping} />
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={lewati}
            disabled={skipping}
            className="min-h-11 w-full"
          >
            {skipping ? <Spinner /> : null}
            Lewati
          </Button>
        </div>
        {skipError ? (
          <p role="alert" className="text-destructive text-sm">
            {skipError}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="outline"
      size="lg"
      disabled={pending || disabled}
      className="min-h-11 w-full"
    >
      {pending ? <Spinner /> : null}
      Simpan
    </Button>
  );
}
