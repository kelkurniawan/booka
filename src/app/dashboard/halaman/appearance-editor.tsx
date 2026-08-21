"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, ImageUp, Loader2, Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { compressImage } from "@/lib/media/compress";
import { MEDIA_LIMITS, validateImageFile } from "@/lib/media/limits";
import { mediaFileName, mediaPathFromUrl, removeMedia, uploadMedia } from "@/lib/media/upload";
import { publicMediaUrl } from "@/lib/media/url";
import { ROUTES } from "@/lib/routes";
import { FONT_PAIR_DESCRIPTIONS, FONT_PAIR_LABELS } from "@/lib/theme/font-pairs";
import { CORNER_LABELS, isFreePreset, THEME_PRESETS } from "@/lib/theme/presets";
import { resolveTheme } from "@/lib/theme/resolve";
import { cn } from "@/lib/utils";
import type {
  BackgroundStyle,
  CornerStyle,
  FontPair,
  MerchantFaq,
  MerchantTheme,
  Service,
  ServiceMedia,
  SubscriptionTier,
  TextScale,
  ThemePreset,
} from "@/types/database";

import { saveFaqs, updateProfileMedia, updateTheme } from "./actions";
import { INITIAL_APPEARANCE_STATE } from "./appearance-state";
import { FaqEditor, validasiFaqs, type FaqDraft } from "./faq-editor";
import { AppearancePreview } from "./preview-frame";

/** Bagian tema yang bisa disunting; cerminan kolom merchant_themes. */
type DraftTema = Omit<MerchantTheme, "merchant_id" | "created_at" | "updated_at">;

const TEMA_KOSONG: DraftTema = {
  preset: "BERSIH",
  accent: null,
  background_style: "SOLID",
  background_color: null,
  background_image_path: null,
  background_overlay: 45,
  font_pair: null,
  text_scale: "SEDANG",
  corner_style: null,
};

const SKALA: { nilai: TextScale; label: string }[] = [
  { nilai: "KECIL", label: "Kecil" },
  { nilai: "SEDANG", label: "Sedang" },
  { nilai: "BESAR", label: "Besar" },
];

const SUDUT: CornerStyle[] = ["TAJAM", "LEMBUT", "BULAT"];

const GAYA_LATAR: { nilai: BackgroundStyle; label: string }[] = [
  { nilai: "SOLID", label: "Polos" },
  { nilai: "GRADIENT", label: "Gradasi" },
  { nilai: "IMAGE", label: "Foto" },
];

/** Kunci kecil bertanda Pro untuk kontrol yang belum terbuka di paket Starter. */
function GemboksPro({ aktif }: { aktif: boolean }) {
  if (!aktif) return null;
  return (
    <Link href={ROUTES.billing} className="inline-flex items-center gap-1">
      <Badge variant="secondary" className="gap-1">
        <Lock className="size-3" />
        Pro
      </Badge>
    </Link>
  );
}

