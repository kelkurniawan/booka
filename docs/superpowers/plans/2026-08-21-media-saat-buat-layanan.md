# Unggah Media Saat Membuat Layanan — Rencana Implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Merchant bisa melampirkan foto dan video **saat membuat** layanan, bukan hanya saat mengubahnya.

**Masalah yang diperbaiki:** `ServiceMediaField` hanya dirender saat `service` ada (mode Ubah). Di mode Tambah, dialog cuma menampilkan kalimat "Simpan dulu layanannya, lalu buka lagi lewat menu Ubah untuk menambahkan foto dan video." Itu menyempitkan permintaan asli pengguna.

**Architecture:** `service_media` punya foreign key ke `services`, jadi barisnya mustahil dibuat sebelum layanannya ada. Karena itu di mode Tambah berkas **ditahan di memori** (sudah dikompres, dengan pratinjau lewat object URL) dan baru diunggah setelah layanan tersimpan. Konsekuensinya: bila pembuatan layanan gagal — misalnya kuota Starter — tidak ada satu pun berkas yang terlanjur mendarat di bucket. Mode Ubah tetap mengunggah seketika karena layanannya sudah ada.

**Tech Stack:** Next.js 16 App Router · React 19 · Supabase Storage · TypeScript

## Global Constraints

- **Bahasa UI dan komentar kode: Indonesia.** Nama variabel, tabel, dan kolom tetap Inggris.
- **Foto dan video bersifat OPSIONAL.** Tidak boleh ada validasi yang mewajibkannya, dan UI harus menyatakan sifat opsional itu.
- Batas yang sudah berlaku tidak berubah: maksimal 5 gambar dan 1 video per layanan; video hanya paket PRO/STUDIO; video maks 20MB dan ~30 detik.
- Path berkas WAJIB berbentuk `{merchant_id}/svc/{service_id}/{nama}` — constraint `service_media_path_scoped` menolak bentuk lain.
- Berkas yang terlanjur diunggah tapi barisnya gagal disimpan WAJIB dihapus (`removeMedia`).
- Tidak ada perubahan skema database pada rencana ini.
- **Gerbang tiap task:** `npm run check` (typecheck + lint + uji unit + build) wajib hijau sebelum commit.
- Commit berbahasa Indonesia, satu commit per task.

## Modul yang sudah ada dan dipakai kembali

| Modul | Yang dipakai |
| --- | --- |
| `src/lib/media/compress.ts` | `compressImage(file, {maxSide, square})`, `captureVideoPoster(file)` |
| `src/lib/media/limits.ts` | `MEDIA_LIMITS`, `validateImageFile`, `validateVideoFile` |
| `src/lib/media/upload.ts` | `uploadMedia(path, blob, contentType)`, `removeMedia(paths)`, `mediaFileName(prefix, ext)` |
| `src/app/dashboard/services/actions.ts` | `attachServiceMedia(formData)`, `detachServiceMedia(formData)` |

---

### Task 1: `createService` mengembalikan id layanan baru

Klien butuh `service_id` untuk menyusun path berkas dan memanggil `attachServiceMedia`.

**Files:**
- Modify: `src/app/dashboard/services/actions.ts`, `src/app/dashboard/services/service-state.ts`

**Interfaces:**
- Consumes: —
- Produces: `ServiceFormState` bertambah field opsional `serviceId?: string`; `createService` mengisinya saat `status === "success"`.

- [ ] **Step 1: Tambahkan field ke tipe**

Di `service-state.ts`, tambahkan ke `ServiceFormState`:

```ts
  /** Id layanan yang baru dibuat. Dipakai klien untuk melampirkan media. */
  serviceId?: string;
```

- [ ] **Step 2: Kembalikan id dari insert**

Di `createService` pada `actions.ts`, ubah insert agar mengembalikan id:

```ts
  const { data, error } = await supabase
    .from("services")
    .insert({
      merchant_id: user.id,
      name: parsed.data.name,
      description: parsed.data.description,
      price: parsed.data.price,
      duration_minutes: parsed.data.duration_minutes,
    })
    .select("id")
    .single();
```

Blok penanganan `error` yang sudah ada JANGAN diubah. Baris `return` terakhir menjadi:

```ts
  return { status: "success", serviceId: data?.id };
```

- [ ] **Step 3: Verifikasi**

```bash
npm run check
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/services/actions.ts src/app/dashboard/services/service-state.ts
git commit -m "Kembalikan id layanan baru dari createService"
```

---

### Task 2: `ServiceMediaField` mendukung mode draft

**Files:**
- Modify: `src/app/dashboard/services/service-media-field.tsx`

**Interfaces:**
- Consumes: `ServiceFormState.serviceId` (Task 1) — tidak langsung, hanya kontraknya
- Produces: tipe `DraftMedia` dan prop baru pada `ServiceMediaField`.

