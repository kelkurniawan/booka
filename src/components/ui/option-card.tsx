"use client"

import type * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Kartu pilih-satu. Berbasis <input type="radio"> tersembunyi, BUKAN <button>
 * dengan aria-checked manual: radio asli memberi navigasi panah, pengelompokan
 * lewat `name`, dan pengumuman screen reader secara gratis dan benar.
 */
function OptionCardGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="option-card-group"
      className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}
      {...props}
    />
  )
}

function OptionCard({
  name,
  value,
  checked,
  onSelect,
  icon,
  label,
  description,
  disabled,
  className,
}: {
  name: string
  value: string
  checked: boolean
  onSelect: (value: string) => void
  icon?: React.ReactNode
  label: string
  description?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <label
      data-slot="option-card"
      data-checked={checked || undefined}
      className={cn(
        // min-h menjaga target ketuk tetap nyaman di ponsel.
        "relative flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border p-4",
        "transition-colors motion-reduce:transition-none hover:bg-accent/50",
        "has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
        "data-[checked]:border-primary data-[checked]:bg-primary/5",
        disabled && "pointer-events-none cursor-not-allowed opacity-50",
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onSelect(value)}
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

export { OptionCard, OptionCardGroup }
