import { Check } from "lucide-react";

import { formatDuration, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Service, ServiceMedia } from "@/types/database";

import { BookingServiceGallery } from "./service-gallery";

/** Galeri sengaja di luar <label> agar kontrol video tidak bersarang di kontrol radio. */
export function ServiceOptionCard({
  service,
  media = [],
  checked,
  onSelect,
  eager = false,
  paymentLabel,
}: {
  service: Service;
  media?: ServiceMedia[];
  checked: boolean;
  onSelect: () => void;
  eager?: boolean;
  paymentLabel: string;
}) {
  return (
    <div
      className={cn(
        "bg-card flex flex-col gap-1 overflow-hidden p-4 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
        checked ? "border-primary border-2" : "border-border border",
      )}
      style={{ borderRadius: "var(--radius)" }}
    >
      <BookingServiceGallery media={media} eager={eager} />
      <label className="relative flex min-h-11 cursor-pointer flex-col gap-1">
        <input
          type="radio"
          name="layanan"
          className="sr-only"
          checked={checked}
          onChange={onSelect}
        />
        <span className="flex items-baseline justify-between gap-3">
          <span className="flex items-center gap-2 font-medium text-balance">
            {checked ? <Check aria-hidden className="size-4 shrink-0" /> : null}
            {service.name}
          </span>
          <span className="shrink-0 text-sm font-medium">{formatRupiah(service.price)}</span>
        </span>
        {service.description ? (
          <span className="text-muted-foreground text-sm text-pretty">{service.description}</span>
        ) : null}
        <span className="text-muted-foreground text-xs">
          {formatDuration(service.duration_minutes)}
        </span>
        <span className="text-xs font-medium">{paymentLabel}</span>
      </label>
    </div>
  );
}