Tipe yang WAJIB diekspor dengan nama persis ini:

```ts
export type DraftMedia = {
  /** Kunci lokal untuk React; bukan id database. */
  key: string;
  kind: "IMAGE" | "VIDEO";
  /** Berkas hasil kompresi, siap diunggah. */
  blob: Blob;
  ext: string;
  contentType: string;
  /** Hanya untuk VIDEO. */
  posterBlob?: Blob;
  width: number;
  height: number;
  /** Object URL untuk pratinjau; pemanggil yang mencabutnya. */
  previewUrl: string;
};
```

Prop komponen menjadi salah satu dari dua bentuk, dibedakan ada tidaknya `serviceId`:

```ts
type ServiceMediaFieldProps = {
  merchantId: string;
  tier: SubscriptionTier;
} & (
  | {
      /** Mode terlampir: layanan sudah ada, media langsung disimpan. */
      serviceId: string;
      media: ServiceMedia[];
    }
  | {
      /** Mode draft: layanan belum ada, berkas ditahan di memori. */
      serviceId?: undefined;
      draft: DraftMedia[];
      onDraftChange: (draft: DraftMedia[]) => void;
    }
);
```

- [ ] **Step 1: Pisahkan pemrosesan berkas dari penyimpanannya**

Logika kompresi yang sekarang ada di `tambahGambar` dan `tambahVideo` tidak boleh diduplikasi. Ekstrak menjadi dua fungsi murni di dalam modul yang sama, yang HANYA memproses berkas dan tidak menyentuh jaringan:

```ts
async function siapkanGambar(file: File): Promise<DraftMedia | string> {
  const galat = validateImageFile(file);
  if (galat) return galat;

  const { blob, width, height } = await compressImage(file, {
    maxSide: MEDIA_LIMITS.serviceImageMaxSide,
    square: false,
  });

  return {
    key: crypto.randomUUID(),
    kind: "IMAGE",
    blob,
    ext: "webp",
    contentType: "image/webp",
    width,
    height,
    previewUrl: URL.createObjectURL(blob),
  };
}

async function siapkanVideo(file: File): Promise<DraftMedia | string> {
  // Poster dibuat LEBIH DULU karena durasinya cuma bisa dibaca dari sini.
  // Memeriksa durasi setelah mengunggah 20MB berarti kuota merchant sudah
  // telanjur habis untuk berkas yang akan ditolak.
  const poster = await captureVideoPoster(file);
  const galat = validateVideoFile(file, poster.duration);
  if (galat) return galat;

  return {
    key: crypto.randomUUID(),
    kind: "VIDEO",
    blob: file,
    ext: file.type === "video/webm" ? "webm" : "mp4",
    contentType: file.type,
    posterBlob: poster.blob,
    width: poster.width,
    height: poster.height,
    previewUrl: URL.createObjectURL(poster.blob),
  };
}
```

Mengembalikan `string` berarti pesan galat untuk `toast.error`.

- [ ] **Step 2: Mode terlampir memakai fungsi yang sama**

`tambahGambar` dan `tambahVideo` yang sudah ada diubah agar memanggil `siapkanGambar`/`siapkanVideo` lalu mengunggah hasilnya. Perilaku yang sudah berjalan TIDAK boleh berubah: unggah ke `{merchantId}/svc/{serviceId}/{mediaFileName(...)}`, panggil `attachServiceMedia`, dan pada kegagalan panggil `removeMedia(hasil.paths)` lalu `toast.error`. Video mengunggah poster lebih dulu, lalu berkas videonya.

- [ ] **Step 3: Mode draft**

Saat `serviceId` tidak ada, penambahan berkas memanggil `onDraftChange([...draft, hasil])` — tanpa menyentuh jaringan sama sekali. Penghapusan memanggil `URL.revokeObjectURL(item.previewUrl)` lalu `onDraftChange(draft.filter(...))`.

Batas dihitung dari `draft` alih-alih dari `media`: maksimal `MEDIA_LIMITS.maxServiceImages` gambar dan 1 video. Tombol video tetap terkunci berlencana Pro untuk merchant STARTER, sama seperti mode terlampir.

Petak thumbnail merender `item.previewUrl` untuk draft dan `publicMediaUrl(...)` untuk media terlampir.

- [ ] **Step 4: Nyatakan sifat opsionalnya**

Teks bantuan di bawah tombol diawali kalimat ini, persis:

```
Opsional. Maksimal 5 gambar dan 1 video per layanan.
```

Sisa kalimat yang sudah ada tentang batas video dan poster otomatis tetap dipertahankan.

- [ ] **Step 5: Verifikasi**

```bash
npm run check
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/services/service-media-field.tsx
git commit -m "Dukung media draft di ServiceMediaField untuk layanan yang belum tersimpan"
```

