// Header keamanan dipisah dari next.config.ts supaya bisa diuji unit.
/**
 * Header keamanan yang berlaku untuk SELURUH respons.
 *
 * HSTS sudah dipasang Vercel sendiri, jadi tidak diulang di sini.
 *
 * `frame-ancestors 'none'` adalah yang paling penting: tanpa itu, dashboard
 * merchant bisa dibingkai situs lain dan merchant yang sedang login bisa
 * ditipu mengklik tindakan merusak (clickjacking). X-Frame-Options ikut
 * dipasang untuk peramban lama yang belum mengenal frame-ancestors.
 *
 * CSP-nya sengaja TIDAK memasang `script-src` yang ketat. Next.js menyuntikkan
 * skrip inline untuk hidrasi, sehingga kebijakan ketat menuntut nonce per
 * request lewat middleware -- perubahan berisiko yang layak dikerjakan
 * tersendiri, bukan diselipkan. Yang dipasang di sini menutup pembingkaian,
 * pengiriman form ke domain lain, dan pemuatan objek/plugin.
 */
export const SECURITY_HEADERS = [
  {
    key: "Content-Security-Policy",
    value: [
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  // Mencegah peramban menebak-nebak tipe berkas. Relevan untuk bucket
  // merchant-media yang isinya diunggah merchant.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Halaman /pesanan/{token} menaruh token di path URL. Ini memastikan path
  // itu tidak pernah ikut terkirim ke domain lain lewat header Referer,
  // tidak bergantung pada nilai bawaan peramban.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

/**
 * Aturan header. Bila dua aturan cocok dengan kunci yang sama, yang TERAKHIR menang
 * (docs next.config headers), jadi aturan khusus harus ditaruh sesudah yang global.
 *
 * Token pesanan ada di path /pesanan/{token} dan ?e= di terima-kasih; di dua halaman itu
 * tidak ada Referer sama sekali, supaya tidak sampai ke skrip pixel di halaman tujuan.
 */
export const HEADER_RULES = [
  { source: "/:path*", headers: SECURITY_HEADERS },
  { source: "/pesanan/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
  { source: "/:username/terima-kasih", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
];
