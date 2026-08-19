import QRCode from "qrcode";

export type QrisCodeProps = {
  /**
   * Isi `bookings.payment_url`. Dua bentuk yang mungkin, tergantung apa yang
   * dikembalikan provider:
   *
   *   1. Payload QRIS mentah (EMV) -- dirender jadi QR di sini.
   *   2. URL http ke gambar QR milik provider (Midtrans mengembalikan ini
   *      lewat action `generate-qr-code`) -- ditampilkan apa adanya sebagai
   *      gambar.
   *
   * Membedakan keduanya WAJIB: mengubah URL menjadi QR akan menghasilkan kode
   * yang berisi tautan, bukan instruksi pembayaran, dan aplikasi e-wallet
   * pelanggan akan menolaknya.
   */
  payload: string;
};

const ARIA_LABEL = "Kode QR QRIS untuk membayar deposit booking ini";

/** URL gambar QR dari provider, bukan payload EMV yang perlu dirender sendiri. */
function isProviderQrImageUrl(payload: string): boolean {
  return payload.startsWith("https://") || payload.startsWith("http://");
}

/**
 * Merender payload QRIS mentah menjadi SVG -- di server, lewat library
 * `qrcode` (Server Component `async function`, bukan client) supaya nol
 * JavaScript tambahan dikirim ke browser dan tetap tajam di semua kepadatan
 * piksel layar (SVG tanpa `width`/`height` eksplisit dari library ini,
 * skalanya murni ikut CSS container).
 *
 * Error correction level M: cukup toleran kalau kamera pelanggan agak goyang
 * saat memindai, tanpa membuat modul QR terlalu padat untuk payload QRIS
 * yang biasanya panjang. `margin: 4` adalah quiet zone standar spesifikasi
 * QR (4 modul putih di setiap sisi) -- wajib ada supaya pemindai kamera bisa
 * mengunci kode dengan cepat.
 *
 * Kalau render gagal (mis. payload rusak), TIDAK melempar -- itu akan
 * membunuh seluruh halaman /pesanan/[token] padahal sisa informasi booking
 * (jadwal, nominal, dsb) masih berguna ditampilkan. Sebagai gantinya
 * ditampilkan pesan gagal + payload mentah yang bisa disalin manual.
 */
export async function QrisCode({ payload }: QrisCodeProps) {
  // Provider sudah menyiapkan gambarnya sendiri -- tampilkan langsung. Tidak
  // dilewatkan next/image karena host-nya milik provider pembayaran dan bisa
  // berbeda per merchant/environment, jadi tidak bisa didaftarkan sebagai
  // remote pattern yang tetap.
  if (isProviderQrImageUrl(payload)) {
    return (
      <div className="w-full max-w-[320px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={payload} alt={ARIA_LABEL} className="h-auto w-full" />
      </div>
    );
  }

  // JSX-nya SENGAJA dikonstruksi di LUAR try/catch di bawah (react-hooks/
  // error-boundaries) -- JSX tidak langsung dirender saat dibuat, jadi error
  // dari situ tidak akan pernah tertangkap try/catch ini. Blok ini hanya
  // menghasilkan string SVG (atau null kalau gagal), keputusan JSX mana yang
  // dipakai ada di luar.
  let accessibleSvg: string | null = null;
  try {
    const rawSvg = await QRCode.toString(payload, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 4,
      color: { dark: "#000000", light: "#ffffff" },
    });

    // Menyisipkan role/aria-label langsung ke elemen <svg> hasil library
    // (bukan membungkusnya di <div role="img"> lagi) supaya tidak ada dua
    // accessible object yang tumpang tindih untuk gambar yang sama.
    accessibleSvg = rawSvg.replace("<svg ", `<svg role="img" aria-label="${ARIA_LABEL}" `);
  } catch (error) {
    console.error("[qris-code] gagal merender QR", { error });
  }

  if (accessibleSvg === null) {
    return (
      <div
        role="img"
        aria-label="Gagal menampilkan kode QR pembayaran"
        className="border-border flex flex-col gap-2 border border-dashed p-4 text-center"
      >
        <p className="text-sm text-pretty">
          Kode QR gagal ditampilkan. Salin kode QRIS di bawah ini ke aplikasi pembayaranmu secara
          manual.
        </p>
        <code className="bg-muted block overflow-x-auto p-2 text-left text-xs break-all">
          {payload}
        </code>
      </div>
    );
  }

  return (
    <div
      className="w-full max-w-[320px] [&_svg]:h-auto [&_svg]:w-full"
      // Sengaja dangerouslySetInnerHTML -- payload sudah lewat encoder SVG
      // dari library qrcode (bukan string mentah dari input pengguna), dan
      // tidak ada bagian dari `payload` yang disisipkan ke ARIA_LABEL di atas.
      dangerouslySetInnerHTML={{ __html: accessibleSvg }}
    />
  );
}
