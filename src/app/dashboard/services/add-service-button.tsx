"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SubscriptionTier, TableMode } from "@/types/database";

import type { ServicePaymentSettings } from "./payment-mode-field";
import type { CourtFormData } from "./court-data";
import { ServiceFormDialog } from "./service-form-dialog";

export function AddServiceButton({
  merchantId,
  tier,
  settings,
  tableMode,
  courtData,
}: {
  merchantId: string;
  tier: SubscriptionTier;
  settings: ServicePaymentSettings;
  tableMode: TableMode;
  courtData: CourtFormData;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} data-tour="service-add">
        <Plus />
        Tambah layanan
      </Button>
      <ServiceFormDialog
        open={open}
        onOpenChange={setOpen}
        merchantId={merchantId}
        tier={tier}
        settings={settings}
        tableMode={tableMode}
        courtData={courtData}
      />
    </>
  );
}
