import { MarkyLoader } from "@/components/brand/marky-mark";

/** Loading layar penuh dengan logo Marky (bukan halaman merchant). */
export default function Loading() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <MarkyLoader />
    </div>
  );
}
