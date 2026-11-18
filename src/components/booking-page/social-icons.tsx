import { whatsappLink } from "@/lib/booking/dashboard";

const ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

// Jalur ikon dari papan desain FunProfil.
export const ICON_PATHS = {
  instagram: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M17.5 6.5h.01",
  tiktok: "M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5 M14 3c.5 2.5 2.5 4 5 4",
  whatsapp: "M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z",
  maps: "M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z M12 7.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  drive: "M7 3h7l5 5v13H7z M14 3v5h5 M10 13h6 M10 17h6",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
} as const;

export function IconSvg({ name }: { name: keyof typeof ICON_PATHS }) {
  return (
    <svg {...ICON_PROPS}>
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

/** Handle disaring ke karakter aman untuk path URL; kosong berarti ikon tidak tampil. */
const handle = (v: string | null) => (v ?? "").trim().replace(/^@/, "").replace(/[^\w.]/g, "");

/** Ikon sosial di bawah profil; kanal yang kosong tidak dirender. */
export function SocialIcons({
  name,
  instagram,
  tiktok,
  whatsapp,
}: {
  name: string;
  instagram: string | null;
  tiktok: string | null;
  whatsapp: string | null;
}) {
  const ig = handle(instagram);
  const tt = handle(tiktok);
  const items = [
    ig && { key: "instagram", label: "Instagram", href: `https://instagram.com/${ig}` },
    tt && { key: "tiktok", label: "TikTok", href: `https://tiktok.com/@${tt}` },
    whatsapp && whatsapp.replace(/\D/g, "") && { key: "whatsapp", label: "WhatsApp", href: whatsappLink(whatsapp) },
  ].filter((i): i is { key: "instagram" | "tiktok" | "whatsapp"; label: string; href: string } => !!i);
  if (items.length === 0) return null;

  return (
    <ul aria-label="Media sosial" className="flex flex-wrap justify-center gap-2">
      {items.map((i) => (
        <li key={i.key}>
          <a
            href={i.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${i.label} ${name}`}
            className="bg-card border-border text-foreground flex size-11 items-center justify-center rounded-full border"
          >
            <IconSvg name={i.key} />
          </a>
        </li>
      ))}
    </ul>
  );
}
