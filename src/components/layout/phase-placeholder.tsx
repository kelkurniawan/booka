import { Construction } from "lucide-react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/**
 * Penanda halaman yang rangkanya sudah ada tapi isinya dijadwalkan di fase
 * berikutnya, sesuai PRD bagian 6.
 */
export function PhasePlaceholder({
  phase,
  title,
  scope,
}: {
  phase: string;
  title: string;
  scope: string[];
}) {
  return (
    <Empty className="border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Construction />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>Dijadwalkan pada {phase}.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <ul className="text-muted-foreground mx-auto max-w-sm space-y-1 text-left text-sm">
          {scope.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden>•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </EmptyContent>
    </Empty>
  );
}
