import { REQUIRED_STEP_COUNT } from "@/app/onboarding/wizard-state";

/**
 * Progres HANYA menghitung langkah wajib. `current` null berarti merchant sudah
 * melewati garis finis (layar sukses / blok opsional) dan barnya penuh.
 */
export function WizardProgress({ current }: { current: number | null }) {
  const selesai = current ?? REQUIRED_STEP_COUNT;
  const persen = Math.round((selesai / REQUIRED_STEP_COUNT) * 100);

  return (
    <div className="flex flex-col gap-2">
      <div
        className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={REQUIRED_STEP_COUNT}
        aria-valuenow={selesai}
        aria-label="Kemajuan pengaturan awal"
      >
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${persen}%` }}
        />
      </div>
      {current === null ? null : (
        <p className="text-muted-foreground text-xs">
          Langkah {current} dari {REQUIRED_STEP_COUNT}
        </p>
      )}
    </div>
  );
}
