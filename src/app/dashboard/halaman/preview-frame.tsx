"use client";

import { PromoBanners } from "@/components/booking-page/promo-banners";
import { CTA_BUTTON_CLASS } from "@/components/booking-page/sticky-action-bar";
import { Button } from "@/components/ui/button";
import { BookingFaqSection } from "@/components/booking-page/faq-section";
import { BookingPageShell } from "@/components/booking-page/page-shell";
import { BookingProfileHeader } from "@/components/booking-page/profile-header";
import { ServiceOptionCard } from "@/components/booking-page/service-option-card";
import { paymentLabel, type PaymentSettings } from "@/lib/booking/payment-mode";
import type { ResolvedTheme } from "@/lib/theme/types";
import type { MerchantFaq, PublicBanner, Service, ServiceMedia } from "@/types/database";

/**
 * Preview memakai komponen yang SAMA PERSIS dengan halaman publik, hanya
 * diberi tema berbeda. Itu sebabnya preview tidak bisa berbohong: kalau
 * tampilannya berubah di sini, ia berubah juga di sana.
 *
 * Pemilih jadwal sengaja diganti stand-in mati -- preview tidak boleh
 * menyentuh logika booking sungguhan, apalagi membuat pesanan hantu.
 */
export function AppearancePreview({
  theme,
  name,
  bio,
  avatarUrl,
  services,
  mediaByService,
  faqs,
  showWatermark,
  paymentSettings,
  banners,
}: {
  theme: ResolvedTheme;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  services: Service[];
  mediaByService: Record<string, ServiceMedia[]>;
  faqs: MerchantFaq[];
  showWatermark: boolean;
  paymentSettings: PaymentSettings;
  banners: PublicBanner[];
}) {
  return (
    // transform membuat bingkai ini acuan `fixed` lapisan gerak di shell.
    <div
      className="border-border mx-auto w-full max-w-[360px] overflow-hidden rounded-[2rem] border-[6px] border-neutral-800"
      data-tour="appearance-preview"
      style={{ transform: "translateZ(0)" }}
    >
      <div className="max-h-[620px] overflow-y-auto">
        <BookingPageShell theme={theme} className="min-h-0" innerClassName="min-h-0" preview>
          <BookingProfileHeader name={name} bio={bio} avatarUrl={avatarUrl} theme={theme} />

          {theme.sections.map((key) => {
            if (key === "LINKS") return null;
            if (key === "PROMO")
              return (
                <PromoBanners
                  key={key}
                  banners={banners}
                  voucherCodeById={{}}
                  activeServiceIds={services.map((s) => s.id)}
                  onApplyVoucher={() => {}}
                  onSelectService={() => {}}
                />
              );
            if (key === "FAQ") return <BookingFaqSection key={key} faqs={faqs} />;
            return (
              <div key={key} className="contents">
          {services.length > 0 ? (
            <section className="flex flex-col gap-4">
              <h2 className="text-sm font-medium">
                Layanan
              </h2>
              <div className="flex flex-col gap-3">
                {services.map((service, index) => (
                  <ServiceOptionCard
                    key={service.id}
                    service={service}
                    media={mediaByService[service.id] ?? []}
                    checked={index === 0}
                    onSelect={() => {}}
                    eager={index === 0}
                    paymentLabel={paymentLabel(service, paymentSettings)}
                  />
                ))}
              </div>
              <Button type="button" tabIndex={-1} aria-hidden className={CTA_BUTTON_CLASS}>
                Pilih jadwal
              </Button>
            </section>
          ) : (
            <p className="text-muted-foreground text-center text-sm">
              Belum ada layanan aktif untuk ditampilkan.
            </p>
          )}
              </div>
            );
          })}

          {showWatermark ? (
            <span className="text-muted-foreground mt-auto self-center text-xs">
              Dibuat dengan Marky
            </span>
          ) : null}
        </BookingPageShell>
      </div>
    </div>
  );
}
