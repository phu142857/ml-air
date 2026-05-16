import { cn } from "@/lib/utils"

export type DetailTabAccent = "sky" | "emerald" | "violet" | "amber"

const accentActiveText: Record<DetailTabAccent, string> = {
  sky: "data-[state=active]:text-sky-700 dark:data-[state=active]:text-sky-400",
  emerald: "data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400",
  violet: "data-[state=active]:text-violet-700 dark:data-[state=active]:text-violet-400",
  amber: "data-[state=active]:text-amber-800 dark:data-[state=active]:text-amber-400",
}

export function detailTabShellClassName(className?: string) {
  return cn("shrink-0 border-b border-border bg-muted/25", className)
}

export function detailTabScrollClassName(className?: string) {
  return cn("px-6 py-3 overflow-x-auto", className)
}

export function detailTabListClassName(className?: string) {
  return cn(
    "inline-flex h-9 min-w-min items-center gap-0.5 rounded-lg",
    "border border-border/70 bg-muted/50 p-1 shadow-sm",
    "dark:bg-muted/30 dark:border-border/50",
    className
  )
}

export function detailTabTriggerClassName(accent: DetailTabAccent = "sky", className?: string) {
  return cn(
    "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md px-3.5",
    "text-[13px] font-medium whitespace-nowrap transition-all duration-150",
    "text-muted-foreground hover:text-foreground hover:bg-background/55",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    "data-[state=active]:bg-card data-[state=active]:text-foreground",
    "data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border/70",
    "dark:data-[state=active]:bg-card/95 dark:data-[state=active]:ring-border/50",
    accentActiveText[accent],
    "[&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:opacity-65 data-[state=active]:[&_svg]:opacity-100",
    className
  )
}
