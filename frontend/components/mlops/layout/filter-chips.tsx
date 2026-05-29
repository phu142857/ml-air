"use client"

import { cn } from "@/lib/utils"

export interface FilterChipOption {
  id: string
  label: string
}

interface FilterChipsProps {
  options: FilterChipOption[]
  value: string
  onChange: (id: string) => void
  variant?: "sky" | "violet" | "emerald"
  className?: string
}

export function FilterChips({
  options,
  value,
  onChange,
  variant = "sky",
  className,
}: FilterChipsProps) {
  const active =
    variant === "emerald"
      ? "bg-[color:var(--status-success-bg)] text-[color:var(--status-success-fg)] border-[color:var(--status-success-border)]"
      : variant === "sky"
        ? "bg-primary/10 text-primary border-primary/30"
        : "bg-primary/10 text-primary border-primary/30"

  return (
    <div
      role="group"
      aria-label="Filter"
      className={cn(
        "inline-flex flex-wrap gap-1 rounded-xl border border-border/60 bg-background/60 p-1 shadow-whisper",
        className,
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={cn(
            "rounded-lg border border-transparent px-3 py-1 text-xs font-medium transition-premium",
            value === opt.id
              ? active
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
