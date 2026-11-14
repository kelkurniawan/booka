# F0 Fondasi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Siapkan dasar redesign Marky: Storybook untuk debug frontend, kontras teks sekunder 4,5:1, sisa rename Booka ke Marky yang aman, dan halaman publik yang tampilannya terpisah dari pengambilan data.

**Architecture:** Storybook memakai framework `@storybook/nextjs-vite` dan `globals.css` yang sama dengan aplikasi, jadi story merender komponen asli. Halaman `/[username]` dipecah menjadi loader server dan komponen tampilan murni agar seluruh halaman bisa dirender di Storybook dengan data contoh. Rename yang menyentuh data hidup (record DNS domain sendiri) memakai masa transisi yang menerima nama lama.

**Tech Stack:** Next.js 16, Tailwind v4, Storybook (versi terbaru yang mendukung Next 16), Supabase Postgres, `node:test` lewat `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-14-marky-redesign-design.md` (bagian 5, F0)

## Global Constraints

- Semua aturan `AGENTS.md` berlaku: migration baru (bukan edit migration lama), UI dan komentar berbahasa Indonesia, tampilan halaman publik hanya lewat `resolveTheme()` / `themeToCssVars()`.
- `src/lib/theme/fonts.ts` tidak boleh diimpor dari kode yang diuji `npm run test:unit`.
- Teks UI tanpa em dash.
- Jangan mengubah palet dashboard.

## Review Focus

1. Merchant yang sudah memverifikasi domain dengan TXT `_booka.<domain>` harus tetap terverifikasi setelah rename. Diuji di Task 2.
2. Preset dengan background gelap (MALAM, ELEGAN) juga harus lolos 4,5:1 untuk teks sekunder, bukan hanya preset terang. Diuji di Task 1.
3. Merchant dengan warna background kustom (bukan dari preset) tetap lolos 4,5:1. Diuji di Task 1.
4. Username `marky` dan `booka` tidak bisa diklaim merchant mana pun, dalam huruf apa pun yang lolos format username. Diuji di Task 3.
5. Halaman publik yang sudah dipecah harus merender persis sama untuk merchant tanpa layanan (state "Belum menerima pesanan"). Diuji di Task 6 lewat story keadaan kosong.

---

### Task 1: Teks sekunder minimal 4,5:1

**Files:**
- Modify: `src/lib/theme/resolve.ts:69`
- Test: `src/lib/theme/resolve.test.ts`

**Interfaces:**
- Consumes: `resolveTheme(tier: SubscriptionTier, row: MerchantTheme | null): ResolvedTheme`, `contrastRatio(a: string, b: string): number` dari `./color`.
- Produces: tidak ada perubahan bentuk; hanya nilai `mutedForeground` yang bisa lebih gelap/terang.

- [ ] **Step 1: Tulis test yang gagal**