---

### Task 3: Sambungkan media draft ke alur pembuatan layanan

**Files:**
- Modify: `src/app/dashboard/services/service-form-dialog.tsx`

**Interfaces:**
- Consumes: `ServiceFormState.serviceId` (Task 1); `DraftMedia`, prop draft `ServiceMediaField` (Task 2); `uploadMedia`, `removeMedia`, `mediaFileName` dari `src/lib/media/upload.ts`; `attachServiceMedia` dari `./actions`
- Produces: dialog Tambah layanan yang menerima foto dan video

- [ ] **Step 1: Tampilkan bagian media di kedua mode**

Hapus seluruh cabang `<p>` berisi "Simpan dulu layanannya, lalu buka lagi lewat menu Ubah untuk menambahkan foto dan video." — kalimat itu tidak boleh lagi ada di basis kode.

Di mode Tambah, render `ServiceMediaField` dengan prop draft. State draftnya dipegang `ServiceForm`.

- [ ] **Step 2: Unggah draft setelah layanan tersimpan**

Setelah `createService` mengembalikan `status === "success"` beserta `serviceId`, unggah tiap draft lalu lampirkan barisnya. Urutan ini WAJIB: layanan dulu, berkas kemudian — foreign key `service_media` menolak baris yang menunjuk layanan yang belum ada, dan menahan berkas sampai titik ini berarti kegagalan pembuatan layanan tidak meninggalkan sampah di bucket.

```ts
async function unggahDraft(serviceId: string, draft: DraftMedia[]) {
  const dasar = `${merchantId}/svc/${serviceId}`;
  let gagal = 0;

  for (const [index, item] of draft.entries()) {
    const berkas: string[] = [];
    try {
      const nama = mediaFileName(item.kind === "VIDEO" ? "vid" : "img", item.ext);
      const path = `${dasar}/${nama}`;

      let posterPath = "";
      if (item.kind === "VIDEO" && item.posterBlob) {
        posterPath = `${dasar}/${nama.replace(/\.\w+$/, "")}-poster.webp`;
        await uploadMedia(posterPath, item.posterBlob, "image/webp");
        berkas.push(posterPath);
      }

      await uploadMedia(path, item.blob, item.contentType);
      berkas.push(path);

      const data = new FormData();
      data.set("service_id", serviceId);
      data.set("kind", item.kind);
      data.set("path", path);
      data.set("poster_path", posterPath);
      data.set("width", String(item.width));
      data.set("height", String(item.height));
      data.set("sort_order", String(index));

      const hasil = await attachServiceMedia(data);
      if (hasil.status === "error") {
        await removeMedia(hasil.paths);
        gagal += 1;
      }
    } catch {
      // Berkas terlanjur mendarat tapi rangkaiannya putus -- bersihkan,
      // jangan tinggalkan berkas yatim di bucket.
      if (berkas.length > 0) await removeMedia(berkas);
      gagal += 1;
    } finally {
      URL.revokeObjectURL(item.previewUrl);
    }
  }

  return gagal;
}
```

Bila `gagal > 0`, tampilkan `toast.error` yang menyebut jumlahnya dan menegaskan layanannya sendiri tetap tersimpan — jangan menampilkan kegagalan media seolah-olah layanannya batal dibuat.

- [ ] **Step 3: Jangan tutup dialog sebelum unggahannya rampung**

Efek yang sekarang memanggil `onSuccess()` begitu `state.status === "success"` akan menutup dialog dan melepas komponennya. Kalau unggahan berjalan di sana, `await` di tengah jalan akan terputus dan draft hilang tanpa jejak.

Tahan penutupan sampai `unggahDraft` selesai, dan selama proses itu berlangsung tampilkan keadaan sibuk pada tombol submit supaya merchant tidak menekannya dua kali atau menutup dialog. Mode Ubah tidak berubah: tetap menutup begitu berhasil.

- [ ] **Step 4: Bersihkan object URL saat dialog ditutup**

Bila dialog ditutup tanpa menyimpan, tiap `previewUrl` pada draft yang tersisa WAJIB dilepas dengan `URL.revokeObjectURL`, agar blob-nya tidak menggantung di memori.

- [ ] **Step 5: Verifikasi**

```bash
npm run check
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/services/service-form-dialog.tsx
git commit -m "Terima foto dan video saat membuat layanan, bukan cuma saat mengubah"
```

---

## Catatan untuk pelaksana

Urutan tidak bisa ditukar: Task 3 memakai `serviceId` dari Task 1 dan prop draft dari Task 2.

Titik yang paling mudah salah: menutup dialog sebelum unggahan selesai. Komponen yang dilepas membatalkan `await` yang sedang berjalan, dan merchant melihat "Layanan ditambahkan" padahal fotonya tidak pernah terkirim.
