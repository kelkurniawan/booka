"use client";

import Link from "next/link";
import { ImageUp, Loader2, Lock, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";

type Jenis = "logo" | "cover";

function Unggah({
  label,
  sibuk,
  nonaktif,
  onFile,
}: {
  label: string;
  sibuk: boolean;
  nonaktif: boolean;
  onFile: (file: File) => void;
}) {
  return (
    <label className="inline-flex">
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="peer sr-only"
        disabled={nonaktif}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
      <span className="border-border hover:bg-muted peer-focus-visible:ring-ring/50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm font-medium peer-focus-visible:ring-3">
        {sibuk ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />}
        {label}
      </span>
    </label>
  );
}

/** Logo dan foto sampul. Sampul dikunci untuk Starter, tapi Hapus tetap boleh. */
export function BrandFields({
  logoUrl,
  coverUrl,
  busy,
  coverLocked,
  onUpload,
  onRemove,
}: {
  logoUrl: string | null;
  coverUrl: string | null;
  busy: Jenis | null;
  coverLocked: boolean;
  onUpload: (kind: Jenis, file: File) => void;
  onRemove: (kind: Jenis) => void;
}) {
  const baris: { kind: Jenis; judul: string; hint: string; url: string | null }[] = [
    { kind: "logo", judul: "Logo", hint: "PNG, JPG, atau WebP. Dipotong persegi.", url: logoUrl },
    {
      kind: "cover",
      judul: "Foto sampul",
      hint: "Dipotong ke rasio 3:1, 1200 x 400 px.",
      url: coverUrl,
    },
  ];
  return (
    <div className="flex flex-col gap-5">
      {baris.map(({ kind, judul, hint, url }) => {
        const terkunci = kind === "cover" && coverLocked;
        return (
          <div key={kind} className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              {judul}
              {terkunci ? (
                <Link href={ROUTES.billing} className="inline-flex items-center gap-1">
                  <Badge variant="secondary" className="gap-1">
                    <Lock className="size-3" />
                    Pro
                  </Badge>
                </Link>
              ) : null}
            </h3>
            <div className="flex items-center gap-3">
              <div
                className={
                  kind === "logo"
                    ? "border-border bg-muted size-16 shrink-0 overflow-hidden rounded-lg border"
                    : "border-border bg-muted aspect-[3/1] w-32 shrink-0 overflow-hidden rounded-lg border"
                }
              >
                {url ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- sudah dikompres ke WebP di browser. */
                  <img src={url} alt="" className="size-full object-cover" />
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Unggah
                  label={url ? "Ganti" : "Unggah"}
                  sibuk={busy === kind}
                  nonaktif={busy !== null || terkunci}
                  onFile={(file) => onUpload(kind, file)}
                />
                {url ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11"
                    disabled={busy !== null}
                    onClick={() => onRemove(kind)}
                  >
                    <Trash2 className="size-4" />
                    Hapus
                  </Button>
                ) : null}
              </div>
            </div>
            <p className="text-muted-foreground text-xs">{hint}</p>
          </div>
        );
      })}
    </div>
  );
}
