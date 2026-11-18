# Desain Marky (salinan lokal kanvas Claude Design)

Folder ini salinan sumber dua kanvas Claude Design, supaya desain tetap bisa
dibaca dan dipakai dari akun atau mesin lain tanpa akses ke kanvasnya.

| Folder | Kanvas asli | Isi |
| --- | --- | --- |
| `booking-flow/` | https://claude.ai/artifact/RSGQtRjX4RQivoVekkfgeo | Alur booking pelanggan, restoran, dashboard, promosi, latar bergerak, panduan, sewa lapangan (L1 sampai L6), funnel iklan (F1 sampai F6) |
| `landing/` | https://claude.ai/artifact/LMDhFXG7AvvbmjpCGUhx5a | Landing page Marky |

## Cara membaca

- `canvas.json` adalah indeks: setiap papan punya judul (`title`), posisi, dan
  ukuran. Judul papan diawali kode baris, misalnya `L3` atau `F4`.
- Setiap `*.dc.html` adalah satu papan: HTML biasa plus blok
  `<script type="text/x-dc">` yang berisi data contoh dan logika interaksi.
  Nilai warna, ukuran, teks, dan keadaan (memuat, kosong, gagal) dibaca dari
  sini saat membangun.
- Berkas ini tidak bisa dibuka langsung di browser, karena butuh `support.js`
  dari Claude Design. Untuk melihat hasilnya, buka kanvas asli.

## Aturan

- Kanvas asli tetap sumber utama. Setelah papan diubah di kanvas, salin ulang
  ke folder ini (Artifact `read` dengan `paths`) dan commit.
- Semua nama, harga, dan angka di papan adalah data contoh.
- Arah visual dan larangan (tanpa em dash, tanpa titik tengah sebagai
  pemisah, keadaan memuat/kosong/gagal wajib, target sentuh 44px) ada di
  `DESIGN.md` di akar repo.

## Spesifikasi yang memakai papan ini

- Sewa lapangan: `docs/superpowers/specs/2026-11-18-court-booking-design.md`
- Funnel iklan: `docs/superpowers/specs/2026-11-18-ads-funnel-design.md`
