"use client";

import { useState } from "react";
import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatRupiah } from "@/lib/format";
import {
  computeAmounts,
  paymentLabel,
  PAYMENT_MODE_OPTIONS,
} from "@/lib/booking/payment-mode";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { DepositType, MerchantSettings, PaymentMode, Service } from "@/types/database";

export type ServicePaymentSettings = Pick<
  MerchantSettings,
  "allow_pay_on_site" | "auto_confirm_on_site" | "max_active_per_phone" | "deposit_after_no_show"
>;

/**
 * Fieldset "Cara pembayaran" di form layanan. Kolom DP hanya dirender untuk
 * DEPOSIT dan REQUEST, jadi mode lain tidak mengirim deposit_* sama sekali.
 */
export function PaymentModeField({
  price,
  service,
  settings,
  depositError,
}: {
  /** Harga yang sedang diketik di form, untuk pratinjau nominal. */
  price: number;
  service?: Pick<Service, "payment_mode" | "deposit_type" | "deposit_value">;
  settings: ServicePaymentSettings;
  depositError?: string;
}) {
  const [mode, setMode] = useState<PaymentMode>(service?.payment_mode ?? "FULL");
  const [type, setType] = useState<DepositType>(service?.deposit_type ?? "PERCENT");
  const [value, setValue] = useState(service?.deposit_value?.toString() ?? "");

  const hasDeposit = mode === "DEPOSIT" || mode === "REQUEST";
  const depositNumber = value === "" ? null : Number(value);
  const depositValid =
    depositNumber !== null &&
    Number.isInteger(depositNumber) &&
    (type === "PERCENT" ? depositNumber >= 1 && depositNumber <= 90 : depositNumber >= 1 && depositNumber < price);

  const sample = {
    price,
    payment_mode: mode,
    deposit_type: hasDeposit && depositValid ? type : null,
    deposit_value: hasDeposit && depositValid ? depositNumber : null,
  };
  const amounts = computeAmounts(sample, mode);
  // Batas per nomor berlaku untuk booking tanpa bayar online: ON_SITE, REQUEST, dan gratis.
  const showNoShow = mode === "ON_SITE" || mode === "REQUEST" || price === 0;
  const labelReady = !(mode === "DEPOSIT" && !depositValid);

  return (
    <FieldSet>
      <FieldLegend variant="label">Kapan pelanggan membayar?</FieldLegend>
      <div className="grid gap-2">
        {PAYMENT_MODE_OPTIONS.map((option) => {
          const checked = mode === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50",
                "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                checked ? "border-primary border-2 p-[11px]" : "border-border",
              )}
            >
              <input
                type="radio"
                name="payment_mode"
                value={option.value}
                checked={checked}
                onChange={() => setMode(option.value)}
                className="sr-only"
              />
              <span
                aria-hidden
                className="border-primary mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border"
              >
                {checked ? <span className="bg-primary size-2 rounded-full" /> : null}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-sm leading-tight font-medium">{option.title}</span>
                <span className="text-muted-foreground text-sm">{option.description}</span>
                <span className="text-muted-foreground text-xs">Cocok untuk: {option.fit}</span>
              </span>
            </label>
          );
        })}
      </div>

      {hasDeposit ? (
        <Field data-invalid={Boolean(depositError)}>
          <FieldLabel htmlFor="deposit_value">Besar DP{mode === "REQUEST" ? " (opsional)" : ""}</FieldLabel>
          <div className="flex gap-2">
            <div role="radiogroup" aria-label="Jenis DP" className="flex shrink-0 overflow-hidden rounded-md border">
              {(["PERCENT", "FIXED"] as const).map((t) => (
                <label
                  key={t}
                  className={cn(
                    "has-[:focus-visible]:ring-ring/50 flex cursor-pointer items-center px-3 text-sm has-[:focus-visible]:ring-3",
                    type === t ? "bg-primary text-primary-foreground" : "hover:bg-accent/50",
                  )}
                >
                  <input
                    type="radio"
                    name="deposit_type"
                    value={t}
                    checked={type === t}
                    onChange={() => setType(t)}
                    className="sr-only"
                  />
                  {t === "PERCENT" ? "%" : "Rp"}
                </label>
              ))}
            </div>
            <Input
              id="deposit_value"
              name="deposit_value"
              type="number"
              inputMode="numeric"
              min={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={type === "PERCENT" ? "30" : "100000"}
              aria-invalid={Boolean(depositError)}
            />
          </div>
          {depositError ? <FieldError>{depositError}</FieldError> : null}
          {mode === "REQUEST" ? (
            <FieldDescription>Kosongkan untuk meminta bayar penuh setelah disetujui.</FieldDescription>
          ) : null}
          {mode === "DEPOSIT" && depositValid ? (
            <p className="text-sm">
              Pelanggan bayar {formatRupiah(amounts.dueNow)} saat booking, {formatRupiah(amounts.dueOnSite)} di tempat.
            </p>
          ) : null}
        </Field>
      ) : null}

      {mode === "REQUEST" ? (
        <p className="text-muted-foreground text-sm">
          Setelah Anda setujui di menu Booking, pelanggan menerima tautan bayar. Permintaan yang tidak dijawab 24 jam
          otomatis ditolak.
        </p>
      ) : null}

      {mode === "ON_SITE" && !settings.allow_pay_on_site ? (
        <Alert>
          <AlertDescription>
            Bayar di tempat sedang dimatikan di Pengaturan. Layanan ini meminta bayar penuh sampai fitur itu
            dinyalakan lagi.
          </AlertDescription>
        </Alert>
      ) : null}

      {showNoShow ? (
        <div className="bg-muted/50 flex flex-col gap-1 rounded-lg border p-3 text-sm">
          <span className="font-medium">Kurangi no-show</span>
          <span className="text-muted-foreground">
            {settings.max_active_per_phone
              ? `Satu nomor WhatsApp maksimal ${settings.max_active_per_phone} booking aktif.`
              : "Tanpa batas booking aktif per nomor."}
          </span>
          {settings.deposit_after_no_show && mode === "ON_SITE" ? (
            <span className="text-muted-foreground">
              Nomor yang pernah tidak datang wajib bayar di muka di booking berikutnya.
            </span>
          ) : null}
          <Link href={ROUTES.settings} className="underline underline-offset-4">
            Ubah di Pengaturan
          </Link>
        </div>
      ) : null}

      {labelReady ? (
        <p className="text-muted-foreground text-sm">
          Tampil di halaman pelanggan: <span className="text-foreground">{paymentLabel(sample, settings)}</span>
        </p>
      ) : null}
    </FieldSet>
  );
}