export function AppearanceEditor({
  tier,
  merchantId,
  username,
  name,
  bio,
  avatarUrl: avatarAwal,
  theme: temaAwal,
  services,
  mediaByService,
  faqs: faqsAwal,
}: {
  tier: SubscriptionTier;
  merchantId: string;
  username: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  theme: MerchantTheme | null;
  services: Service[];
  mediaByService: Record<string, ServiceMedia[]>;
  faqs: MerchantFaq[];
}) {
  const starter = tier === "STARTER";

  const [tema, setTema] = useState<DraftTema>(() =>
    temaAwal
      ? {
          preset: temaAwal.preset,
          accent: temaAwal.accent,
          background_style: temaAwal.background_style,
          background_color: temaAwal.background_color,
          background_image_path: temaAwal.background_image_path,
          background_overlay: temaAwal.background_overlay,
          font_pair: temaAwal.font_pair,
          text_scale: temaAwal.text_scale,
          corner_style: temaAwal.corner_style,
        }
      : TEMA_KOSONG,
  );
  // Salinan nilai yang benar-benar sudah tersimpan, untuk membedakan "sedang
  // dicoba-coba" dari "sudah dipakai pelanggan".
  const [temaTersimpan, setTemaTersimpan] = useState<DraftTema>(() => tema);
  const [avatarUrl, setAvatarUrl] = useState(avatarAwal);
  const [menghapusAvatar, setMenghapusAvatar] = useState(false);
  const [faqs, setFaqs] = useState<FaqDraft[]>(() =>
    faqsAwal.map((faq) => ({ id: faq.id, question: faq.question, answer: faq.answer })),
  );
  const [faqsTersimpan, setFaqsTersimpan] = useState<FaqDraft[]>(() =>
    faqsAwal.map((faq) => ({ id: faq.id, question: faq.question, answer: faq.answer })),
  );
  const [mengunggah, setMengunggah] = useState<"avatar" | "background" | null>(null);
  const [tampilan, setTampilan] = useState<"atur" | "preview">("atur");
  const [, mulaiTransisi] = useTransition();

  const [temaPending, mulaiSimpanTema] = useTransition();
  const [faqPending, mulaiSimpanFaqs] = useTransition();

  /**
   * Penyimpanan dijalankan lewat callback async, bukan useActionState +
   * useEffect. Snapshot "tersimpan" harus diperbarui tepat saat sebuah
   * penyimpanan berhasil, dan melakukannya di dalam efek berarti setState
   * sinkron di dalam efek -- render berantai, dan toast yang bisa muncul dua
   * kali kalau efeknya berjalan ulang. Di sini nilainya ditangkap sebelum
   * request berangkat, jadi perubahan yang dibuat merchant selagi request
   * berjalan tidak ikut terhitung sudah tersimpan.
   */
  function kirimTema(data: FormData) {
    const snapshot = tema;
    mulaiSimpanTema(async () => {
      const hasil = await updateTheme(INITIAL_APPEARANCE_STATE, data);
      if (hasil.status === "success") {
        setTemaTersimpan(snapshot);
        toast.success(hasil.message);
      } else {
        toast.error(hasil.message);
      }
    });
  }

  function kirimFaqs(data: FormData) {
    const snapshot = faqs;
    mulaiSimpanFaqs(async () => {
      const hasil = await saveFaqs(INITIAL_APPEARANCE_STATE, data);
      if (hasil.status === "success") {
        setFaqsTersimpan(snapshot);
        toast.success(hasil.message);
      } else {
        toast.error(hasil.message);
      }
    });
  }

  const temaBerubah = JSON.stringify(tema) !== JSON.stringify(temaTersimpan);
  const faqBerubah = JSON.stringify(faqs) !== JSON.stringify(faqsTersimpan);
  const adaPerubahan = temaBerubah || faqBerubah;

  // Halaman ini sengaja memakai tombol Simpan, bukan simpan otomatis -- etalase
  // merchant tidak boleh berubah sambil dicoba-coba. Konsekuensinya, menutup
  // tab tanpa menyimpan berarti pekerjaan hilang tanpa peringatan apa pun.
  useEffect(() => {
    if (!adaPerubahan) return;
    const cegah = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", cegah);
    return () => window.removeEventListener("beforeunload", cegah);
  }, [adaPerubahan]);

  const faqErrors = validasiFaqs(faqs);
  const faqTidakValid = Object.keys(faqErrors).length > 0;

  // Preview memakai resolver yang sama dengan halaman publik, termasuk
  // pemangkasan paket -- jadi merchant STARTER melihat persis apa yang benar
  // benar akan tampil, bukan versi yang lebih bagus dari kenyataan.
  const temaJadi = useMemo(
    () => resolveTheme(tier, { ...tema, merchant_id: merchantId, created_at: "", updated_at: "" }),
    [tier, tema, merchantId],
  );

  const faqPreview: MerchantFaq[] = faqs
    .filter((faq) => faq.question.trim() !== "" && faq.answer.trim() !== "")
    .map((faq, index) => ({
      id: faq.id,
      merchant_id: merchantId,
      question: faq.question,
      answer: faq.answer,
      sort_order: index,
      created_at: "",
      updated_at: "",
    }));

  async function unggahGambar(
    file: File,
    jenis: "avatar" | "background",
  ): Promise<void> {
    const galat = validateImageFile(file);
    if (galat) {
      toast.error(galat);
      return;
    }

    setMengunggah(jenis);
    const avatarLama = jenis === "avatar" ? mediaPathFromUrl(avatarUrl) : null;
    const latarLama = jenis === "background" ? tema.background_image_path : null;
    let pathBaru: string | null = null;

    try {
      const { blob } = await compressImage(file, {
        maxSide:
          jenis === "avatar" ? MEDIA_LIMITS.avatarMaxSide : MEDIA_LIMITS.backgroundMaxSide,
        square: jenis === "avatar",
      });

      pathBaru = `${merchantId}/${mediaFileName(jenis === "avatar" ? "avatar" : "bg", "webp")}`;
      await uploadMedia(pathBaru, blob, "image/webp");

      if (jenis === "avatar") {
        const url = publicMediaUrl(pathBaru);
        setAvatarUrl(url);
        const data = new FormData();
        data.set("avatar_url", url);
        const hasil = await updateProfileMedia(INITIAL_APPEARANCE_STATE, data);
        if (hasil.status === "error") {
          // Kembalikan tampilan ke foto lama: barisnya tidak tersimpan, jadi
          // menampilkan foto baru akan berbohong soal apa yang dilihat
          // pelanggan.
          setAvatarUrl(avatarUrl);
          throw new Error(hasil.message ?? "Foto profil gagal disimpan.");
        }
        toast.success("Foto profil tersimpan");
      } else {
        setTema((lama) => ({
          ...lama,
          background_style: "IMAGE",
          background_image_path: pathBaru,
        }));
      }

      // Berkas lama baru dihapus setelah penggantinya benar-benar mendarat.
      const lama = avatarLama ?? latarLama;
      if (lama) await removeMedia([lama]);
    } catch (error) {
      // Berkas sudah terlanjur mendarat tapi rangkaiannya gagal -- bersihkan,
      // jangan tinggalkan berkas yatim di bucket.
      if (pathBaru) await removeMedia([pathBaru]);
      toast.error(error instanceof Error ? error.message : "Gambar gagal diunggah.");
    } finally {
      setMengunggah(null);
    }
  }

  const panel = (
    <div className="flex max-w-lg flex-col gap-8">
      {/* 1. Foto profil */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Foto profil</h2>
        <div className="flex items-center gap-4">
          <div className="border-border size-16 shrink-0 overflow-hidden rounded-full border">
            {avatarUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element -- sudah
                 dikompres ke WebP 512px di browser sebelum diunggah. */
              <img src={avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              <div className="bg-muted text-muted-foreground flex size-full items-center justify-center text-lg">
                {(name || "?").charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label className="inline-flex">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={mengunggah !== null}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void unggahGambar(file, "avatar");
                }}
              />
              <span className="border-border hover:bg-muted inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium">
                {mengunggah === "avatar" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ImageUp className="size-4" />
                )}
                Ganti foto
              </span>
            </label>
            {avatarUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-fit"
                disabled={mengunggah !== null || menghapusAvatar}
                onClick={() => {
                  const lama = mediaPathFromUrl(avatarUrl);
                  setMenghapusAvatar(true);
                  setAvatarUrl(null);
                  const data = new FormData();
                  data.set("avatar_url", "");
                  mulaiTransisi(async () => {
                    const hasil = await updateProfileMedia(
                      INITIAL_APPEARANCE_STATE,
                      data,
                    );
                    if (hasil.status === "error") {
                      setAvatarUrl(avatarUrl);
                      toast.error(hasil.message);
                    } else {
                      // Hanya berkas milik kita yang dihapus. Foto lama dari
                      // Google OAuth bukan milik bucket ini, dan
                      // mediaPathFromUrl mengembalikan null untuknya.
                      if (lama) await removeMedia([lama]);
                      toast.success("Foto profil dihapus");
                    }
                    setMenghapusAvatar(false);
                  });
                }}
              >
                <Trash2 className="size-4" />
                Hapus foto
              </Button>
            ) : null}
            <p className="text-muted-foreground text-xs">
              JPG, PNG, atau WebP. Dipotong otomatis jadi persegi.
            </p>
          </div>
        </div>
      </section>

      <form action={kirimTema} className="flex flex-col gap-8">
        {/* Nilai yang tidak punya kontrol sendiri tetap harus ikut terkirim. */}
        <input type="hidden" name="preset" value={tema.preset} />
        <input type="hidden" name="accent" value={tema.accent ?? ""} />
        <input type="hidden" name="background_style" value={tema.background_style} />
        <input type="hidden" name="background_color" value={tema.background_color ?? ""} />
        <input
          type="hidden"
          name="background_image_path"
          value={tema.background_image_path ?? ""}
        />
        <input type="hidden" name="background_overlay" value={tema.background_overlay} />
        <input type="hidden" name="font_pair" value={tema.font_pair ?? ""} />
        <input type="hidden" name="text_scale" value={tema.text_scale} />
        <input type="hidden" name="corner_style" value={tema.corner_style ?? ""} />

        {/* 2. Tema */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Tema</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(Object.keys(THEME_PRESETS) as ThemePreset[]).map((key) => {
              const def = THEME_PRESETS[key];
              const terkunci = starter && !isFreePreset(key);
              return (
                <button
                  key={key}
                  type="button"
                  disabled={terkunci}
                  onClick={() => setTema((lama) => ({ ...lama, preset: key }))}
                  className={cn(
                    "border-border flex flex-col gap-2 border p-2 text-left transition-colors",
                    tema.preset === key && "ring-ring ring-2",
                    terkunci ? "cursor-not-allowed opacity-60" : "hover:bg-muted",
                  )}
                >
                  <span
                    aria-hidden
                    className="flex h-10 w-full items-end gap-1 p-1"
                    style={{ backgroundColor: def.background }}
                  >
                    <span className="h-2 flex-1" style={{ backgroundColor: def.accent }} />
                    <span
                      className="h-2 w-3"
                      style={{ backgroundColor: def.mutedForeground }}
                    />
                  </span>
                  <span className="flex items-center justify-between gap-1 text-xs font-medium">
                    {def.label}
                    <GemboksPro aktif={terkunci} />
                  </span>
                </button>
              );
            })}
          </div>
          <FieldDescription>{THEME_PRESETS[tema.preset].description}</FieldDescription>
        </section>

        {/* 3. Warna aksen */}
        <Field>
          <FieldLabel className="flex items-center gap-2">
            Warna aksen <GemboksPro aktif={starter} />
          </FieldLabel>
          <div className="flex items-center gap-2">
            <Input
              type="color"
              className="h-8 w-14 p-1"
              disabled={starter}
              value={tema.accent ?? THEME_PRESETS[tema.preset].accent}
              onChange={(e) =>
                setTema((lama) => ({ ...lama, accent: e.target.value.toLowerCase() }))
              }
              aria-label="Warna aksen"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={starter || tema.accent === null}
              onClick={() => setTema((lama) => ({ ...lama, accent: null }))}
            >
              Ikut tema
            </Button>
          </div>
          <FieldDescription>
            Dipakai untuk tombol. Kalau kontrasnya kurang, warna tulisannya
            disesuaikan otomatis supaya tetap terbaca.
          </FieldDescription>
        </Field>

        {/* 4. Background */}
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            Background <GemboksPro aktif={starter} />
          </h2>
          <div className="flex gap-2">
            {GAYA_LATAR.map((gaya) => (
              <Button
                key={gaya.nilai}
                type="button"
                size="sm"
                variant={tema.background_style === gaya.nilai ? "default" : "outline"}
                // "Foto" tidak bisa dipilih sebelum gambarnya ada. Sebelumnya
                // tombolnya bisa ditekan tapi tidak melakukan apa-apa, yang
                // terbaca seperti aplikasi rusak.
                disabled={
                  starter || (gaya.nilai === "IMAGE" && !tema.background_image_path)
                }
                onClick={() => setTema((lama) => ({ ...lama, background_style: gaya.nilai }))}
              >
                {gaya.label}
              </Button>
            ))}
          </div>

          {!starter && !tema.background_image_path ? (
            <FieldDescription>
              Unggah foto di bawah dulu untuk bisa memilih background bergambar.
            </FieldDescription>
          ) : null}

          {!starter && tema.background_style !== "IMAGE" ? (
            <div className="flex items-center gap-2">
              <Input
                type="color"
                className="h-8 w-14 p-1"
                value={tema.background_color ?? THEME_PRESETS[tema.preset].background}
                onChange={(e) =>
                  setTema((lama) => ({
                    ...lama,
                    background_color: e.target.value.toLowerCase(),
                  }))
                }
                aria-label="Warna background"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={tema.background_color === null}
                onClick={() => setTema((lama) => ({ ...lama, background_color: null }))}
              >
                Ikut tema
              </Button>
            </div>
          ) : null}

          {!starter ? (
            <div className="flex flex-col gap-2">
              <label className="inline-flex w-fit">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={mengunggah !== null}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void unggahGambar(file, "background");
                  }}
                />
                <span className="border-border hover:bg-muted inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium">
                  {mengunggah === "background" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ImageUp className="size-4" />
                  )}
                  Unggah foto background
                </span>
              </label>

              {tema.background_image_path ? (
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-fit"
                    onClick={() => {
                      const lama = tema.background_image_path;
                      setTema((t) => ({
                        ...t,
                        background_style: "SOLID",
                        background_image_path: null,
                      }));
                      if (lama) void removeMedia([lama]);
                    }}
                  >
                    <Trash2 className="size-4" />
                    Hapus foto background
                  </Button>

                  {tema.background_style === "IMAGE" ? (
                    <Field>
                      <FieldLabel htmlFor="overlay">
                        Gelap overlay: {tema.background_overlay}%
                      </FieldLabel>
                      <input
                        id="overlay"
                        type="range"
                        min={40}
                        max={80}
                        step={5}
                        value={Math.max(40, tema.background_overlay)}
                        onChange={(e) =>
                          setTema((lama) => ({
                            ...lama,
                            background_overlay: Number(e.target.value),
                          }))
                        }
                      />
                      <FieldDescription>
                        Minimal 40% supaya tulisan tetap terbaca di atas foto.
                      </FieldDescription>
                    </Field>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* 5. Font */}
        <Field>
          <FieldLabel className="flex items-center gap-2">
            Huruf <GemboksPro aktif={starter} />
          </FieldLabel>
          <Select
            disabled={starter}
            value={tema.font_pair ?? "IKUT_TEMA"}
            onValueChange={(nilai) =>
              setTema((lama) => ({
                ...lama,
                font_pair: nilai === "IKUT_TEMA" ? null : (nilai as FontPair),
              }))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="IKUT_TEMA">Ikut tema</SelectItem>
              {(Object.keys(FONT_PAIR_LABELS) as FontPair[]).map((pair) => (
                <SelectItem key={pair} value={pair}>
                  {FONT_PAIR_LABELS[pair]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            {tema.font_pair
              ? FONT_PAIR_DESCRIPTIONS[tema.font_pair]
              : "Memakai pasangan huruf bawaan tema yang dipilih."}
          </FieldDescription>
        </Field>

        {/* 6. Ukuran teks */}
        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            Ukuran teks <GemboksPro aktif={starter} />
          </h2>
          <div className="flex gap-2">
            {SKALA.map((skala) => (
              <Button
                key={skala.nilai}
                type="button"
                size="sm"
                variant={tema.text_scale === skala.nilai ? "default" : "outline"}
                disabled={starter}
                onClick={() => setTema((lama) => ({ ...lama, text_scale: skala.nilai }))}
              >
                {skala.label}
              </Button>
            ))}
          </div>
        </section>

        {/* 7. Sudut */}
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Sudut</h2>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={tema.corner_style === null ? "default" : "outline"}
              onClick={() => setTema((lama) => ({ ...lama, corner_style: null }))}
            >
              Ikut tema
            </Button>
            {SUDUT.map((sudut) => (
              <Button
                key={sudut}
                type="button"
                size="sm"
                variant={tema.corner_style === sudut ? "default" : "outline"}
                onClick={() => setTema((lama) => ({ ...lama, corner_style: sudut }))}
              >
                {CORNER_LABELS[sudut]}
              </Button>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={temaPending || !temaBerubah}>
            {temaPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Simpan tampilan
          </Button>
          {temaBerubah ? (
            <span className="text-muted-foreground text-xs">
              Perubahan belum tersimpan. Pengunjung masih melihat versi lama.
            </span>
          ) : null}
          <Button asChild variant="outline">
            <a href={ROUTES.merchantPage(username)} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              Lihat halaman saya
            </a>
          </Button>
        </div>
      </form>

      {/* 8. FAQ */}
      <form action={kirimFaqs} className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Pertanyaan umum</h2>
        <input
          type="hidden"
          name="faqs"
          value={JSON.stringify(
            faqs.map(({ question, answer }) => ({ question, answer })),
          )}
        />
        <FaqEditor faqs={faqs} errors={faqErrors} onChange={setFaqs} />
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            className="w-fit"
            disabled={faqPending || faqTidakValid}
          >
            {faqPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Simpan FAQ
          </Button>
          {faqTidakValid ? (
            <span className="text-muted-foreground text-xs">
              Lengkapi dulu baris yang ditandai merah.
            </span>
          ) : null}
        </div>
      </form>
    </div>
  );

  const preview = (
    <AppearancePreview
      theme={temaJadi}
      name={name}
      bio={bio}
      avatarUrl={avatarUrl}
      services={services}
      mediaByService={mediaByService}
      faqs={faqPreview}
      showWatermark={starter}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Di layar sempit panel dan preview bergantian. Pemilihnya HANYA
          menyembunyikan lewat CSS -- keduanya tetap dirender sekali saja.
          Versi sebelumnya menaruh panel di dalam <Tabs> DAN di grid desktop,
          sehingga seluruh editor ada dua kali di DOM: empat <form>, dua input
          berkas, dan dua salinan tiap isian yang berbagi state. */}
      <div className="flex w-fit gap-1 lg:hidden">
        {(["atur", "preview"] as const).map((nilai) => (
          <Button
            key={nilai}
            type="button"
            size="sm"
            variant={tampilan === nilai ? "default" : "outline"}
            aria-pressed={tampilan === nilai}
            onClick={() => setTampilan(nilai)}
          >
            {nilai === "atur" ? "Atur" : "Preview"}
          </Button>
        ))}
      </div>

      <div className="gap-10 lg:grid lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className={cn(tampilan === "preview" && "max-lg:hidden")}>{panel}</div>
        <div
          className={cn(
            "lg:sticky lg:top-6 lg:self-start",
            tampilan === "atur" && "max-lg:hidden",
          )}
        >
          {preview}
        </div>
      </div>
    </div>
  );
}
