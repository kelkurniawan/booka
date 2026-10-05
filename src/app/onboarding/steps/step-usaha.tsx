"use client";

import type { ComponentType } from "react";
import {
  Briefcase,
  Camera,
  Car,
  GraduationCap,
  HeartPulse,
  PartyPopper,
  PawPrint,
  Scissors,
  Sparkles,
  Wrench,
} from "lucide-react";

import { OptionCard, OptionCardGroup } from "@/components/ui/option-card";
import { BUSINESS_CATEGORIES, typesForCategory } from "@/lib/business/catalog";
import type { BusinessCategory } from "@/types/database";

import type { WizardAnswers } from "../wizard-state";

/**
 * Peta nama ikon katalog ke komponen lucide-react. Pemetaannya ADA DI SINI,
 * bukan di katalog, supaya `src/lib/business/catalog.ts` tetap modul murni
 * yang bisa diuji `npm run test:unit`.
 *
 * Bertipe Record atas seluruh BusinessCategory: kategori baru di katalog tanpa
 * ikon di sini akan gagal typecheck, bukan hilang diam-diam saat dirender.
 */
const CATEGORY_ICONS: Record<BusinessCategory, ComponentType<{ className?: string }>> = {
  KECANTIKAN: Scissors,
  KESEHATAN: HeartPulse,
  FOTOGRAFI: Camera,
  ACARA: PartyPopper,
  PENDIDIKAN: GraduationCap,
  HEWAN: PawPrint,
  OTOMOTIF: Car,
  SERVIS: Wrench,
  KONSULTASI: Briefcase,
  LAINNYA: Sparkles,
};

/**
 * Langkah 1: bidang usaha lalu jenis usaha, DI LAYAR YANG SAMA.
 *
 * Memilih kategori tidak pernah langsung menyimpan `typeSlug` lama: wizard
 * mengosongkannya lewat `onSelectCategory`. Tanpa itu, merchant yang mundur
 * lalu berganti kategori akan mengirim pasangan kategori/slug yang tidak
 * cocok, dan penolakannya baru muncul di langkah TERAKHIR tanpa petunjuk
 * apa pun ke sumber masalahnya.
 */
export function StepUsaha({
  answers,
  onSelectCategory,
  onSelectType,
}: {
  answers: WizardAnswers;
  onSelectCategory: (category: BusinessCategory) => void;
  onSelectType: (slug: string) => void;
}) {
  const category = answers.category;
  const types = category ? typesForCategory(category) : [];

  return (
    <div className="flex flex-col gap-8">
      <OptionCardGroup aria-label="Bidang usaha">
        {BUSINESS_CATEGORIES.map((entry) => {
          const Icon = CATEGORY_ICONS[entry.id];
          return (
            <OptionCard
              key={entry.id}
              name="business_category"
              value={entry.id}
              checked={category === entry.id}
              onSelect={() => onSelectCategory(entry.id)}
              icon={<Icon className="size-5" />}
              label={entry.label}
            />
          );
        })}
      </OptionCardGroup>

      {types.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Jenis usaha yang paling mendekati</h2>
          <OptionCardGroup aria-label="Jenis usaha">
            {types.map((type) => (
              <OptionCard
                key={type.slug}
                name="business_type_slug"
                value={type.slug}
                checked={answers.typeSlug === type.slug}
                onSelect={() => onSelectType(type.slug)}
                label={type.label}
              />
            ))}
          </OptionCardGroup>
        </section>
      ) : null}
    </div>
  );
}
