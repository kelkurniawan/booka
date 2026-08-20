import { formatDuration, formatRupiah } from "@/lib/format";
import type { Service } from "@/types/database";

export function BookingServiceCard({ service }: { service: Service }) {
  return (
    <li className="border-border flex flex-col gap-1 border p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium text-balance">{service.name}</span>
        <span className="shrink-0 text-sm font-medium">{formatRupiah(service.price)}</span>
      </div>
      {service.description ? (
        <p className="text-muted-foreground text-sm text-pretty">{service.description}</p>
      ) : null}
      <span className="text-muted-foreground text-xs">
        {formatDuration(service.duration_minutes)}
      </span>
    </li>
  );
}
