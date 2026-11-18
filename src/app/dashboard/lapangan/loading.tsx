import { Skeleton } from "@/components/ui/skeleton";

/** Keadaan "memuat" papan L3. */
export default function CourtsLoading() {
  return (
    <>
      <p role="status" className="text-muted-foreground py-10 text-center text-sm">
        Memuat jadwal lapangan...
      </p>
      <div aria-hidden="true" className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    </>
  );
}
