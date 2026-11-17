"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { GUIDE_PAGE_KEYS, MANUAL_STEP_KEYS } from "@/lib/guide/guide";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import type { GuidePageKey, ManualStepKey } from "@/types/database";

export type GuideActionResult = { ok: boolean; message?: string };

const FAILED: GuideActionResult = { ok: false, message: "Gagal menyimpan. Coba lagi." };

// Merchant diambil dari auth.uid() di dalam RPC, jadi tidak ada id dari klien.
async function save(
  args: { p_step?: ManualStepKey; p_tour?: GuidePageKey; p_dismissed?: boolean },
): Promise<GuideActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_onboarding_progress", args);
  if (error) {
    console.error("[dashboard/guide] save_onboarding_progress gagal", { error });
    return FAILED;
  }
  return { ok: true };
}

export async function markGuideStep(step: ManualStepKey): Promise<GuideActionResult> {
  const parsed = z.enum(MANUAL_STEP_KEYS as [ManualStepKey, ...ManualStepKey[]]).safeParse(step);
  if (!parsed.success) return FAILED;
  const result = await save({ p_step: parsed.data });
  if (result.ok) revalidatePath(ROUTES.dashboard, "layout");
  return result;
}

export async function markGuideSeen(page: GuidePageKey): Promise<GuideActionResult> {
  const parsed = z.enum(GUIDE_PAGE_KEYS as [GuidePageKey, ...GuidePageKey[]]).safeParse(page);
  if (!parsed.success) return FAILED;
  return save({ p_tour: parsed.data });
}

export async function setChecklistDismissed(dismissed: boolean): Promise<GuideActionResult> {
  const parsed = z.boolean().safeParse(dismissed);
  if (!parsed.success) return FAILED;
  const result = await save({ p_dismissed: parsed.data });
  if (result.ok) revalidatePath(ROUTES.dashboard, "layout");
  return result;
}
