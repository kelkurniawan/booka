import { Button } from "@/components/ui/button";

/** Kelas aksi utama; warnanya dari gaya tombol tema (Keputusan 9). */
export const CTA_BUTTON_CLASS =
  "min-h-11 shrink-0 px-5 border-2 border-[var(--button-border)] bg-[var(--button-bg)] text-[var(--button-fg)] hover:bg-[var(--button-bg)] hover:opacity-90";

export function StickyActionBar({
  summary,
  actionLabel,
  disabled = false,
  busy = false,
  onAction,
  type = "button",
}: {
  summary: string;
  actionLabel: string;
  disabled?: boolean;
  busy?: boolean;
  onAction?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <div className="bg-background border-border sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t px-4 py-3">
      <p className="min-w-0 truncate text-sm font-medium">{summary}</p>
      <Button
        type={type}
        className={CTA_BUTTON_CLASS}
        disabled={disabled || busy}
        aria-busy={busy}
        onClick={onAction}
      >
        {busy ? "Memproses..." : actionLabel}
      </Button>
    </div>
  );
}
