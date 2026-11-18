// Logika murni panduan merchant: checklist, rute, penyaringan tur, dan
// penempatan tooltip. Tanpa impor React atau DOM supaya bisa diuji unit.

import { ROUTES } from "@/lib/routes";
import type { GuidePageKey, ManualStepKey } from "@/types/database";

export const GUIDE_PAGE_KEYS: readonly GuidePageKey[] = [
  "today", "bookings", "analytics", "services", "availability", "floor_plan", "staff",
  "payments", "appearance", "promo", "domain", "billing", "settings",
  "links", "ads", "courts",
];

export const MANUAL_STEP_KEYS: readonly ManualStepKey[] = ["PAGE", "SHARE"];

export type ChecklistStepKey = "SERVICE" | "HOURS" | "PAYMENT" | "PAGE" | "SHARE" | "BOOKING";

export const CHECKLIST_ORDER: readonly ChecklistStepKey[] = [
  "SERVICE", "HOURS", "PAYMENT", "PAGE", "SHARE", "BOOKING",
];

export type OnboardingFacts = {
  hasService: boolean;
  hasHours: boolean;
  hasActivePayment: boolean;
  needsOnlinePayment: boolean;
  pageCustomized: boolean;
  hasOnlineBooking: boolean;
};

export type ChecklistItem = { key: ChecklistStepKey; done: boolean; manual: boolean };

/**
 * Aturan enam langkah. Langkah PAYMENT selesai bila ada gateway aktif, atau
 * bila ada layanan dan tidak satu pun butuh bayar online (REQUEST tanpa DP
 * ditagih online setelah disetujui, jadi tidak aman tanpa gateway).
 */
export function buildChecklist(
  facts: OnboardingFacts,
  stepsCompleted: readonly ManualStepKey[],
): ChecklistItem[] {
  const manualDone = (key: ManualStepKey) => stepsCompleted.includes(key);
  const done: Record<ChecklistStepKey, boolean> = {
    SERVICE: facts.hasService,
    HOURS: facts.hasHours,
    PAYMENT: facts.hasActivePayment || (facts.hasService && !facts.needsOnlinePayment),
    PAGE: facts.pageCustomized || manualDone("PAGE"),
    SHARE: facts.hasOnlineBooking || manualDone("SHARE"),
    BOOKING: facts.hasOnlineBooking,
  };
  return CHECKLIST_ORDER.map((key) => ({
    key,
    done: done[key],
    manual: (MANUAL_STEP_KEYS as readonly string[]).includes(key),
  }));
}

// Prefiks rute dashboard per halaman. Hari ini (`/dashboard`) dicocokkan persis.
const PAGE_ROUTES: readonly [GuidePageKey, string][] = [
  ["bookings", ROUTES.bookings],
  ["analytics", ROUTES.analytics],
  ["services", ROUTES.services],
  ["availability", ROUTES.availability],
  ["floor_plan", ROUTES.floorPlan],
  ["staff", ROUTES.staff],
  ["payments", ROUTES.payments],
  ["appearance", ROUTES.appearance],
  ["promo", ROUTES.promoBanners],
  ["domain", ROUTES.domain],
  ["billing", ROUTES.billing],
  ["settings", ROUTES.settings],
  ["links", ROUTES.links],
  ["ads", ROUTES.ads],
  ["courts", ROUTES.courts],
];

export function guidePageForPath(pathname: string): GuidePageKey | null {
  if (pathname === ROUTES.dashboard) return "today";
  const hit = PAGE_ROUTES.find(
    ([, route]) => pathname === route || pathname.startsWith(`${route}/`),
  );
  return hit ? hit[0] : null;
}

export type TourViewport = "desktop" | "mobile";

export type TourTarget =
  | "page-link" | "nav-today" | "nav-bookings" | "new-booking" | "page-guide" | "getting-started"
  | "booking-tabs" | "booking-search" | "analytics-summary" | "service-add" | "service-list"
  | "hours-days" | "dining-capacity" | "dining-editor" | "staff-list" | "payment-providers"
  | "appearance-editor" | "appearance-preview" | "promo-tabs" | "domain-form" | "billing-plans"
  | "settings-profile" | "settings-booking" | "settings-customer" | "settings-reminders" | "settings-account"
  | "links-editor" | "ads-tabs"
  | "court-tabs" | "court-date-nav" | "court-legend" | "court-grid" | "court-add-manual"
  | "court-list" | "court-profile" | "court-photos" | "court-venue" | "nav-courts" | "nav-courts-mobile";

export type TourStep = { target: TourTarget | null; title: string; body: string; viewport?: TourViewport };

export type GuidePoint = { term: string; text: string };

export type GuideVideo = { src: string; captionsSrc: string };

export type GuidePage = {
  title: string;
  summary: string;
  points: GuidePoint[];
  note: string | null;
  video: GuideVideo | null;
  tour: TourStep[];
};

/**
 * Menyaring langkah tur: buang yang viewport-nya berbeda, dan yang targetnya
 * tidak ada di halaman. Langkah tanpa target (null) selalu tetap.
 */
export function tourStepsFor<T extends { target: string | null; viewport?: TourViewport }>(
  steps: readonly T[],
  viewport: TourViewport,
  hasTarget: (target: string) => boolean,
): T[] {
  return steps.filter(
    (step) =>
      (step.viewport === undefined || step.viewport === viewport) &&
      (step.target === null || hasTarget(step.target)),
  );
}

export type Rect = { top: number; left: number; width: number; height: number };

const GAP = 12;
const MARGIN = 16;

const clamp = (x: number, min: number, max: number) => Math.max(min, Math.min(x, max));
const fits = (start: number, size: number, limit: number) =>
  start >= MARGIN && start + size <= limit - MARGIN;

/**
 * Posisi kartu tur: kanan, bawah, atas, lalu kiri target. Sumbu silang dijepit
 * ke dalam layar. Tanpa target, kartu di tengah.
 */
export function placeTip(
  target: Rect | null,
  tip: { width: number; height: number },
  viewport: { width: number; height: number },
): { top: number; left: number } {
  const { width: w, height: h } = tip;
  const maxTop = viewport.height - h - MARGIN;
  const maxLeft = viewport.width - w - MARGIN;

  if (!target) {
    return {
      top: clamp((viewport.height - h) / 2, MARGIN, maxTop),
      left: clamp((viewport.width - w) / 2, MARGIN, maxLeft),
    };
  }

  const t = target;
  const right = t.left + t.width + GAP;
  if (fits(right, w, viewport.width)) {
    return { top: clamp(t.top, MARGIN, maxTop), left: right };
  }
  const below = t.top + t.height + GAP;
  if (fits(below, h, viewport.height)) {
    return { top: below, left: clamp(t.left, MARGIN, maxLeft) };
  }
  const above = t.top - GAP - h;
  if (fits(above, h, viewport.height)) {
    return { top: above, left: clamp(t.left, MARGIN, maxLeft) };
  }
  const left = t.left - GAP - w;
  if (fits(left, w, viewport.width)) {
    return { top: clamp(t.top, MARGIN, maxTop), left };
  }
  // Tidak ada kandidat yang muat: pakai bawah dan jepit kedua sumbu.
  return { top: clamp(below, MARGIN, maxTop), left: clamp(t.left, MARGIN, maxLeft) };
}
