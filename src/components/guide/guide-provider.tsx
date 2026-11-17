"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { markGuideSeen, setChecklistDismissed } from "@/app/dashboard/guide-actions";
import { useIsMobile } from "@/hooks/use-mobile";
import { GUIDE_PAGES } from "@/lib/guide/content";
import { guidePageForPath, tourStepsFor, type TourStep } from "@/lib/guide/guide";
import type { GuidePageKey } from "@/types/database";

import { CoachmarkTour, findTourTarget } from "./coachmark-tour";
import { PageGuidePanel } from "./page-guide-panel";

export type GuideContextValue = {
  page: GuidePageKey | null;
  isSeen: (page: GuidePageKey) => boolean;
  openPanel: () => void;
  startTour: (page: GuidePageKey) => void;
  checklistDismissed: boolean;
};

const GuideContext = React.createContext<GuideContextValue | null>(null);

export function useGuide(): GuideContextValue | null {
  return React.useContext(GuideContext);
}

export function GuideProvider({
  toursSeen,
  checklistDismissed,
  children,
}: {
  toursSeen: GuidePageKey[];
  checklistDismissed: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const page = guidePageForPath(pathname);
  const isMobile = useIsMobile();
  const [seen, setSeen] = React.useState(() => new Set(toursSeen));
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [tour, setTour] = React.useState<{ page: GuidePageKey; steps: TourStep[] } | null>(null);

  const markSeen = React.useCallback((key: GuidePageKey) => {
    setSeen((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    void markGuideSeen(key); // hasil diabaikan: gagal simpan tidak boleh memblokir UI
  }, []);

  const openPanel = React.useCallback(() => {
    if (!page) return;
    setPanelOpen(true);
    markSeen(page);
  }, [page, markSeen]);

  const startTour = React.useCallback(
    (key: GuidePageKey) => {
      setPanelOpen(false);
      // Tunggu satu frame supaya panel tertutup dan targetnya terukur benar.
      requestAnimationFrame(() => {
        const steps = tourStepsFor(
          GUIDE_PAGES[key].tour,
          isMobile ? "mobile" : "desktop",
          (t) => findTourTarget(t) !== null,
        );
        if (steps.length > 0) setTour({ page: key, steps });
      });
    },
    [isMobile],
  );

  const closeTour = () => {
    if (tour) markSeen(tour.page);
    setTour(null);
  };

  const value = React.useMemo<GuideContextValue>(
    () => ({ page, isSeen: (k) => seen.has(k), openPanel, startTour, checklistDismissed }),
    [page, seen, openPanel, startTour, checklistDismissed],
  );

  return (
    <GuideContext.Provider value={value}>
      {children}
      {page ? (
        <PageGuidePanel
          page={page}
          open={panelOpen}
          onOpenChange={setPanelOpen}
          onStartTour={() => startTour(page)}
          checklistDismissed={checklistDismissed}
          onRestoreChecklist={() => setChecklistDismissed(false)}
        />
      ) : null}
      <CoachmarkTour steps={tour?.steps ?? []} open={tour !== null} onClose={closeTour} />
    </GuideContext.Provider>
  );
}
