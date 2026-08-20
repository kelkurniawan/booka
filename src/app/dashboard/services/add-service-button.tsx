"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SubscriptionTier } from "@/types/database";

import { ServiceFormDialog } from "./service-form-dialog";

export function AddServiceButton({
  merchantId,
  tier,
}: {
  merchantId: string;
  tier: SubscriptionTier;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        Tambah layanan
      </Button>
      <ServiceFormDialog
        open={open}
        onOpenChange={setOpen}
        merchantId={merchantId}
        tier={tier}
      />
    </>
  );
}
