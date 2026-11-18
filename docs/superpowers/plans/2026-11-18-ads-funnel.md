# Funnel Iklan dan Link-in-bio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Halaman booking Marky siap dipasang di bio dan iklan: tautan iklan per kanal dengan QR, asal pengunjung di setiap booking, funnel kunjungan per kanal, pixel Meta/TikTok/GA4 lewat ID, dan link-in-bio.

**Architecture:** Lima tabel/kolom baru di Postgres (RLS per merchant, anon hanya lewat RPC definer atau grant kolom), satu route `POST /api/events` untuk kejadian browser, kejadian `BOOKED`/`PAID` ditulis server. Modul murni di `src/lib/funnel/*` memegang aturan (UTM, validasi ID pixel, pemetaan kejadian) dan diuji unit. Pixel hanya dimuat di `/[username]` dan halaman terima kasih baru, tidak pernah di `/pesanan/[token]`.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase Postgres + RLS, Zod, node:test (`npm run test:unit`), harness `npm run docker:test`, `qrcode` (sudah terpasang).

**Spec:** `docs/superpowers/specs/2026-11-18-ads-funnel-design.md`. Papan desain: `docs/design/booking-flow/Fun*.dc.html` (F1 sampai F6), kanvas https://claude.ai/artifact/RSGQtRjX4RQivoVekkfgeo.

**Branch:** `fitur/funnel-iklan` (dari `origin/main`, sudah membawa dokumen desain lapangan).

## Global Constraints

- AGENTS.md mengikat: migration baru saja (mulai `20261125000100`), setiap tabel baru `REVOKE ALL` dari `anon` dan `authenticated` lalu grant per kolom, fungsi baru tertutup kecuali `GRANT EXECUTE` eksplisit, definer memakai `set search_path = ''`, `createAdminClient()` wajib memfilter `merchant_id`, tidak ada `getSession()`, tipe di `src/types/database.ts` berupa `type`.
- UI dan komentar kode berbahasa Indonesia; nama variabel, tabel, kolom berbahasa Inggris.
- Teks UI disalin dari papan F1 sampai F6 (`docs/design/booking-flow/Fun*.dc.html`). Tanpa em dash, tanpa titik tengah sebagai pemisah, tanpa panah di teks tombol.
- Komponen di `src/components/booking-page/*` hanya memakai token dari `themeToCssVars()`, tanpa warna atau ukuran tertulis langsung.
- Regex ID pixel, sama di Zod dan CHECK database: Meta `^\d{15,16}$`, TikTok `^[A-Z0-9]{20}$`, GA4 `^G-[A-Z0-9]{6,12}$`.
- Slug tautan iklan `^[a-z0-9-]{3,40}$`, unik per merchant. URL link-in-bio `^https://`, maksimal 500 karakter, label 1 sampai 40, maksimal 8 tautan per merchant.
- UTM per kanal: `IG_BIO` instagram/bio, `META_ADS` meta/paid, `TIKTOK_ADS` tiktok/paid, `WA_STATUS` whatsapp/status, `OTHER` lainnya/link; `utm_campaign` = slug. Nilai UTM dan `referrer_host` dipotong ke 64 dan 100 karakter.
- Pemetaan kejadian pixel persis tabel di spec (PageView/Pageview/page_view sampai Purchase/CompletePayment/purchase). `event_id` Lead = `pixel_event_id`, Purchase = `pixel_event_id + ":paid"`.
- Pixel tidak pernah dimuat di `/pesanan/[token]` atau `/dashboard/*`.
- Setiap perubahan skema diuji `npm run docker:test`; kasus baru di `supabase/tests/99_verify.sql` mulai bagian 73.
- Setiap task diakhiri `npm run check` (typecheck, lint, build) dan `npm run test:unit` hijau, lalu commit.

## Review Focus

