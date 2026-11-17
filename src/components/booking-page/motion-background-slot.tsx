"use client";

import dynamic from "next/dynamic";

// Dimuat malas dan hanya di browser: gerakan tidak perlu ada di HTML server.
export const MotionBackgroundSlot = dynamic(
  () => import("./motion-background").then((m) => m.MotionBackground),
  { ssr: false, loading: () => null },
);
