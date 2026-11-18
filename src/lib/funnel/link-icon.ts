export type LinkIconKey = "instagram" | "tiktok" | "whatsapp" | "maps" | "drive" | "link";

const rules: [LinkIconKey, (host: string, path: string) => boolean][] = [
  ["instagram", (h) => h === "instagram.com" || h.endsWith(".instagram.com")],
  ["tiktok", (h) => h === "tiktok.com" || h.endsWith(".tiktok.com")],
  ["whatsapp", (h) => h === "wa.me" || h === "whatsapp.com" || h.endsWith(".whatsapp.com")],
  [
    "maps",
    (h, p) =>
      h === "maps.app.goo.gl" || h === "maps.google.com" || (h === "goo.gl" && p.startsWith("/maps")) ||
      (/(^|\.)google\.[a-z.]+$/.test(h) && p.startsWith("/maps")),
  ],
  ["drive", (h) => h === "drive.google.com" || h === "docs.google.com"],
];

/** Ikon tautan dipilih dari host; url tak terbaca atau host lain jatuh ke "link". */
export function linkIconFor(url: string): LinkIconKey {
  try {
    const { hostname, pathname } = new URL(url);
    const host = hostname.toLowerCase().replace(/^www\./, "");
    return rules.find(([, match]) => match(host, pathname))?.[0] ?? "link";
  } catch {
    return "link";
  }
}

/** Host untuk teks kecil di bawah label; kosong bila url tak terbaca. */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
