import { cn } from "@/lib/utils"

/** @deprecated Accent colors are unified — use flat primary active state instead. */
export type DetailTabAccent = "sky" | "emerald" | "violet" | "amber" | "zinc"

export function detailTabShellClassName(className?: string) {
  return cn(
    "shrink-0 border-b border-border bg-background",
    className,
  )
}

export function detailTabScrollClassName(className?: string) {
  return cn("overflow-x-auto px-4 py-3 sm:px-6", className)
}

export function detailTabListClassName(className?: string) {
  return cn(
    "inline-flex h-8 min-w-min items-center gap-0.5 rounded-md",
    "border border-border bg-muted/40 p-1 transition-default",
    className,
  )
}

/** Scrollable tab panel — use on Radix `TabsContent` (run detail, settings, …).
 *  `TabsContent` detects `scroll-region` and insets children so panels don’t touch the scrollbar.
 */
export function tabPanelScrollClassName(className?: string) {
  return cn("scroll-region mt-0", className)
}

export function detailTabTriggerClassName(className?: string) {
  return cn(
    "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md px-3",
    "text-[13px] font-medium whitespace-nowrap transition-default",
    "text-muted-foreground hover:text-foreground hover:bg-background/55",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:text-primary",
    "data-[state=active]:ring-1 data-[state=active]:ring-border",
    "[&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:opacity-65 data-[state=active]:[&_svg]:opacity-100",
    className,
  )
}
