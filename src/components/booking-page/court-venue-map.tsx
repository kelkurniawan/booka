import type { CourtProfile, VenueAreaView } from "@/types/database";

import {
  courtShort,
  courtStatus,
  ENVIRONMENT_LABEL,
  venueAria,
  venueLayout,
} from "@/lib/booking/court-ui";
import { publicMediaUrl } from "@/lib/media/url";
import { cn } from "@/lib/utils";

const radius = { borderRadius: "var(--radius)" } as const;

/**
 * Denah tempat, galeri foto, dan profil lapangan terpilih. Papan L1b.
 * `selectedCourtId` hanya lapangan yang sedang dilihat; pilihan sebenarnya
 * dikonfirmasi lewat tombol di luar komponen.
 */
export function CourtVenueMap({
  areas,
  markers,
  courts,
  busyCourtIds,
  selectedCourtId,
  onSelect,
}: {
  areas: VenueAreaView[];
  markers: VenueAreaView[];
  courts: CourtProfile[];
  /** Lapangan terisi di jam terpilih; kosong bila belum ada jam. */
  busyCourtIds: string[];
  selectedCourtId: string | null;
  onSelect: (courtId: string) => void;
}) {
  const layout = venueLayout({ courts, areas, markers });
  const sel = courts.find((c) => c.id === selectedCourtId) ?? courts[0] ?? null;
  // Foto tanpa teks alternatif tidak ditampilkan (aturan spesifikasi).
  const photos = sel ? sel.photos.filter((p) => (p.alt_text ?? "").trim() !== "") : [];
  const selStatus = sel ? courtStatus(sel.id, busyCourtIds, selectedCourtId) : "Kosong";
  const tags = sel ? [ENVIRONMENT_LABEL[sel.environment], ...sel.features] : [];

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="denah-h" className="flex flex-col gap-2">
        <h3 id="denah-h" className="sr-only">Denah tempat</h3>
        <div
          role="radiogroup"
          aria-labelledby="denah-h"
          className="bg-card border-border relative w-full overflow-hidden border"
          style={{ ...radius, aspectRatio: String(layout.aspect) }}
        >
          {layout.items.map((item) => {
            const pos = { left: `${item.left}%`, top: `${item.top}%`, width: `${item.width}%`, height: `${item.height}%` };
            if (item.kind !== "court") {
              return (
                <span
                  key={item.id}
                  aria-hidden
                  className={cn(
                    "text-muted-foreground absolute flex items-start p-1 text-[11px] font-medium",
                    item.kind === "area" ? "border-border border border-dashed" : "bg-muted items-center justify-center",
                  )}
                  style={{ ...pos, borderRadius: "var(--radius)" }}
                >
                  {item.label}
                </span>
              );
            }
            const court = courts.find((c) => c.id === item.id)!;
            const status = courtStatus(court.id, busyCourtIds, selectedCourtId);
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={status === "Dipilih"}
                aria-label={venueAria(court.name, status, court.features[0] ?? ENVIRONMENT_LABEL[court.environment])}
                onClick={() => onSelect(court.id)}
                className={cn(
                  "absolute flex items-center justify-center overflow-hidden p-0 text-xs focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  status === "Dipilih" && "border-primary bg-primary text-primary-foreground border-2",
                  status === "Kosong" && "border-primary bg-card text-primary border-2",
                  status === "Terisi" && "border-muted-foreground bg-muted text-muted-foreground border border-dashed",
                )}
                style={{ ...pos, borderRadius: "var(--radius)" }}
              >
                <span className="flex flex-col items-center gap-0.5">
                  <strong>{courtShort(court.name)}</strong>
                  <span>{status}</span>
                </span>
              </button>
            );
          })}
        </div>
        <ul aria-label="Arti tanda" className="text-muted-foreground flex flex-wrap gap-3.5 text-xs">
          <li className="flex items-center gap-1.5"><span aria-hidden className="bg-primary size-3.5 rounded" />Dipilih</li>
          <li className="flex items-center gap-1.5"><span aria-hidden className="border-primary bg-card size-3.5 rounded border-2" />Kosong</li>
          <li className="flex items-center gap-1.5"><span aria-hidden className="border-muted-foreground bg-muted size-3.5 rounded border border-dashed" />Terisi di jam ini</li>
        </ul>
      </section>

      {sel ? (
        <section aria-labelledby="prof-h" className="flex flex-col gap-3">
          {photos.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <div
                role="region"
                aria-label={`Foto ${sel.name}, geser untuk foto lain`}
                tabIndex={0}
                className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {photos.map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element -- foto merchant dari Storage publik
                  <img
                    key={p.path}
                    src={publicMediaUrl(p.path)}
                    alt={p.alt_text ?? ""}
                    width={p.width}
                    height={p.height}
                    loading="lazy"
                    className="h-48 w-auto max-w-[80%] shrink-0 snap-start object-cover"
                    style={radius}
                  />
                ))}
              </div>
              <span className="text-muted-foreground text-xs">
                {photos.length} foto{photos.length > 1 ? ", geser ke samping" : ""}
              </span>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <h3 id="prof-h" className="text-lg font-medium">{sel.name}</h3>
            <ul aria-label="Ciri lapangan" className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <li key={t} className="bg-muted rounded-full px-2.5 py-1 text-xs font-medium">{t}</li>
              ))}
            </ul>
          </div>
          {sel.description ? <p className="text-sm leading-relaxed">{sel.description}</p> : null}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            {sel.surface ? (
              <>
                <dt className="text-muted-foreground">Permukaan</dt>
                <dd>{sel.surface}</dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">Di jam ini</dt>
            <dd className="font-medium">{selStatus === "Terisi" ? "Terisi" : "Kosong"}</dd>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
