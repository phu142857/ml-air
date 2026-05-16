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
      ? "bg-emerald-600/20 text-emerald-400 border-emerald-500/40"
      : variant === "sky"
        ? "bg-sky-600/20 text-sky-400 border-sky-500/40"
        : "bg-violet-600/20 text-violet-400 border-violet-500/40"

  return (
    <div
      role="group"
      aria-label="Filter"
      className={cn("inline-flex flex-wrap gap-1 rounded-md border border-border p-0.5 bg-background/60", className)}
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={cn(
            "px-3 py-1 rounded text-xs font-medium transition-colors border border-transparent",
            value === opt.id ? active : "text-muted-foreground hover:text-foreground"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
