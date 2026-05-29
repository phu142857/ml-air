import { cn } from "@/lib/utils"

export type DetailTabAccent = "sky" | "emerald" | "violet" | "amber"

const accentActiveText: Record<DetailTabAccent, string> = {
  sky: "data-[state=active]:text-primary",
  emerald: "data-[state=active]:text-primary",
  violet: "data-[state=active]:text-primary",
  amber: "data-[state=active]:text-primary",
}

export function detailTabShellClassName(className?: string) {
  return cn(
    "shrink-0 border-b border-border/70 bg-background/50 backdrop-blur-sm",
    className,
  )
}

export function detailTabScrollClassName(className?: string) {
  return cn("overflow-x-auto px-4 py-3 sm:px-6", className)
}

export function detailTabListClassName(className?: string) {
  return cn(
    "inline-flex h-9 min-w-min items-center gap-0.5 rounded-xl",
    "border border-border/60 bg-muted/40 p-1 shadow-whisper",
    className,
  )
}

/** Scrollable tab panel — use on Radix `TabsContent` (run detail, settings, …). */
export function tabPanelScrollClassName(className?: string) {
  return cn("scroll-region mt-0 px-4 py-6 sm:px-6", className)
}

export function detailTabTriggerClassName(
  accent: DetailTabAccent = "sky",
  className?: string,
) {
  return cn(
    "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3.5",
    "text-[13px] font-medium whitespace-nowrap transition-premium",
    "text-muted-foreground hover:text-foreground hover:bg-background/55",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    "data-[state=active]:bg-card data-[state=active]:text-foreground",
    "data-[state=active]:shadow-whisper data-[state=active]:ring-1 data-[state=active]:ring-border/60",
    accentActiveText[accent],
    "[&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:opacity-65 data-[state=active]:[&_svg]:opacity-100",
    className,
  )
}