1. **Token bocor ke pihak ketiga:** pixel atau `funnel_events` tidak boleh menerima URL `/pesanan/[token]`. Uji di Task 7 bahwa `PixelScripts` tidak dirender oleh layout/halaman pesanan, dan `referrer_host` hanya menyimpan host.
2. **Angka funnel tidak masuk akal:** `funnel_summary` tidak boleh mengembalikan Dibayar > Booking dibuat atau Booking > Kunjungan untuk satu kanal. `VIEW` dicatat sekali per sesi per merchant. Uji di Task 2 (SQL) dan Task 4 (route).
3. **Spam ke `/api/events`:** body tak valid, merchant tak ada, atau laju berlebihan harus ditolak tanpa menulis baris. Uji di Task 4.
4. **Tautan iklan rusak:** slug diarsipkan, layanan nonaktif, atau voucher kedaluwarsa tetap menghasilkan halaman yang bisa dipakai (F2 keadaan kedua dan ketiga). Uji di Task 5.
5. **Injeksi lewat ID pixel atau URL tautan:** ID yang tidak cocok regex ditolak di database, dan URL `javascript:` atau `http://` ditolak. Uji di Task 1 (SQL) dan Task 3 (unit).

---

### Task 1: Skema tautan, pixel, link-in-bio

Model: opus tidak perlu; sonnet implementer, sonnet reviewer (SQL keamanan).

**Files:**
- Create: `supabase/migrations/20261125000100_funnel_enums.sql` (enum `ad_channel`, `funnel_event_kind`; nilai enum dipisah dari pemakaian)
- Create: `supabase/migrations/20261125000200_ad_links_tracking_links.sql`
- Modify: `src/types/database.ts`
- Test: `supabase/tests/99_verify.sql` (bagian 73)

**Interfaces:**
- Produces tabel `ad_links`, `merchant_tracking`, `merchant_links` (kolom persis spec), kolom `merchant_themes.show_social_icons boolean not null default true`, nilai `LINKS` di `section_order`/`hidden_sections` (constraint: tepat empat nilai `LINKS`,`PROMO`,`SERVICES`,`FAQ`; baris lama mendapat `LINKS` di depan).
- Produces RPC `resolve_ad_link(p_username text, p_slug text) returns table(id uuid, service_id uuid, voucher_code text, channel public.ad_channel)` (anon, definer, abaikan yang diarsipkan) dan `get_public_tracking(p_merchant_id uuid) returns table(meta_pixel_id text, tiktok_pixel_id text, ga4_measurement_id text)` (anon, hanya yang `*_enabled`).
- Produces RPC `save_merchant_links(p_links jsonb, p_show_social_icons boolean, p_section_order text[])` (authenticated, merchant sendiri, atomik di bawah kunci merchant: upsert lalu hapus yang hilang, pola `save_dining_layout`), dipakai Task 8.
- Produces grant anon `select (contact_instagram, contact_tiktok, contact_phone)` di `merchant_settings` dan `select` baris `merchant_links` yang `is_visible`.
- Types: `AdLink`, `MerchantTracking`, `MerchantLink`, `AdChannel`, `FunnelEventKind`, `SectionKey` bertambah `"LINKS"`.

- [ ] **Step 1: Tulis kasus uji di `99_verify.sql` bagian 73** yang gagal: anon `select` langsung dari `ad_links` dan `merchant_tracking` ditolak; `meta_pixel_id = '12345-678'` ditolak CHECK; tautan ke-9 ditolak trigger; `url = 'javascript:alert(1)'` dan `'http://a.b'` ditolak; `resolve_ad_link` tidak mengembalikan slug yang `archived_at` terisi; `get_public_tracking` tidak mengembalikan ID yang dimatikan; `section_order` lama berisi `LINKS` di depan.
- [ ] **Step 2: Jalankan `npm run docker:test`**, pastikan kasus baru gagal.
- [ ] **Step 3: Tulis kedua migration** sesuai Interfaces dan Global Constraints (RLS: merchant hanya baris `merchant_id = auth.uid()`; trigger batas 8 meniru batas banner di `20261117000300_merchant_banners.sql`).
- [ ] **Step 4: `npm run docker:test`** sampai `FAIL count` hanya baris footer.
- [ ] **Step 5: Perbarui `database.ts`**, `npm run check`, commit `Skema tautan iklan, pixel, dan link-in-bio`.

