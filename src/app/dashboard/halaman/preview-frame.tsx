"use client";

import { BookingFaqSection } from "@/components/booking-page/faq-section";
import { BookingPageShell } from "@/components/booking-page/page-shell";
import { BookingProfileHeader } from "@/components/booking-page/profile-header";
import { BookingServiceCard } from "@/components/booking-page/service-card";
import type { ResolvedTheme } from "@/lib/theme/types";
import type { MerchantFaq, Service, ServiceMedia } from "@/types/database";

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
}: {
  theme: ResolvedTheme;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  services: Service[];
  mediaByService: Record<string, ServiceMedia[]>;
  faqs: MerchantFaq[];
  showWatermark: boolean;
}) {
  return (
    <div className="border-border mx-auto w-full max-w-[360px] overflow-hidden rounded-[2rem] border-[6px] border-neutral-800">
      <div className="max-h-[620px] overflow-y-auto">
        <BookingPageShell theme={theme} className="min-h-0" innerClassName="min-h-0">
          <BookingProfileHeader name={name} bio={bio} avatarUrl={avatarUrl} />

          {services.length > 0 ? (
            <section className="flex flex-col gap-4">
              <h2 className="text-muted-foreground font-mono text-[0.7rem] tracking-[0.18em] uppercase">
                Layanan
              </h2>
              <ul className="flex flex-col gap-3">
                {services.map((service, index) => (
                  <BookingServiceCard
                    key={service.id}
                    service={service}
                    media={mediaByService[service.id] ?? []}
                    eager={index === 0}
                  />
                ))}
              </ul>
              <div
                aria-hidden
                className="bg-primary text-primary-foreground py-3 text-center text-sm font-medium"
                style={{ borderRadius: "var(--radius)" }}
              >
                Pilih jadwal
              </div>
            </section>
          ) : (
            <p className="text-muted-foreground text-center text-sm">
              Belum ada layanan aktif untuk ditampilkan.
            </p>
          )}

          <BookingFaqSection faqs={faqs} />

          {showWatermark ? (
            <span className="text-muted-foreground mt-auto self-center text-xs">
              Dibuat dengan Booka
            </span>
          ) : null}
        </BookingPageShell>
      </div>
    </div>
  );
}
