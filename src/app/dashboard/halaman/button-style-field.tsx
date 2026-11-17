"use client";

import Link from "next/link";
import { Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";
import { buttonContrastMessage } from "@/lib/theme/contrast";
import type { ResolvedTheme } from "@/lib/theme/types";
import type { ButtonStyle } from "@/types/database";

const GAYA: { nilai: ButtonStyle; label: string }[] = [
  { nilai: "FILLED", label: "Penuh" },
  { nilai: "OUTLINE", label: "Garis" },
  { nilai: "SOFT", label: "Lembut" },
];

export function ButtonStyleField({
  value,
  locked,
  theme,
  onChange,
}: {
  value: ButtonStyle;
  locked: boolean;
  theme: ResolvedTheme;
  onChange: (value: ButtonStyle) => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        Gaya tombol
        {locked ? (
          <Link href={ROUTES.billing} className="inline-flex items-center gap-1">
            <Badge variant="secondary" className="gap-1">
              <Lock className="size-3" />
              Pro
            </Badge>
          </Link>
        ) : null}
      </h2>
      <div className="flex gap-2">
        {GAYA.map((gaya) => (
          <Button
            key={gaya.nilai}
            type="button"
            className="min-h-11"
            variant={value === gaya.nilai ? "default" : "outline"}
            aria-pressed={value === gaya.nilai}
            disabled={locked && gaya.nilai !== "FILLED"}
            onClick={() => onChange(gaya.nilai)}
          >
            {gaya.label}
          </Button>
        ))}
      </div>
      <p role="status" className="text-muted-foreground text-xs">
        {buttonContrastMessage(theme).message}
      </p>
    </section>
  );
}