```ts
test("teks sekunder minimal 4,5:1 di semua preset", () => {
  for (const preset of Object.keys(THEME_PRESETS) as ThemePreset[]) {
    const tema = resolveTheme("PRO", baris({ preset }));
    assert.ok(contrastRatio(tema.mutedForeground, tema.background) >= 4.5, preset);
  }
});

test("teks sekunder tetap 4,5:1 di atas background kustom", () => {
  const tema = resolveTheme("PRO", baris({ preset: "HANGAT", background_color: "#f3e3d6" }));
  assert.ok(contrastRatio(tema.mutedForeground, tema.background) >= 4.5);
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `npm run test:unit 2>&1 | grep -A3 "teks sekunder"`
Expected: FAIL untuk setidaknya HANGAT (rasio sekitar 3,8).

- [ ] **Step 3: Ubah batas `ensureContrast(def.mutedForeground, permukaan, 3)` menjadi `4.5`** di `src/lib/theme/resolve.ts`, dan perbarui komentar di atasnya.

- [ ] **Step 4: Jalankan test**

Run: `npm run test:unit`
Expected: semua lulus.

- [ ] **Step 5: Commit**

```bash
git add src/lib/theme/resolve.ts src/lib/theme/resolve.test.ts
git commit -m "Naikkan kontras teks sekunder halaman publik ke 4,5:1"
```

### Task 2: Verifikasi domain menerima `_marky` dan `_booka`

**Files:**
- Create: `src/lib/domains/ownership.ts`
- Create: `src/lib/domains/ownership.test.ts`
- Modify: `src/lib/domains/config.ts` (hapus `ownershipRecord`)
- Modify: `src/app/dashboard/domain/actions.ts:77-87`
- Modify: `src/app/dashboard/domain/page.tsx:17,68`

**Interfaces:**
- Produces:
  - `type TxtRecord = { type: "TXT"; name: string; value: string }`
  - `ownershipRecord(domain: string, token: string): TxtRecord`: record yang ditampilkan ke merchant baru, `_marky.<domain>` = `marky-verify=<token>`.
  - `acceptedOwnershipRecords(domain: string, token: string): TxtRecord[]`: `[record baru, record lama _booka / booka-verify]`.
  - `matchesOwnership(found: Record<string, string[][]>, domain: string, token: string): boolean`: true bila salah satu record yang diterima ditemukan.

- [ ] **Step 1: Tulis test yang gagal di `ownership.test.ts`**

```ts
test("record baru memakai prefiks marky", () => {
  assert.deepEqual(ownershipRecord("salon.id", "abc"), { type: "TXT", name: "_marky.salon.id", value: "marky-verify=abc" });
});
test("record lama _booka tetap diterima", () => {
  assert.equal(matchesOwnership({ "_booka.salon.id": [["booka-verify=abc"]] }, "salon.id", "abc"), true);
});
test("record baru diterima, token lain ditolak", () => {
  assert.equal(matchesOwnership({ "_marky.salon.id": [["marky-verify=abc"]] }, "salon.id", "abc"), true);
  assert.equal(matchesOwnership({ "_marky.salon.id": [["marky-verify=xyz"]] }, "salon.id", "abc"), false);
});
test("TXT yang terpecah per 255 karakter digabung dulu", () => {
  assert.equal(matchesOwnership({ "_marky.salon.id": [["marky-verify=", "abc"]] }, "salon.id", "abc"), true);
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `npm run test:unit 2>&1 | grep -B1 -A3 ownership`
Expected: FAIL, modul belum ada.

- [ ] **Step 3: Buat `src/lib/domains/ownership.ts`** (modul murni, tanpa `server-only`) dengan tiga fungsi di atas. Ubah `ownsDomain` di `actions.ts` agar memanggil `resolveTxt` untuk setiap nama di `acceptedOwnershipRecords`, mengumpulkan hasil ke objek `found`, lalu memanggil `matchesOwnership`. Halaman domain menampilkan `ownershipRecord` (yang baru).

- [ ] **Step 4: Jalankan test dan typecheck**

Run: `npm run test:unit && npm run typecheck`
Expected: lulus.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domains src/app/dashboard/domain
git commit -m "Verifikasi domain memakai _marky, tetap menerima _booka"
```

### Task 3: Cadangkan username merek

**Files:**
- Create: `supabase/migrations/20261114000100_reserve_brand_usernames.sql`
- Test: `supabase/tests/99_verify.sql` (bagian "2. Username")

**Interfaces:** tidak ada.

- [ ] **Step 1: Tambah kasus uji** setelah kasus `opengraph-image`, dengan pola `pg_temp.expect_fail` yang sama untuk `'marky'` dan `'booka'` (label `username reserved "marky"` dan `username reserved "booka"`).

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `npm run docker:test`
Expected: dua kasus baru gagal (update berhasil padahal harusnya ditolak).

- [ ] **Step 3: Tulis migration** `insert into public.reserved_usernames (name) values ('marky'), ('booka') on conflict (name) do nothing;` dengan komentar Indonesia singkat (alasan: mencegah peniruan merek, nama lama tetap dicadangkan).

- [ ] **Step 4: Jalankan**

Run: `npm run docker:test`
Expected: semua lulus.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261114000100_reserve_brand_usernames.sql supabase/tests/99_verify.sql
git commit -m "Cadangkan username marky dan booka"
```

### Task 4: Sisa rename di dokumen dan konfigurasi

**Files:**
- Modify: `README.md`, `AGENTS.md`, `docs/*.md` (kecuali `docs/superpowers/**` yang bersifat arsip), `.env.example`, `deploy/whatsapp-gateway/compose.yaml`
- Tidak diubah: `compose.yaml` `name: booka` (mengganti nama proyek Compose membuat volume database lokal yatim; tulis komentar alasannya), `package.json` `name`, kunci `sessionStorage` `booka:onboarding:*`, kelas CSS `booka-reveal`.

**Interfaces:** tidak ada.

- [ ] **Step 1: Ganti "Booka" menjadi "Marky" dan `booka.id` menjadi `marky.id`** di berkas yang disebut. Di `AGENTS.md`, judul jadi "Marky: Smart Booking & Invoicing SaaS", dan tambahkan satu baris status: redesign mengikuti `DESIGN.md` dan spec 2026-11-14.

- [ ] **Step 2: Periksa sisa**

Run: `grep -rIn "Booka\|booka\.id" README.md AGENTS.md docs/*.md .env.example deploy`
Expected: tidak ada keluaran.

- [ ] **Step 3: Commit**

```bash
git add README.md AGENTS.md docs .env.example deploy compose.yaml
git commit -m "Ganti nama Booka menjadi Marky di dokumen dan konfigurasi"
```

### Task 5: Pasang Storybook

**Files:**
- Create: `.storybook/main.ts`, `.storybook/preview.tsx`
- Modify: `package.json` (devDependencies, scripts `storybook` dan `build-storybook`), `.gitignore` (`storybook-static/`), `eslint.config.mjs` bila lint menolak berkas `.stories.tsx`
- Create: `src/components/ui/button.stories.tsx` (story uji pasang)

**Interfaces:**
- Produces: perintah `npm run storybook` (port 6006) dan `npm run build-storybook`. Viewport bernama `hp` (390x844), `tablet` (768x1024), `desktop` (1280x800).

- [ ] **Step 1: Pasang** dengan `npx storybook@latest init --type nextjs --builder vite --yes`, lalu pastikan `framework.name` di `main.ts` adalah `@storybook/nextjs-vite`, `stories` = `["../src/**/*.stories.@(ts|tsx)"]`, addon `@storybook/addon-a11y` aktif. Hapus contoh bawaan `src/stories/`.

- [ ] **Step 2: `preview.tsx`** mengimpor `../src/app/globals.css`, mendefinisikan tiga viewport di atas, dan `parameters.a11y.test = "error"`.

- [ ] **Step 3: Story Button** dengan varian `default`, `outline`, `destructive`, dan `disabled`.

- [ ] **Step 4: Bangun**

Run: `npm run build-storybook`
Expected: selesai tanpa error, folder `storybook-static/` terbentuk.

- [ ] **Step 5: Periksa `npm run check` tetap lulus**

Run: `npm run check`
Expected: lulus (Storybook tidak ikut build Next).

- [ ] **Step 6: Commit**

```bash
git add .storybook package.json package-lock.json .gitignore eslint.config.mjs src/components/ui/button.stories.tsx
git commit -m "Pasang Storybook untuk debug frontend"
```

### Task 6: Pisahkan tampilan halaman publik dari data, lengkap dengan story

**Files:**
- Create: `src/components/booking-page/booking-page-view.tsx`
- Create: `src/components/booking-page/fixtures.ts`
- Create: `src/components/booking-page/booking-page-view.stories.tsx`
- Modify: `src/app/[username]/page.tsx:204-311` (render memanggil `BookingPageView`)

**Interfaces:**
- Consumes: `resolveTheme`, komponen yang ada di `src/components/booking-page/*`, `BookingSeam`.
- Produces:
  - `type BookingPageViewProps = { merchant: Pick<Merchant, "id" | "username" | "full_name" | "bio" | "avatar_url" | "subscription_tier">; theme: ResolvedTheme; services: Service[]; mediaByService: Record<string, ServiceMedia[]>; availability: Pick<Availability, "day_of_week">[]; staff: PublicStaff[]; faqs: MerchantFaq[] }`
  - `BookingPageView(props: BookingPageViewProps): JSX.Element`: seluruh isi yang sekarang ada di `MerchantPublicPage` setelah data diambil, termasuk JSON-LD FAQ dan tautan "Dibuat dengan Marky".
  - `fixtures.ts`: `sampleMerchant`, `sampleServices`, `sampleFaqs`, `sampleTheme(preset: ThemePreset): ResolvedTheme` (memanggil `resolveTheme("PRO", …)`).

- [ ] **Step 1: Pindahkan JSX** dari `MerchantPublicPage` ke `BookingPageView` tanpa mengubah markup. `page.tsx` tinggal memanggil `getMerchantPageData`, `notFound()`, lalu `<BookingPageView … />`.

- [ ] **Step 2: Story** `BookingPageView` dengan lima cerita: `Hangat`, `Malam`, `Berani`, `TanpaLayanan` (services kosong, menampilkan "Belum menerima pesanan"), `TanpaFaq`, semua di viewport `hp` secara default.

- [ ] **Step 3: Periksa build dan typecheck**

Run: `npm run typecheck && npm run build-storybook`
Expected: lulus.

- [ ] **Step 4: Periksa di browser** bahwa `/[username]` milik merchant lokal tampil sama seperti sebelum dipecah (bandingkan screenshot 390px sebelum dan sesudah), dan bahwa panel a11y Storybook tidak menunjukkan pelanggaran untuk kelima story.

- [ ] **Step 5: Commit lalu perbarui graph**

```bash
git add src/components/booking-page src/app/\[username\]/page.tsx
git commit -m "Pisahkan tampilan halaman publik agar bisa dirender di Storybook"
graphify update .
```