### Task 2: Kejadian funnel, atribusi booking, ringkasan funnel

Model: **opus** implementer dan reviewer (mendefinisikan ulang `create_booking`, uang dan konkurensi).

**Files:**
- Create: `supabase/migrations/20261125000300_funnel_events_attribution.sql`
- Modify: `src/types/database.ts`
- Test: `supabase/tests/99_verify.sql` (bagian 74)

**Interfaces:**
- Consumes enum dari Task 1.
- Produces tabel `funnel_events` (kolom persis spec, indeks `(merchant_id, created_at)`), kolom `bookings.session_id uuid`, `ad_link_id uuid` (FK gabungan dengan `merchant_id`), `utm_source`, `utm_medium`, `utm_campaign`, `referrer_host`, `pixel_event_id uuid not null default gen_random_uuid()`.
- `create_booking` dibuat ulang (drop lalu create, satu migration) dengan parameter tambahan ber-default null: `p_session_id uuid`, `p_ad_link_id uuid`, `p_utm_source text`, `p_utm_medium text`, `p_utm_campaign text`, `p_referrer_host text`. Menyimpan ke kolom booking dan menulis satu `funnel_events` `BOOKED`. `ad_link_id` milik merchant lain diabaikan (null), bukan error. `create_manual_booking` dan pemanggil lain tetap cocok.
- Produces `record_paid_event(p_booking_id uuid)` (service_role saja) yang menulis `PAID` sekali per booking (idempoten).
- Produces `get_paid_event(p_event_id uuid) returns table(merchant_id uuid, service_name text, amount numeric, currency text)` (anon; hanya booking `PAID` dengan `paid_at` dalam 24 jam).
- Produces `funnel_summary(p_from timestamptz, p_to timestamptz) returns table(channel text, views int, service_views int, checkouts int, booked int, paid int, revenue numeric)` (authenticated, merchant sendiri; `channel` dari `ad_links.channel`, atau `utm_source`, atau `'LANGSUNG'`). `VIEW` dihitung per `session_id` unik.
- Produces `ad_link_stats(p_from timestamptz, p_to timestamptz) returns table(ad_link_id uuid, views int, booked int, paid int, revenue numeric)` (authenticated, merchant sendiri), dipakai tabel tautan di Task 9.
- Produces `prune_funnel_events()` (service_role) yang menghapus baris lebih tua dari 13 bulan.

- [ ] **Step 1: Kasus uji bagian 74** yang gagal: booking dengan `p_utm_source` tersimpan dan menulis `BOOKED`; `ad_link_id` merchant lain menjadi null; `record_paid_event` dua kali hanya satu `PAID`; `get_paid_event` menolak booking PENDING dan yang lewat 24 jam; `funnel_summary` merchant A tidak melihat kejadian merchant B; untuk data contoh 3 sesi VIEW, 2 BOOKED, 1 PAID hasilnya `views=3, booked=2, paid=1`; anon tidak bisa `select` `funnel_events`.
- [ ] **Step 2: `npm run docker:test`**, kasus baru gagal, kasus lama (termasuk voucher, kursi, batas QRIS) tetap lulus.
- [ ] **Step 3: Tulis migration.** Salin badan `create_booking` terbaru dari `20261120000200_seat_capacity.sql` beserta perubahan setelahnya (cek `grep -l "function public.create_booking" supabase/migrations/*` dan ambil yang terakhir), tambahkan parameter dan penulisan di akhir, jangan ubah urutan kunci atau aturan harga.
- [ ] **Step 4: `npm run docker:test`** hijau.
- [ ] **Step 5: `database.ts`**, `npm run check`, commit `Kejadian funnel dan atribusi booking`.

### Task 3: Modul murni funnel

Model: sonnet implementer; reviewer sonnet.

**Files:**
- Create: `src/lib/funnel/attribution.ts`, `src/lib/funnel/attribution.test.ts`
- Create: `src/lib/funnel/pixel-ids.ts`, `src/lib/funnel/pixel-ids.test.ts`
- Create: `src/lib/funnel/events.ts`, `src/lib/funnel/events.test.ts`
- Create: `src/lib/validations/funnel.ts` (skema Zod tautan iklan, link-in-bio, tracking, body `/api/events`)

