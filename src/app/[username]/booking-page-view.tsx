import Link from "next/link";
import { CalendarOff } from "lucide-react";

import { BookingFaqSection } from "@/components/booking-page/faq-section";
import { BookingPageShell } from "@/components/booking-page/page-shell";
import { BookingProfileHeader } from "@/components/booking-page/profile-header";
import { DesktopHandoff } from "@/components/booking-page/desktop-handoff";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { PaymentSettings } from "@/lib/booking/payment-mode";
import type { PublicStaff } from "@/lib/booking/staff";
import { ROUTES } from "@/lib/routes";
import { siteUrl } from "@/lib/site";
import type { ResolvedTheme } from "@/lib/theme/types";
import type {
  Availability,
  Merchant,
  MerchantFaq,
  Service,
  ServiceMedia,
} from "@/types/database";

import { BookingFlow } from "./booking-flow";

export type BookingPageViewProps = {
  merchant: Pick<
    Merchant,
    "id" | "full_name" | "bio" | "avatar_url" | "subscription_tier"
  > & { username: string };
  theme: ResolvedTheme;
  services: Service[];
  mediaByService: Record<string, ServiceMedia[]>;
  availability: Pick<Availability, "day_of_week">[];
  staff: PublicStaff[];
  faqs: MerchantFaq[];
  paymentSettings: PaymentSettings;
};

/**
 * Tampilan murni halaman publik: tanpa akses data, supaya bisa dirender di
 * Storybook dengan fixture. Pemuatan data tetap di page.tsx.
 */
export function BookingPageView({
  merchant,
  theme,
  services,
  mediaByService,
  availability,
  staff,
  faqs,
  paymentSettings,
}: BookingPageViewProps) {
  const name = merchant.full_name ?? merchant.username;
  // Staf dengan jam sendiri membuat halaman bisa menerima pesanan walau jam
  // kerja usaha kosong.
  const canAcceptBookings =
    services.length > 0 &&
    (availability.length > 0 || staff.some((member) => member.availability.length > 0));

  return (
    <BookingPageShell theme={theme}>
      <BookingProfileHeader
        name={name}
        bio={merchant.bio}
        avatarUrl={merchant.avatar_url}
      />

      {canAcceptBookings ? (
        <>
          <BookingFlow
            username={merchant.username}
            merchantName={name}
            services={services}
            mediaByService={mediaByService}
            availability={availability}
            paymentSettings={paymentSettings}
            staff={staff.map((member) => ({
              id: member.id,
              name: member.name,
              days: [...new Set(member.availability.map((row) => row.day_of_week))],
            }))}
          />
          <DesktopHandoff url={new URL(ROUTES.merchantPage(merchant.username), siteUrl()).toString()} />
        </>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarOff />
            </EmptyMedia>
            <EmptyTitle>Belum menerima pesanan</EmptyTitle>
            <EmptyDescription>
              {name} belum mengatur layanan atau jam kerja. Coba kunjungi lagi nanti.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <BookingFaqSection faqs={faqs} />

      {faqs.length > 0 ? (
        <script
          type="application/ld+json"
          // Isinya milik merchant sendiri dan panjangnya sudah dibatasi
          // constraint database. JSON.stringify menutup tanda kutip; kurung
          // sudut di-escape supaya string "</script>" di dalam jawaban tidak
          // bisa menutup tag ini lebih awal.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: faqs.map((faq) => ({
                "@type": "Question",
                name: faq.question,
                acceptedAnswer: { "@type": "Answer", text: faq.answer },
              })),
            }).replace(/</g, "\\u003c"),
          }}
        />
      ) : null}

      {merchant.subscription_tier === "STARTER" ? (
        <Link
          href={ROUTES.home}
          className="text-muted-foreground hover:text-foreground mt-auto self-center text-xs"
        >
          Dibuat dengan Marky
        </Link>
      ) : null}
    </BookingPageShell>
  );
}
