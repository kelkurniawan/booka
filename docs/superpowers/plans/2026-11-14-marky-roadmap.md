# Marky redesign: roadmap rencana

Spec: `docs/superpowers/specs/2026-11-14-marky-redesign-design.md`

Spec ini berisi 11 sub-proyek yang masing-masing bisa dirilis sendiri. Setiap fase mendapat rencana terpisah yang ditulis tepat sebelum fase itu dikerjakan, karena rencana fase berikutnya bergantung pada nama dan bentuk yang dihasilkan fase sebelumnya.

| Fase | Rencana | Status | Bergantung pada | Perlu migration |
|---|---|---|---|---|
| F0 Fondasi (Storybook, rename, kontras) | `2026-11-14-marky-f0-fondasi.md` | Siap dikerjakan | – | Ya (username cadangan) |
| F1 Halaman pelanggan baru | ditulis setelah F0 | – | F0 | Tidak |
| F2 Cara bayar per layanan | ditulis setelah F1 | – | F1 | Ya |
| F3 Dashboard Hari ini + Booking | ditulis setelah F2 | – | F2 | Sedikit (sumber booking) |
| F4 Kelola booking pelanggan + pengingat | ditulis setelah F2 | – | F2 | Ya |
| F5 Promosi: banner + voucher | ditulis setelah F2 | – | F2 | Ya |
| F6 Tampilan lanjutan + latar bergerak | ditulis setelah F1 | – | F1 | Ya |
| F7 Profil staf | ditulis setelah F1 | – | F1 | Ya |
| F8 Restoran: tamu, kapasitas, meja | ditulis setelah F3 | – | F2, F3 | Ya |
| F9 Panduan merchant baru | ditulis setelah F3 | – | F3 | Ya |
| F10 Landing page Marky + SEO | bisa kapan saja setelah F0 | – | F0 | Tidak |

Urutan yang disarankan: F0, F1, F2, F3, lalu F4/F5/F6/F7 dalam urutan mana pun (tidak saling menyentuh tabel yang sama kecuali `merchant_settings`, yang dibuat di F2), lalu F8 dan F9. F10 bisa dikerjakan paralel di sesi lain kapan saja.

Setiap fase dianggap selesai bila:

1. `npm run check` lulus.
2. `npm run docker:test` lulus bila fase itu punya migration, dengan kasus baru di `supabase/tests/99_verify.sql`.
3. Komponen baru punya story di Storybook dan `npm run build-storybook` lulus.
4. Alur utama fase diperiksa di browser pada lebar 390px dan 1280px.
5. `graphify update .` dijalankan setelah kode berubah.
