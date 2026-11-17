"use client";

import { ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { HIDEABLE_SECTIONS, moveSection, SECTION_LABELS, type PageSection } from "@/lib/theme/sections";

export function SectionOrderField({
  order,
  hidden,
  hints,
  onChange,
}: {
  order: PageSection[];
  hidden: PageSection[];
  hints: Record<PageSection, string>;
  onChange: (next: { order: PageSection[]; hidden: PageSection[] }) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {order.map((bagian, index) => {
        const label = SECTION_LABELS[bagian];
        const bisaSembunyi = (HIDEABLE_SECTIONS as readonly string[]).includes(bagian);
        return (
          <li key={bagian} className="border-border flex items-center gap-2 rounded-lg border p-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{label}</p>
              <p className="text-muted-foreground text-xs">{hints[bagian]}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="size-11"
              aria-label={`Naikkan ${label}`}
              disabled={index === 0}
              onClick={() => onChange({ order: moveSection(order, bagian, "up"), hidden })}
            >
              <ChevronUp className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="size-11"
              aria-label={`Turunkan ${label}`}
              disabled={index === order.length - 1}
              onClick={() => onChange({ order: moveSection(order, bagian, "down"), hidden })}
            >
              <ChevronDown className="size-4" />
            </Button>
            <label className="flex min-h-11 items-center gap-2 text-xs">
              Tampil
              <Switch
                aria-label={`Tampilkan ${label}`}
                disabled={!bisaSembunyi}
                checked={!hidden.includes(bagian)}
                onCheckedChange={(tampil) =>
                  onChange({
                    order,
                    hidden: tampil ? hidden.filter((h) => h !== bagian) : [...hidden, bagian],
                  })
                }
              />
            </label>
          </li>
        );
      })}
    </ul>
  );
}
