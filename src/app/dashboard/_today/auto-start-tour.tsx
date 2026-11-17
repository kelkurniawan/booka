"use client";

import * as React from "react";

import { useGuide } from "@/components/guide/guide-provider";
import type { GuidePageKey } from "@/types/database";

/** Memulai tur halaman itu sekali saat mount bila belum dilihat. */
export function AutoStartTour({ page }: { page: GuidePageKey }) {
  const guide = useGuide();
  const started = React.useRef(false);
  React.useEffect(() => {
    if (started.current || !guide || guide.isSeen(page)) return;
    started.current = true;
    guide.startTour(page);
  }, [guide, page]);
  return null;
}
