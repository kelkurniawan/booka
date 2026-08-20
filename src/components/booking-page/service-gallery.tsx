import { publicMediaUrl } from "@/lib/media/url";
import type { ServiceMedia } from "@/types/database";

/**
 * Strip gulir horizontal ber-scroll-snap. Video, kalau ada, selalu slide
 * pertama.
 *
 * `preload="none"` disengaja dan penting: tanpa itu, tiap kunjungan halaman
 * mengunduh sebagian berkas video meski tidak ada yang menontonnya, dan biaya
 * bandwidth-nya ditanggung platform. Dengan poster + preload none, nol byte
 * video terunduh sampai pelanggan menekan play.
 */
export function BookingServiceGallery({
  media,
  eager = false,
}: {
  media: ServiceMedia[];
  eager?: boolean;
}) {
  if (media.length === 0) return null;

  const urut = [...media].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "VIDEO" ? -1 : 1;
    return a.sort_order - b.sort_order;
  });

  return (
    <ul className="-mx-4 -mt-4 mb-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pt-4">
      {urut.map((item, index) => (
        <li
          key={item.id}
          className="border-border aspect-[4/3] w-4/5 shrink-0 snap-start overflow-hidden border"
          style={{ borderRadius: "var(--radius)" }}
        >
          {item.kind === "VIDEO" && item.poster_path ? (
            <video
              className="size-full object-cover"
              controls
              preload="none"
              playsInline
              poster={publicMediaUrl(item.poster_path)}
              width={item.width}
              height={item.height}
            >
              <source src={publicMediaUrl(item.path)} />
            </video>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element -- berkas sudah
               dikompres ke WebP berukuran tetap di browser sebelum diunggah,
               jadi next/image hanya akan menambah tagihan transformasi. */
            <img
              className="size-full object-cover"
              src={publicMediaUrl(item.path)}
              alt={item.alt ?? ""}
              width={item.width}
              height={item.height}
              loading={eager && index === 0 ? "eager" : "lazy"}
              decoding="async"
            />
          )}
        </li>
      ))}
    </ul>
  );
}