**Interfaces:**
- `channelUtm(channel: AdChannel): { source: string; medium: string }`
- `adLinkUrls(input: { origin: string; username: string; slug: string; channel: AdChannel }): { short: string; full: string }` (full memuat `t`, `utm_source`, `utm_medium`, `utm_campaign`)
- `readAttribution(url: URL, referrer: string | null, selfHost: string): Attribution` dengan `type Attribution = { adLinkSlug: string | null; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; referrerHost: string | null }`; referrer dari host sendiri menjadi null; nilai dipotong 64/100.
- `isValidMetaPixelId`, `isValidTiktokPixelId`, `isValidGa4Id: (v: string) => boolean`
- `PIXEL_EVENTS: Record<FunnelStep, { meta: string; tiktok: string; ga4: string }>` dengan `type FunnelStep = "VIEW" | "SERVICE" | "CHECKOUT" | "BOOKED" | "PAID"`.
- `isSafeLinkUrl(url: string): boolean` (hanya `https:`, maksimal 500).

- [ ] **Step 1: Tulis tes** untuk tiap fungsi dengan nilai dari Global Constraints, termasuk: `channelUtm("TIKTOK_ADS")` → `{ source: "tiktok", medium: "paid" }`; `readAttribution` membuang referrer dari host sendiri dan memotong `utm_source` 100 karakter ke 64; `isSafeLinkUrl("javascript:alert(1)") === false`; `isValidMetaPixelId("12345-678") === false`; `PIXEL_EVENTS.PAID.tiktok === "CompletePayment"`.
- [ ] **Step 2: `npm run test:unit`**, gagal.
- [ ] **Step 3: Implementasi.**
- [ ] **Step 4: `npm run test:unit`** lulus, `npm run check`.
- [ ] **Step 5: Commit** `Modul murni funnel iklan`.

### Task 4: Route kejadian, booking, dan webhook

Model: sonnet implementer; sonnet reviewer.

**Files:**
- Create: `src/app/api/events/route.ts`, `src/app/api/events/route.test.ts`
- Modify: `src/app/api/bookings/route.ts` (teruskan atribusi ke `create_booking`), skema body booking di `src/lib/validations/booking.ts`
- Modify: `src/app/api/webhooks/[provider]/route.ts` (panggil `record_paid_event` setelah status PAID, kegagalannya dicatat, tidak menggagalkan webhook)
- Modify: `src/app/api/cron/cancel-unpaid/route.ts` (panggil `prune_funnel_events` sekali sehari)

**Interfaces:**
- Consumes Task 2 RPC dan Task 3 Zod.
- `POST /api/events` body `{ merchantId: uuid, sessionId: uuid, kind: "VIEW" | "SERVICE" | "CHECKOUT" | "LINK_CLICK", serviceId?: uuid, merchantLinkId?: uuid, attribution: Attribution }` → 204. 400 untuk body tak valid, 404 merchant tidak ada/belum onboarding, 429 lewat batas laju (pola `extractClientIp` + hash di `src/lib/booking/rate-limit.ts`). `VIEW` kedua untuk sesi dan merchant yang sama tidak menulis baris (tetap 204).

- [ ] **Step 1: Tes route** (pola `src/app/api/webhooks/[provider]/route.test.ts`, dependensi disuntikkan): 400, 404, 429, `VIEW` ganda satu baris, insert memakai `merchant_id` dari body yang sudah divalidasi.
- [ ] **Step 2: `npm run test:unit`** gagal.
- [ ] **Step 3: Implementasi** ketiga perubahan.
- [ ] **Step 4: Tes lulus**, `npm run check`.
- [ ] **Step 5: Commit** `Route kejadian funnel dan atribusi booking`.

### Task 5: Halaman publik, masuk dari tautan iklan (F2) dan pengiriman kejadian

Model: sonnet implementer; sonnet reviewer.

