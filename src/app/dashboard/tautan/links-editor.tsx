"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { BookingPageShell } from "@/components/booking-page/page-shell";
import { LinksSection } from "@/components/booking-page/links-section";
import { BookingProfileHeader } from "@/components/booking-page/profile-header";
import { SocialIcons } from "@/components/booking-page/social-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isSafeLinkUrl } from "@/lib/funnel/pixel-ids";
import { applyPlacement, type LinkPlacement } from "@/lib/funnel/link-placement";
import { ROUTES } from "@/lib/routes";
import type { ResolvedTheme } from "@/lib/theme/types";

import { saveMerchantLinks } from "./actions";

type Row = { id: string; label: string; url: string; isVisible: boolean };
type Contacts = { instagram: string | null; tiktok: string | null; whatsapp: string | null };

const MAX_LINKS = 8;
const URL_ERROR = "Alamat harus lengkap dan diawali https://, misalnya https://maps.app.goo.gl/...";
const PLACEMENT_LABELS: Record<LinkPlacement, string> = {
  BEFORE_SERVICES: "Di atas daftar layanan",
  AFTER_SERVICES: "Di bawah daftar layanan",
  END: "Paling bawah, setelah FAQ",
};

export function LinksEditor({
  initialLinks,
  initialShowSocial,
  initialPlacement,
  theme,
  name,
  bio,
  avatarUrl,
  contacts,
}: {
  initialLinks: Row[];
  initialShowSocial: boolean;
  initialPlacement: LinkPlacement;
  theme: ResolvedTheme;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  contacts: Contacts | null;
}) {
  const [rows, setRows] = useState(initialLinks);
  const [showSocial, setShowSocial] = useState(initialShowSocial);
  const [placement, setPlacement] = useState(initialPlacement);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const patch = (i: number, p: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) =>
    setRows((r) => {
      const n = [...r];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });
  const urlBad = (r: Row) => (submitted || r.url.trim() !== "https://") && !isSafeLinkUrl(r.url.trim());
  const labelBad = (r: Row) => submitted && r.label.trim() === "";

  const save = () => {
    setSubmitted(true);
    setError(null);
    if (rows.some((r) => !isSafeLinkUrl(r.url.trim()) || r.label.trim() === "")) {
      setError("Periksa kembali isian Anda");
      return;
    }
    startTransition(async () => {
      const res = await saveMerchantLinks({
        links: rows.map((r) => ({ ...r, label: r.label.trim(), url: r.url.trim() })),
        showSocialIcons: showSocial,
        placement,
      });
      if (res.ok) toast.success("Tautan tersimpan");
      else setError(res.message);
    });
  };

  const kontak = [
    contacts?.instagram && `@${contacts.instagram.replace(/^@/, "")} (Instagram)`,
    contacts?.tiktok && `@${contacts.tiktok.replace(/^@/, "")} (TikTok)`,
    contacts?.whatsapp && `${contacts.whatsapp} (WhatsApp)`,
  ].filter(Boolean);

  const urutan = applyPlacement(null, placement).filter((s) => s === "LINKS" || s === "SERVICES");

  return (
    <div className="mt-6 flex flex-wrap items-start gap-4">
      <div className="flex min-w-0 flex-[999_1_460px] flex-col gap-4">
        <section aria-labelledby="links-h" className="flex flex-col gap-3 rounded-xl border p-4">
          <div className="flex items-center gap-2.5">
            <h2 id="links-h" className="flex-1 text-[15px] font-semibold">Tautan</h2>
            <span className="text-muted-foreground text-sm">{rows.length} dari {MAX_LINKS}</span>
          </div>

          {rows.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
              Belum ada tautan. Tambahkan portofolio, daftar harga, atau lokasi studio supaya pelanggan dari bio langsung menemukannya.
            </p>
          ) : (
            <ol className="flex flex-col gap-2.5">
              {rows.map((r, i) => {
                const bad = urlBad(r);
                return (
                  <li
                    key={r.id}
                    className={`flex items-start gap-2.5 rounded-[10px] border p-2.5 ${bad ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30" : ""}`}
                  >
                    <div className="flex flex-col gap-1">
                      <Button type="button" variant="outline" size="icon" className="size-8" aria-label={`Naikkan ${r.label}`} disabled={i === 0 || pending} onClick={() => move(i, -1)}>
                        <ChevronUp aria-hidden />
                      </Button>
                      <Button type="button" variant="outline" size="icon" className="size-8" aria-label={`Turunkan ${r.label}`} disabled={i === rows.length - 1 || pending} onClick={() => move(i, 1)}>
                        <ChevronDown aria-hidden />
                      </Button>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <Input value={r.label} maxLength={40} aria-label={`Teks tautan ${i + 1}`} aria-invalid={labelBad(r)} onChange={(e) => patch(i, { label: e.target.value })} />
                      <Input value={r.url} inputMode="url" aria-label={`Alamat tautan ${i + 1}`} aria-invalid={bad} onChange={(e) => patch(i, { url: e.target.value })} />
                      {labelBad(r) ? <span role="alert" className="text-sm text-red-700 dark:text-red-400">Isi nama tombol</span> : null}
                      {bad ? <span role="alert" className="text-sm text-red-700 dark:text-red-400">{URL_ERROR}</span> : null}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                        <input type="checkbox" className="size-[18px] accent-black dark:accent-white" checked={r.isVisible} onChange={(e) => patch(i, { isVisible: e.target.checked })} />
                        Tampil
                      </label>
                      <Button type="button" variant="ghost" size="sm" className="text-red-700 dark:text-red-400" aria-label={`Hapus ${r.label}`} onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>
                        Hapus
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <Button
            type="button"
            variant="outline"
            className="self-start border-dashed"
            disabled={rows.length >= MAX_LINKS}
            onClick={() => setRows((r) => [...r, { id: crypto.randomUUID(), label: "Tautan baru", url: "https://", isVisible: true }])}
          >
            Tambah tautan
          </Button>
          <span className="text-muted-foreground text-xs">
            Ikon dipilih otomatis dari alamatnya: Instagram, TikTok, WhatsApp, Google Maps, Google Drive, atau ikon tautan biasa.
          </span>
        </section>

        <section aria-labelledby="sos-h" className="flex flex-col gap-2.5 rounded-xl border p-4">
          <h2 id="sos-h" className="text-[15px] font-semibold">Ikon sosmed di bawah nama usaha</h2>
          <label className="flex min-h-8 cursor-pointer items-center gap-2.5 text-sm">
            <input type="checkbox" className="size-[18px] accent-black dark:accent-white" checked={showSocial} onChange={(e) => setShowSocial(e.target.checked)} />
            Tampilkan ikon Instagram, TikTok, dan WhatsApp
          </label>
          <p className="text-muted-foreground text-sm">
            {kontak.length > 0 ? `Diambil dari kontak di Pengaturan: ${kontak.join(", ")}. ` : "Belum ada kontak yang bisa ditampilkan. "}
            <Link href={ROUTES.settings} className="text-foreground font-semibold underline">Ubah di Pengaturan</Link>
          </p>
        </section>

        <section aria-labelledby="letak-h" className="flex flex-wrap items-center gap-3 rounded-xl border p-4">
          <h2 id="letak-h" className="text-[15px] font-semibold">Letak tautan</h2>
          <select
            aria-labelledby="letak-h"
            value={placement}
            onChange={(e) => setPlacement(e.target.value as LinkPlacement)}
            className="border-input bg-background h-9 rounded-lg border px-2.5 text-sm"
          >
            {(Object.keys(PLACEMENT_LABELS) as LinkPlacement[]).map((p) => (
              <option key={p} value={p}>{PLACEMENT_LABELS[p]}</option>
            ))}
          </select>
          <span className="text-muted-foreground text-sm">Urutan semua bagian juga bisa diatur di <Link href={ROUTES.appearance} className="underline">Tampilan</Link>.</span>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={save} disabled={pending}>{pending ? "Menyimpan..." : "Simpan"}</Button>
          {error ? <span role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</span> : null}
        </div>
      </div>

      <aside aria-label="Pratinjau halaman" className="max-w-[320px] min-w-[280px] flex-[1_1_280px]">
        <span className="text-muted-foreground mb-2 block text-xs">Pratinjau</span>
        <div className="mx-auto w-full overflow-hidden rounded-[2rem] border-[6px] border-neutral-800" style={{ transform: "translateZ(0)" }}>
          <div className="max-h-[620px] overflow-y-auto">
            <BookingPageShell theme={theme} className="min-h-0" innerClassName="min-h-0" preview>
              <BookingProfileHeader
                name={name}
                bio={bio}
                avatarUrl={avatarUrl}
                theme={theme}
                socials={showSocial && contacts ? <SocialIcons name={name} {...contacts} /> : null}
              />
              {urutan.map((s) =>
                s === "LINKS" ? (
                  <LinksSection key={s} links={rows.filter((r) => r.isVisible)} />
                ) : (
                  <div key={s} aria-hidden className="text-muted-foreground flex h-10 items-center justify-center border border-dashed text-xs" style={{ borderRadius: "var(--radius)" }}>
                    Daftar layanan
                  </div>
                ),
              )}
            </BookingPageShell>
          </div>
        </div>
      </aside>
    </div>
  );
}
