"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type ColorVariant = "emerald" | "red" | "yellow" | "white" | "purple" | "blue";

const colorStyles: Record<ColorVariant, string> = {
  emerald: cn(
    "border-emerald-500/40 bg-emerald-100/60 text-emerald-700 shadow-sm",
    "hover:bg-emerald-100/80 hover:border-emerald-500/60 hover:shadow-[0_0_20px_rgba(16,185,129,0.2)]",
    "dark:border-emerald-500/30 dark:bg-emerald-950/20 dark:text-emerald-400",
    "dark:hover:bg-emerald-950/30 dark:hover:border-emerald-500/50 dark:hover:shadow-[0_0_20px_rgba(16,185,129,0.15)]"
  ),
  red: cn(
    "border-red-500/40 bg-red-100/60 text-red-700 shadow-sm",
    "hover:bg-red-100/80 hover:border-red-500/60 hover:shadow-[0_0_20px_rgba(239,68,68,0.2)]",
    "dark:border-red-500/30 dark:bg-red-950/20 dark:text-red-400",
    "dark:hover:bg-red-950/30 dark:hover:border-red-500/50 dark:hover:shadow-[0_0_20px_rgba(239,68,68,0.15)]"
  ),
  yellow: cn(
    "border-yellow-500/40 bg-yellow-100/60 text-yellow-700 shadow-sm",
    "hover:bg-yellow-100/80 hover:border-yellow-500/60 hover:shadow-[0_0_20px_rgba(234,179,8,0.2)]",
    "dark:border-yellow-500/30 dark:bg-yellow-950/20 dark:text-yellow-400",
    "dark:hover:bg-yellow-950/30 dark:hover:border-yellow-500/50 dark:hover:shadow-[0_0_20px_rgba(234,179,8,0.15)]"
  ),
  white: cn(
    "border-zinc-400/30 bg-zinc-900/5 text-zinc-700 shadow-sm",
    "hover:bg-zinc-900/10 hover:border-zinc-400/50 hover:shadow-[0_0_20px_rgba(0,0,0,0.08)]",
    "dark:border-white/20 dark:bg-white/5 dark:text-zinc-100",
    "dark:hover:bg-white/10 dark:hover:border-white/30 dark:hover:shadow-[0_0_20px_rgba(255,255,255,0.1)]"
  ),
  purple: cn(
    "border-violet-400/40 bg-violet-100/60 text-violet-700 shadow-sm",
    "hover:bg-violet-100/80 hover:border-violet-400/60 hover:shadow-[0_0_20px_rgba(167,139,250,0.2)]",
    "dark:border-violet-400/30 dark:bg-violet-950/20 dark:text-violet-300",
    "dark:hover:bg-violet-950/30 dark:hover:border-violet-400/50 dark:hover:shadow-[0_0_20px_rgba(167,139,250,0.15)]"
  ),
  blue: cn(
    "border-sky-500/40 bg-sky-100/60 text-sky-700 shadow-sm",
    "hover:bg-sky-100/80 hover:border-sky-500/60 hover:shadow-[0_0_20px_rgba(14,165,233,0.2)]",
    "dark:border-sky-500/30 dark:bg-sky-950/20 dark:text-sky-400",
    "dark:hover:bg-sky-950/30 dark:hover:border-sky-500/50 dark:hover:shadow-[0_0_20px_rgba(14,165,233,0.15)]"
  )
};

export type GlassButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode;
  icon?: React.ReactNode;
  color?: ColorVariant;
};

export function GlassButton({
  children,
  icon,
  color = "emerald",
  className,
  type = "button",
  ...props
}: GlassButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "group relative inline-flex items-center justify-center gap-2",
        "rounded-xl border px-4 py-2 backdrop-blur-md",
        "text-sm font-medium",
        "transition-all duration-200 ease-out",
        "active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        colorStyles[color],
        className
      )}
      {...props}
    >
      {icon ? (
        <span className="transition-transform duration-200 group-hover:scale-105 [&_svg]:size-4">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
