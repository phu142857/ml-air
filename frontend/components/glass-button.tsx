"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

type ColorVariant = "emerald" | "red" | "yellow" | "white" | "purple" | "blue"
type ThemeVariant = "dark" | "light"

const darkColorStyles: Record<ColorVariant, string> = {
  emerald: cn(
    "bg-emerald-950/20 border-emerald-500/30 text-emerald-400",
    "hover:bg-emerald-950/30 hover:border-emerald-500/50",
    "hover:shadow-[0_0_20px_rgba(16,185,129,0.15)]"
  ),
  red: cn(
    "bg-red-950/20 border-red-500/30 text-red-400",
    "hover:bg-red-950/30 hover:border-red-500/50",
    "hover:shadow-[0_0_20px_rgba(239,68,68,0.15)]"
  ),
  yellow: cn(
    "bg-yellow-950/20 border-yellow-500/30 text-yellow-400",
    "hover:bg-yellow-950/30 hover:border-yellow-500/50",
    "hover:shadow-[0_0_20px_rgba(234,179,8,0.15)]"
  ),
  white: cn(
    "bg-white/5 border-white/20 text-foreground",
    "hover:bg-white/10 hover:border-white/30",
    "hover:shadow-[0_0_20px_rgba(255,255,255,0.1)]"
  ),
  purple: cn(
    "bg-violet-950/20 border-violet-400/30 text-violet-300",
    "hover:bg-violet-950/30 hover:border-violet-400/50",
    "hover:shadow-[0_0_20px_rgba(167,139,250,0.15)]"
  ),
  blue: cn(
    "bg-sky-950/20 border-sky-500/30 text-sky-400",
    "hover:bg-sky-950/30 hover:border-sky-500/50",
    "hover:shadow-[0_0_20px_rgba(14,165,233,0.15)]"
  ),
}

const lightColorStyles: Record<ColorVariant, string> = {
  emerald: cn(
    "bg-emerald-100/60 border-emerald-500/40 text-emerald-700",
    "hover:bg-emerald-100/80 hover:border-emerald-500/60",
    "hover:shadow-[0_0_20px_rgba(16,185,129,0.2)]"
  ),
  red: cn(
    "bg-red-100/60 border-red-500/40 text-red-700",
    "hover:bg-red-100/80 hover:border-red-500/60",
    "hover:shadow-[0_0_20px_rgba(239,68,68,0.2)]"
  ),
  yellow: cn(
    "bg-yellow-100/60 border-yellow-500/40 text-yellow-700",
    "hover:bg-yellow-100/80 hover:border-yellow-500/60",
    "hover:shadow-[0_0_20px_rgba(234,179,8,0.2)]"
  ),
  white: cn(
    "bg-card/5 border-border/40 text-muted-foreground",
    "hover:bg-card/10 hover:border-border/60",
    "hover:shadow-[0_0_20px_rgba(0,0,0,0.08)]"
  ),
  purple: cn(
    "bg-violet-100/60 border-violet-400/40 text-violet-700",
    "hover:bg-violet-100/80 hover:border-violet-400/60",
    "hover:shadow-[0_0_20px_rgba(167,139,250,0.2)]"
  ),
  blue: cn(
    "bg-sky-100/60 border-sky-500/40 text-sky-700",
    "hover:bg-sky-100/80 hover:border-sky-500/60",
    "hover:shadow-[0_0_20px_rgba(14,165,233,0.2)]"
  ),
}

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  icon?: React.ReactNode
  variant?: ColorVariant
  theme?: ThemeVariant
}

export function GlassButton({ children, icon, variant = "emerald", theme = "dark", className, ...props }: GlassButtonProps) {
  const colorStyles = theme === "dark" ? darkColorStyles : lightColorStyles
  
  return (
    <button
      className={cn(
        "group relative inline-flex items-center justify-center gap-2",
        "px-4 py-2 rounded-xl border",
        "backdrop-blur-md",
        "text-sm font-medium",
        "transition-all duration-200 ease-out",
        "active:scale-[0.98]",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        colorStyles[variant],
        className
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
