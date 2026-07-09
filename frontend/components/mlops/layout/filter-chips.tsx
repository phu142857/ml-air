"use client"

import { STATUS_CHIP_CLASS } from "@/lib/status-style"
import { cn } from "@/lib/utils"

export type FilterChipTone = "default" | "success" | "failed"

export interface FilterChipOption {
  id: string
  label: string
  /** Active-state color when this chip is selected. */
  tone?: FilterChipTone
}

interface FilterChipsProps {
  options: FilterChipOption[]
  value: string
  onChange: (id: string) => void
  /** Fallback active tone when an option omits `tone`. */
  variant?: "sky" | "violet" | "emerald" | "failed"
  className?: string
}

function activeClassForTone(tone: FilterChipTone, variant: FilterChipsProps["variant"]): string {
  if (tone === "success") return STATUS_CHIP_CLASS.success
  if (tone === "failed") return STATUS_CHIP_CLASS.failed
  if (variant === "failed") return STATUS_CHIP_CLASS.failed
  if (variant === "emerald") return STATUS_CHIP_CLASS.success
  return "bg-primary/10 text-primary border-primary/30"
}

export function FilterChips({
  options,
  value,
  onChange,
  variant = "sky",
  className,
}: FilterChipsProps) {
  return (
    <div
      role="group"
      aria-label="Filter"
      className={cn(
        "inline-flex flex-wrap gap-1 rounded-lg border border-border bg-background p-1",
        className,
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={cn(
            "rounded-lg border border-transparent px-3 py-1 text-xs font-medium transition-default",
            value === opt.id
              ? activeClassForTone(opt.tone ?? "default", variant)
              : opt.tone === "failed"
                ? "text-[color:var(--status-failed-fg)]/80 hover:bg-[color:var(--status-failed-bg)] hover:text-[color:var(--status-failed-fg)]"
                : opt.tone === "success"
                  ? "text-[color:var(--status-success-fg)]/80 hover:bg-[color:var(--status-success-bg)] hover:text-[color:var(--status-success-fg)]"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
