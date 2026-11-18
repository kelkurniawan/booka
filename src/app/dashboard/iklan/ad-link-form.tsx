"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adLinkUrls, slugifyAdLink } from "@/lib/funnel/attribution";
import { cn } from "@/lib/utils";
import type { AdChannel } from "@/types/database";

import { createAdLink } from "./actions";
import { AdLinkQr } from "./ad-link-qr";
import { CHANNEL_LABELS, CHANNEL_ORDER } from "./labels";

export type ServiceOption = { id: string; name: string };
export type VoucherOption = { code: string; label: string };

const SELECT = "border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm";

export function AdLinkForm({ origin, username, services, vouchers }: { origin: string; username: string; services: ServiceOption[]; vouchers: VoucherOption[] }) {
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<AdChannel>("IG_BIO");
  const [serviceId, setServiceId] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [savedSlug, setSavedSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  // Mengubah isian membuang hasil simpan: QR di samping selalu milik tautan yang tertera.
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setSavedSlug(null);
    setCopied(false);
    setError(null);
  };

  const slug = savedSlug ?? slugifyAdLink(name.trim() || "contoh", channel);
  const urls = adLinkUrls({ origin, username, slug, channel });
  const dest = serviceId ? services.find((s) => s.id === serviceId)?.name : null;

  const reset = () => {
    setName("");
    setChannel("IG_BIO");
    setServiceId("");
    setVoucherCode("");
    setSavedSlug(null);
    setError(null);
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await createAdLink({ name, channel, serviceId: serviceId || null, voucherCode: voucherCode || null });
      if (res.ok) {
        setSavedSlug(res.slug);
        toast.success("Tautan tersimpan");
      } else setError(res.message);
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(urls.short);
      setCopied(true);
    } catch {
      setError("Tautan belum bisa disalin. Salin manual dari kotak di atas.");
    }
  };

  return (
    <div className="flex flex-wrap items-start gap-4">
      <section aria-labelledby="buat-h" className="flex min-w-0 flex-[999_1_420px] flex-col gap-3.5 rounded-xl border p-4">
        <h2 id="buat-h" className="text-[15px] font-semibold">Buat tautan</h2>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="nama" className="font-medium text-sm">
            Nama tautan <span className="text-muted-foreground font-normal">(hanya terlihat oleh Anda)</span>
          </label>
          <Input id="nama" value={name} maxLength={60} placeholder="Iklan TikTok wisuda Desember" onChange={(e) => edit(setName)(e.target.value)} />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Dipasang di</legend>
          <div role="radiogroup" className="flex flex-wrap gap-1.5">
            {CHANNEL_ORDER.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={channel === c}
                onClick={() => edit(setChannel)(c)}
                className={cn("h-8 rounded-lg border px-3 text-sm", channel === c ? "border-primary bg-primary text-primary-foreground" : "bg-background text-foreground/80")}
              >
                {CHANNEL_LABELS[c]}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-[1_1_200px] flex-col gap-1.5">
            <label htmlFor="tujuan" className="font-medium text-sm">Pengunjung langsung ke</label>
            <select id="tujuan" className={SELECT} value={serviceId} onChange={(e) => edit(setServiceId)(e.target.value)}>
              <option value="">Halaman utama</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>Layanan: {s.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-[1_1_200px] flex-col gap-1.5">
            <label htmlFor="vc" className="font-medium text-sm">
              Voucher terpasang <span className="text-muted-foreground font-normal">(opsional)</span>
            </label>
            <select id="vc" className={SELECT} value={voucherCode} onChange={(e) => edit(setVoucherCode)(e.target.value)}>
              <option value="">Tanpa voucher</option>
              {vouchers.map((v) => (
                <option key={v.code} value={v.code}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span id="url-l" className="font-medium text-sm">Tautan untuk dipasang</span>
          <div className="flex gap-2">
            <output aria-labelledby="url-l" className="bg-muted/40 flex h-9 min-w-0 flex-1 items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border px-2.5 font-mono text-[13px]">
              {urls.short.replace(/^https?:\/\//, "")}
            </output>
            <Button type="button" onClick={copy} disabled={!savedSlug}>{copied ? "Tersalin" : "Salin"}</Button>
          </div>
          <details>
            <summary className="text-muted-foreground flex min-h-8 cursor-pointer items-center text-sm">Tautan lengkap dengan UTM, untuk Ads Manager</summary>
            <p className="bg-muted/40 mt-1.5 break-all rounded-lg px-2.5 py-2 font-mono text-xs">{urls.full}</p>
          </details>
        </div>
        {error ? <p role="alert" className="text-destructive text-sm">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={reset} disabled={pending}>Batal</Button>
          <Button type="button" onClick={save} disabled={pending || !name.trim() || savedSlug !== null}>
            {pending ? "Menyimpan..." : "Simpan tautan"}
          </Button>
        </div>
      </section>
      <aside aria-labelledby="qr-h" className="flex flex-[1_1_240px] flex-col items-center gap-3 rounded-xl border p-4 text-center">
        <h2 id="qr-h" className="self-start text-[15px] font-semibold">QR untuk dicetak</h2>
        <AdLinkQr url={urls.short} filename={slug} ariaLabel="QR untuk tautan ini" canDownload={savedSlug !== null} />
        <span className="text-muted-foreground text-[13px]">
          {savedSlug
            ? `Pindai untuk langsung ke ${dest ?? "halaman utama"}${voucherCode ? " dengan voucher terpasang" : ""}.`
            : "Simpan tautan dulu agar QR bisa diunduh. Alamat final bisa berbeda bila namanya sudah dipakai."}
        </span>
      </aside>
    </div>
  );
}
