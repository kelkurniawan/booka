import Link from "next/link";
import { CalendarOff } from "lucide-react";

import { BookingFaqSection } from "@/components/booking-page/faq-section";
import { BookingPageShell } from "@/components/booking-page/page-shell";
import { BookingProfileHeader } from "@/components/booking-page/profile-header";
import { SocialIcons } from "@/components/booking-page/social-icons";
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
import { publicMediaUrl } from "@/lib/media/url";
import { clipPosterPath } from "@/lib/media/staff-paths";
import { ROUTES } from "@/lib/routes";
import { siteUrl } from "@/lib/site";
import type { ResolvedTheme } from "@/lib/theme/types";
import type {
  Availability,
  Merchant,
  MerchantFaq,
  MerchantLink,
  PublicBanner,
  PublicVoucher,
  Service,
  ServiceMedia,
} from "@/types/database";

import { NO_COURT_VENUE, type CourtVenueData } from "@/lib/booking/court-ui";
import { BookingFlow, type RestaurantInfo } from "./booking-flow";
import { NO_ENTRY, type Entry } from "./entry";
import { PublicLinks } from "./public-links";

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
  restaurant: RestaurantInfo;
  /** Lapangan, denah, dan aturan jam ramai; kosong bila tidak ada layanan sewa. */
  courtVenue?: CourtVenueData;
  banners: PublicBanner[];
  vouchers: PublicVoucher[];
  links?: Pick<MerchantLink, "id" | "label" | "url">[];
  /** Null bila ikon sosial dimatikan merchant. */
  contacts?: { instagram: string | null; tiktok: string | null; whatsapp: string | null } | null;
  /** Masuk dari tautan iklan atau ?kode=; kosong di Storybook. */
  entry?: Entry;
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
  restaurant,
  courtVenue = NO_COURT_VENUE,
  banners,
  vouchers,
  links = [],
  contacts = null,
  entry = NO_ENTRY,
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
        theme={theme}
        socials={contacts ? <SocialIcons name={name} {...contacts} /> : null}
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
            restaurant={restaurant}
            courtVenue={courtVenue}
            banners={banners}
            vouchers={vouchers}
            entry={entry}
            sections={theme.sections}
            faq={<BookingFaqSection faqs={faqs} />}
            links={<PublicLinks links={links} />}
            staff={staff.map((member) => ({
              id: member.id,
              name: member.name,
              role: member.role,
              bio: member.bio,
              tags: member.tags,
              photoUrl: member.photoPath ? publicMediaUrl(member.photoPath) : null,
              motionUrl: member.motionPath ? publicMediaUrl(member.motionPath) : null,
              posterUrl: member.motionPath ? publicMediaUrl(clipPosterPath(member.motionPath)) : null,
              days: [...new Set(member.availability.map((row) => row.day_of_week))],
            }))}
          />
          <DesktopHandoff url={new URL(ROUTES.merchantPage(merchant.username), siteUrl()).toString()} />
        </>
      ) : null}

      {!canAcceptBookings
        ? theme.sections.map((key) =>
            key === "SERVICES" ? (
              <Empty key={key} className="bg-card border">
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
            ) : key === "FAQ" ? (
              <BookingFaqSection key={key} faqs={faqs} />
            ) : key === "LINKS" ? (
              <PublicLinks key={key} links={links} />
            ) : null,
          )
        : null}

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
          className="text-muted-foreground hover:text-foreground bg-card mt-auto self-center rounded-full px-3 py-1 text-xs"
        >
          Dibuat dengan Marky
        </Link>
      ) : null}
    </BookingPageShell>
  );
}
