"use client"

import { cn } from "@/lib/utils"

interface PageScrollBodyProps {
  children: React.ReactNode
  className?: string
  /** Renders above the scroll region (banners, filters, forms). */
  header?: React.ReactNode
  /** `workspace` fills the viewport below chrome (trace-style); `scroll` uses page scroll. */
  variant?: "scroll" | "workspace"
}

/**
 * Standard page content shell: fixed chrome + scroll or workspace region.
 * Use on list/detail pages inside `flex min-h-0 flex-1 flex-col overflow-hidden` roots.
 */
export function PageScrollBody({
  children,
  className,
  header,
  variant = "scroll",
}: PageScrollBodyProps) {
  return (
    <div className={cn("page-body", variant === "workspace" && "min-h-0", className)}>
      {header}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {variant === "workspace" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">{children}</div>
        ) : (
          <div className="scroll-region flex flex-col gap-6">{children}</div>
        )}
      </div>
    </div>
  )
}
