"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";

import { BookingPageShell } from "@/components/booking-page/page-shell";
import { PromoBanners } from "@/components/booking-page/promo-banners";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { jakartaDateISO } from "@/lib/booking/slots";
import { compressImage } from "@/lib/media/compress";
import { validateImageFile } from "@/lib/media/limits";
import { mediaFileName, removeMedia, uploadMedia } from "@/lib/media/upload";
import type { ResolvedTheme } from "@/lib/theme/types";
import { themeToCssVars } from "@/lib/theme/css";
import { cn } from "@/lib/utils";
import type { BannerColor, BannerSource, BannerTarget, MerchantBanner, PublicBanner } from "@/types/database";

import { deleteBanner, saveBanner } from "./banner-actions";
import { INITIAL_BANNER_FORM_STATE, themeSwatch, type BannerFormState } from "./banner-state";

export type VoucherOption = { id: string; code: string };
export type ServiceOption = { id: string; name: string };

const COLOR_LABELS: Record<BannerColor, string> = { ACCENT: "Aksen tema", DARK: "Gelap", SOFT: "Lembut" };
const TARGET_LABELS: Record<BannerTarget | "NONE", string> = {
  NONE: "Tanpa tombol",
  VOUCHER: "Voucher publik",
  SERVICE: "Layanan",
  URL: "Tautan lain",
};
const SELECT_CLASS =
  "border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

/** Tanggal selesai di DB eksklusif (00:00 hari berikutnya); form menampilkan hari terakhir. */
const endsOn = (endsAt: string | null) => (endsAt ? jakartaDateISO(new Date(Date.parse(endsAt) - 1)) : "");

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="text-destructive text-sm">
      {message}
    </p>
  ) : null;
}

