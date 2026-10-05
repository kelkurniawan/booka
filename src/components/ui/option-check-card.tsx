"use client"

import type * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Kartu pilih-banyak. Sama seperti OptionCard tetapi <input type="checkbox">.
 * Saat batas maksimum tercapai, komponen pemanggil mengirim `disabled` untuk
 * pilihan yang belum tercentang -- batasnya dinyatakan lewat menonaktifkan
 * pilihan, BUKAN lewat pesan error setelah fakta.
 */
function OptionCheckCard({
  name,
  value,
  checked,
  onToggle,
  icon,
  label,
  description,
  disabled,
  className,
}: {
  name: string
  value: string
  checked: boolean
  onToggle: (value: string, checked: boolean) => void
  icon?: React.ReactNode
  label: string
  description?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <label
      data-slot="option-check-card"
      data-checked={checked || undefined}
      className={cn(
        "relative flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border p-4",
        "transition-colors motion-reduce:transition-none hover:bg-accent/50",
        "has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
        "data-[checked]:border-primary data-[checked]:bg-primary/5",
        disabled && "pointer-events-none cursor-not-allowed opacity-50",
        className,
      )}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onToggle(value, event.target.checked)}
        className="sr-only"
      />
      {icon ? <span className="text-muted-foreground shrink-0">{icon}</span> : null}
      <span className="flex flex-col gap-0.5">
        <span className="text-sm leading-none font-medium">{label}</span>
        {description ? (
          <span className="text-muted-foreground text-sm">{description}</span>
        ) : null}
      </span>
    </label>
  )
}

export { OptionCheckCard }