**Files:**
- Modify: `src/app/[username]/page.tsx` (resolve `?t=` lewat `resolve_ad_link`, teruskan `entry` ke `BookingFlow`)
- Modify: `src/app/[username]/booking-flow.tsx` (buka langkah Jadwal untuk layanan dari tautan, pasang voucher, pesan keadaan F2, kirim kejadian `SERVICE`/`CHECKOUT`, kirim atribusi saat membuat booking)
- Create: `src/app/[username]/funnel-tracker.tsx` ("use client"; simpan atribusi pertama di `sessionStorage`, buat `sessionId`, kirim `VIEW` sekali, ekspor `trackFunnel(kind, extra)`)
- Test: `src/app/[username]/entry.test.ts` untuk fungsi murni `resolveEntry(link, services, voucherState)` di `src/app/[username]/entry.ts`

**Interfaces:**
- `type Entry = { serviceId: string | null; voucherCode: string | null; notice: "VOUCHER_APPLIED" | "VOUCHER_EXPIRED" | "SERVICE_GONE" | null }`
- Teks pesan dari `docs/design/booking-flow/FunMasuk.dc.html`.

- [ ] **Step 1: Tes `resolveEntry`**: layanan aktif + voucher berlaku → `VOUCHER_APPLIED`; voucher kedaluwarsa → `VOUCHER_EXPIRED` dengan `voucherCode` null; layanan terhapus → `SERVICE_GONE` dan `serviceId` null; tanpa tautan → semua null.
- [ ] **Step 2: Gagal, lalu implementasi** `entry.ts`, tracker, dan sambungan di halaman/flow. `?kode=` dan `utm_*` dari luar juga dibaca.
- [ ] **Step 3: `npm run test:unit`, `npm run check`.**
- [ ] **Step 4: Verifikasi di browser** (`marky-local`, port 3100, merchant `salon-uji`): buka `/salon-uji?t=<slug uji>` lihat langkah Jadwal dan pesan voucher; Network tab menunjukkan satu `POST /api/events` VIEW.
- [ ] **Step 5: Commit** `Masuk dari tautan iklan dan kejadian funnel`.

### Task 6: Link-in-bio di halaman publik (F1)

Model: sonnet implementer; sonnet reviewer.

**Files:**
- Create: `src/components/booking-page/links-section.tsx`, `src/components/booking-page/social-icons.tsx`
- Modify: `src/app/[username]/page.tsx` (ambil `merchant_links` dan kontak), komponen yang merender `section_order` (cari dengan `graphify query "section_order render public page"`)
- Modify: `src/lib/theme/*` bila `SectionKey` dipakai di sana; editor susunan di `/dashboard/halaman` menerima `LINKS`

**Interfaces:**
- `LinksSection({ links, onLinkClick }: { links: Pick<MerchantLink, "id" | "label" | "url">[]; onLinkClick?: (id: string) => void })`; ikon dipilih dari host (Instagram, TikTok, WhatsApp, Google Maps, Google Drive, lainnya) lewat fungsi murni `linkIconFor(url: string)` di `src/lib/funnel/link-icon.ts` dengan tes.
- `SocialIcons({ instagram, tiktok, whatsapp }: { instagram: string | null; tiktok: string | null; whatsapp: string | null })`; tiap ikon `<a>` 44px dengan `aria-label` "Instagram {nama usaha}".
- `LINK_CLICK` dikirim lewat `trackFunnel` dari Task 5.

- [ ] **Step 1: Tes `linkIconFor`** (6 host + fallback).
- [ ] **Step 2: Implementasi** komponen, hanya token tema; bagian tanpa tautan tidak dirender.
- [ ] **Step 3: `npm run test:unit`, `npm run check`.**
- [ ] **Step 4: Verifikasi browser** di HP 390px: tautan dan ikon tampil sesuai F1, preview `/dashboard/halaman` sama.
- [ ] **Step 5: Commit** `Link-in-bio dan ikon sosmed di halaman booking`.

### Task 7: Pixel dan halaman terima kasih

Model: sonnet implementer; **opus** reviewer (keamanan token).

