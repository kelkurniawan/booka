import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  normalizeVoucherCode,
  voucherIneligibleReason,
  voucherSummary,
  type AppliedVoucher,
  type CheckVoucherResult,
} from "@/lib/booking/voucher";
import { cn } from "@/lib/utils";
import type { PublicVoucher, Service } from "@/types/database";

function voucherNote(voucher: PublicVoucher): string | null {
  if (voucher.new_customer_only) return "Khusus pelanggan baru";
  if (voucher.per_phone_limit != null) return "Satu kali per nomor WhatsApp";
  return null;
}

export function VoucherPicker({
  vouchers,
  service,
  serviceNames,
  merchantName,
  applied,
  onApply,
  onRemove,
  checkCode,
}: {
  vouchers: PublicVoucher[];
  service: Pick<Service, "id" | "price">;
  serviceNames: Record<string, string>;
  merchantName: string;
  applied: AppliedVoucher | null;
  onApply: (voucher: AppliedVoucher) => void;
  onRemove: () => void;
  /** Memanggil POST /api/vouchers/check; melempar Error berisi pesan Indonesia. */
  checkCode: (code: string) => Promise<CheckVoucherResult>;
}) {
  const [open, setOpen] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const eligibleCount = vouchers.filter(
    (voucher) => voucherIneligibleReason(voucher, service, serviceNames) === null,
  ).length;

  async function handleUseCode() {
    const code = normalizeVoucherCode(codeInput);
    if (!code) {
      setCodeError("Ketik kode dulu.");
      return;
    }
    if (checking) return;
    setCodeError(null);
    setChecking(true);
    try {
      const result = await checkCode(code);
      onApply({
        code: result.code,
        kind: result.kind,
        value: result.value,
        max_discount: result.max_discount,
        min_spend: result.min_spend,
        service_ids: result.service_ids,
        source: vouchers.some((voucher) => voucher.code === result.code) ? "PUBLIC" : "PRIVATE",
      });
      setCodeInput("");
    } catch (error) {
      setCodeError(error instanceof Error ? error.message : "Kode tidak bisa dipakai.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {vouchers.length > 0 ? (
        <div
          className="bg-card border-border flex flex-col border"
          style={{ borderRadius: "var(--radius)" }}
        >
          <button
            type="button"
            aria-expanded={open}
            aria-controls="voucher-publik"
            onClick={() => setOpen((value) => !value)}
            className="flex min-h-11 items-center justify-between gap-3 p-4 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            style={{ borderRadius: "var(--radius)" }}
          >
            <span className="flex flex-col">
              <span className="text-sm font-medium">
                {applied ? `${applied.code} dipilih` : "Pilih voucher"}
              </span>
              <span className="text-muted-foreground text-xs">
                {eligibleCount} voucher bisa dipakai di booking ini
              </span>
            </span>
            <ChevronDown aria-hidden className={cn("size-4 shrink-0", open && "rotate-180")} />
          </button>
          {open ? (
            <div
              id="voucher-publik"
              role="radiogroup"
              aria-label="Voucher"
              className="border-border flex flex-col gap-2 border-t p-4"
            >
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50">
                <input
                  type="radio"
                  name="voucher"
                  checked={applied === null}
                  onChange={onRemove}
                  className="accent-primary size-4"
                />
                Tanpa voucher
              </label>
              {vouchers.map((voucher) => {
                const reason = voucherIneligibleReason(voucher, service, serviceNames);
                const note = voucherNote(voucher);
                return (
                  <label
                    key={voucher.id}
                    className={cn(
                      "flex min-h-11 items-start gap-3 text-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                      reason ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                    )}
                  >
                    <input
                      type="radio"
                      name="voucher"
                      disabled={reason !== null}
                      checked={applied?.code === voucher.code}
                      onChange={() => onApply({ ...voucher, source: "PUBLIC" })}
                      className="accent-primary mt-1 size-4"
                    />
                    <span className="flex flex-col">
                      <span className="font-medium">{voucher.code}</span>
                      <span className="text-muted-foreground">{voucherSummary(voucher)}</span>
                      {reason ? <span className="text-muted-foreground text-xs">{reason}</span> : null}
                      {note ? <span className="text-muted-foreground text-xs">{note}</span> : null}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {applied?.source === "PRIVATE" ? (
        <div
          className="bg-card border-border flex items-center justify-between gap-3 border p-3"
          style={{ borderRadius: "var(--radius)" }}
        >
          <p className="text-sm">
            <span className="font-medium">{applied.code}</span> dipakai
          </p>
          <Button type="button" variant="outline" className="min-h-11" onClick={onRemove}>
            Lepas
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <label htmlFor="kode-voucher" className="text-sm font-medium">
          Punya kode dari {merchantName}?
        </label>
        <div className="flex gap-2">
          <Input
            id="kode-voucher"
            value={codeInput}
            onChange={(event) => setCodeInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleUseCode();
              }
            }}
            maxLength={16}
            autoCapitalize="characters"
            autoComplete="off"
            className="min-h-11 uppercase"
            aria-describedby={codeError ? "kode-voucher-error" : undefined}
            aria-invalid={codeError ? true : undefined}
          />
          <Button
            type="button"
            variant="outline"
            className="min-h-11 shrink-0"
            disabled={checking}
            onClick={() => void handleUseCode()}
          >
            {checking ? "Memeriksa..." : "Pakai"}
          </Button>
        </div>
        {codeError ? (
          <p id="kode-voucher-error" role="alert" className="text-muted-foreground text-sm">
            {codeError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
