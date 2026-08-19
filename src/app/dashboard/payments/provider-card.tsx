"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, KeyRound, Link2, ShieldCheck, Unlink } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/lib/format";
import type { PaymentConnection, PaymentProvider } from "@/types/database";

import { disconnectProvider } from "./actions";
import { ManualKeyDialog } from "./manual-key-dialog";
import { PROVIDER_META } from "./payment-state";

const CONNECTION_MODE_LABEL: Record<PaymentConnection["connection_mode"], string> = {
  MANUAL_KEY: "Server Key manual",
  OAUTH: "OAuth Connect",
};

const ENVIRONMENT_LABEL: Record<PaymentConnection["environment"], string> = {
  SANDBOX: "Sandbox",
  PRODUCTION: "Production",
};

export function ProviderCard({
  provider,
  connection,
  maskedCredential,
  isUsedForBooking,
}: {
  provider: PaymentProvider;
  connection: PaymentConnection | null;
  /** Maksimal 4 karakter terakhir Server Key/token -- lihat maskCredential(). TIDAK PERNAH kredensial penuh. */
  maskedCredential: string | null;
  /**
   * True kalau provider ini yang dipakai POST /api/bookings untuk booking
   * baru -- lihat selectActiveConnection di
   * src/lib/payments/select-connection.ts. Pemanggil (page.tsx) hanya
   * menyalakannya kalau merchant punya lebih dari satu koneksi ACTIVE;
   * kalau cuma satu, tidak ada ambiguitas yang perlu dijelaskan lewat badge.
   */
  isUsedForBooking: boolean;
}) {
  const meta = PROVIDER_META[provider];
  const isActive = connection?.status === "ACTIVE";

  /**
   * Peringatan "pembayaran sedang gagal" -- lihat insiden di komentar
   * migration 20260819000300_payment_connection_charge_health.sql: koneksi
   * ACTIVE tapi charge selalu ditolak gateway tidak boleh terus tampil
   * seperti badge hijau biasa. Aktif kalau ada penolakan tercatat DAN belum
   * ada charge sukses SESUDAH penolakan itu -- gagal lalu sukses lagi
   * sesudahnya berarti sudah pulih (lihat komentar last_charge_success_at
   * di src/types/database.ts).
   */
  const chargeFailing =
    isActive &&
    connection?.last_charge_error_at != null &&
    (connection.last_charge_success_at == null ||
      new Date(connection.last_charge_success_at).getTime() <=
        new Date(connection.last_charge_error_at).getTime());

  const [manualKeyOpen, setManualKeyOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnectPending, startDisconnect] = useTransition();

  function handleDisconnect() {
    startDisconnect(async () => {
      const result = await disconnectProvider(provider);
      if (result.ok) {
        toast.success(`Koneksi ${meta.name} diputuskan`);
        setDisconnectOpen(false);
      } else {
        toast.error(result.message ?? "Gagal memutuskan koneksi.");
      }
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{meta.name}</CardTitle>
          <CardDescription>{meta.description}</CardDescription>
          <CardAction className="flex flex-col items-end gap-1">
            {isActive && chargeFailing ? (
              <Badge variant="destructive">
                <AlertTriangle /> Pembayaran gagal
              </Badge>
            ) : isActive ? (
              <Badge variant="secondary">
                <ShieldCheck /> Terhubung
              </Badge>
            ) : connection ? (
              <Badge variant="destructive">Terputus</Badge>
            ) : (
              <Badge variant="outline">Belum terhubung</Badge>
            )}
            {isActive && isUsedForBooking ? (
              <Badge variant="default">Dipakai untuk booking baru</Badge>
            ) : null}
          </CardAction>
        </CardHeader>

        <CardContent className="flex flex-col gap-2 text-sm">
          {connection && chargeFailing ? (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>Pembayaran sedang gagal — pelanggan tidak bisa menyelesaikan booking</AlertTitle>
              <AlertDescription>
                <p>
                  Setiap percobaan DP QRIS lewat {meta.name} ditolak gateway. Pelanggan Anda tidak
                  bisa menyelesaikan booking baru sampai ini diperbaiki.
                </p>
                <p>
                  Pesan dari {meta.name}: &ldquo;{connection.last_charge_error}&rdquo;
                </p>
                <p>Terakhir gagal: {formatDateTime(connection.last_charge_error_at!)}</p>
                {connection.environment === "SANDBOX" ? (
                  <p>
                    Koneksi ini memakai environment Sandbox {meta.name} — environment untuk uji
                    coba. Selama masih di Sandbox, pesanan pelanggan sungguhan tidak akan pernah
                    menghasilkan pembayaran sungguhan, terlepas dari masalah di atas sudah
                    diperbaiki atau belum.
                  </p>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
          {connection ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Jalur koneksi</span>
                <span className="font-medium">{CONNECTION_MODE_LABEL[connection.connection_mode]}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Environment</span>
                <Badge variant={connection.environment === "PRODUCTION" ? "default" : "outline"}>
                  {ENVIRONMENT_LABEL[connection.environment]}
                </Badge>
              </div>
              {maskedCredential ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Server Key / token</span>
                  <span className="font-mono">{maskedCredential}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Terhubung sejak</span>
                <span>{formatDateTime(connection.connected_at)}</span>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">
              Belum ada akun {meta.name} yang terhubung. DP pelanggan akan langsung masuk ke
              akun ini, tidak pernah ditahan Booka.
            </p>
          )}
        </CardContent>

        <CardFooter className="flex flex-wrap gap-2">
          {isActive ? (
            <Button variant="outline" onClick={() => setDisconnectOpen(true)}>
              <Unlink /> Putuskan koneksi
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setManualKeyOpen(true)}>
                <KeyRound /> Server Key manual
              </Button>
              <Button variant="secondary" asChild>
                <a href={`/api/payments/${provider.toLowerCase()}/connect`}>
                  <Link2 /> Connect via OAuth
                </a>
              </Button>
            </>
          )}
        </CardFooter>
      </Card>

      <ManualKeyDialog open={manualKeyOpen} onOpenChange={setManualKeyOpen} provider={provider} />

      <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Putuskan koneksi {meta.name}?</DialogTitle>
            <DialogDescription>
              Halaman booking Anda tidak akan bisa menerima DP QRIS lewat {meta.name} lagi
              sampai Anda menghubungkannya ulang. Kredensial yang tersimpan akan dihapus.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDisconnectOpen(false)}
              disabled={disconnectPending}
            >
              Batal
            </Button>
            <Button variant="destructive" onClick={handleDisconnect} disabled={disconnectPending}>
              {disconnectPending ? <Spinner /> : null}
              Putuskan koneksi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
