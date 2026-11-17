"use client";

import { Check, RotateCcw, Users } from "lucide-react";
import { useEffect, useRef } from "react";

import { nearestSlotText } from "@/lib/booking/schedule";
import { ANY_STAFF_KEY, type NearestSlot } from "@/lib/booking/slots";
import { cn } from "@/lib/utils";

import { useDocumentHidden, useMotionAllowed } from "./use-motion-allowed";

export type StaffOption = {
  id: string;
  name: string;
  role: string | null;
  bio: string | null;
  tags: string[];
  photoUrl: string | null;
  motionUrl: string | null;
  posterUrl: string | null;
};

export type NearestState = "loading" | "error" | Record<string, NearestSlot | null>;

type Props = {
  staff: StaffOption[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  nearest: NearestState;
  todayISO: string;
  /** Paksa poster; untuk story dan pratinjau, perilakunya sama dengan reduced motion. */
  forceStatic?: boolean;
};

function nearestLine(nearest: NearestState, key: string, todayISO: string): string | null {
  if (nearest === "loading") return "Mencari jam kosong";
  if (nearest === "error" || !(key in nearest)) return null;
  return nearestSlotText(nearest[key], todayISO);
}

export function StaffPicker({ staff, selectedId, onSelect, nearest, todayISO, forceStatic }: Props) {
  const selected = staff.find((member) => member.id === selectedId) ?? null;
  const cards = [
    { id: null, key: ANY_STAFF_KEY, name: "Siapa saja", role: "Paling cepat", photoUrl: null },
    ...staff.map((member) => ({ ...member, key: member.id })),
  ];

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">Dengan siapa?</h2>
      <div
        role="radiogroup"
        aria-label="Dengan siapa?"
        className="-mx-4 flex scroll-px-4 snap-x gap-2 overflow-x-auto px-4 py-1"
      >
        {cards.map((card) => {
          const checked = card.id === selectedId;
          const line = nearestLine(nearest, card.key, todayISO);
          const label = [card.name, card.role, line ? `kosong paling cepat ${line}` : null]
            .filter(Boolean)
            .join(", ");
          return (
            <label
              key={card.key}
              className={cn(
                "bg-card relative flex min-h-11 w-28 shrink-0 cursor-pointer snap-start flex-col items-center gap-1 p-3 text-center has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                checked ? "border-primary border-2" : "border-border border",
              )}
              style={{ borderRadius: "var(--radius)" }}
            >
              <input
                type="radio"
                name="staf"
                className="sr-only"
                aria-label={label}
                checked={checked}
                onChange={() => onSelect(card.id)}
              />
              {checked ? <Check aria-hidden className="text-primary absolute right-1.5 top-1.5 size-3" /> : null}
              <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center overflow-hidden rounded-full text-base font-medium">
                {card.id === null ? (
                  <Users aria-hidden className="size-5" />
                ) : card.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card.photoUrl} alt="" width={48} height={48} loading="lazy" className="size-full object-cover" />
                ) : (
                  card.name.charAt(0).toUpperCase()
                )}
              </span>
              <span className="w-full truncate text-sm font-medium">{card.name}</span>
              {card.role ? <span className="text-muted-foreground w-full truncate text-xs">{card.role}</span> : null}
              {line ? <span className="text-xs">{line}</span> : null}
            </label>
          );
        })}
      </div>
      {selected ? <StaffProfileCard member={selected} forceStatic={forceStatic} /> : null}
    </div>
  );
}

export function StaffProfileCard({ member, forceStatic }: { member: StaffOption; forceStatic?: boolean }) {
  const motionAllowed = useMotionAllowed();
  const hidden = useDocumentHidden();
  const videoRef = useRef<HTMLVideoElement>(null);
  const playMotion = motionAllowed && !forceStatic && Boolean(member.motionUrl);

  // Klip diputar sekali (maks 5 detik); tab tersembunyi menjeda.
  useEffect(() => {
    if (hidden) videoRef.current?.pause();
  }, [hidden]);

  if (!member.bio && member.tags.length === 0 && !member.motionUrl) return null;

  function replay() {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    void video.play().catch(() => {});
  }

  return (
    <div
      aria-live="polite"
      className="bg-card border-border flex gap-3 border p-3"
      style={{ borderRadius: "var(--radius)" }}
    >
      {member.motionUrl ? (
        <div className="relative shrink-0">
          {playMotion ? (
            <>
              <video
                ref={videoRef}
                src={member.motionUrl}
                poster={member.posterUrl ?? undefined}
                muted
                autoPlay
                playsInline
                preload="metadata"
                disablePictureInPicture
                aria-hidden="true"
                width={72}
                height={96}
                className="h-24 w-[72px] object-cover"
                style={{ borderRadius: "var(--radius)" }}
              />
              <button
                type="button"
                aria-label="Putar lagi klip"
                onClick={replay}
                className="border-border bg-card/85 text-foreground absolute bottom-0 right-0 flex size-11 items-center justify-center rounded-full border outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <RotateCcw aria-hidden className="size-4" />
              </button>
            </>
          ) : member.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={member.posterUrl}
              alt=""
              width={72}
              height={96}
              className="h-24 w-[72px] object-cover"
              style={{ borderRadius: "var(--radius)" }}
            />
          ) : null}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-medium">{member.role ? `${member.name}, ${member.role}` : member.name}</p>
        {member.bio ? <p className="text-muted-foreground text-sm">{member.bio}</p> : null}
        {member.tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1">
            {member.tags.map((tag) => (
              <li key={tag} className="bg-muted rounded-full px-2 py-0.5 text-xs">
                {tag}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
