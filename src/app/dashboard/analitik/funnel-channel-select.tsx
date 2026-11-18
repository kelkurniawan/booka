"use client";

import { useRouter } from "next/navigation";

/** Pilihan kanal; navigasi lewat query supaya funnel tetap dirender server. */
export function FunnelChannelSelect({
  value,
  options,
  hrefBase,
}: {
  value: string;
  options: readonly string[];
  /** URL tanpa param kanal, sudah berisi param lain. */
  hrefBase: string;
}) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Kanal</span>
      <select
        value={value}
        onChange={(e) =>
          router.push(e.target.value === "ALL" ? hrefBase : `${hrefBase}&kanal=${encodeURIComponent(e.target.value)}`)
        }
        className="border-input bg-background h-9 rounded-md border px-2 text-sm"
      >
        <option value="ALL">Semua kanal</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
