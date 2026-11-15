"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/lib/routes";
import type { ContactChannel, MerchantSettings } from "@/types/database";

import { updateContactSettings, type BookingSettingsState } from "./booking-settings-actions";
import { SaveFooter, type SettingsAction } from "./customer-policy-form";

type Settings = Pick<
  MerchantSettings,
  | "contact_phone" | "contact_email" | "contact_instagram" | "contact_threads" | "contact_x" | "contact_tiktok"
  | "contact_hidden" | "reply_from" | "reply_until"
>;

const INITIAL: BookingSettingsState = { status: "idle" };

const ROWS = [
  { channel: "PHONE", label: "Telepon", field: "contact_phone", type: "tel", placeholder: "0812-3456-7890" },
  { channel: "EMAIL", label: "Email", field: "contact_email", type: "email", placeholder: "halo@usaha.id" },
  { channel: "INSTAGRAM", label: "Instagram", field: "contact_instagram", type: "text", placeholder: "namausaha" },
  { channel: "THREADS", label: "Threads", field: "contact_threads", type: "text", placeholder: "namausaha" },
  { channel: "X", label: "X", field: "contact_x", type: "text", placeholder: "namausaha" },
  { channel: "TIKTOK", label: "TikTok", field: "contact_tiktok", type: "text", placeholder: "namausaha" },
] as const satisfies readonly { channel: ContactChannel; field: keyof Settings; [k: string]: string }[];

// Kolom time Postgres datang sebagai HH:MM:SS, input type=time cukup HH:MM.
const hhmm = (t: string | null) => t?.slice(0, 5) ?? "";

export function ContactSettingsForm({
  settings,
  whatsapp,
  action = updateContactSettings,
}: {
  settings: Settings;
  whatsapp: string | null;
  action?: SettingsAction;
}) {
  const [state, formAction] = useActionState(action, INITIAL);
  const shown = (c: ContactChannel) => !settings.contact_hidden.includes(c);

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Kontak &amp; media sosial</CardTitle>
        <CardDescription>
          Tampil di tombol &quot;Hubungi&quot; pada halaman booking pelanggan. Kosongkan yang tidak dipakai.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 md:gap-2">
            <div className="text-muted-foreground hidden grid-cols-[6rem_1fr_3.5rem] gap-3 text-xs md:grid">
              <span>Kanal</span>
              <span>Alamat</span>
              <span>Tampil</span>
            </div>

            <Row label="WhatsApp" channel="WHATSAPP" shown={shown("WHATSAPP")}>
              <p className="text-sm">
                {whatsapp ? (
                  <>
                    {whatsapp}{" "}
                  </>
                ) : (
                  <span className="text-muted-foreground">Belum diisi </span>
                )}
                <Link href={`${ROUTES.settings}#profil`} className="text-foreground underline underline-offset-4">
                  Ubah di Profil
                </Link>
              </p>
            </Row>

            {ROWS.map((r) => (
              <Row key={r.channel} label={r.label} channel={r.channel} shown={shown(r.channel)}>
                <Input
                  name={r.field}
                  type={r.type}
                  defaultValue={settings[r.field] as string | null ?? ""}
                  placeholder={r.placeholder}
                  aria-label={`Alamat ${r.label}`}
                />
              </Row>
            ))}
          </div>

          <div className="flex min-h-11 flex-wrap items-center gap-2 text-sm">
            <span>Jam balas pesan</span>
            <Input name="reply_from" type="time" defaultValue={hhmm(settings.reply_from)} aria-label="Jam balas mulai" className="w-28" />
            <span>sampai</span>
            <Input name="reply_until" type="time" defaultValue={hhmm(settings.reply_until)} aria-label="Jam balas selesai" className="w-28" />
            <span>WIB</span>
          </div>

          <SaveFooter state={state} />
        </form>
      </CardContent>
    </Card>
  );
}

function Row({ label, channel, shown, children }: { label: string; channel: ContactChannel; shown: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 md:grid-cols-[6rem_1fr_3.5rem]">
      <span className="text-sm font-medium">{label}</span>
      <div className="order-last col-span-2 md:order-none md:col-span-1">{children}</div>
      <span className="flex size-11 items-center justify-center justify-self-end md:justify-self-start">
        <input type="checkbox" name={`show_${channel}`} defaultChecked={shown} aria-label={`Tampilkan ${label}`} className="size-5" />
      </span>
    </div>
  );
}
