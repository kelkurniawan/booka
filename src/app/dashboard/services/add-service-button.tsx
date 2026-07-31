"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { ServiceFormDialog } from "./service-form-dialog";

export function AddServiceButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        Tambah layanan
      </Button>
      <ServiceFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
