# Kode error

Satu tabel per kode yang bisa dikembalikan layanan. Pemetaan HTTP dan pesan
pengguna untuk booking ada di `src/lib/booking/errors.ts`; teks mentah
Postgres tidak pernah diteruskan ke klien. Daftar ini dilengkapi bertahap
(Task 12 rencana booking lapangan menuntaskannya).

| Kode | Lapisan | HTTP | Pesan pengguna | Kapan |
| --- | --- | --- | --- | --- |
| BK070 | SQL `create_booking`, `create_manual_booking` | 409 | Lapangan yang dipilih tidak tersedia. Pilih lapangan lain atau Mana saja. | Lapangan yang diminta terisi di rentang itu, nonaktif, tidak terkait layanan, atau milik merchant lain |
| BK071 | SQL `create_booking`, `create_manual_booking` | 422 | Lama main tidak valid untuk layanan ini. | Layanan sewa tanpa lama main, bukan kelipatan unit, di bawah minimum, atau di atas maksimum |
| BK072 | SQL `create_booking`, `create_manual_booking`, `move_booking_slot` (lewat `reschedule_booking_by_merchant`, `reschedule_booking`) | 409 | Semua lapangan penuh untuk lama main ini di tanggal ini. Coba lama main lebih singkat atau pilih tanggal lain. | "Mana saja" tanpa lapangan kosong, atau jadwal ulang ke jam tanpa lapangan terkait yang kosong |
| BK001 | SQL `create_booking` (cabang sewa), `move_booking_slot` (semua jalur jadwal ulang), lewat `court_slot_fits` | 409 | Slot yang dipilih di luar jam kerja merchant, silakan pilih jadwal lain. | Rentang sewa tidak muat dalam satu jendela jam usaha (termasuk lewat tengah malam), atau jam mulai di luar grid unit |
| BK073 | SQL `reschedule_booking` (pelanggan, `POST /api/pesanan/[token]/ubah-jadwal`) | 409 | Jam baru harganya lebih tinggi. Hubungi merchant untuk pindah ke jam ini. | `court_price` di jam baru lebih tinggi dari `service_price`, atau tidak bisa dihitung karena layanan dihapus. Jalur merchant tidak memeriksa ini |
| 23P01 | SQL constraint `bookings_court_no_overlap` | 409 | (sudah ada, sama dengan bentrok slot) | INSERT/UPDATE langsung yang beririsan di lapangan sama; jaring terakhir di belakang kunci merchant |
| 23P01 | SQL `save_court_pricing` | 409 | Aturan jam ramai tumpang tindih di hari yang sama. | Dua aturan beririsan pada layanan dan hari yang sama |
| 22023 | SQL `save_court_pricing`, `save_venue_layout`; API `POST /api/bookings` (`src/lib/booking/errors.ts`) | 422 | Data tidak valid. Periksa isian lalu coba lagi. | Payload bukan array, lebih dari 50 aturan, layanan bukan sewa, nilai melanggar CHECK/NOT NULL, id null atau ganda di denah |
| 42501 | SQL `save_court_pricing`, `save_venue_layout`, `create_manual_booking`, `reschedule_booking_by_merchant`; API `POST /api/bookings` | 403 | Anda tidak punya akses untuk tindakan ini. | Tanpa login, layanan/lapangan/denah milik merchant lain |
| 23514 | API `POST /api/bookings` | 422 | Data tidak valid. Periksa isian lalu coba lagi. | CHECK constraint ditolak saat `create_booking` |
| 23503 | API `POST /api/bookings` | 409 | Lapangan atau layanan yang dipilih tidak cocok. Muat ulang halaman lalu coba lagi. | FK gabungan menolak lapangan atau layanan merchant lain |
| BK054, BK071 | RPC `check_voucher` (`POST /api/vouchers/check`) | 409, 422 | (pesan BK054 dan BK071 di atas) | Pratinjau voucher sewa: total di bawah minimal, atau lama main bukan kelipatan unit |
| duration_required | API `GET /api/slots` (sewa) | 400 | Lama main wajib dipilih untuk layanan sewa lapangan. | `durationMinutes` kosong |
| duration_invalid | API `GET /api/slots` (sewa) | 400 | Lama main tidak valid untuk layanan ini. | `durationMinutes` bukan salah satu `durations` layanan |
| court_service_not_supported | API `GET /api/slots/nearest` | 400 | Layanan sewa lapangan tidak memakai jam terdekat. Pilih tanggal dan lama main. | Layanan sewa memanggil jam terdekat (keputusan 8 spec) |
| court_load_failed | API `GET /api/slots` (sewa) | 500 | Gagal memuat jadwal lapangan. | RPC `get_court_profiles`, `get_court_price_rules`, atau `get_court_availability` gagal; dicatat di log |
| PGRST*, 23505, kode lain | API `POST /api/bookings` | 500 | Gagal membuat booking, silakan coba lagi. | Tidak dikenali; dicatat di log, tanpa teks mentah |
| 23P01, 42501, 22023, 23514, 23503, 23505, P0001 | Server action simpan layanan sewa dan `addCourt` (`src/app/dashboard/services/court-errors.ts`) | (galat form, bukan HTTP) | 23P01 "Aturan jam ramai tumpang tindih di hari yang sama. Ubah jam atau lepas harinya."; 42501 "Anda tidak punya akses untuk tindakan ini."; 22023 "Data sewa tidak valid. Periksa isian lalu coba lagi."; 23514 "Pengaturan sewa tidak valid. Periksa lama main dan jam mulai."; 23503 "Lapangan yang dipilih tidak cocok. Muat ulang halaman lalu coba lagi."; 23505 "Nama lapangan itu sudah dipakai. Pakai nama lain."; P0001 "Paket Starter hanya mengizinkan 1 layanan. ..."; lainnya "Gagal menyimpan layanan sewa. Coba lagi." | RPC `save_court_service` (atomik: kolom sewa, `service_courts`, aturan; memanggil `save_court_pricing`) dan insert `courts`; layanan baru dihapus kembali bila langkah sewa gagal |
