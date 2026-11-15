import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { requireMerchant } from "@/lib/auth/session";
import { loadPublicStaff } from "@/lib/booking/staff";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

import { ManualBookingForm } from "./manual-booking-form";

export const metadata: Metadata = { title: "Booking manual" };

export default async function NewBookingPage() {
  const { user, merchant } = await requireMerchant();
  const supabase = await createClient();

  const [servicesResult, staff] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, duration_minutes, price")
      .eq("merchant_id", user.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    loadPublicStaff(supabase, user.id, merchant.subscription_tier),
  ]);
  const services = servicesResult.data ?? [];

  return (
    <>
      <PageHeader
        title="Booking manual"
        description="Catat booking dari telepon atau pelanggan yang datang langsung."
      />
      {services.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardList />
            </EmptyMedia>
            <EmptyTitle>Tambahkan layanan dulu</EmptyTitle>
            <EmptyDescription>Booking manual butuh minimal satu layanan aktif.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href={ROUTES.services}>Ke menu Layanan</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ManualBookingForm
          username={merchant.username}
          services={services}
          staff={staff.map((s) => ({ id: s.id, name: s.name }))}
        />
      )}
    </>
  );
}
