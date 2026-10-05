"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import type { NotificationLog } from "@/types/database";

const KIND_LABEL: Record<NotificationLog["kind"], string> = {
  BOOKING_PAID_MERCHANT: "Pemberitahuan ke Anda",
  BOOKING_PAID_CUSTOMER: "Konfirmasi ke pelanggan",
  REMINDER_CUSTOMER: "Reminder H-1 ke pelanggan",
};

const CHANNEL_LABEL: Record<NotificationLog["channel"], string> = {
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
};

const STATUS_META: Record<
  NotificationLog["status"],
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  SENT: { label: "Terkirim", variant: "default" },
  PENDING: { label: "Mengirim", variant: "secondary" },
  FAILED: { label: "Gagal", variant: "destructive" },
  SKIPPED: { label: "Dilewati", variant: "outline" },
};

type Row = Pick<NotificationLog, "id" | "kind" | "channel" | "status" | "detail">;

/**
 * Riwayat notifikasi satu booking, dimuat saat dialog detail dibuka.
 * RLS `notification_log_read_own` membatasi ke baris milik merchant ini.
 * Gagal memuat cukup disembunyikan -- riwayat ini pelengkap, bukan inti
 * detail booking.
 */
export function NotificationHistory({ bookingId }: { bookingId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let active = true;
    createClient()
      .from("notification_log")
      .select("id, kind, channel, status, detail")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (active) setRows(data ?? []);
      });
    return () => {
      active = false;
    };
  }, [bookingId]);

  if (!rows || rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-t pt-4 text-sm">
      <p className="font-medium">Notifikasi</p>
      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {KIND_LABEL[row.kind]}{" "}
              <span className="text-muted-foreground">· {CHANNEL_LABEL[row.channel]}</span>
            </span>
            <Badge variant={STATUS_META[row.status].variant} title={row.detail ?? undefined}>
              {STATUS_META[row.status].label}
            </Badge>
            {row.detail && row.status !== "SENT" ? (
              <span className="text-muted-foreground w-full text-xs">{row.detail}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
