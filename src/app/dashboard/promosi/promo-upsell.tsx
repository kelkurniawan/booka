import Link from "next/link";
import { Megaphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ROUTES } from "@/lib/routes";

/** Ajakan upgrade untuk merchant Starter; dipakai tab Banner dan Voucher. */
export function PromoUpsell() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Megaphone />
        </EmptyMedia>
        <EmptyTitle>Fitur paket Pro</EmptyTitle>
        <EmptyDescription>
          Pasang banner promo dan voucher diskon di halaman booking dengan paket Pro atau Studio.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link href={ROUTES.billing}>Lihat paket</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
