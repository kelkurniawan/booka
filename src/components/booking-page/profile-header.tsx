import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { publicMediaUrl } from "@/lib/media/url";
import type { ResolvedTheme } from "@/lib/theme/types";

/**
 * Kepala profil di permukaan solid (kartu), jadi kontras tidak bergantung pada
 * lapisan gerak di belakang halaman. Logo menggantikan foto profil bila ada.
 */
export function BookingProfileHeader({
  name,
  bio,
  avatarUrl,
  theme,
}: {
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  theme: ResolvedTheme;
}) {
  const avatarSrc = theme.logoPath ? publicMediaUrl(theme.logoPath) : avatarUrl;

  return (
    <header
      className="bg-card border-border flex flex-col items-center gap-3 overflow-hidden border pb-5 text-center"
      style={{ borderRadius: "var(--radius)" }}
    >
      {theme.coverPath ? (
        // eslint-disable-next-line @next/next/no-img-element -- sampul diunggah merchant, ukuran tetap lewat aspect-[3/1]
        <img
          src={publicMediaUrl(theme.coverPath)}
          alt=""
          width={1200}
          height={400}
          fetchPriority="high"
          decoding="async"
          className="aspect-[3/1] w-full object-cover"
        />
      ) : null}
      <Avatar
        size="lg"
        className={
          theme.coverPath
            ? "ring-background -mt-10 size-16 ring-4"
            : "mt-5 size-16"
        }
      >
        <AvatarImage src={avatarSrc ?? undefined} alt={name} />
        <AvatarFallback className="text-lg">
          {(name || "?").charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-1 px-4">
        <h1
          className="text-xl font-semibold tracking-tight text-balance"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {name}
        </h1>
        {bio ? <p className="text-muted-foreground text-sm text-pretty">{bio}</p> : null}
      </div>
    </header>
  );
}
