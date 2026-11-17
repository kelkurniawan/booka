"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";

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
import { Switch } from "@/components/ui/switch";
import { jakartaDateISO } from "@/lib/booking/slots";
import { computeDiscount, randomVoucherCode } from "@/lib/booking/voucher";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Voucher, VoucherKind } from "@/types/database";

import { deleteVoucher, saveVoucher } from "./actions";
import { INITIAL_VOUCHER_FORM_STATE, type VoucherFormState } from "./voucher-state";

export type ServiceOption = { id: string; name: string; price: number };

const rp = (value: number) => formatRupiah(value).replace(/\s/g, "");

/** Tanggal selesai di DB eksklusif (00:00 hari berikutnya); form menampilkan hari terakhir. */
function endsOn(endsAt: string | null): string {
  return endsAt ? jakartaDateISO(new Date(Date.parse(endsAt) - 1)) : "";
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="text-destructive text-sm">
      {message}
    </p>
  ) : null;
}

export function VoucherForm({
  voucher,
  services,
  onDone,
}: {
  voucher: Voucher | null;
  services: ServiceOption[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<VoucherFormState, FormData>(
    async (prev, formData) => {
      const result = await saveVoucher(prev, formData);
      if (result.status === "success") {
        toast.success(result.message);
        onDone();
      }
      return result;
    },
    INITIAL_VOUCHER_FORM_STATE,
  );
  const errors = state.fieldErrors ?? {};

  const [code, setCode] = useState(voucher?.code ?? "");
  const [kind, setKind] = useState<VoucherKind>(voucher?.kind ?? "PERCENT");
  const [value, setValue] = useState(voucher ? String(voucher.value) : "");
  const [maxDiscount, setMaxDiscount] = useState(voucher?.max_discount != null ? String(voucher.max_discount) : "");
  const [minSpend, setMinSpend] = useState(voucher?.min_spend != null ? String(voucher.min_spend) : "");
  const [scopeAll, setScopeAll] = useState(!voucher?.service_ids?.length);
  const [serviceIds, setServiceIds] = useState<string[]>(voucher?.service_ids ?? []);
  const [quota, setQuota] = useState(voucher?.quota != null ? String(voucher.quota) : "");
  const [startsOn, setStartsOn] = useState(voucher?.starts_at ? jakartaDateISO(new Date(voucher.starts_at)) : "");
  const [endsOnValue, setEndsOnValue] = useState(endsOn(voucher?.ends_at ?? null));
  const [onePerPhone, setOnePerPhone] = useState(voucher?.per_phone_limit === 1);
  const [newCustomerOnly, setNewCustomerOnly] = useState(voucher?.new_customer_only ?? false);
  const [isPublic, setIsPublic] = useState(voucher ? voucher.visibility === "PUBLIC" : true);
  const [scopeError, setScopeError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Layanan tercakup yang tidak aktif/tersembunyi tidak punya checkbox; id-nya tetap dikirim agar tidak hilang saat disimpan.
  const hiddenScopedIds = serviceIds.filter((id) => !services.some((s) => s.id === id));

  // Baris contoh memakai layanan pertama dalam cakupan voucher.
  const sample = services.find((s) => (scopeAll ? true : serviceIds.includes(s.id)));
  const numValue = Number(value);
  const example =
    sample && Number.isInteger(numValue) && numValue > 0 && (kind === "FIXED" || numValue <= 100)
      ? (() => {
          const terms = {
            code,
            kind,
            value: numValue,
            max_discount: kind === "PERCENT" && maxDiscount ? Number(maxDiscount) : null,
            min_spend: minSpend ? Number(minSpend) : null,
            service_ids: null,
          };
          const discount = computeDiscount(terms, Number(sample.price));
          return `Contoh: ${sample.name} ${rp(Number(sample.price))} menjadi ${rp(Number(sample.price) - discount)} (hemat ${rp(discount)}).`;
        })()
      : null;

  const segment = (k: VoucherKind, label: string) => (
    <button
      type="button"
      aria-pressed={kind === k}
      onClick={() => setKind(k)}
      className={cn(
        "min-h-11 flex-1 rounded-md border px-3 text-sm font-medium",
        kind === k ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted",
      )}
    >
      {label}
    </button>
  );

  return (
    <>
      <form
        action={formAction}
        onSubmit={(e) => {
          if (!scopeAll && serviceIds.length === 0) {
            e.preventDefault();
            setScopeError("Pilih minimal satu layanan");
          }
        }}
        className="flex flex-col gap-5 px-4 pb-4">
        {voucher ? <input type="hidden" name="id" value={voucher.id} /> : null}
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="is_public" value={String(isPublic)} />
        <input type="hidden" name="scope" value={scopeAll ? "all" : "some"} />
        {!scopeAll ? hiddenScopedIds.map((id) => <input key={id} type="hidden" name="service_ids" value={id} />) : null}

        {state.status === "error" && !state.fieldErrors ? (
          <p role="alert" className="text-destructive text-sm">
            {state.message}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="voucher-code">Kode</Label>
          <div className="flex gap-2">
            <Input
              id="voucher-code"
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={16}
              autoComplete="off"
              aria-invalid={!!errors.code}
              className="min-h-11 font-mono"
            />
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setCode(randomVoucherCode())}>
              Acak
            </Button>
          </div>
          <p className="text-muted-foreground text-sm">4 sampai 16 huruf atau angka. Tidak membedakan huruf besar kecil.</p>
          <FieldError message={errors.code} />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Jenis potongan</Label>
          <div className="flex gap-2">
            {segment("PERCENT", "Persen")}
            {segment("FIXED", "Nominal")}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="voucher-value">{kind === "PERCENT" ? "Persen" : "Nominal (Rp)"}</Label>
            <Input
              id="voucher-value"
              name="value"
              type="number"
              inputMode="numeric"
              min={1}
              max={kind === "PERCENT" ? 100 : undefined}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={!!errors.value}
              className="min-h-11"
            />
            <FieldError message={errors.value} />
          </div>
          {kind === "PERCENT" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="voucher-max">Maks potongan</Label>
              <Input
                id="voucher-max"
                name="max_discount"
                type="number"
                inputMode="numeric"
                min={1}
                placeholder="Tanpa batas"
                value={maxDiscount}
                onChange={(e) => setMaxDiscount(e.target.value)}
                aria-invalid={!!errors.max_discount}
                className="min-h-11"
              />
              <FieldError message={errors.max_discount} />
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="voucher-min">Min transaksi</Label>
          <Input
            id="voucher-min"
            name="min_spend"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="Tanpa minimal"
            value={minSpend}
            onChange={(e) => setMinSpend(e.target.value)}
            aria-invalid={!!errors.min_spend}
            className="min-h-11"
          />
          <FieldError message={errors.min_spend} />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Berlaku untuk</legend>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" name="scope-choice" checked={scopeAll} onChange={() => { setScopeAll(true); setScopeError(undefined); }} />
            Semua layanan
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" name="scope-choice" checked={!scopeAll} onChange={() => setScopeAll(false)} />
            Pilih beberapa…
          </label>
          {!scopeAll ? (
            <div className="flex flex-col gap-1 pl-6">
              {services.map((service) => (
                <label key={service.id} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="service_ids"
                    value={service.id}
                    checked={serviceIds.includes(service.id)}
                    onChange={(e) => {
                      setScopeError(undefined);
                      setServiceIds((ids) => (e.target.checked ? [...ids, service.id] : ids.filter((i) => i !== service.id)));
                    }}
                  />
                  {service.name}
                </label>
              ))}
              {services.length === 0 ? (
                <p className="text-muted-foreground text-sm">Belum ada layanan aktif.</p>
              ) : null}
            </div>
          ) : null}
          <FieldError message={scopeError ?? errors.service_ids} />
        </fieldset>

        {example ? <p className="text-muted-foreground text-sm">{example}</p> : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="voucher-quota">Total kuota</Label>
          <Input
            id="voucher-quota"
            name="quota"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="Tanpa batas"
            value={quota}
            onChange={(e) => setQuota(e.target.value)}
            aria-invalid={!!errors.quota}
            className="min-h-11"
          />
          <FieldError message={errors.quota} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="voucher-start">Mulai</Label>
            <Input
              id="voucher-start"
              name="starts_on"
              type="date"
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
              aria-invalid={!!errors.starts_on}
              className="min-h-11"
            />
            <FieldError message={errors.starts_on} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="voucher-end">Selesai</Label>
            <Input
              id="voucher-end"
              name="ends_on"
              type="date"
              value={endsOnValue}
              onChange={(e) => setEndsOnValue(e.target.value)}
              aria-invalid={!!errors.ends_on}
              className="min-h-11"
            />
            <FieldError message={errors.ends_on} />
          </div>
        </div>

        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="one_per_phone" checked={onePerPhone} onChange={(e) => setOnePerPhone(e.target.checked)} />
          Satu kali per nomor WhatsApp
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="new_customer_only" checked={newCustomerOnly} onChange={(e) => setNewCustomerOnly(e.target.checked)} />
          Hanya untuk pelanggan baru
        </label>

        <div className="flex flex-col gap-1">
          <div className="flex min-h-11 items-center justify-between gap-3">
            <Label htmlFor="voucher-public">Tampilkan di halaman booking</Label>
            <Switch id="voucher-public" checked={isPublic} onCheckedChange={setIsPublic} />
          </div>
          <p className="text-muted-foreground text-sm">
            {isPublic
              ? "Pelanggan melihat voucher ini di langkah terakhir booking."
              : "Kode rahasia: hanya pelanggan yang mengetik kodenya yang bisa memakai voucher ini. Minimal 6 karakter."}
          </p>
          <FieldError message={errors.is_public} />
        </div>

        <p className="text-muted-foreground text-sm">
          Layanan DP: DP dihitung dari harga setelah diskon. Bayar di tempat: diskon tercatat di booking agar staf
          menagih harga yang benar.
        </p>

        <div className="flex flex-col gap-2">
          <Button type="submit" disabled={pending} className="min-h-11">
            {pending ? <Spinner /> : null}
            Simpan voucher
          </Button>
          <Button type="button" variant="outline" onClick={onDone} className="min-h-11">
            Batal
          </Button>
          {voucher ? (
            <Button type="button" variant="destructive" onClick={() => setConfirmDelete(true)} className="min-h-11">
              Hapus voucher
            </Button>
          ) : null}
        </div>
      </form>

      {voucher ? (
        <DeleteDialog
          voucher={voucher}
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          onDeleted={onDone}
        />
      ) : null}
    </>
  );
}

function DeleteDialog({
  voucher,
  open,
  onOpenChange,
  onDeleted,
}: {
  voucher: Voucher;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteVoucher(voucher.id);
      if (result.ok) {
        toast.success("Voucher dihapus");
        onDeleted();
      } else {
        toast.error(result.message ?? "Gagal menghapus voucher.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hapus voucher {voucher.code}?</DialogTitle>
          <DialogDescription>
            Pelanggan tidak bisa memakainya lagi. Booking lama tetap menyimpan diskonnya.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Batal
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={pending}>
            {pending ? <Spinner /> : null}
            Hapus voucher
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
