# Logo Marky Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pasang logo Marky "Cap m" di semua tempat yang memakai logo: tab browser, ikon HP, landing, auth, onboarding, dashboard, 404/error, gambar OG, email merchant, push, manifest pesanan, dan loading layar penuh.

**Architecture:** Satu sumber bentuk di `src/lib/brand/mark.ts` (konstanta geometri + `markSvg()` yang menghasilkan string SVG). Komponen React `src/components/brand/marky-mark.tsx` memakai konstanta yang sama; ikon statis (ICO, PNG) dibuat sekali oleh skrip `sharp` dari `markSvg()` dan di-commit; OG memakai `markSvg()` sebagai data URI.

**Tech Stack:** Next.js 16 App Router (konvensi `icon.svg`, `apple-icon.png`, `favicon.ico`), React 19, Tailwind v4, `sharp` (sudah ada di node_modules), `next/og`, node:test lewat `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-22-marky-logo-design.md` (papan: `docs/design/logo/`, kanvas https://claude.ai/artifact/EcQsGazAHZAP9ULhzKuiMx)

## Global Constraints

- Bentuk simbol persis spek: `viewBox="0 0 100 100"`; rect `x=14 y=14 w=72 h=72 rx=18`, `transform="rotate(-8 50 50)"`; m dilubangi lewat mask dari path `M22 79V43a14.5 14.5 0 0 1 29 0v36M51 43a14.5 14.5 0 0 1 29 0v36`, `stroke-width=16`, `transform="translate(50 51) scale(.56) translate(-51 -49.75)"`; mask `userSpaceOnUse x=-20 y=-20 w=140 h=140`.
- Tulisan "marky" huruf kecil, General Sans 700, `letter-spacing: -0.05em`.
- Warna: tinta `oklch(21% 0.012 38)` (hex untuk sharp/Satori: `#1d1814`), kertas `oklch(97% 0.006 55)` (hex `#f7f3ef`), dashboard `currentColor`. Coral tidak untuk favicon dan dashboard.
- Ikon aplikasi: kotak tinta, sudut 22% (`rx=22` pada 100), simbol kertas 66% lebar kotak.
- Tanpa gradasi atau glow. Terbaca di 16 px.
- Loading: cap ditekan lalu lepas 1,6 s berulang; statis saat `prefers-reduced-motion: reduce`; teks "Memuat" untuk pembaca layar.
- Badan `/[username]` dan `/pesanan/[token]` tidak menampilkan merek Marky; tidak ada `src/app/loading.tsx` di akar (akan berlaku untuk halaman merchant).
- UI dan komentar berbahasa Indonesia; tanpa em dash, tanpa titik tengah sebagai pemisah (DESIGN.md).

## Review Focus

- Dua simbol di satu halaman (sidebar + 404, masthead + footer): id mask bentrok membuat simbol kedua kosong; tiap instance wajib punya id mask unik (tes Task 1).
- Tab browser bertema gelap: `icon.svg` harus berganti ke warna kertas lewat `@media (prefers-color-scheme: dark)` (tes Task 1 pada `markSvg({ adaptive: true })`).
- Klien email yang memblokir gambar: header tetap terbaca karena "marky" ditulis sebagai teks dan `alt="Marky"` (tes Task 5).
- Pengguna dengan kurangi gerakan: loader tidak bergerak (aturan CSS di Task 3, diperiksa di langkah verifikasinya).
- Pengunjung halaman merchant: tidak ada loader atau logo Marky muncul (Task 3, langkah verifikasi `ls src/app/loading.tsx` gagal).

---

### Task 1: Sumber bentuk dan komponen simbol

**Files:**
- Create: `src/lib/brand/mark.ts`, `src/lib/brand/mark.test.ts`
- Create: `src/components/brand/marky-mark.tsx`, `src/components/brand/marky-mark.stories.tsx`
- Test: `src/components/brand/marky-mark.test.ts`

**Interfaces:**
- Produces (`src/lib/brand/mark.ts`, tanpa `server-only`):
  - `export const MARK_PATH: string`, `MARK_TRANSFORM: string`, `CAP = { x: 14, y: 14, size: 72, rx: 18, rotate: -8 }`, `INK_HEX = "#1d1814"`, `PAPER_HEX = "#f7f3ef"`.
  - `export function markSvg(opts: { color?: string; size?: number; maskId?: string; adaptive?: boolean; tile?: { background: string; radius: number; scale: number } }): string` — SVG mandiri. `adaptive` menambah `<style>` yang memakai warna kertas di mode gelap; `tile` menggambar kotak latar lalu simbol diperkecil `scale` di tengahnya.
  - `export function markDataUri(opts: Parameters<typeof markSvg>[0]): string` — `data:image/svg+xml;base64,...`.
- Produces (`src/components/brand/marky-mark.tsx`):
  - `MarkyMark({ className?: string; title?: string })` — `<svg>` warna `currentColor`; tanpa `title` jadi `aria-hidden`, dengan `title` jadi `role="img"` + `aria-label`; id mask dari `useId()`.
  - `MarkyLogo({ className?: string })` — simbol + `<span>marky</span>` (kelas `font-bold tracking-[-0.05em]`), simbol `size-[1.05em]`, jarak `gap-[0.3em]`; ukuran mengikuti `font-size` induk.
  - `MarkyLoader({ label?: string })` — dipakai Task 3; default `label = "Memuat"`.

- [ ] **Step 1: Tes gagal untuk `markSvg`** di `src/lib/brand/mark.test.ts`:

```ts
test("markSvg: memuat path m dan rect cap yang dimiringkan", () => {
  const svg = markSvg({});
  assert.match(svg, /viewBox="0 0 100 100"/);
  assert.ok(svg.includes(MARK_PATH));
  assert.match(svg, /rotate\(-8 50 50\)/);
  assert.match(svg, new RegExp(`fill="${INK_HEX}"`));
});
test("markSvg: maskId berbeda menghasilkan id mask berbeda", () => {
  assert.match(markSvg({ maskId: "a" }), /id="a"/);
  assert.match(markSvg({ maskId: "b" }), /url\(#b\)/);
});
test("markSvg adaptive: warna kertas saat prefers-color-scheme dark", () => {
  const svg = markSvg({ adaptive: true });
  assert.match(svg, /@media \(prefers-color-scheme: dark\)/);
  assert.ok(svg.includes(PAPER_HEX));
});
test("markSvg tile: kotak latar lalu simbol diperkecil", () => {
  const svg = markSvg({ color: PAPER_HEX, tile: { background: INK_HEX, radius: 22, scale: 0.66 } });
  assert.match(svg, new RegExp(`<rect[^>]*rx="22"[^>]*fill="${INK_HEX}"`));
  assert.match(svg, /scale\(0\.66\)/);
});
test("markDataUri: base64 svg", () => {
  assert.match(markDataUri({}), /^data:image\/svg\+xml;base64,/);
});
```

- [ ] **Step 2:** `npx tsx --conditions=react-server --test src/lib/brand/mark.test.ts` → FAIL (modul tidak ada).
- [ ] **Step 3:** Implementasi `src/lib/brand/mark.ts` sesuai Interfaces dan Global Constraints.
- [ ] **Step 4:** Jalankan lagi → PASS.
- [ ] **Step 5: Tes komponen** `src/components/brand/marky-mark.test.ts` memakai `renderToStaticMarkup` dari `react-dom/server` dan `createElement`:

```ts
test("dua MarkyMark di satu render punya id mask berbeda", () => {
  const html = renderToStaticMarkup(createElement("div", null, createElement(MarkyMark), createElement(MarkyMark)));
  const ids = [...html.matchAll(/<mask id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1]);
});
test("MarkyMark tanpa title disembunyikan dari pembaca layar, dengan title jadi gambar berlabel", () => {
  assert.match(renderToStaticMarkup(createElement(MarkyMark)), /aria-hidden="true"/);
  assert.match(renderToStaticMarkup(createElement(MarkyMark, { title: "Marky" })), /role="img"[^>]*aria-label="Marky"/);
});
test("MarkyLogo menulis marky sebagai teks", () => {
  assert.match(renderToStaticMarkup(createElement(MarkyLogo)), />marky</);
});
```

  Jalankan tanpa `--conditions=react-server` bila `react-dom/server` menolak kondisi itu: `npx tsx --test src/components/brand/marky-mark.test.ts`. Kalau `npm run test:unit` (yang memakai kondisi itu) gagal mengimpornya, ganti nama berkas jadi `.test.tsx` tidak membantu; catat di laporan dan pakai `react-dom/server.node` (`renderToStaticMarkup` tersedia di sana).
- [ ] **Step 6:** Implementasi `marky-mark.tsx` (`"use client"` tidak perlu: `useId` jalan di Server Component). Path dan transform diimpor dari `src/lib/brand/mark.ts`.
- [ ] **Step 7:** Stories: `MarkyMark` di 16/32/64 px, `MarkyLogo` di 18/32/44 px, latar terang dan gelap.
- [ ] **Step 8:** `npm run test:unit` → semua lulus.
- [ ] **Step 9: Commit** `git add src/lib/brand src/components/brand` lalu `git commit -m "Tambah simbol dan logo Marky"`.

### Task 2: Ikon tab browser, HP, dan PWA

**Files:**
- Create: `src/lib/brand/ico.ts`, `src/lib/brand/ico.test.ts`, `scripts/brand-icons.ts`
- Create (hasil skrip, di-commit): `src/app/icon.svg`, `src/app/apple-icon.png`, `public/brand/marky-192.png`, `public/brand/marky-512.png`, `public/brand/marky-email.png`
- Modify (hasil skrip): `src/app/favicon.ico`
- Modify: `package.json` (script `"brand:icons": "tsx scripts/brand-icons.ts"`)

**Interfaces:**
- Consumes: `markSvg`, `INK_HEX`, `PAPER_HEX` (Task 1).
- Produces: `buildIco(images: { size: number; png: Buffer }[]): Buffer`; berkas di atas pada path tetap. Task 4 dan 5 merujuk `/brand/marky-192.png`, `/brand/marky-512.png`, `/brand/marky-email.png`.

- [ ] **Step 1: Tes gagal** `src/lib/brand/ico.test.ts`:

```ts
test("buildIco: header ICO dan satu entri per ukuran berisi PNG", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const ico = buildIco([{ size: 16, png }, { size: 32, png }]);
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 2);
  assert.equal(ico[6], 16);
  assert.equal(ico[22], 32);
  assert.equal(ico.readUInt32LE(6 + 8), 4);
  assert.equal(ico.readUInt32LE(6 + 12), 6 + 16 * 2);
  assert.deepEqual([...ico.subarray(38, 42)], [0x89, 0x50, 0x4e, 0x47]);
});
```

- [ ] **Step 2:** Jalankan → FAIL. **Step 3:** Implementasi `buildIco` (ICONDIR 6 byte, ICONDIRENTRY 16 byte: lebar, tinggi, 0, 0, planes 1, bpp 32, ukuran data, offset; lalu data PNG berurutan). **Step 4:** → PASS.
- [ ] **Step 5:** `scripts/brand-icons.ts` menulis, dengan `sharp(Buffer.from(svg)).resize(n).png()`:
  - `src/app/icon.svg` = `markSvg({ adaptive: true })`.
  - `src/app/favicon.ico` = `buildIco` dari PNG 16, 32, 48 simbol tinta tanpa kotak (`markSvg({ color: INK_HEX })`).
  - `src/app/apple-icon.png` 180, `public/brand/marky-192.png`, `public/brand/marky-512.png` = `markSvg({ color: PAPER_HEX, tile: { background: INK_HEX, radius: 22, scale: 0.66 } })`.
  - `public/brand/marky-email.png` 64 = simbol tinta tanpa kotak.
- [ ] **Step 6:** `npm run brand:icons`, lalu `file src/app/favicon.ico src/app/apple-icon.png public/brand/*.png` → ICO 3 ikon, PNG 180/192/512/64.
- [ ] **Step 7: Commit** semua berkas di atas: `git commit -m "Pakai logo Marky untuk favicon dan ikon aplikasi"`.

### Task 3: Logo di halaman Marky dan loader

**Files:**
- Modify: `src/components/landing/masthead.tsx` (teks "marky" diganti `<MarkyLogo />`, tetap di dalam `<Link aria-label="Marky, beranda">`)
- Modify: `src/app/(auth)/layout.tsx` (teks "Marky" diganti `<MarkyLogo className="text-2xl" />`)
- Modify: `src/components/onboarding/wizard-shell.tsx` (`<MarkyLogo className="text-xl" />` di atas `WizardProgress`, tautan ke `ROUTES.home`)
- Modify: `src/components/layout/app-sidebar.tsx` (huruf "M" di kotak `bg-primary` diganti `<MarkyMark className="size-5" />`)
- Modify: `src/app/not-found.tsx`, `src/app/error.tsx` (`<MarkyLogo className="text-lg" />` di atas `Empty`, tautan ke beranda)
- Modify: `src/components/brand/marky-mark.tsx` (isi `MarkyLoader`), `src/app/globals.css` (keyframes)
- Create: `src/app/(auth)/loading.tsx`, `src/app/onboarding/loading.tsx`
- Modify: `src/app/onboarding/onboarding-form.tsx` (saat `pending` di `SubmitButton`, tampilkan lapisan layar penuh `MarkyLoader label="Menyiapkan halaman booking Anda"`)

**Interfaces:**
- Consumes: `MarkyMark`, `MarkyLogo` (Task 1).
- Produces: `MarkyLoader({ label?: string })`: kontainer `role="status"` `aria-live="polite"`, simbol 56 px dengan kelas `marky-cap-press`, teks label `sr-only` bila default, terlihat bila diberi.

- [ ] **Step 1:** `globals.css`: `@keyframes marky-cap-press { 0% { transform: scale(1.28) rotate(-6deg); opacity: 0 } 28% { transform: scale(.94) rotate(0); opacity: 1 } 40% { transform: scale(1) } 82% { opacity: 1 } 100% { opacity: 0 } }`, `.marky-cap-press { animation: marky-cap-press 1.6s cubic-bezier(.2,.8,.2,1) infinite }`, dan `@media (prefers-reduced-motion: reduce) { .marky-cap-press { animation: none } }`.
- [ ] **Step 2:** Isi `MarkyLoader` dan tambah tes di `marky-mark.test.ts`:

```ts
test("MarkyLoader: status yang diumumkan dan label default Memuat", () => {
  const html = renderToStaticMarkup(createElement(MarkyLoader));
  assert.match(html, /role="status"/);
  assert.match(html, />Memuat</);
  assert.match(html, /marky-cap-press/);
});
```

- [ ] **Step 3:** Dua `loading.tsx`: `<div className="flex min-h-svh items-center justify-center"><MarkyLoader /></div>`.
- [ ] **Step 4:** Ganti semua tempat lain di daftar Files. Jangan membuat `src/app/loading.tsx`.
- [ ] **Step 5: Verifikasi:** `npm run test:unit` lulus; `ls src/app/loading.tsx` → "No such file"; `grep -n "prefers-reduced-motion" src/app/globals.css` memuat aturan `.marky-cap-press`; `npm run check` hijau (0 error lint).
- [ ] **Step 6: Verifikasi di browser:** jalankan dev server (`.claude/launch.json` konfigurasi `booka-dev`), buka `/`, `/masuk`, `/halaman-yang-tidak-ada` lebar 390 dan 1280; ambil screenshot masthead dan auth. Dashboard dan onboarding butuh sesi; bila tidak ada akun lokal, cek lewat Storybook (`MarkyLogo`, `MarkyLoader`) dan catat di laporan bahwa sidebar belum dilihat langsung.
- [ ] **Step 7: Commit** `git commit -m "Tampilkan logo Marky di landing, auth, onboarding, dashboard, dan loading"`.

### Task 4: Gambar OG

**Files:**
- Modify: `src/lib/marketing/og.tsx` (di kiri atas: `<img src={markDataUri({ color: INK })} width={44} height={44} />` lalu "marky")
- Modify: `src/app/[username]/opengraph-image.tsx:96` (tulisan kaki "marky": simbol 20 px warna `theme.mutedForeground` di depannya)

**Interfaces:**
- Consumes: `markDataUri` (Task 1). Satori tidak membaca oklch: warna harus hex (pakai konstanta yang sudah ada di berkas).

- [ ] **Step 1:** Ubah kedua berkas.
- [ ] **Step 2: Verifikasi:** dengan dev server Task 3, `curl -s -o /tmp/claude-502/og.png -w "%{http_code} %{content_type}\n" http://localhost:3000/opengraph-image` → `200 image/png`; buka PNG-nya (Read) dan pastikan simbol tampil di samping "marky". Untuk `/[username]` butuh merchant di DB: bila tidak ada, catat sebagai belum dilihat.
- [ ] **Step 3: Commit** `git commit -m "Tambah simbol Marky di gambar OG"`.

### Task 5: Email merchant, push, dan manifest pesanan

**Files:**
- Modify: `src/lib/notify/templates.ts` (`merchantPaidEmail` dan `simpleEmail` diawali `brandHeader(data)`), `src/lib/notify/templates.test.ts`
- Modify: `public/sw.js` (`icon: "/brand/marky-192.png"` di `showNotification`)
- Modify: `src/app/api/pesanan/[token]/manifest/route.ts` (`icons`), Create: `src/app/api/pesanan/[token]/manifest/route.test.ts`

**Interfaces:**
- Consumes: `/brand/marky-email.png`, `/brand/marky-192.png`, `/brand/marky-512.png` (Task 2).
- Produces: `function brandHeader(data: BookingMessageData): string` (privat) = `<p style="margin:0 0 16px"><img src="<origin>/brand/marky-email.png" width="24" height="24" alt="Marky" style="vertical-align:middle;border:0"> <strong style="letter-spacing:-0.05em">marky</strong></p>`, dengan `<origin>` = `new URL(data.dashboardUrl).origin`.

- [ ] **Step 1: Tes gagal** di `templates.test.ts`:

```ts
test("email ke merchant diawali logo Marky dari origin dashboard", () => {
  for (const msg of [merchantPaidEmail(base), merchantConfirmedEmail(base), merchantRequestedEmail(base), merchantCustomerCancelledEmail(base)]) {
    assert.ok(msg.html.includes(`${new URL(base.dashboardUrl).origin}/brand/marky-email.png`));
    assert.match(msg.html, /alt="Marky"/);
    assert.match(msg.html, />marky</);
  }
});
test("email pengingat ke pelanggan tidak memakai logo Marky", () => {
  assert.ok(!customerReminderEmail(base, "H1").html.includes("marky-email.png"));
});
```

  (Pakai nilai offset yang valid di `ReminderOffset` bila "H1" bukan salah satunya.)
- [ ] **Step 2:** Jalankan `npx tsx --conditions=react-server --test src/lib/notify/templates.test.ts` → FAIL. **Step 3:** Implementasi `brandHeader`. **Step 4:** → PASS.
- [ ] **Step 5: Tes manifest** `route.test.ts`: `GET` dengan token 48 hex mengembalikan `icons` berisi `{ src: "/brand/marky-192.png", sizes: "192x192", type: "image/png" }` dan versi 512; token salah tetap 404. Implementasi lalu jalankan → PASS.
- [ ] **Step 6:** `sw.js`: tambah `icon`. Tidak ada tes (berkas statis); cek dengan `node --check public/sw.js`.
- [ ] **Step 7:** `npm run test:unit` dan `npm run check` → hijau.
- [ ] **Step 8: Commit** `git commit -m "Pakai logo Marky di email merchant, push, dan manifest pesanan"`.

### Task 6: Dokumentasi

**Files:**
- Modify: `docs/design/README.md` (baris tabel `logo/` dengan tautan kanvas), `DESIGN.md` (bagian "Logo": simbol Cap m, aturan warna dan ukuran dari spek, larangan merek Marky di halaman merchant), `AGENTS.md` (satu kalimat di Status: logo di `src/lib/brand/mark.ts`, ikon dibuat ulang dengan `npm run brand:icons`)

- [ ] **Step 1:** Ubah ketiga berkas. **Step 2:** `graphify update .`. **Step 3: Commit** `git add docs/design/logo docs/design/README.md DESIGN.md AGENTS.md docs/superpowers/specs/2026-11-22-marky-logo-design.md docs/superpowers/plans/2026-11-22-marky-logo.md` lalu `git commit -m "Dokumentasikan logo Marky"`.
