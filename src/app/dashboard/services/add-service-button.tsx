"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SubscriptionTier } from "@/types/database";

import type { ServicePaymentSettings } from "./payment-mode-field";
import { ServiceFormDialog } from "./service-form-dialog";

export function AddServiceButton({
  merchantId,
  tier,
  settings,
}: {
  merchantId: string;
  tier: SubscriptionTier;
  settings: ServicePaymentSettings;
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
        settings={settings}
      />
    </>
  );
}
