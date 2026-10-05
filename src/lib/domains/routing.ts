/**
 * Keputusan routing untuk request yang datang lewat domain sendiri merchant.
 * Fungsi murni supaya aturannya bisa diuji tanpa proxy sungguhan.
 *
 * Di domain merchant hanya halaman publik merchant itu yang hidup:
 *   /                     -> halaman booking (/{username})
 *   /opengraph-image      -> gambar pratinjau merchant
 *   /pesanan/{token}      -> status pesanan pelanggan (lolos apa adanya)
 *   /{username}           -> dialihkan ke / supaya tautannya satu
 *   selain itu            -> dialihkan ke domain Booka (dashboard, login,
 *                            halaman legal, merchant lain)
 */
export type DomainRoute =
  | { type: "rewrite"; pathname: string }
  | { type: "redirect"; pathname: string; toApp: boolean }
  | { type: "pass" };

export function routeCustomDomain(pathname: string, username: string): DomainRoute {
  if (pathname === "/" || pathname === "") return { type: "rewrite", pathname: `/${username}` };
  if (pathname === "/opengraph-image" || pathname.startsWith("/opengraph-image")) {
    return { type: "rewrite", pathname: `/${username}${pathname}` };
  }
  if (pathname.startsWith("/pesanan/")) return { type: "pass" };
  if (pathname === `/${username}`) return { type: "redirect", pathname: "/", toApp: false };
  if (pathname.startsWith(`/${username}/`)) {
    return { type: "rewrite", pathname };
  }
  return { type: "redirect", pathname, toApp: true };
}

/**
 * Host milik Booka sendiri: domain aplikasi, localhost, dan deployment
 * pratinjau Vercel. Request ke host ini tidak pernah dicari di
 * merchant_domains -- menghemat satu query di hampir semua request.
 */
export function isAppHost(host: string, appUrl: string | undefined): boolean {
  const hostname = host.split(":")[0].toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost")) {
    return true;
  }
  if (hostname.endsWith(".vercel.app")) return true;
  try {
    const app = new URL(appUrl ?? "").hostname.toLowerCase();
    return hostname === app || hostname === `www.${app}`;
  } catch {
    return false;
  }
}
