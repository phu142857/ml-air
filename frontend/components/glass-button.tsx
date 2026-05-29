"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

type ColorVariant = "primary" | "success" | "danger" | "warning" | "neutral" | "muted"
type ThemeVariant = "dark" | "light"

const variantStyles: Record<ColorVariant, string> = {
  primary: "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 hover:border-primary/40",
  success:
    "border-[color:var(--status-success-border)] bg-[color:var(--status-success-bg)] text-[color:var(--status-success-fg)] hover:opacity-90",
  danger:
    "border-[color:var(--status-failed-border)] bg-[color:var(--status-failed-bg)] text-[color:var(--status-failed-fg)] hover:opacity-90",
  warning:
    "border-[color:var(--status-pending-border)] bg-[color:var(--status-pending-bg)] text-[color:var(--status-pending-fg)] hover:opacity-90",
  neutral: "border-border/60 bg-card text-foreground hover:bg-muted/40",
  muted: "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
}

/** @deprecated Use variant names above. Legacy aliases map to semantic variants. */
const legacyMap: Record<string, ColorVariant> = {
  emerald: "success",
  red: "danger",
  yellow: "warning",
  white: "neutral",
  purple: "primary",
  blue: "primary",
}

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  icon?: React.ReactNode
  variant?: ColorVariant | "emerald" | "red" | "yellow" | "white" | "purple" | "blue"
  theme?: ThemeVariant
}

export function GlassButton({
  children,
  icon,
  variant = "primary",
  theme: _theme = "dark",
  className,
  ...props
}: GlassButtonProps) {
  const resolved =
    variant in legacyMap
      ? legacyMap[variant as keyof typeof legacyMap]
      : (variant as ColorVariant)

  return (
    <button
      type="button"
      className={cn(
        "glass-panel group relative inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-premium active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        variantStyles[resolved],
        className,
      )}
      {...props}
    >
      {icon && (
        <span className="transition-transform duration-200 group-hover:scale-105">
          {icon}
        </span>
      )}
      {children}
    </button>
  )
}