export function BannerForm({
  banner,
  vouchers,
  services,
  theme,
  merchantId,
  merchantName,
  onDone,
}: {
  banner: MerchantBanner | null;
  vouchers: VoucherOption[];
  services: ServiceOption[];
  theme: ResolvedTheme;
  merchantId: string;
  merchantName: string;
  onDone: () => void;
}) {
  const [source, setSource] = useState<BannerSource>(banner?.source ?? "TEMPLATE");
  const [tag, setTag] = useState(banner?.tag_text ?? "");
  const [title, setTitle] = useState(banner?.title ?? "");
  const [body, setBody] = useState(banner?.body ?? "");
  const [color, setColor] = useState<BannerColor>(banner?.color ?? "ACCENT");
  const [alt, setAlt] = useState(banner?.alt_text ?? "");
  const [cta, setCta] = useState(banner?.cta_text ?? "");
  const [targetKind, setTargetKind] = useState<BannerTarget | null>(banner?.target_kind ?? null);
  const [voucherId, setVoucherId] = useState(banner?.target_voucher_id ?? "");
  const [serviceId, setServiceId] = useState(banner?.target_service_id ?? "");
  const [url, setUrl] = useState(banner?.target_url ?? "");
  // Gambar baru ditahan di memori dan baru diunggah saat disimpan, jadi batal tidak meninggalkan berkas yatim.
  const [file, setFile] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [state, formAction, pending] = useActionState<BannerFormState, FormData>(
    async (prev, formData) => {
      let newPath: string | null = null;
      try {
        if (source === "IMAGE" && file) {
          const { blob } = await compressImage(file, { maxSide: 1200, square: false, aspect: 3 });
          newPath = `${merchantId}/banner/${mediaFileName("banner", "webp")}`;
          await uploadMedia(newPath, blob, "image/webp");
          formData.set("image_path", newPath);
        }
      } catch (error) {
        return { status: "error", message: error instanceof Error ? error.message : "Gambar gagal diunggah." };
      }

      const result = await saveBanner(prev, formData);
      if (result.status === "success") {
        // Berkas lama baru dihapus setelah baris tersimpan dengan gambar pengganti.
        if (newPath && banner?.image_path) await removeMedia([banner.image_path]);
        toast.success(result.message);
        onDone();
      } else if (newPath) {
        await removeMedia([newPath]);
      }
      return result;
    },
    INITIAL_BANNER_FORM_STATE,
  );
  const errors = state.fieldErrors ?? {};

  function pickFile(next: File | undefined) {
    if (!next) return;
    const error = validateImageFile(next);
    if (error) {
      toast.error(error);
      return;
    }
    if (localUrl) URL.revokeObjectURL(localUrl);
    setFile(next);
    setLocalUrl(URL.createObjectURL(next));
  }

  const pendingImage = source === "IMAGE" ? localUrl : null;
  const previewBanner: PublicBanner = {
    id: banner?.id ?? "preview",
    merchant_id: merchantId,
    source,
    tag_text: source === "TEMPLATE" && tag.trim() ? tag.trim() : null,
    title: source === "TEMPLATE" ? title.trim() || "Judul banner" : null,
    body: source === "TEMPLATE" && body.trim() ? body.trim() : null,
    color,
    image_path: source === "IMAGE" ? (banner?.image_path ?? null) : null,
    alt_text: source === "IMAGE" ? alt : null,
    cta_text: targetKind && cta.trim() ? cta.trim() : null,
    target_kind: targetKind,
    target_voucher_id: targetKind === "VOUCHER" ? voucherId || null : null,
    target_service_id: targetKind === "SERVICE" ? serviceId || null : null,
    target_url: targetKind === "URL" ? url : null,
    starts_at: null,
    ends_at: null,
    sort_order: banner?.sort_order ?? 0,
  };
  const voucherCodeById = Object.fromEntries(vouchers.map((v) => [v.id, v.code]));

  const choice = (active: boolean, label: string, onClick: () => void) => (
    <button
      key={label}
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-11 flex-1 rounded-md border px-3 text-sm font-medium",
        active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted",
      )}
    >
      {label}
    </button>
  );

  return (
    <>
      <form action={formAction} className="flex flex-col gap-5 px-4 pb-4">
        {banner ? <input type="hidden" name="id" value={banner.id} /> : null}
        <input type="hidden" name="source" value={source} />
        <input type="hidden" name="color" value={color} />
        <input type="hidden" name="target_kind" value={targetKind ?? ""} />
        <input type="hidden" name="image_path" value={banner?.image_path ?? ""} />

        {state.status === "error" && !state.fieldErrors ? (
          <p role="alert" className="text-destructive text-sm">
            {state.message}
          </p>
        ) : null}

        <div className="flex gap-2">
          {choice(source === "TEMPLATE", "Dari template", () => setSource("TEMPLATE"))}
          {choice(source === "IMAGE", "Unggah gambar", () => setSource("IMAGE"))}
        </div>

        {source === "TEMPLATE" ? (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="banner-tag">Label kecil</Label>
              <Input id="banner-tag" name="tag_text" value={tag} maxLength={24} onChange={(e) => setTag(e.target.value)} aria-invalid={!!errors.tag_text} className="min-h-11" />
              <FieldError message={errors.tag_text} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="banner-title">Judul</Label>
              <Input id="banner-title" name="title" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!errors.title} className="min-h-11" />
              <FieldError message={errors.title} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="banner-body">Keterangan</Label>
              <Textarea id="banner-body" name="body" value={body} maxLength={90} rows={2} onChange={(e) => setBody(e.target.value)} aria-invalid={!!errors.body} />
              <FieldError message={errors.body} />
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Warna</legend>
              <div className="flex gap-3">
                {(Object.keys(COLOR_LABELS) as BannerColor[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={color === c}
                    aria-label={COLOR_LABELS[c]}
                    title={COLOR_LABELS[c]}
                    onClick={() => setColor(c)}
                    className={cn(
                      "size-11 rounded-full border-2",
                      color === c ? "ring-ring ring-2 ring-offset-2" : "",
                    )}
                    style={{ background: themeSwatch(theme, c) }}
                  />
                ))}
              </div>
              <p className="text-muted-foreground text-sm">Diambil dari tema halaman Anda, kontras teks sudah aman.</p>
            </fieldset>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="banner-file">Gambar banner</Label>
              <input
                id="banner-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => pickFile(e.target.files?.[0])}
                className="min-h-11 text-sm"
              />
              <p className="text-muted-foreground text-sm">Rasio 3:1, minimal 1200 x 400 px. JPG, PNG, atau WebP.</p>
              {!file && !banner?.image_path ? <FieldError message={errors.image_path} /> : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="banner-alt">Teks alternatif</Label>
              <Input id="banner-alt" name="alt_text" value={alt} maxLength={140} onChange={(e) => setAlt(e.target.value)} aria-invalid={!!errors.alt_text} className="min-h-11" />
              <p className="text-muted-foreground text-sm">Wajib. Tulis isi tulisan di gambar untuk pembaca layar.</p>
              <FieldError message={errors.alt_text} />
            </div>
          </>
        )}

        <div className="flex flex-col gap-2">
          <Label>Tombol menuju</Label>
          <div className="grid grid-cols-2 gap-2">
            {choice(targetKind === null, TARGET_LABELS.NONE, () => setTargetKind(null))}
            {(["VOUCHER", "SERVICE", "URL"] as BannerTarget[]).map((k) =>
              choice(targetKind === k, TARGET_LABELS[k], () => setTargetKind(k)),
            )}
          </div>
        </div>

        {targetKind ? (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="banner-cta">Teks tombol</Label>
              <Input id="banner-cta" name="cta_text" value={cta} maxLength={20} onChange={(e) => setCta(e.target.value)} aria-invalid={!!errors.cta_text} className="min-h-11" />
              <FieldError message={errors.cta_text} />
            </div>
            {targetKind === "VOUCHER" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="banner-voucher">Voucher</Label>
                <select id="banner-voucher" name="target_voucher_id" value={voucherId} onChange={(e) => setVoucherId(e.target.value)} className={SELECT_CLASS}>
                  <option value="">Pilih voucher</option>
                  {vouchers.map((v) => (
                    <option key={v.id} value={v.id}>
                      Voucher {v.code}
                    </option>
                  ))}
                </select>
                {vouchers.length === 0 ? <p className="text-muted-foreground text-sm">Belum ada voucher publik.</p> : null}
                <FieldError message={errors.target_voucher_id} />
              </div>
            ) : null}
            {targetKind === "SERVICE" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="banner-service">Layanan</Label>
                <select id="banner-service" name="target_service_id" value={serviceId} onChange={(e) => setServiceId(e.target.value)} className={SELECT_CLASS}>
                  <option value="">Pilih layanan</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      Layanan: {s.name}
                    </option>
                  ))}
                </select>
                <FieldError message={errors.target_service_id} />
              </div>
            ) : null}
            {targetKind === "URL" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="banner-url">Tautan</Label>
                <Input id="banner-url" name="target_url" type="url" inputMode="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} aria-invalid={!!errors.target_url} className="min-h-11" />
                <FieldError message={errors.target_url} />
              </div>
            ) : null}
          </>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="banner-start">Mulai tayang</Label>
            <Input id="banner-start" name="starts_on" type="date" defaultValue={banner?.starts_at ? jakartaDateISO(new Date(banner.starts_at)) : ""} aria-invalid={!!errors.starts_on} className="min-h-11" />
            <FieldError message={errors.starts_on} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="banner-end">Selesai</Label>
            <Input id="banner-end" name="ends_on" type="date" defaultValue={endsOn(banner?.ends_at ?? null)} aria-invalid={!!errors.ends_on} className="min-h-11" />
            <FieldError message={errors.ends_on} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Pratinjau di HP</p>
          <div className="border-border mx-auto w-full max-w-[280px] overflow-hidden rounded-[2rem] border-[6px] border-neutral-800">
            <BookingPageShell theme={theme} className="min-h-0" innerClassName="min-h-0">
              <p className="text-sm font-medium">{merchantName}</p>
              {pendingImage ? (
                <div style={themeToCssVars(theme)}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- pratinjau lokal sebelum diunggah */}
                  <img src={pendingImage} alt={alt} className="aspect-[3/1] w-full object-cover" style={{ borderRadius: "var(--radius)" }} />
                </div>
              ) : source === "IMAGE" && !banner?.image_path ? (
                <p className="text-muted-foreground text-sm">Pilih gambar untuk melihat pratinjau.</p>
              ) : (
                <PromoBanners
                  banners={[previewBanner]}
                  voucherCodeById={voucherCodeById}
                  activeServiceIds={services.map((s) => s.id)}
                  onApplyVoucher={() => {}}
                  onSelectService={() => {}}
                />
              )}
            </BookingPageShell>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button type="submit" name="published" value="true" disabled={pending} className="min-h-11">
            {pending ? <Spinner /> : null}
            Simpan dan jadwalkan
          </Button>
          <Button type="submit" name="published" value="false" variant="outline" disabled={pending} className="min-h-11">
            Simpan draf
          </Button>
          {banner ? (
            <Button type="button" variant="destructive" onClick={() => setConfirmDelete(true)} className="min-h-11">
              Hapus
            </Button>
          ) : null}
        </div>
      </form>

      {banner ? (
        <DeleteDialog banner={banner} open={confirmDelete} onOpenChange={setConfirmDelete} onDeleted={onDone} />
      ) : null}
    </>
  );
}

function DeleteDialog({
  banner,
  open,
  onOpenChange,
  onDeleted,
}: {
  banner: MerchantBanner;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteBanner(banner.id);
      if (result.ok) {
        if (result.imagePath) await removeMedia([result.imagePath]);
        toast.success("Banner dihapus");
        onDeleted();
      } else {
        toast.error(result.message ?? "Gagal menghapus banner.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hapus banner ini?</DialogTitle>
          <DialogDescription>Banner langsung hilang dari halaman booking dan tidak bisa dikembalikan.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Batal
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={pending}>
            {pending ? <Spinner /> : null}
            Hapus banner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
