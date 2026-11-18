import { ChevronLeft } from "lucide-react";
import type { CourtProfile, VenueAreaView } from "@/types/database";

import { CourtVenueMap } from "@/components/booking-page/court-venue-map";
import { StickyActionBar } from "@/components/booking-page/sticky-action-bar";
import { Button } from "@/components/ui/button";

/** Layar denah (papan L1b): header, denah, dan aksi "Pilih Lapangan X" atau pesan terisi. */
export function CourtVenueScreen({
  subtitle,
  areas,
  markers,
  courts,
  busyCourtIds,
  viewCourtId,
  onView,
  onBack,
  onChoose,
}: {
  subtitle: string | null;
  areas: VenueAreaView[];
  markers: VenueAreaView[];
  courts: CourtProfile[];
  busyCourtIds: string[];
  viewCourtId: string | null;
  onView: (courtId: string) => void;
  onBack: () => void;
  onChoose: (courtId: string) => void;
}) {
  const view = courts.find((c) => c.id === viewCourtId);
  const busy = view ? busyCourtIds.includes(view.id) : false;
  return (
    <>
      <div className="bg-card border-border flex flex-col gap-4 border p-3" style={{ borderRadius: "var(--radius)" }}>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" className="min-h-11 min-w-11 px-0" aria-label="Kembali ke pilihan jadwal" onClick={onBack}>
            <ChevronLeft aria-hidden className="size-5" />
          </Button>
          <div className="flex flex-col">
            <h3 className="text-base font-medium">Denah lapangan</h3>
            {subtitle ? <span className="text-muted-foreground text-xs">{subtitle}</span> : null}
          </div>
        </div>
        <CourtVenueMap
          areas={areas}
          markers={markers}
          courts={courts}
          busyCourtIds={busyCourtIds}
          selectedCourtId={viewCourtId}
          onSelect={onView}
        />
      </div>
      {view && busy ? (
        <p role="status" className="border-border bg-background sticky bottom-0 -mx-4 border-t border-dashed px-4 py-3 text-center text-sm font-medium">
          {view.name} terisi di jam ini. Pilih lapangan lain di denah.
        </p>
      ) : view ? (
        <StickyActionBar summary={view.name} actionLabel={`Pilih ${view.name}`} onAction={() => onChoose(view.id)} />
      ) : null}
    </>
  );
}
