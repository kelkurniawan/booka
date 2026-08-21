"use client";

import { useEffect, useRef, useState, useTransition, type TransitionStartFunction } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { mediaFileName, removeMedia, uploadMedia } from "@/lib/media/upload";
import { ROUTES } from "@/lib/routes";
import type { Service, ServiceMedia, SubscriptionTier } from "@/types/database";

import { attachServiceMedia, createService, updateService } from "./actions";
import { ServiceMediaField, type DraftMedia } from "./service-media-field";
import { INITIAL_SERVICE_FORM_STATE, type ServiceFormState } from "./service-state";

/**
 * Dialog tambah/ubah layanan. Mode ditentukan oleh ada tidaknya `service`.
 *
 * `DialogContent` dari Radix baru merender anaknya ke DOM saat dialog
 * terbuka, dan melepasnya lagi setelah animasi tutup selesai — jadi
 * `ServiceForm` di dalamnya otomatis mendapat state form yang bersih setiap
 * kali dialog dibuka ulang, tanpa perlu reset manual.
 */
export function ServiceFormDialog({
  open,
  onOpenChange,
  service,
  merchantId,
  tier,
  media = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service?: Service;
  merchantId: string;
  tier: SubscriptionTier;
  media?: ServiceMedia[];
}) {
  // Dipegang di sini, bukan di ServiceForm, supaya dialog sendiri bisa
  // menolak ditutup selagi submit atau unggahan draft masih berjalan --
  // tombol X, Escape, dan klik di luar semuanya lewat onOpenChange yang
  // dipasang di komponen ini.
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(nilai) => {
        // Menutup selagi sibuk memutus await unggahan yang sedang jalan di
        // tengah, meninggalkan berkas yatim di bucket dan merchant yang
        // tidak tahu prosesnya belum selesai.
        if (!nilai && pending) return;
        onOpenChange(nilai);
      }}
    >
      <DialogContent
        showCloseButton={!pending}
        onEscapeKeyDown={(e) => {
          if (pending) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (pending) e.preventDefault();
        }}
      >
        <ServiceForm
          service={service}
          merchantId={merchantId}
          tier={tier}
          media={media}
          pending={pending}
          startTransition={startTransition}
          onSuccess={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Mengunggah tiap draft dan melampirkannya ke layanan yang baru saja
 * tersimpan. Urutan wajib: layanan dulu, berkas kemudian -- foreign key
 * service_media menolak baris yang menunjuk layanan yang belum ada, dan
 * menahan berkas sampai titik ini berarti kegagalan pembuatan layanan tidak
 * meninggalkan sampah di bucket. Mengembalikan jumlah berkas yang gagal.
 */
async function unggahDraft(
  merchantId: string,
  serviceId: string,
  draft: DraftMedia[],
): Promise<number> {
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

function ServiceForm({
  service,
  merchantId,
  tier,
  media,
  pending,
  startTransition,
  onSuccess,
}: {
  service?: Service;
  merchantId: string;
  tier: SubscriptionTier;
  media: ServiceMedia[];
  /** Dipegang oleh ServiceFormDialog supaya dialog bisa menolak ditutup selagi ini true. */
  pending: boolean;
  startTransition: TransitionStartFunction;
  onSuccess: () => void;
}) {
  const isEdit = Boolean(service);
  const action = isEdit ? updateService : createService;

  const [state, setState] = useState<ServiceFormState>(INITIAL_SERVICE_FORM_STATE);
  const [draft, setDraft] = useState<DraftMedia[]>([]);

  // Ref pelacak draft terbaru untuk cleanup unmount di bawah. Ditulis di
  // dalam efek (bukan saat render) supaya lolos aturan lint "Cannot access
  // refs during render".
  const draftRef = useRef<DraftMedia[]>(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    // Dialog Radix melepas komponen ini begitu tertutup. Bila merchant
    // menutup dialog tanpa menyimpan, pratinjau blob yang masih tersisa di
    // draft harus dilepas di sini -- kalau tidak, blob-nya menggantung di
    // memori.
    return () => {
      for (const item of draftRef.current) {
        URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  /**
   * Dipanggil lewat `action` form, bukan `useActionState` + efek terpisah:
   * penutupan dialog harus menunggu unggahan draft rampung, dan `useEffect`
   * yang menutup dialog begitu status berubah "success" akan melepas
   * komponen ini SEBELUM unggahan sempat berjalan -- `await` yang sedang
   * berlangsung terputus dan draftnya hilang tanpa jejak.
   */
  function kirimForm(formData: FormData) {
    startTransition(async () => {
      const hasil = await action(INITIAL_SERVICE_FORM_STATE, formData);
      setState(hasil);

      if (hasil.status !== "success") return;

      if (isEdit) {
        toast.success("Layanan diperbarui");
        onSuccess();
        return;
      }

      toast.success("Layanan ditambahkan");

      if (hasil.serviceId && draft.length > 0) {
        const gagal = await unggahDraft(merchantId, hasil.serviceId, draft);
        if (gagal > 0) {
          toast.error(
            `${gagal} dari ${draft.length} berkas gagal diunggah. Layanannya sendiri tetap tersimpan -- tambahkan lagi lewat menu Ubah.`,
          );
        }
      }

      onSuccess();
    });
  }

  return (
    <>
      <form action={kirimForm} className="flex flex-col gap-4" noValidate>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Ubah layanan" : "Tambah layanan"}</DialogTitle>
          <DialogDescription>
            Layanan ini akan tampil di halaman booking Anda beserta harga dan durasinya.
          </DialogDescription>
        </DialogHeader>

        {service ? <input type="hidden" name="id" value={service.id} /> : null}

        <Field data-invalid={Boolean(state.fieldErrors?.name)}>
          <FieldLabel htmlFor="name">Nama layanan</FieldLabel>
          <Input
            id="name"
            name="name"
            defaultValue={service?.name ?? ""}
            placeholder="Riasan pengantin"
            maxLength={80}
            required
            aria-invalid={Boolean(state.fieldErrors?.name)}
          />
          {state.fieldErrors?.name ? <FieldError>{state.fieldErrors.name}</FieldError> : null}
        </Field>

        <Field data-invalid={Boolean(state.fieldErrors?.description)}>
          <FieldLabel htmlFor="description">Deskripsi (opsional)</FieldLabel>
          <Textarea
            id="description"
            name="description"
            defaultValue={service?.description ?? ""}
            placeholder="Ceritakan singkat apa yang didapat pelanggan"
            maxLength={500}
            aria-invalid={Boolean(state.fieldErrors?.description)}
          />
          {state.fieldErrors?.description ? (
            <FieldError>{state.fieldErrors.description}</FieldError>
          ) : null}
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field data-invalid={Boolean(state.fieldErrors?.price)}>
            <FieldLabel htmlFor="price">Harga (Rp)</FieldLabel>
            <Input
              id="price"
              name="price"
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              defaultValue={service?.price ?? ""}
              placeholder="350000"
              required
              aria-invalid={Boolean(state.fieldErrors?.price)}
            />
            {state.fieldErrors?.price ? (
              <FieldError>{state.fieldErrors.price}</FieldError>
            ) : (
              <FieldDescription>Angka polos, tanpa titik atau &quot;Rp&quot;.</FieldDescription>
            )}
          </Field>

          <Field data-invalid={Boolean(state.fieldErrors?.duration_minutes)}>
            <FieldLabel htmlFor="duration_minutes">Durasi (menit)</FieldLabel>
            <Input
              id="duration_minutes"
              name="duration_minutes"
              type="number"
              inputMode="numeric"
              min={5}
              max={480}
              step={5}
              defaultValue={service?.duration_minutes ?? ""}
              placeholder="90"
              required
              aria-invalid={Boolean(state.fieldErrors?.duration_minutes)}
            />
            {state.fieldErrors?.duration_minutes ? (
              <FieldError>{state.fieldErrors.duration_minutes}</FieldError>
            ) : (
              <FieldDescription>5–480 menit.</FieldDescription>
            )}
          </Field>
        </div>

        {state.status === "error" && !state.fieldErrors ? (
          <Alert variant="destructive">
            <AlertTitle>{state.limitReached ? "Batas layanan tercapai" : "Gagal menyimpan"}</AlertTitle>
            <AlertDescription>
              {state.message}
              {state.limitReached ? (
                <>
                  {" "}
                  <a href={ROUTES.billing}>Naik ke paket Pro</a>.
                </>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner /> : null}
            {isEdit ? "Simpan perubahan" : "Tambah layanan"}
          </Button>
        </DialogFooter>
      </form>

      {/* Sengaja DI LUAR <form> supaya berkas media tidak ikut terkirim
          bersama isian layanan saat form ini disubmit. */}
      <div className="border-border mt-2 border-t pt-4">
        {service ? (
          <ServiceMediaField
            serviceId={service.id}
            merchantId={merchantId}
            tier={tier}
            media={media}
          />
        ) : (
          <ServiceMediaField
            merchantId={merchantId}
            tier={tier}
            draft={draft}
            onDraftChange={setDraft}
            disabled={pending}
          />
        )}
      </div>
    </>
  );
}
