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
| BK001 | SQL `create_booking` (cabang sewa), `move_booking_slot` | 422 | (sudah ada) | Rentang sewa tidak muat dalam satu jendela jam usaha, atau jam mulai di luar grid unit |
| 23P01 | SQL constraint `bookings_court_no_overlap` | 409 | (sudah ada, sama dengan bentrok slot) | INSERT/UPDATE langsung yang beririsan di lapangan sama; jaring terakhir di belakang kunci merchant |
| 23P01 | SQL `save_court_pricing` | 409 | Aturan jam ramai tumpang tindih di hari yang sama. | Dua aturan beririsan pada layanan dan hari yang sama |
| 22023 | SQL `save_court_pricing`, `save_venue_layout` | 422 | Data tidak valid. | Payload bukan array, lebih dari 50 aturan, layanan bukan sewa, nilai melanggar CHECK/NOT NULL, id null atau ganda di denah |
| 42501 | SQL `save_court_pricing`, `save_venue_layout`, `create_manual_booking`, `reschedule_booking_by_merchant` | 403 | Anda tidak punya akses. | Tanpa login, layanan/lapangan/denah milik merchant lain |
