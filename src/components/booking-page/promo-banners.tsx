import { isSafeBannerUrl } from "@/lib/promo/banner";
import { publicMediaUrl } from "@/lib/media/url";
import type { BannerColor, PublicBanner } from "@/types/database";

// Warna banner template hanya lewat token tema (Keputusan 17).
const COLORS: Record<
  BannerColor,
  { card: React.CSSProperties; button: React.CSSProperties }
> = {
  ACCENT: {
    card: { background: "var(--primary)", color: "var(--primary-foreground)" },
    button: { background: "var(--primary-foreground)", color: "var(--primary)" },
  },
  DARK: {
    card: { background: "var(--foreground)", color: "var(--background)" },
    button: { background: "var(--background)", color: "var(--foreground)" },
  },
  SOFT: {
    card: {
      background: "var(--card)",
      color: "var(--foreground)",
      border: "1px solid var(--border)",
    },
    button: { background: "var(--primary)", color: "var(--primary-foreground)" },
  },
};

const BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center self-start px-4 text-sm font-medium focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

export function PromoBanners({
  banners,
  voucherCodeById,
  activeServiceIds,
  onApplyVoucher,
  onSelectService,
}: {
  banners: PublicBanner[];
  /** Kode voucher publik per id; tombol VOUCHER hanya tampil bila id-nya ada di sini. */
  voucherCodeById: Record<string, string>;
  activeServiceIds: string[];
  onApplyVoucher: (voucherId: string) => void;
  onSelectService: (serviceId: string) => void;
}) {
  if (banners.length === 0) return null;
  const single = banners.length === 1;

  return (
    <section aria-label="Promo">
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4">
        {banners.map((banner) => {
          const colors = COLORS[banner.color];
          const isImage = banner.source === "IMAGE" && banner.image_path;
          // Banner gambar tidak punya warna kartu: tombolnya memakai warna aksen tema.
          const buttonSurface = isImage
            ? { background: "var(--primary)", color: "var(--primary-foreground)" }
            : colors.button;

          let cta: React.ReactNode = null;
          if (banner.cta_text && banner.target_kind === "VOUCHER") {
            const id = banner.target_voucher_id;
            if (id && voucherCodeById[id]) {
              cta = (
                <button
                  type="button"
                  className={BUTTON_CLASS}
                  style={{ ...buttonSurface, borderRadius: "var(--radius)" }}
                  onClick={() => onApplyVoucher(id)}
                >
                  {banner.cta_text}
                </button>
              );
            }
          } else if (banner.cta_text && banner.target_kind === "SERVICE") {
            const id = banner.target_service_id;
            if (id && activeServiceIds.includes(id)) {
              cta = (
                <button
                  type="button"
                  className={BUTTON_CLASS}
                  style={{ ...buttonSurface, borderRadius: "var(--radius)" }}
                  onClick={() => onSelectService(id)}
                >
                  {banner.cta_text}
                </button>
              );
            }
          } else if (
            banner.cta_text &&
            banner.target_kind === "URL" &&
            banner.target_url &&
            isSafeBannerUrl(banner.target_url)
          ) {
            cta = (
              <a
                href={banner.target_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className={BUTTON_CLASS}
                style={{ ...buttonSurface, borderRadius: "var(--radius)" }}
              >
                {banner.cta_text}
              </a>
            );
          }

          return (
            <li
              key={banner.id}
              className="shrink-0 snap-start"
              style={{ width: single ? "100%" : "85%" }}
            >
              {isImage ? (
                <div className="flex flex-col gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- gambar Storage milik merchant, rasio tetap */}
                  <img
                    src={publicMediaUrl(banner.image_path!)}
                    alt={banner.alt_text ?? ""}
                    loading="lazy"
                    width={1200}
                    height={400}
                    className="aspect-[3/1] w-full object-cover"
                    style={{ borderRadius: "var(--radius)" }}
                  />
                  {cta}
                </div>
              ) : (
                <div
                  className="flex min-h-32 flex-col justify-between gap-2 p-4"
                  style={{ ...colors.card, borderRadius: "var(--radius)" }}
                >
                  <div className="flex flex-col gap-1">
                    {banner.tag_text ? (
                      <p className="text-xs font-medium">{banner.tag_text}</p>
                    ) : null}
                    <p className="text-base font-medium text-balance">{banner.title}</p>
                    {banner.body ? (
                      <p className="text-sm text-pretty opacity-90">{banner.body}</p>
                    ) : null}
                  </div>
                  {cta}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
