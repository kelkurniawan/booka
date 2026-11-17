"use client";

import { useSyncExternalStore } from "react";

import { motionAllowed } from "@/lib/theme/motion";

// Gerbang gerak bersama (latar F6 dan klip staf F7): satu sumber pendeteksian.
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function useSaveData(): boolean {
  const prefersReducedData = useMedia("(prefers-reduced-data: reduce)");
  const connection = useSyncExternalStore(
    (cb) => {
      const c = (navigator as Navigator & { connection?: EventTarget })
        .connection;
      c?.addEventListener("change", cb);
      return () => c?.removeEventListener("change", cb);
    },
    () =>
      (navigator as Navigator & { connection?: { saveData?: boolean } })
        .connection?.saveData === true,
    () => false,
  );
  return prefersReducedData || connection;
}

export function useDocumentHidden(): boolean {
  return useSyncExternalStore(
    (cb) => {
      document.addEventListener("visibilitychange", cb);
      return () => document.removeEventListener("visibilitychange", cb);
    },
    () => document.hidden,
    () => false,
  );
}

const noop = () => () => {};

/** false di server dan render pertama; true bila bukan reduced motion dan bukan hemat data. */
export function useMotionAllowed(): boolean {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)");
  const saveData = useSaveData();
  return mounted && motionAllowed({ reducedMotion, saveData });
}
