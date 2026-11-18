"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import { saveTracking, type TrackingErrors } from "./actions";

export type TrackingValues = {
  metaPixelId: string;
  tiktokPixelId: string;
  ga4MeasurementId: string;
  metaEnabled: boolean;
  tiktokEnabled: boolean;
  ga4Enabled: boolean;
};

type Key = "meta" | "tiktok" | "ga4";
const CARDS: { key: Key; id: "metaPixelId" | "tiktokPixelId" | "ga4MeasurementId"; on: "metaEnabled" | "tiktokEnabled" | "ga4Enabled"; title: string; label: string; placeholder: string; where: string }[] = [
  { key: "meta", id: "metaPixelId", on: "metaEnabled", title: "Meta (Instagram dan Facebook)", label: "Pixel ID", placeholder: "15 atau 16 angka", where: "Ada di Events Manager, bagian Data sources." },
  { key: "tiktok", id: "tiktokPixelId", on: "tiktokEnabled", title: "TikTok", label: "Pixel ID", placeholder: "20 huruf dan angka", where: "Ada di TikTok Events Manager, bagian Web events." },
  { key: "ga4", id: "ga4MeasurementId", on: "ga4Enabled", title: "Google Analytics 4", label: "Measurement ID", placeholder: "G-XXXXXXXXXX", where: "Ada di Admin, Data streams, lalu pilih stream web." },
];

const EVENTS = [
  { what: "Membuka halaman", note: "Setiap kunjungan", meta: "PageView", tt: "Pageview", ga: "page_view" },
  { what: "Memilih layanan", note: "Membawa nama dan harga layanan", meta: "ViewContent", tt: "ViewContent", ga: "view_item" },
  { what: "Lanjut ke data diri", note: "Jadwal sudah dipilih", meta: "InitiateCheckout", tt: "InitiateCheckout", ga: "begin_checkout" },
  { what: "Booking dibuat", note: "Termasuk booking bayar di tempat", meta: "Lead", tt: "SubmitForm", ga: "generate_lead" },
  { what: "Pembayaran QRIS berhasil", note: "Membawa nilai dalam rupiah", meta: "Purchase", tt: "CompletePayment", ga: "purchase" },
];

export function PixelForm({ initial, pageUrl }: { initial: TrackingValues; pageUrl: string | null }) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<TrackingErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const res = await saveTracking(v);
      if (res.ok) toast.success("Pengaturan pixel tersimpan");
      else {
        setErrors(res.fieldErrors ?? {});
        setFormError(res.fieldErrors ? null : res.message);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end gap-3">
        {formError ? <p role="alert" className="text-destructive text-sm">{formError}</p> : null}
        <Button type="button" onClick={save} disabled={pending}>{pending ? "Menyimpan..." : "Simpan"}</Button>
      </div>
      <div className="flex flex-wrap gap-3">
        {CARDS.map((c) => {
          const error = errors[c.id];
          return (
            <section key={c.key} aria-label={c.title} className="flex flex-[1_1_260px] flex-col gap-2.5 rounded-xl border p-4">
              <div className="flex items-center gap-2.5">
                <h2 className="flex-1 text-[15px] font-semibold">{c.title}</h2>
                <Switch checked={v[c.on]} aria-label={`Aktifkan pixel ${c.title}`} onCheckedChange={(on) => setV({ ...v, [c.on]: on })} />
              </div>
              <label htmlFor={`px-${c.key}`} className="font-medium text-sm">{c.label}</label>
              <Input
                id={`px-${c.key}`}
                className="font-mono"
                value={v[c.id]}
                placeholder={c.placeholder}
                aria-invalid={error ? true : undefined}
                onChange={(e) => setV({ ...v, [c.id]: e.target.value })}
              />
              {error ? <span role="alert" className="text-destructive text-[13px]">{error}</span> : null}
              <span className="text-muted-foreground text-xs">{c.where}</span>
            </section>
          );
        })}
      </div>
      <section aria-labelledby="ev-h" className="overflow-hidden rounded-xl border">
        <div className="flex flex-col gap-0.5 border-b p-3.5">
          <h2 id="ev-h" className="text-[15px] font-semibold">Kejadian yang dikirim</h2>
          <p className="text-muted-foreground text-[13px]">Marky mengirim nama kejadian standar, jadi Anda bisa langsung memakainya sebagai tujuan konversi iklan.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-sm">
            <thead>
              <tr className="text-muted-foreground text-left [&>th]:border-b [&>th]:px-3 [&>th]:py-2.5 [&>th]:font-medium">
                <th scope="col">Di halaman booking</th>
                <th scope="col">Meta</th>
                <th scope="col">TikTok</th>
                <th scope="col">Google Analytics 4</th>
              </tr>
            </thead>
            <tbody className="[&_td]:border-b [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top [&_tr:last-child_td]:border-b-0">
              {EVENTS.map((e) => (
                <tr key={e.meta}>
                  <td>
                    <span className="font-medium">{e.what}</span>
                    <br />
                    <span className="text-muted-foreground text-xs">{e.note}</span>
                  </td>
                  <td><code className="font-mono text-[13px]">{e.meta}</code></td>
                  <td><code className="font-mono text-[13px]">{e.tt}</code></td>
                  <td><code className="font-mono text-[13px]">{e.ga}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="flex flex-wrap gap-3">
        <section aria-labelledby="priv-h" className="bg-muted/40 flex flex-[1_1_320px] flex-col gap-1.5 rounded-xl px-4 py-3.5">
          <h2 id="priv-h" className="text-sm font-semibold">Yang dikirim ke platform iklan</h2>
          <p className="text-foreground/80 text-sm leading-normal">
            Pixel dimuat di halaman booking dan halaman pembayaran Anda, tidak di dashboard. Marky hanya mengirim jenis kejadian, nama layanan, dan nilai booking. Nama, nomor WhatsApp, dan catatan pelanggan tidak dikirim Marky. Matikan Automatic advanced matching di Events Manager bila tidak ingin platform mengambil data dari form.
          </p>
        </section>
        <section aria-labelledby="tes-h" className="flex flex-[1_1_320px] flex-col gap-1.5 rounded-xl border px-4 py-3.5">
          <h2 id="tes-h" className="text-sm font-semibold">Cek pixel sudah jalan</h2>
          <p className="text-foreground/80 text-sm leading-normal">
            Buka halaman booking Anda, lalu lihat menu Test events di Meta Events Manager atau TikTok Events Manager. Kejadian muncul dalam beberapa detik.
          </p>
          {pageUrl ? (
            <a href={pageUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-8 items-center self-start text-sm font-semibold underline-offset-4 hover:underline">
              Buka halaman booking saya
            </a>
          ) : null}
        </section>
      </div>
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <span className="rounded-full border px-2 py-0.5 text-xs font-semibold">Segera hadir</span>
        Kirim kejadian dari server (Conversions API) agar tetap tercatat walau pengunjung memakai pemblokir iklan.
      </p>
    </div>
  );
}
