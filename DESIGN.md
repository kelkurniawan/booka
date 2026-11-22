# Marky design direction

Arah visual yang mengikat semua UI Marky. Disusun untuk dibaca agen (antislop R-37, Hallmark pre-flight) dan manusia. Desain sumbernya ada di dua kanvas Claude Design:

- Alur booking, dashboard, pengaturan: https://claude.ai/artifact/RSGQtRjX4RQivoVekkfgeo
- Landing page: https://claude.ai/artifact/LMDhFXG7AvvbmjpCGUhx5a

## Tiga permukaan, tiga aturan

### 1. Dashboard merchant: monokrom, tetap

- Palet shadcn netral yang sudah ada di `src/app/globals.css`. Jangan diwarnai ulang.
- Hitam `#0a0a0a` untuk aksi utama, abu `#71717a` untuk teks sekunder, garis `#e4e4e7`.
- Merah hanya untuk tindakan yang merusak (Batalkan, Hapus).
- Status dibedakan dengan isi (latar hitam vs garis tepi) dan teks, bukan warna saja.
- Halaman pertama adalah "Hari ini": perlu tindakan, agenda, uang yang ditagih di tempat.

### 2. Halaman publik `/[username]`: milik merchant

- Semua warna, huruf, sudut lewat `resolveTheme()` dan `themeToCssVars()`. Tidak ada nilai warna tertulis langsung di `src/components/booking-page/*`.
- Mobile-first: di desktop, kolom yang sama selebar sekitar 440px di tengah. Tidak ada tata letak desktop terpisah.
- Satu aksi utama yang menempel di bawah layar.
- Kontras teks sekunder minimal 4,5:1 (naikkan batas `mutedForeground` di `resolve.ts` dari 3).
- Latar bergerak opsional, nyala/mati di dashboard. Konten selalu di atas kartu solid. Animasi berhenti saat `prefers-reduced-motion`, hemat data, atau tab tersembunyi, dan selalu ada tombol jeda (antislop R-39).

### 3. Landing page: tema Coral (Hallmark)

- Kertas abu hangat, tinta coklat gelap, satu tinta coral hanya untuk cap "Lunas", fokus, dan garis tautan.
- General Sans (self-host), Geist Mono untuk angka dalam kolom.
- Produk diperlihatkan sebagai alat tulis: slip booking, mutasi QRIS, kartu pengingat.
- Satu gerakan saat dimuat, lalu diam.

## Logo

- Simbol "Cap m": cap bersudut membulat, miring 8 derajat, huruf m dilubangi. Kanvas: https://claude.ai/artifact/EcQsGazAHZAP9ULhzKuiMx, spek: `docs/superpowers/specs/2026-11-22-marky-logo-design.md`.
- Satu sumber bentuk: `src/lib/brand/mark.ts`. Komponen: `MarkyMark`, `MarkyLogo`, `MarkyLoader` di `src/components/brand/marky-mark.tsx`. Ikon statis dibuat ulang dengan `npm run brand:icons`.
- Satu warna saja: tinta di landing, `currentColor` di dashboard, kertas di atas latar gelap. Coral tidak untuk favicon atau dashboard. Tanpa gradasi atau glow.
- Tulisan "marky" huruf kecil, General Sans 700, `letter-spacing: -0.05em`.
- Badan halaman merchant (`/[username]`, `/pesanan/[token]`) tidak menampilkan logo Marky. Loader logo hanya untuk loading layar penuh di auth dan onboarding; isi halaman tetap memakai skeleton.

## Larangan untuk semua permukaan

- Tanpa em dash, tanpa eyebrow di atas judul, tanpa label huruf kapital berjarak, tanpa titik tengah sebagai pemisah, tanpa panah menempel di teks tombol.
- Tanpa angka, testimoni, atau logo karangan. Contoh data di desain diberi nama jelas sebagai contoh.
- Setiap daftar data punya keadaan memuat, kosong, dan gagal.
- Target sentuh minimal 44px, fokus selalu terlihat, semua bisa dipakai dengan keyboard.
- Gerakan lebih dari 5 detik wajib punya tombol jeda.
