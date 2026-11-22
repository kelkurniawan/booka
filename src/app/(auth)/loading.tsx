import { MarkyLoader } from "@/components/brand/marky-mark";

/** Loading di dalam layout auth (logo dan teks ketentuan tetap di layout). */
export default function Loading() {
  return (
    <div className="flex justify-center py-16">
      <MarkyLoader />
    </div>
  );
}