**Files:**
- Create: `src/components/booking-page/pixel-scripts.tsx` ("use client"; memuat skrip resmi dengan `next/script` `afterInteractive`, Meta `autoConfig` false, ekspor `firePixel(step, payload)`)
- Create: `src/app/[username]/terima-kasih/page.tsx` dan komponen client-nya
- Modify: `src/app/[username]/page.tsx` (ambil `get_public_tracking`, render `PixelScripts`), `booking-flow.tsx` (fire ViewContent, InitiateCheckout, Lead dengan `event_id`), `src/app/pesanan/[token]/booking-live-status.tsx` atau tampilan status (tombol "Selesai" ke `/{username}/terima-kasih?e=<pixel_event_id>` hanya saat PAID; URL pesanan disimpan di `sessionStorage`)
- Modify: `src/lib/routes.ts` bila perlu helper URL; `src/proxy.ts` hanya bila routing domain sendiri tidak meneruskan subpath (cek dulu)
- Test: `src/components/booking-page/pixel-scripts.test.ts` untuk fungsi murni `pixelSnippets(ids)` yang menghasilkan kode init dari ID tervalidasi (ID tak valid dibuang)

**Interfaces:**
- `pixelSnippets(ids: { meta?: string | null; tiktok?: string | null; ga4?: string | null }): { meta: string | null; tiktok: string | null; ga4: string | null }`
- `firePixel(step: FunnelStep, payload: { eventId: string; value?: number; contentName?: string })`
- `PIXEL_EVENTS` dari Task 3.

- [ ] **Step 1: Tes `pixelSnippets`**: ID valid masuk lewat `JSON.stringify`, ID `"1');alert(1);//"` dibuang, Meta snippet memuat `autoConfig` false.
- [ ] **Step 2: Implementasi** dan sambungan.
- [ ] **Step 3: Tes otomatis "tidak ada pixel di pesanan"**: tes yang merender (atau memeriksa import graph) halaman `src/app/pesanan/[token]/page.tsx` dan memastikan `pixel-scripts` tidak diimpor; tambahkan komentar di `pixel-scripts.tsx` yang menjelaskan alasannya.
- [ ] **Step 4: `npm run test:unit`, `npm run check`, verifikasi browser**: dengan ID pixel uji di `merchant_tracking` lokal, Network tab menunjukkan permintaan ke Meta di `/salon-uji`, tidak ada di `/pesanan/...`; halaman terima kasih mengirim Purchase sekali (muat ulang tidak mengirim lagi).
- [ ] **Step 5: Commit** `Pixel iklan dan halaman terima kasih`.

### Task 8: Dashboard Tautan dan sosmed (F6)

Model: sonnet implementer; sonnet reviewer.

**Files:**
- Create: `src/app/dashboard/tautan/page.tsx`, `actions.ts`, `links-editor.tsx`
- Modify: `src/lib/routes.ts` (`ROUTES.links = "/dashboard/tautan"`), `src/components/layout/app-sidebar.tsx` (grup "Halaman booking": Tampilan, Tautan dan sosmed, Promosi, Iklan, Domain)

**Interfaces:**
- Server action `saveMerchantLinks(input: { links: { id?: string; label: string; url: string; isVisible: boolean }[]; showSocialIcons: boolean; placement: "BEFORE_SERVICES" | "AFTER_SERVICES" | "END" })` yang menulis atomik lewat RPC `save_merchant_links` dari Task 1; `placement` diterjemahkan ke `section_order`.
- Keadaan dan teks dari `FunLinkEditor.dc.html` (error "Alamat harus lengkap dan diawali https://...", "4 dari 8", tombol naik/turun dengan `aria-label`).

- [ ] **Step 1: Tes skema Zod input** (9 tautan ditolak, `http://` ditolak).
- [ ] **Step 2: Implementasi** halaman, action, editor dengan pratinjau.
- [ ] **Step 3: `npm run test:unit`, `npm run check`, verifikasi browser.**
- [ ] **Step 4: Commit** `Editor tautan dan sosmed`.

### Task 9: Dashboard Iklan: tautan iklan, QR, pixel (F3, F4)

Model: sonnet implementer; sonnet reviewer.

