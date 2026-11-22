# Logo Marky: desain singkat

Papan sumber: kanvas Claude Design "Marky Logo",
https://claude.ai/artifact/EcQsGazAHZAP9ULhzKuiMx (salinan lokal di
`docs/design/logo/`). Variasi terpilih: **E Cap m**.

## Maksud

Marky belum punya logo: `src/app/favicon.ico` masih bawaan Next.js, landing
hanya menulis "marky", sidebar dashboard memakai kotak berisi huruf "M".
Pemilik ingin satu logo yang langsung membawa janji Marky: booking cepat,
pembayaran lunas, simpel, terpercaya. Logo dipakai untuk loading, tab
browser, logo website, dan semua tempat lain yang memakai logo.

## Tujuan, bukan tujuan, larangan

- Tujuan: satu simbol (Cap m) dan satu susunan simbol + tulisan "marky"
  yang dipakai seragam di landing, auth, onboarding, dashboard, favicon,
  ikon aplikasi, gambar OG, email ke merchant, dan loading layar penuh.
- Bukan tujuan: halaman milik merchant (`/[username]`, `/pesanan/[token]`)
  tetap tanpa merek Marky di badan halaman; warna dashboard tidak berubah;
  tidak ada ganti nama atau tagline baru.
- Larangan (DESIGN.md, anti-slop): tanpa gradasi, glow, atau detail halus;
  harus terbaca di 16 px; gerakan loading berhenti saat
  `prefers-reduced-motion`.

## Pendekatan yang ditimbang

Enam simbol padat satu warna digambar di kanvas (papan B1 sampai B3):
A m tebal, B Stempel, C Slip lunas, D m centang, E Cap m, F Cincin selesai.
D ditolak karena centang adalah tanda paling umum; F lemah sebagai merek;
B dan C terlalu harfiah dan rinci di 16 px. Pemilik memilih **E**: cap miring
berisi m, menyambung cap "Lunas" yang sudah ada di landing.

## Bentuk (mengikat)

Simbol, `viewBox="0 0 100 100"`, satu warna (`currentColor`):

```svg
<mask id="mk-cap" maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="140">
  <rect x="-20" y="-20" width="140" height="140" fill="#fff"/>
  <path d="M22 79V43a14.5 14.5 0 0 1 29 0v36M51 43a14.5 14.5 0 0 1 29 0v36"
        fill="none" stroke="#000" stroke-width="16"
        transform="translate(50 51) scale(.56) translate(-51 -49.75)"/>
</mask>
<rect x="14" y="14" width="72" height="72" rx="18" fill="currentColor"
      mask="url(#mk-cap)" transform="rotate(-8 50 50)"/>
```

- Tulisan: "marky" huruf kecil, General Sans 700, `letter-spacing: -0.05em`,
  seperti masthead landing sekarang. Simbol setinggi sekitar 1,05 kali tinggi
  huruf, jarak 0,3 kali tinggi simbol.
- Warna: tinta landing `oklch(21% 0.012 38)` di permukaan Coral, `#0a0a0a`
  (atau `currentColor`) di dashboard, kertas `oklch(97% 0.006 55)` di atas
  latar gelap. Coral `oklch(54% 0.165 29)` hanya untuk aksen landing, tidak
  untuk favicon atau dashboard.
- Ikon aplikasi: kotak tinta bersudut 22%, simbol kertas 66% lebar kotak.
- Favicon: simbol tinta tanpa kotak; versi SVG berganti ke warna kertas saat
  `prefers-color-scheme: dark`.

## Tempat pemakaian

| Tempat | Perubahan |
| --- | --- |
| Tab browser | `src/app/icon.svg` (adaptif gelap/terang), `favicon.ico` 16/32/48 dari simbol yang sama |
| Ikon HP | `src/app/apple-icon.png` 180 px; PNG 192 dan 512 untuk manifest |
| Landing | masthead memakai simbol + tulisan |
| Auth (`/masuk`, `/daftar`, `/lupa-password`, `/reset-password`) | logo di atas kartu, tautan ke beranda |
| Onboarding | logo di kepala wizard; loader cap di langkah "menyiapkan halaman" |
| Dashboard | sidebar: kotak "M" diganti simbol di kotak `bg-primary` |
| 404 dan halaman error | logo kecil di atas pesan |
| OG landing (`src/lib/marketing/og.tsx`) | simbol di samping tulisan "marky" |
| OG merchant (`/[username]/opengraph-image.tsx`) | tulisan kaki "marky" diganti simbol kecil + tulisan, warna redup |
| Email ke merchant | PNG logo di kepala email (SVG tidak didukung Gmail); email ke pelanggan tidak berubah |
| Manifest `/pesanan` dan notifikasi push | ikon Marky 192/512 sebagai ikon bawaan |
| Loading layar penuh | komponen `MarkyLoader`: cap ditekan lalu lepas, 1,6 s berulang; statis saat reduced motion; teks "Memuat" untuk pembaca layar. Dipakai di `loading.tsx` grup auth dan onboarding. Dashboard tetap memakai skeleton |

## Diserahkan ke pembangun

- Cara membuat PNG dan ICO (skrip sekali jalan atau `ImageResponse` lewat
  konvensi file Next), asal hasilnya identik dengan bentuk di atas.
- Nama dan letak komponen (usul: `src/components/brand/`), dengan satu
  sumber path SVG yang dipakai komponen, ikon, dan OG.
- Storybook untuk `MarkyMark`, `MarkyLogo`, `MarkyLoader`.