**Files:**
- Create: `src/app/dashboard/iklan/page.tsx` (tab `?tab=pixel`), `actions.ts`, `ad-link-form.tsx`, `ad-link-table.tsx`, `ad-link-qr.tsx`, `pixel-form.tsx`
- Modify: `src/lib/routes.ts` (`ROUTES.ads = "/dashboard/iklan"`), sidebar

**Interfaces:**
- Actions `createAdLink`, `archiveAdLink`, `saveTracking`; slug dibuat dari nama + kanal (`slugifyAdLink(name, channel)` di `src/lib/funnel/attribution.ts`, dengan tes) dan diberi akhiran angka bila bentrok.
- Tabel tautan memakai `ad_link_stats` dari Task 2 (30 hari terakhir).
- QR dari pustaka `qrcode` (`toDataURL` untuk PNG, `toString({ type: "svg" })` untuk SVG).
- Teks, keadaan kosong, dan validasi dari `FunTautan.dc.html` dan `FunPixel.dc.html`.

- [ ] **Step 1: Tes `slugifyAdLink`** dan skema Zod form.
- [ ] **Step 2: Implementasi.**
- [ ] **Step 3: `npm run test:unit`, `npm run check`, verifikasi browser** (buat tautan, salin, unduh PNG, simpan ID pixel salah lalu benar).
- [ ] **Step 4: Commit** `Tautan iklan, QR, dan pengaturan pixel`.

### Task 10: Funnel di Analitik dan asal booking (F5)

Model: sonnet implementer; sonnet reviewer.

**Files:**
- Create: `src/app/dashboard/analitik/funnel-section.tsx`, `src/lib/analytics/funnel.ts`, `src/lib/analytics/funnel.test.ts`
- Modify: `src/app/dashboard/analitik/page.tsx`, panel detail booking (`src/app/dashboard/bookings/booking-detail-panel.tsx`)

**Interfaces:**
- `summarizeFunnel(rows: FunnelRow[], channel: string | "ALL"): { steps: { key: FunnelStep; count: number; rateFromPrev: number | null }[]; worstStep: FunnelStep | null; channels: { channel: string; views: number; booked: number; paid: number; conversion: number; revenue: number }[] }`
- Label kanal: `IG_BIO` "Bio Instagram", `META_ADS` "Iklan Instagram atau Facebook", `TIKTOK_ADS` "Iklan TikTok", `WA_STATUS` "Status WhatsApp", lainnya "Langsung atau lainnya".

- [ ] **Step 1: Tes `summarizeFunnel`** dengan angka F5 (1.240 / 610 / 302 / 64 / 41; terburuk Lanjut ke data diri ke Booking dibuat, 21%), keadaan kosong (semua nol → `worstStep` null).
- [ ] **Step 2: Implementasi** bagian funnel dan baris "Datang dari" di detail booking.
- [ ] **Step 3: `npm run test:unit`, `npm run check`, verifikasi browser** (kosong dan berisi).
- [ ] **Step 4: Commit** `Funnel per kanal di Analitik`.

### Task 11: Panduan, privasi, keputusan, dokumentasi

Model: haiku implementer (teks), controller memeriksa.

**Files:**
- Modify: `src/lib/guide/content.ts` (+ `content.test.ts` hijau), `src/app/privasi/page.tsx` (bagian kunjungan dan pixel sesuai spec), `docs/DECISIONS.md` (#42 Funnel iklan: keputusan 1 sampai 6 spec), `CLAUDE.md` bagian Status (satu paragraf F11)

- [ ] **Step 1: Perbarui teks.**
- [ ] **Step 2: `npm run test:unit`, `npm run check`.**
- [ ] **Step 3: `graphify update .`**
- [ ] **Step 4: Commit** `Panduan, privasi, dan keputusan funnel iklan`.

### Penutup (controller)

- [ ] Review akhir seluruh cabang (opus).
- [ ] Terapkan migration `20261125000100` sampai `20261125000300` ke produksi lewat Supabase MCP dengan pola md5 (lihat memori `marky-rollout`), sebelum merge kode.
- [ ] PR ke `main`, cek Vercel, verifikasi read-only di produksi (tanpa booking atau pembayaran nyata).
